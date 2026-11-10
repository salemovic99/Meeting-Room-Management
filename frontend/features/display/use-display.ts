"use client";

import { useEffect, useRef, useState } from "react";
import { wsUrl } from "@/lib/api";
import { ReconnectingSocket, type SocketState } from "@/lib/ws";
import type { DisplaySchedule, RealtimeMessage } from "@/lib/types";
import {
  DisplayHttpError,
  createSession,
  getSchedule,
  getSettings,
  safeGet,
  safeRemove,
  safeSet,
  sendHeartbeat,
} from "./display-api";

export type DisplayPhase = "init" | "unpaired" | "ready" | "revoked" | "wrong_room";

export interface DisplayState {
  phase: DisplayPhase;
  schedule: DisplaySchedule | null;
  lastSync: number | null;
  clockOffset: number;
  socket: SocketState;
  /** Last HTTP fetch succeeded. */
  reachable: boolean;
}

const SESSION_REFRESH_MS = 10 * 60 * 1000;
const REVOKED_RETRY_MS = 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

function readHashToken(): string | null {
  const hash = window.location.hash || "";
  const m = /[#&]token=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}

function stripHash() {
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch (e) {
    window.location.hash = "";
  }
}

/**
 * Pairing, session, schedule sync and realtime for a TV display.
 * Device token: read once from `#token=` (fragment never reaches server logs), stored in
 * localStorage, then stripped from the URL. It is never logged.
 */
export function useDisplay(slug: string): DisplayState {
  const [phase, setPhase] = useState<DisplayPhase>("init");
  const [schedule, setSchedule] = useState<DisplaySchedule | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [socketState, setSocketState] = useState<SocketState>("closed");
  const [reachable, setReachable] = useState(true);
  const scheduleRef = useRef<DisplaySchedule | null>(null);

  useEffect(() => {
    let disposed = false;
    const tokenKey = "mrm.device_token." + slug;
    const cacheKey = "mrm.schedule." + slug;
    const browserInfo = navigator.userAgent.slice(0, 300);
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const intervals: ReturnType<typeof setInterval>[] = [];

    const hashToken = readHashToken();
    if (hashToken) {
      safeSet(tokenKey, hashToken);
      stripHash();
    }
    const deviceToken = hashToken || safeGet(tokenKey);

    // Show the last known schedule immediately (e.g. TV rebooted while the network is down).
    const cached = safeGet(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { schedule: DisplaySchedule; at: number };
        scheduleRef.current = parsed.schedule;
        setSchedule(parsed.schedule);
        setLastSync(parsed.at);
      } catch (e) {
        safeRemove(cacheKey);
      }
    }

    if (!deviceToken) {
      setPhase("unpaired");
      return;
    }

    let displayToken: string | null = null;
    let tokenExpiresAt = 0;
    let sessionPromise: Promise<string | null> | null = null;
    let revoked = false;

    const ensureSession = (force?: boolean): Promise<string | null> => {
      if (!force && displayToken && Date.now() < tokenExpiresAt - 60000) return Promise.resolve(displayToken);
      if (sessionPromise) return sessionPromise;
      sessionPromise = createSession(deviceToken, browserInfo)
        .then((s) => {
          if (s.room_slug !== slug) {
            displayToken = null;
            setPhase("wrong_room");
            return null;
          }
          revoked = false;
          displayToken = s.access_token;
          tokenExpiresAt = Date.now() + s.expires_in * 1000;
          setReachable(true);
          return displayToken;
        })
        .catch((e: unknown) => {
          displayToken = null;
          if (e instanceof DisplayHttpError && (e.status === 401 || e.status === 403)) {
            revoked = true;
            setPhase("revoked");
          } else {
            setReachable(false);
          }
          return null;
        })
        .then((v) => {
          sessionPromise = null;
          return v;
        });
      return sessionPromise;
    };

    const applySchedule = (s: DisplaySchedule, t0: number) => {
      const t1 = Date.now();
      // Server-corrected clock (handles TV clock / timezone misconfiguration).
      setClockOffset(new Date(s.server_time).getTime() - (t0 + t1) / 2);
      scheduleRef.current = s;
      setSchedule(s);
      setLastSync(t1);
      setReachable(true);
      setPhase("ready");
      safeSet(cacheKey, JSON.stringify({ schedule: s, at: t1 }));
    };

    const loadSchedule = (retried?: boolean): Promise<void> =>
      ensureSession().then((token) => {
        if (!token || disposed) return;
        const t0 = Date.now();
        return getSchedule(slug, token)
          .then((s) => {
            if (!disposed) applySchedule(s, t0);
          })
          .catch((e: unknown) => {
            if (e instanceof DisplayHttpError && e.status === 401 && !retried) {
              displayToken = null;
              return loadSchedule(true);
            }
            if (e instanceof DisplayHttpError && e.status === 403) {
              setPhase("wrong_room");
              return;
            }
            setReachable(false);
          });
      });

    const loadSettings = () =>
      ensureSession().then((token) => {
        if (!token) return;
        return getSettings(slug, token)
          .then((settings) => {
            const cur = scheduleRef.current;
            if (cur) {
              const merged = { ...cur, settings };
              scheduleRef.current = merged;
              setSchedule(merged);
            }
          })
          .catch(() => loadSchedule());
      });

    const onMessage = (msg: RealtimeMessage) => {
      switch (msg.type) {
        case "display.refresh":
          window.location.reload();
          break;
        case "display.settings_updated":
          void loadSettings();
          break;
        case "booking.created":
        case "booking.updated":
        case "booking.cancelled":
        case "booking.started":
        case "booking.ended":
        case "room.status_changed":
        case "display.announcement_updated":
          void loadSchedule();
          break;
        default:
          break;
      }
    };

    const socket = new ReconnectingSocket({
      url: wsUrl("/ws/display/" + encodeURIComponent(slug)),
      getToken: () => (revoked ? Promise.resolve(null) : ensureSession()),
      onMessage,
      onStateChange: setSocketState,
      // ALWAYS refetch after (re)connecting — we may have missed events while offline.
      onAuthenticated: () => void loadSchedule(),
      onServerClose: (code) => {
        if (code === 4401) displayToken = null; // expired/revoked → new session on next connect
        if (code === 4403) {
          setPhase("wrong_room");
          return false;
        }
        return true;
      },
      maxBackoffMs: 30000,
    });

    // Boot
    void loadSchedule().then(() => {
      if (!disposed) socket.start();
    });

    // Safety-net poll, re-reading the configured interval each time.
    const schedulePoll = () => {
      const s = scheduleRef.current;
      const sec = s ? Math.max(15, s.settings.refresh_interval_seconds || 60) : 60;
      pollTimer = setTimeout(() => {
        if (disposed) return;
        void loadSchedule().then(schedulePoll);
      }, sec * 1000);
    };
    schedulePoll();

    intervals.push(setInterval(() => void ensureSession(true), SESSION_REFRESH_MS));

    // Retry revoked credentials periodically (IT may re-enable the device).
    intervals.push(
      setInterval(() => {
        if (!revoked) return;
        void ensureSession(true).then((tok) => {
          if (tok) {
            void loadSchedule();
            socket.reconnectNow();
          }
        });
      }, REVOKED_RETRY_MS),
    );

    // HTTP heartbeat only while the socket is down (socket pings record heartbeats otherwise).
    intervals.push(
      setInterval(() => {
        if (socket.currentState === "open" || !displayToken) return;
        sendHeartbeat(displayToken, browserInfo).catch(() => undefined);
      }, HEARTBEAT_MS),
    );

    return () => {
      disposed = true;
      socket.stop();
      if (pollTimer) clearTimeout(pollTimer);
      intervals.forEach(clearInterval);
    };
  }, [slug]);

  return { phase, schedule, lastSync, clockOffset, socket: socketState, reachable };
}
