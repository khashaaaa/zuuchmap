import type { ErrorCode, FieldIssue } from '@zuuchmap/core';
import { isErrorCode } from '@zuuchmap/core';
import i18n from '../i18n';
import { clearAuth, getDeviceId, getToken } from './auth';

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.32:8383/api';

/** `status` 0 = the network (no response); `code` is the engine's SCREAMING_SNAKE code when it sent one. */
export class ApiError extends Error {
  status: number;
  code: ErrorCode | string | null;
  /** Per-field issues on a 400 (`INVALID_ATTRIBUTES`, validation). */
  errors: FieldIssue[];
  constructor(status: number, code: string | null, message: string, errors: FieldIssue[] = []) {
    super(message);
    this.errors = errors;
    this.status = status;
    this.code = code;
  }
}

type Primitive = string | number | boolean | null | undefined;

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, Primitive>;
  body?: unknown;
  /** Multipart body (photo upload); the runtime sets the boundary. */
  form?: FormData;
  signal?: AbortSignal;
  /** Send the anonymous device id (view counting). */
  visitor?: boolean;
}

const TIMEOUT_MS = 15000;

function queryString(params?: Record<string, Primitive>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.visitor) headers['X-Visitor-Id'] = await getDeviceId();
  if (opts.body !== undefined && !opts.form) headers['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${queryString(opts.params)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'network');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* an empty or non-JSON body */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: unknown; message?: unknown; errors?: unknown };
    const code = typeof d.code === 'string' ? d.code : typeof d.message === 'string' && isErrorCode(d.message) ? d.message : null;
    // 401 on a signed-in request: the session is gone, drop it and let the screen show the sign-in sheet.
    if (res.status === 401 && token) void clearAuth();
    throw new ApiError(res.status, code, typeof d.message === 'string' ? d.message : `HTTP ${res.status}`, Array.isArray(d.errors) ? (d.errors as FieldIssue[]) : []);
  }
  return data as T;
}

/**
 * Sign-out the user asked for: ends the session on the engine (its token would otherwise stay
 * valid for a year), then drops it here. No `device_id`: the phone stays trusted, so signing in
 * again needs no paid verification. Best effort — the token is dropped either way.
 */
export async function signOut(): Promise<void> {
  if (getToken()) await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
  await clearAuth();
}

/** The user-facing text for any thrown value: a known code first, then the status, then a generic line. */
export function errorText(e: unknown): string {
  const t = i18n.t.bind(i18n);
  if (e instanceof ApiError) {
    if (e.code && i18n.exists(`errors.codes.${e.code}`)) return t(`errors.codes.${e.code}`);
    if (e.status === 0) return t('errors.network');
    if (e.status === 401) return t('errors.unauthorized');
    if (e.status === 404) return t('errors.notFound');
    if (e.status === 429) return t('errors.tooManyRequests');
    if (e.status >= 500) return t('errors.serverError');
    return t('errors.badRequest');
  }
  return t('errors.unknown');
}

/** The listing is gone for good or never was: C7, not the browse-empty text. */
export const isMissing = (e: unknown): boolean => e instanceof ApiError && (e.status === 404 || e.status === 410);
export const isOffline = (e: unknown): boolean => e instanceof ApiError && e.status === 0;
