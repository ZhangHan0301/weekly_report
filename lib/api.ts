import type { RemoteFile } from './models';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

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
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}/api${path}`, {
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
