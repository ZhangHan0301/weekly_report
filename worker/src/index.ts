interface Env {
  APP_USERNAME?: string;
  APP_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  ALLOWED_ORIGIN: string;
  SESSION_MAX_AGE?: string;
}

const encoder = new TextEncoder();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const AUTH_PATH = 'data/system/auth.json';
const authCache = new Map<
  string,
  { value: AuthConfig | null; expiresAt: number }
>();
const MAX_BODY = 1_000_000;
const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function response(body: unknown, status = 200, extra: HeadersInit = {}) {
  const headers = new Headers(jsonHeaders);
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}
function cors(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    Vary: 'Origin',
  };
}
function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function fromB64url(value: string) {
  const raw = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
interface AuthConfig {
  version: 1;
  username: string;
  passwordHash: string;
  createdAt: string;
}
function authCacheKey(env: Env) {
  return `${env.GITHUB_OWNER}/${env.GITHUB_REPO}@${env.GITHUB_BRANCH || 'main'}`;
}
function sessionSecret(env: Env) {
  return (
    env.SESSION_SECRET ||
    `work-trace-session-v1:${env.GITHUB_TOKEN}:${authCacheKey(env)}`
  );
}
async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(value)),
    ),
  );
}
async function makeSession(username: string, env: Env) {
  const payload = b64url(
    encoder.encode(
      JSON.stringify({
        sub: username,
        exp:
          Math.floor(Date.now() / 1000) + Number(env.SESSION_MAX_AGE || 604800),
      }),
    ),
  );
  return `${payload}.${await hmac(payload, sessionSecret(env))}`;
}
async function sessionUsername(request: Request, env: Env) {
  const match = request.headers
    .get('Cookie')
    ?.match(/(?:^|;\s*)work_session=([^;]+)/);
  if (!match) return null;
  const [payload, signature] = match[1].split('.');
  if (!payload || !signature) return null;
  const expected = await hmac(payload, sessionSecret(env));
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    const auth = await loadAuth(env);
    return auth && data.sub === auth.username && data.exp > Date.now() / 1000
      ? auth.username
      : null;
  } catch {
    return null;
  }
}
async function passwordHash(password: string) {
  const iterations = 600_000;
  const saltBytes = crypto.getRandomValues(new Uint8Array(18));
  const salt = b64url(saltBytes);
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: encoder.encode(salt),
        iterations,
      },
      material,
      256,
    ),
  );
  return `pbkdf2_sha256$${iterations}$${salt}$${b64url(bits)}`;
}
async function verifyPassword(password: string, stored: string) {
  const [algorithm, rounds, salt, expected] = stored.split('$');
  if (algorithm !== 'pbkdf2_sha256' || !rounds || !salt || !expected)
    return false;
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: encoder.encode(salt),
        iterations: Number(rounds),
      },
      material,
      256,
    ),
  );
  const actual = b64url(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
function cleanHtml(input: unknown) {
  if (typeof input !== 'string') return '';
  const html = input
    .slice(0, 200_000)
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(
      /<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi,
      '',
    );
  const allowed = new Set([
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'h1',
    'h2',
    'h3',
    'ol',
    'ul',
    'li',
    'div',
    'span',
  ]);
  return html.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (whole, rawName, attrs) => {
    const name = String(rawName).toLowerCase();
    if (!allowed.has(name)) return '';
    if (whole.startsWith('</')) return `</${name}>`;
    if (name === 'br') return '<br>';
    const alignment = String(attrs).match(
      /style\s*=\s*["']\s*text-align\s*:\s*(left|center|right|justify)\s*;?\s*["']/i,
    );
    return `<${name}${alignment ? ` style="text-align:${alignment[1].toLowerCase()}"` : ''}>`;
  });
}
function sanitizeData(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 500).map(sanitizeData);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([k, v]) => [
          k,
          [
            'completed',
            'progress',
            'risks',
            'nextPlan',
            'findings',
            'tomorrow',
            'extra',
            'content',
            'summary',
          ].includes(k)
            ? cleanHtml(v)
            : sanitizeData(v),
        ]),
    );
  if (typeof value === 'string') return value.slice(0, 200_000);
  return value;
}
function validateData(path: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const text = (key: string, limit: number) =>
    typeof data[key] === 'string' && (data[key] as string).length <= limit;
  if (path === 'data/index.json') {
    return (
      data.version === 1 &&
      Array.isArray(data.projects) &&
      data.projects.length <= 100 &&
      data.projects.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const project = item as Record<string, unknown>;
        return (
          typeof project.id === 'string' &&
          uuid.test(project.id) &&
          typeof project.name === 'string' &&
          project.name.trim().length > 0 &&
          project.name.length <= 80 &&
          typeof project.color === 'string' &&
          (!project.status ||
            (typeof project.status === 'string' &&
            ['planning', 'active', 'blocked', 'done'].includes(
              project.status,
            ))) &&
          (project.progress === undefined ||
            (typeof project.progress === 'number' &&
              project.progress >= 0 &&
              project.progress <= 100))
        );
      })
    );
  }
  const projectPath = path.match(/^data\/projects\/([0-9a-f-]{36})\.json$/i);
  if (projectPath) {
    const milestones = data.milestones;
    const updates = data.updates;
    return (
      text('id', 36) &&
      data.id === projectPath[1] &&
      uuid.test(String(data.id)) &&
      text('name', 80) &&
      text('color', 40) &&
      ['planning', 'active', 'blocked', 'done'].includes(String(data.status)) &&
      typeof data.progress === 'number' &&
      data.progress >= 0 &&
      data.progress <= 100 &&
      text('summary', 200000) &&
      Array.isArray(milestones) &&
      milestones.length <= 200 &&
      milestones.every((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const item = entry as Record<string, unknown>;
        return (
          typeof item.id === 'string' &&
          uuid.test(item.id) &&
          typeof item.title === 'string' &&
          item.title.length <= 120 &&
          typeof item.dueDate === 'string' &&
          item.dueDate.length <= 10 &&
          typeof item.done === 'boolean'
        );
      }) &&
      Array.isArray(updates) &&
      updates.length <= 500 &&
      updates.every((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const item = entry as Record<string, unknown>;
        return (
          typeof item.id === 'string' &&
          uuid.test(item.id) &&
          typeof item.date === 'string' &&
          item.date.length <= 10 &&
          typeof item.content === 'string' &&
          item.content.length <= 200000
        );
      })
    );
  }
  const weeklyPath = path.match(
    /^data\/weekly\/(?:([0-9a-f-]{36})\/)?\d{4}-\d{2}-\d{2}\.json$/i,
  );
  if (weeklyPath) {
    const projectIds = data.projectIds;
    const dailyEntries = data.dailyEntries;
    const validProjects = Array.isArray(projectIds)
      ? projectIds.length <= 100 &&
        projectIds.every((id) => typeof id === 'string' && uuid.test(id))
      : weeklyPath[1] && data.projectId === weeklyPath[1];
    return (
      text('id', 36) &&
      uuid.test(String(data.id)) &&
      Boolean(validProjects) &&
      (dailyEntries === undefined ||
        (Array.isArray(dailyEntries) &&
          dailyEntries.length <= 7 &&
          dailyEntries.every((entry) => {
            if (!entry || typeof entry !== 'object') return false;
            const item = entry as Record<string, unknown>;
            return (
              typeof item.date === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
              ['completed', 'progress', 'risks', 'nextPlan'].every(
                (key) =>
                  typeof item[key] === 'string' &&
                  (item[key] as string).length <= 20000,
              )
            );
          }))) &&
      text('weekStart', 10) &&
      text('title', 120) &&
      text('completed', 200000) &&
      text('progress', 200000) &&
      text('risks', 200000) &&
      text('nextPlan', 200000) &&
      typeof data.completion === 'number' &&
      data.completion >= 0 &&
      data.completion <= 100
    );
  }
  const ids = path.match(
    /^data\/(?:daily|notes)\/([0-9a-f-]{36})(?:\/([0-9a-f-]{36}))?/i,
  );
  if (
    !ids ||
    !text('id', 36) ||
    !uuid.test(String(data.id)) ||
    !text('projectId', 36) ||
    data.projectId !== ids[1]
  )
    return false;
  if (path.startsWith('data/daily/')) {
    return (
      text('date', 10) &&
      text('completed', 200000) &&
      text('findings', 200000) &&
      text('tomorrow', 200000) &&
      text('extra', 200000)
    );
  }
  return (
    text('title', 120) &&
    text('content', 200000) &&
    typeof data.pinned === 'boolean' &&
    data.id === ids[2]
  );
}
function validPath(path: string, list = false) {
  if (
    !path.startsWith('data/') ||
    path.includes('..') ||
    path.includes('\\') ||
    path.length > 240
  )
    return false;
  if (path === 'data/index.json') return !list;
  return list
    ? /^data\/weekly$/.test(path) ||
        /^data\/(weekly|daily|notes)\/[0-9a-f-]{36}$/.test(path)
    : /^data\/(projects\/[0-9a-f-]{36}|weekly\/(?:[0-9a-f-]{36}\/)?\d{4}-\d{2}-\d{2}|daily\/[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}|notes\/[0-9a-f-]{36}\/[0-9a-f-]{36})\.json$/.test(
        path,
      );
}
function githubUrl(path: string, env: Env) {
  return `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(env.GITHUB_BRANCH || 'main')}`;
}
async function github(path: string, env: Env, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  headers.set('User-Agent', 'work-trace-worker');
  return fetch(githubUrl(path, env), { ...init, headers });
}
async function loadAuth(env: Env, fresh = false): Promise<AuthConfig | null> {
  const key = authCacheKey(env);
  const cached = authCache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const gh = await github(AUTH_PATH, env);
  let value: AuthConfig | null = null;
  if (gh.ok) {
    const file = (await gh.json()) as { content: string };
    const parsed = JSON.parse(decodeContent(file.content)) as AuthConfig;
    if (
      parsed.version !== 1 ||
      typeof parsed.username !== 'string' ||
      typeof parsed.passwordHash !== 'string'
    )
      throw new Error('invalid auth config');
    value = parsed;
  } else if (gh.status === 404 && env.APP_USERNAME && env.APP_PASSWORD_HASH) {
    value = {
      version: 1,
      username: env.APP_USERNAME,
      passwordHash: env.APP_PASSWORD_HASH,
      createdAt: 'legacy',
    };
  } else if (gh.status !== 404) {
    throw new Error('github auth read failed');
  }
  authCache.set(key, { value, expiresAt: Date.now() + 60_000 });
  return value;
}
async function createAuth(
  username: string,
  password: string,
  env: Env,
): Promise<AuthConfig> {
  const existing = await loadAuth(env, true);
  if (existing) throw new Response('already initialized', { status: 409 });
  const value: AuthConfig = {
    version: 1,
    username,
    passwordHash: await passwordHash(password),
    createdAt: new Date().toISOString(),
  };
  const gh = await github(AUTH_PATH, env, {
    method: 'PUT',
    body: JSON.stringify({
      message: '初始化工作留迹管理员账号',
      content: encodeContent(value),
      branch: env.GITHUB_BRANCH || 'main',
    }),
  });
  if (!gh.ok) {
    if (gh.status === 409 || gh.status === 422)
      throw new Response('already initialized', { status: 409 });
    throw new Error('github auth write failed');
  }
  authCache.set(authCacheKey(env), {
    value,
    expiresAt: Date.now() + 60_000,
  });
  return value;
}
function decodeContent(content: string) {
  const binary = atob(content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeContent(data: unknown) {
  const bytes = encoder.encode(JSON.stringify(data, null, 2) + '\n');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
async function body(request: Request) {
  if (
    !request.headers
      .get('Content-Type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new Response('content type', { status: 415 });
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) throw new Response('too large', { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Response('too large', { status: 413 });
  return JSON.parse(text);
}
function requireOrigin(request: Request, env: Env) {
  return request.headers.get('Origin') === env.ALLOWED_ORIGIN;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = cors(env);
    if (
      request.headers.get('Origin') &&
      request.headers.get('Origin') !== env.ALLOWED_ORIGIN
    )
      return response({ error: '禁止的来源' }, 403, headers);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers });
    if (!url.pathname.startsWith('/api/'))
      return response({ error: '未找到' }, 404, headers);
    try {
      if (url.pathname === '/api/setup-status' && request.method === 'GET') {
        const auth = await loadAuth(env);
        return response({ needsSetup: !auth }, 200, headers);
      }
      if (url.pathname === '/api/setup' && request.method === 'POST') {
        if (!requireOrigin(request, env))
          return response({ error: '禁止的来源' }, 403, headers);
        const input = (await body(request)) as {
          username?: string;
          password?: string;
        };
        const username =
          typeof input.username === 'string' ? input.username.trim() : '';
        if (
          username.length < 1 ||
          username.length > 80 ||
          typeof input.password !== 'string' ||
          input.password.length < 10 ||
          input.password.length > 200
        )
          return response(
            { error: '用户名不能为空，密码至少需要 10 位' },
            400,
            headers,
          );
        const auth = await createAuth(username, input.password, env);
        const token = await makeSession(auth.username, env);
        const age = Number(env.SESSION_MAX_AGE || 604800);
        return response({ authenticated: true, username: auth.username }, 201, {
          ...headers,
          'Set-Cookie': `work_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`,
        });
      }
      if (url.pathname === '/api/login' && request.method === 'POST') {
        if (!requireOrigin(request, env))
          return response({ error: '禁止的来源' }, 403, headers);
        const key = request.headers.get('CF-Connecting-IP') || 'unknown';
        const current = loginAttempts.get(key);
        const time = Date.now();
        if (current && current.resetAt > time && current.count >= 8)
          return response({ error: '登录尝试过多，请稍后再试' }, 429, headers);
        const input = (await body(request)) as {
          username?: string;
          password?: string;
        };
        const auth = await loadAuth(env);
        const ok =
          Boolean(auth) &&
          typeof input.username === 'string' &&
          typeof input.password === 'string' &&
          input.username.length <= 80 &&
          input.password.length <= 200 &&
          input.username === auth?.username &&
          (await verifyPassword(input.password, auth?.passwordHash || ''));
        if (!ok) {
          loginAttempts.set(key, {
            count:
              (current?.resetAt || 0) > time ? (current?.count || 0) + 1 : 1,
            resetAt: time + 15 * 60_000,
          });
          return response({ error: '用户名或密码错误' }, 401, headers);
        }
        loginAttempts.delete(key);
        const token = await makeSession(auth!.username, env);
        const age = Number(env.SESSION_MAX_AGE || 604800);
        return response(
          { authenticated: true, username: auth!.username },
          200,
          {
            ...headers,
            'Set-Cookie': `work_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`,
          },
        );
      }
      if (url.pathname === '/api/session' && request.method === 'GET') {
        const username = await sessionUsername(request, env);
        const auth = await loadAuth(env);
        return response(
          {
            authenticated: Boolean(username),
            username: username || undefined,
            needsSetup: !auth,
          },
          200,
          headers,
        );
      }
      if (!(await sessionUsername(request, env)))
        return response({ error: '请先登录' }, 401, headers);
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        if (!requireOrigin(request, env))
          return response({ error: '禁止的来源' }, 403, headers);
        return response({ ok: true }, 200, {
          ...headers,
          'Set-Cookie':
            'work_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
        });
      }
      if (url.pathname === '/api/list' && request.method === 'GET') {
        const path = url.searchParams.get('path') || '';
        if (!validPath(path, true))
          return response({ error: '无效路径' }, 400, headers);
        const gh = await github(path, env);
        if (gh.status === 404) return response({ items: [] }, 200, headers);
        if (!gh.ok) return response({ error: 'GitHub 读取失败' }, 502, headers);
        const items = (await gh.json()) as {
          name: string;
          path: string;
          sha: string;
          type: string;
        }[];
        return response(
          {
            items: items
              .filter((i) => i.type === 'file' && i.name.endsWith('.json'))
              .map(({ name, path, sha }) => ({ name, path, sha })),
          },
          200,
          headers,
        );
      }
      if (url.pathname === '/api/data' && request.method === 'GET') {
        const path = url.searchParams.get('path') || '';
        if (!validPath(path))
          return response({ error: '无效路径' }, 400, headers);
        const gh = await github(path, env);
        if (gh.status === 404)
          return response({ error: '记录不存在' }, 404, headers);
        if (!gh.ok) return response({ error: 'GitHub 读取失败' }, 502, headers);
        const file = (await gh.json()) as {
          content: string;
          sha: string;
          path: string;
        };
        return response(
          {
            data: sanitizeData(JSON.parse(decodeContent(file.content))),
            sha: file.sha,
            path: file.path,
          },
          200,
          headers,
        );
      }
      if (url.pathname === '/api/data' && request.method === 'PUT') {
        if (!requireOrigin(request, env))
          return response({ error: '禁止的来源' }, 403, headers);
        const input = (await body(request)) as {
          path: string;
          data: unknown;
          sha?: string | null;
          message: string;
        };
        if (
          !validPath(input.path) ||
          typeof input.message !== 'string' ||
          input.message.length > 160 ||
          !validateData(input.path, input.data)
        )
          return response({ error: '无效请求' }, 400, headers);
        const existing = await github(input.path, env);
        if (existing.ok) {
          const remote = (await existing.json()) as { sha: string };
          if (!input.sha || input.sha !== remote.sha)
            return response(
              { error: '远程文件已变化', code: 'REMOTE_CONFLICT' },
              409,
              headers,
            );
        } else if (existing.status !== 404)
          return response({ error: 'GitHub 检查失败' }, 502, headers);
        const gh = await github(input.path, env, {
          method: 'PUT',
          body: JSON.stringify({
            message: input.message || '更新工作记录',
            content: encodeContent(sanitizeData(input.data)),
            sha: input.sha || undefined,
            branch: env.GITHUB_BRANCH || 'main',
          }),
        });
        if (!gh.ok) return response({ error: 'GitHub 保存失败' }, 502, headers);
        const saved = (await gh.json()) as { content: { sha: string } };
        return response({ sha: saved.content.sha }, 200, headers);
      }
      if (url.pathname === '/api/data' && request.method === 'DELETE') {
        if (!requireOrigin(request, env))
          return response({ error: '禁止的来源' }, 403, headers);
        const input = (await body(request)) as {
          path: string;
          sha: string;
          message: string;
        };
        if (
          !validPath(input.path) ||
          typeof input.sha !== 'string' ||
          typeof input.message !== 'string'
        )
          return response({ error: '无效请求' }, 400, headers);
        const existing = await github(input.path, env);
        if (!existing.ok)
          return response({ error: '记录不存在' }, 404, headers);
        const remote = (await existing.json()) as { sha: string };
        if (remote.sha !== input.sha)
          return response(
            { error: '远程文件已变化', code: 'REMOTE_CONFLICT' },
            409,
            headers,
          );
        const gh = await github(input.path, env, {
          method: 'DELETE',
          body: JSON.stringify({
            message: input.message,
            sha: input.sha,
            branch: env.GITHUB_BRANCH || 'main',
          }),
        });
        if (!gh.ok) return response({ error: 'GitHub 删除失败' }, 502, headers);
        return response({ ok: true }, 200, headers);
      }
      return response({ error: '未找到' }, 404, headers);
    } catch (error) {
      if (error instanceof Response)
        return response(
          {
            error:
              error.status === 413
                ? '请求体过大'
                : error.status === 415
                  ? '仅支持 JSON'
                  : error.status === 409
                    ? '账号已经设置，请直接登录'
                    : '请求无效',
          },
          error.status,
          headers,
        );
      return response({ error: '服务器处理失败' }, 500, headers);
    }
  },
};

export default worker;
