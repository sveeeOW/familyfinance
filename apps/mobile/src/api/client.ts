import Constants from 'expo-constants';
import { secureStorage } from './storage';
import { AuthTokens } from './types';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as any)?.apiUrl ??
  'http://localhost:3000';

const TOKENS_KEY = 'ff.tokens';

let memoryTokens: AuthTokens | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function loadTokens(): Promise<AuthTokens | null> {
  if (memoryTokens) return memoryTokens;
  const raw = await secureStorage.get(TOKENS_KEY);
  memoryTokens = raw ? (JSON.parse(raw) as AuthTokens) : null;
  return memoryTokens;
}

export async function saveTokens(tokens: AuthTokens | null) {
  memoryTokens = tokens;
  if (tokens) await secureStorage.set(TOKENS_KEY, JSON.stringify(tokens));
  else await secureStorage.remove(TOKENS_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  _retry?: boolean;
}

/** Базовый запрос с автоматическим refresh при 401 (§5.4). */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, _retry = false } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const tokens = await loadTokens();
    if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !_retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, _retry: true });
    onUnauthorized?.();
    throw new ApiError('Сессия истекла', 401);
  }

  if (!res.ok) {
    const message = await extractError(res);
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  const tokens = await loadTokens();
  if (!tokens?.refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) return false;
    const next = (await res.json()) as AuthTokens;
    await saveTokens(next);
    return true;
  } catch {
    return false;
  }
}

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (Array.isArray(data.message)) return data.message.join(', ');
    return data.message ?? data.error ?? `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export { API_URL };
