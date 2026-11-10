/**
 * Device-side API client for the TV display. Deliberately separate from lib/api.ts:
 * TVs authenticate with a device credential → short-lived display JWT, never user sessions.
 * Written for Chromium 69 (no optional catch binding issues — transpiled by SWC anyway — and
 * no newer runtime APIs).
 */
import { API_BASE } from "@/lib/api";
import type { DisplayBootstrap, DisplaySchedule, DisplaySession, DisplaySettings } from "@/lib/types";

export class DisplayHttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, { ...init, cache: "no-store", credentials: "omit" });
  if (!res.ok) {
    let code = "http_" + res.status;
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body && body.error) {
        code = body.error.code || code;
        message = body.error.message || message;
      }
    } catch (e) {
      /* non-JSON */
    }
    throw new DisplayHttpError(res.status, code, message);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export function getBootstrap(slug: string) {
  return request<DisplayBootstrap>("/display/" + encodeURIComponent(slug), { method: "GET" });
}

export function createSession(deviceToken: string, browserInfo: string) {
  return request<DisplaySession>("/display/session", {
    method: "POST",
    headers: { Authorization: "Device " + deviceToken, "Content-Type": "application/json" },
    body: JSON.stringify({ browser_info: browserInfo }),
  });
}

export function getSchedule(slug: string, token: string) {
  return request<DisplaySchedule>("/display/" + encodeURIComponent(slug) + "/schedule", {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
  });
}

export function getSettings(slug: string, token: string) {
  return request<DisplaySettings>("/display/" + encodeURIComponent(slug) + "/settings", {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
  });
}

export function sendHeartbeat(token: string, browserInfo: string) {
  return request<void>("/display/devices/heartbeat", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ browser_info: browserInfo }),
  });
}

// ---- guarded storage (private mode / kiosk browsers may throw) ----
export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
export function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* ignore */
  }
}
export function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}
