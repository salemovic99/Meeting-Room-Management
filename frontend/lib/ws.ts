import type { RealtimeMessage } from "./types";

/**
 * Reconnecting WebSocket client implementing the handshake in docs/API.md:
 *  - first message {"type":"auth","token"} (token never goes in the URL)
 *  - ping every 30s
 *  - exponential backoff reconnect (capped)
 *
 * Shared by the dashboard and the TV display, so it avoids newer browser APIs.
 */

export type SocketState = "connecting" | "open" | "closed";

export interface ReconnectingSocketOptions {
  url: string;
  /** Resolve a fresh token for the auth message; return null to stop. */
  getToken: () => Promise<string | null>;
  onMessage: (msg: RealtimeMessage) => void;
  onStateChange?: (state: SocketState) => void;
  /** Called after each successful auth (initial connect and every reconnect). */
  onAuthenticated?: (msg: RealtimeMessage) => void;
  /** Close codes from the server. Return false to stop reconnecting. */
  onServerClose?: (code: number) => boolean | void;
  pingIntervalMs?: number;
  maxBackoffMs?: number;
}

export class ReconnectingSocket {
  private ws: WebSocket | null = null;
  private opts: ReconnectingSocketOptions;
  private attempt = 0;
  private stopped = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private state: SocketState = "closed";

  constructor(opts: ReconnectingSocketOptions) {
    this.opts = opts;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000);
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.setState("closed");
  }

  /** Force an immediate reconnect (e.g. after obtaining a new token). */
  reconnectNow() {
    if (this.stopped) return;
    this.attempt = 0;
    if (this.ws) {
      try {
        this.ws.close(1000);
      } catch {
        /* ignore */
      }
    } else {
      this.connect();
    }
  }

  get currentState(): SocketState {
    return this.state;
  }

  private setState(s: SocketState) {
    if (this.state !== s) {
      this.state = s;
      if (this.opts.onStateChange) this.opts.onStateChange(s);
    }
  }

  private clearTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const max = this.opts.maxBackoffMs || 30000;
    const base = Math.min(max, 1000 * Math.pow(2, this.attempt));
    const delay = Math.round(base / 2 + Math.random() * (base / 2));
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private async connect() {
    if (this.stopped) return;
    this.clearTimers();
    this.setState("connecting");

    let token: string | null = null;
    try {
      token = await this.opts.getToken();
    } catch {
      token = null;
    }
    if (this.stopped) return;
    if (!token) {
      this.setState("closed");
      this.scheduleReconnect();
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch {
      this.setState("closed");
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: token }));
    };

    ws.onmessage = (ev: MessageEvent) => {
      let msg: RealtimeMessage;
      try {
        msg = JSON.parse(String(ev.data)) as RealtimeMessage;
      } catch {
        return;
      }
      if (msg.type === "auth.ok") {
        this.attempt = 0;
        this.setState("open");
        this.pingTimer = setInterval(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
        }, this.opts.pingIntervalMs || 30000);
        if (this.opts.onAuthenticated) this.opts.onAuthenticated(msg);
        return;
      }
      this.opts.onMessage(msg);
    };

    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.setState("closed");
      if (ev.code >= 4000 && this.opts.onServerClose) {
        const proceed = this.opts.onServerClose(ev.code);
        if (proceed === false) {
          this.stopped = true;
          return;
        }
      }
      this.scheduleReconnect();
    };

    ws.onerror = function () {
      // onclose will follow and handle reconnect.
    };
  }
}
