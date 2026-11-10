import type { ApiErrorBody, TokenResponse } from "./types";

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown> | null;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level validation errors (422) keyed by last loc segment. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    const fields = (this.details?.fields as { loc: (string | number)[]; msg: string }[] | undefined) ?? [];
    for (const f of fields) {
      const key = String(f.loc[f.loc.length - 1]);
      out[key] = f.msg;
    }
    return out;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

// ---- in-memory access token (never persisted) ----
let accessToken: string | null = null;
let refreshInFlight: Promise<TokenResponse | null> | null = null;
type SessionListener = (session: TokenResponse | null) => void;
const listeners = new Set<SessionListener>();

export function getAccessToken() {
  return accessToken;
}

export function setSession(session: TokenResponse | null) {
  accessToken = session?.access_token ?? null;
  listeners.forEach((l) => l(session));
}

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* non-JSON error */
  }
  const e = body?.error;
  return new ApiError(res.status, e?.code ?? `http_${res.status}`, e?.message ?? res.statusText, e?.details ?? null);
}

/** Exchange the httpOnly refresh cookie for a new access token. De-duplicated across callers. */
export function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
        if (!res.ok) {
          setSession(null);
          return null;
        }
        const session = (await res.json()) as TokenResponse;
        setSession(session);
        return session;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  auth?: boolean;
  signal?: AbortSignal;
}

async function rawRequest(path: string, opts: RequestOptions, retry: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
    signal: opts.signal,
  });

  if (res.status === 401 && retry && opts.auth !== false) {
    const session = await refreshSession();
    if (session) return rawRequest(path, opts, false);
  }
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts, true);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204 || res.status === 202) {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return (await res.json()) as T;
}

/** Authenticated file download (CSV/XLSX exports). */
export async function apiDownload(path: string, query: Record<string, QueryValue>, fallbackName: string) {
  const res = await rawRequest(path, { query }, true);
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a same-origin WebSocket URL (wss when the page is served over https). */
export function wsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}
