import i18n from '@/i18n';
import type { FieldIssue } from '@zuuchmap/core';
import { useAuthStore } from './auth';

export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  status: number;
  code: string | null;
  /** Per-field problems of a 400 (`errors: [{key, code, message}]`). */
  issues: FieldIssue[];
  constructor(status: number, code: string | null, message: string, issues: FieldIssue[] = []) {
    super(message);
    this.issues = issues;
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  /** Multipart upload; sent instead of `body`. */
  form?: FormData;
  signal?: AbortSignal;
}

const qs = (q?: Query): string => {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { token, deviceId } = useAuthStore.getState();
  const headers: Record<string, string> = { 'X-Visitor-Id': deviceId };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined && !opts.form) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${qs(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'network');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const d = (data ?? {}) as { code?: unknown; message?: unknown; errors?: unknown };
    const message = typeof d.message === 'string' ? d.message : '';
    // The engine promotes a SCREAMING_SNAKE message to `code`; accept either.
    const code = typeof d.code === 'string' ? d.code : /^[A-Z][A-Z0-9_]+$/.test(message) ? message : null;
    if (res.status === 401 && token) useAuthStore.getState().clear();
    throw new ApiError(res.status, code, message, Array.isArray(d.errors) ? (d.errors as FieldIssue[]) : []);
  }
  return data as T;
}

/** Message for a failed call: the known error code's text, else the generic one. */
export function errorKey(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return 'errors.network';
    if (e.code && i18n.exists(`errors.codes.${e.code}`)) return `errors.codes.${e.code}`;
    if (e.status === 404) return 'errors.notFound';
    if (e.status === 429) return 'errors.tooManyRequests';
    if (e.status >= 500) return 'errors.serverError';
  }
  return 'errors.unknown';
}
