import { createServer } from 'node:http';
import { createHmac, createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

const PORT = Number(process.env.LOCAL_API_PORT || 8787);
const ORIGIN = process.env.LOCAL_APP_ORIGIN || 'http://localhost:3000';
const ROOT = resolve(process.env.LOCAL_DATA_DIR || '.local-data');
const REPOSITORY = join(ROOT, 'repository');
const AUTH_FILE = join(ROOT, 'auth.json');
const SECRET_FILE = join(ROOT, 'session-secret');
const MAX_BODY = 1_000_000;

await mkdir(REPOSITORY, { recursive: true });

const json = (response, status, data, extra = {}) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    Vary: 'Origin',
    ...extra,
  });
  response.end(JSON.stringify(data));
};
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path) => readFile(path).then(() => true).catch(() => false);
const safePath = (relative) => {
  if (!relative.startsWith('data/') || relative.includes('..') || relative.includes('\\')) throw new Error('invalid path');
  const target = resolve(REPOSITORY, relative);
  if (!target.startsWith(REPOSITORY + sep)) throw new Error('invalid path');
  return target;
};
const requestBody = async (request) => {
  if (!request.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('仅支持 JSON'), { status: 415 });
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > MAX_BODY) throw Object.assign(new Error('请求体过大'), { status: 413 });
  }
  return JSON.parse(text || '{}');
};
const fileSha = (text) => createHash('sha256').update(text).digest('hex');
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const text = JSON.stringify(value, null, 2) + '\n';
  await writeFile(temporary, text, { mode: 0o600 });
  await rename(temporary, path);
  return fileSha(text);
};
const passwordHash = (password) => {
  const salt = randomBytes(18).toString('base64url');
  return `pbkdf2_sha256$600000$${salt}$${pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('base64url')}`;
};
const verifyPassword = (password, stored) => {
  const [algorithm, rounds, salt, expected] = String(stored).split('$');
  if (algorithm !== 'pbkdf2_sha256' || !rounds || !salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, Number(rounds), 32, 'sha256');
  const expectedBytes = Buffer.from(expected, 'base64url');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
};
const secret = await readFile(SECRET_FILE, 'utf8').catch(async () => {
  const value = randomBytes(48).toString('base64url');
  await mkdir(ROOT, { recursive: true });
  await writeFile(SECRET_FILE, value, { mode: 0o600 });
  return value;
});
const sign = (value) => createHmac('sha256', secret).update(value).digest('base64url');
const sessionCookie = (username) => {
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: Math.floor(Date.now() / 1000) + 604800 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};
const sessionUsername = async (request) => {
  const token = request.headers.cookie?.match(/(?:^|;\s*)work_session=([^;]+)/)?.[1];
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const auth = await readJson(AUTH_FILE);
    return data.exp > Date.now() / 1000 && data.sub === auth.username ? auth.username : null;
  } catch {
    return null;
  }
};

createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://localhost:${PORT}`);
  if (request.headers.origin && request.headers.origin !== ORIGIN) return json(response, 403, { error: '禁止的来源' });
  if (request.method === 'OPTIONS') return json(response, 204, {});
  if (!url.pathname.startsWith('/api/')) return json(response, 404, { error: '未找到' });
  try {
    if (url.pathname === '/api/setup-status' && request.method === 'GET') {
      return json(response, 200, { needsSetup: !(await exists(AUTH_FILE)) });
    }
    if (url.pathname === '/api/setup' && request.method === 'POST') {
      if (await exists(AUTH_FILE)) return json(response, 409, { error: '账号已经设置，请直接登录' });
      const input = await requestBody(request);
      const username = typeof input.username === 'string' ? input.username.trim() : '';
      if (!username || username.length > 80 || typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 200) {
        return json(response, 400, { error: '用户名不能为空，密码至少需要 10 位' });
      }
      await writeJson(AUTH_FILE, { version: 1, username, passwordHash: passwordHash(input.password), createdAt: new Date().toISOString() });
      return json(response, 201, { authenticated: true, username }, { 'Set-Cookie': `work_session=${sessionCookie(username)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800` });
    }
    if (url.pathname === '/api/login' && request.method === 'POST') {
      const input = await requestBody(request);
      const auth = await readJson(AUTH_FILE).catch(() => null);
      if (!auth || input.username !== auth.username || typeof input.password !== 'string' || !verifyPassword(input.password, auth.passwordHash)) {
        return json(response, 401, { error: '用户名或密码错误' });
      }
      return json(response, 200, { authenticated: true, username: auth.username }, { 'Set-Cookie': `work_session=${sessionCookie(auth.username)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800` });
    }
    if (url.pathname === '/api/session' && request.method === 'GET') {
      const username = await sessionUsername(request);
      return json(response, 200, { authenticated: Boolean(username), username: username || undefined, needsSetup: !(await exists(AUTH_FILE)) });
    }
    if (!(await sessionUsername(request))) return json(response, 401, { error: '请先登录' });
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      return json(response, 200, { ok: true }, { 'Set-Cookie': 'work_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (url.pathname === '/api/list' && request.method === 'GET') {
      const directory = safePath(url.searchParams.get('path') || '');
      const items = await readdir(directory, { withFileTypes: true }).catch(() => []);
      const result = await Promise.all(items.filter((item) => item.isFile() && item.name.endsWith('.json')).map(async (item) => {
        const path = join(directory, item.name);
        const text = await readFile(path, 'utf8');
        return { name: item.name, path: join(url.searchParams.get('path') || '', item.name).replaceAll('\\', '/'), sha: fileSha(text) };
      }));
      return json(response, 200, { items: result });
    }
    if (url.pathname === '/api/data' && request.method === 'GET') {
      const relative = url.searchParams.get('path') || '';
      const path = safePath(relative);
      const text = await readFile(path, 'utf8').catch(() => null);
      if (text === null) return json(response, 404, { error: '记录不存在' });
      return json(response, 200, { data: JSON.parse(text), sha: fileSha(text), path: relative });
    }
    if (url.pathname === '/api/data' && request.method === 'PUT') {
      const input = await requestBody(request);
      const path = safePath(input.path);
      const current = await readFile(path, 'utf8').catch(() => null);
      if (current !== null && (!input.sha || input.sha !== fileSha(current))) return json(response, 409, { error: '远程文件已变化', code: 'REMOTE_CONFLICT' });
      const sha = await writeJson(path, input.data);
      return json(response, 200, { sha });
    }
    if (url.pathname === '/api/data' && request.method === 'DELETE') {
      const input = await requestBody(request);
      const path = safePath(input.path);
      const current = await readFile(path, 'utf8').catch(() => null);
      if (current === null) return json(response, 404, { error: '记录不存在' });
      if (input.sha !== fileSha(current)) return json(response, 409, { error: '本地文件已变化', code: 'REMOTE_CONFLICT' });
      await rm(path);
      return json(response, 200, { ok: true });
    }
    return json(response, 404, { error: '未找到' });
  } catch (error) {
    return json(response, error.status || 500, { error: error.message || '本地服务处理失败' });
  }
}).listen(PORT, 'localhost', () => {
  console.log(`工作留迹本地数据服务：http://localhost:${PORT}`);
  console.log(`数据目录：${ROOT}`);
});
