import { apiRequest } from './api';

beforeEach(() => {
  vi.restoreAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());

test('concurrent expired requests share one refresh and retry with the new token', async () => {
  localStorage.setItem('token', 'expired');
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh')) return new Response(JSON.stringify({ token: 'renewed' }), { status: 200 });
    const token = new Headers(init.headers).get('Authorization');
    return new Response(JSON.stringify(token === 'Bearer renewed' ? { success: true } : {}), { status: token === 'Bearer renewed' ? 200 : 401 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const result = await Promise.all([apiRequest('/sessions'), apiRequest('/analytics')]);
  expect(result).toEqual([{ success: true }, { success: true }]);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
});

test('account controls renew an expired session but preserve it for an incorrect password', async () => {
  localStorage.setItem('token', 'expired');
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh')) return new Response(JSON.stringify({ token: 'renewed' }), { status: 200 });
    const token = new Headers(init.headers).get('Authorization');
    return new Response(JSON.stringify({ detail: 'Password is incorrect.' }), { status: token === 'Bearer renewed' ? 403 : 401 });
  });
  vi.stubGlobal('fetch', fetchMock);
  await expect(apiRequest('/auth/recovery-code', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })).rejects.toThrow('Password is incorrect.');
  expect(localStorage.getItem('token')).toBe('renewed');
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
});
