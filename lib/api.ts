import type { RemoteFile } from './models';

export type StorageMode = 'local' | 'cloud';

const localApiBase = (
  process.env.NEXT_PUBLIC_LOCAL_API_BASE || 'http://localhost:8787'
).replace(/\/$/, '');
const configuredApiBase = (process.env.NEXT_PUBLIC_API_BASE || '').replace(
  /\/$/,
  '',
);
const cloudApiBase = (
  process.env.NEXT_PUBLIC_CLOUD_API_BASE ||
  (configuredApiBase.includes('localhost') ? '' : configuredApiBase)
).replace(/\/$/, '');
let storageMode: StorageMode = 'local';

const apiBase = () => (storageMode === 'local' ? localApiBase : cloudApiBase);

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase();
  if (!base)
    throw new ApiError('尚未配置 Cloudflare 云端服务地址', 503, 'CLOUD_NOT_CONFIGURED');
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(`${base}/api${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  } & T;
  if (!response.ok)
    throw new ApiError(
      payload.error || '请求失败',
      response.status,
      payload.code,
    );
  return payload;
}

export const api = {
  setStorageMode: (mode: StorageMode) => {
    storageMode = mode;
  },
  cloudConfigured: () => Boolean(cloudApiBase),
  session: () =>
    request<{
      authenticated: boolean;
      username?: string;
      needsSetup?: boolean;
    }>('/session'),
  setupStatus: () => request<{ needsSetup: boolean }>('/setup-status'),
  setup: (username: string, password: string) =>
    request<{ authenticated: true; username: string }>('/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ authenticated: true; username: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<{ ok: true }>('/logout', { method: 'POST', body: '{}' }),
  read: <T>(path: string) =>
    request<RemoteFile<T>>(`/data?path=${encodeURIComponent(path)}`),
  list: (path: string) =>
    request<{ items: { name: string; path: string; sha: string }[] }>(
      `/list?path=${encodeURIComponent(path)}`,
    ),
  write: <T>(path: string, data: T, sha: string | null, message: string) =>
    request<{ sha: string }>('/data', {
      method: 'PUT',
      body: JSON.stringify({ path, data, sha, message }),
    }),
  remove: (path: string, sha: string, message: string) =>
    request<{ ok: true }>('/data', {
      method: 'DELETE',
      body: JSON.stringify({ path, sha, message }),
    }),
};
