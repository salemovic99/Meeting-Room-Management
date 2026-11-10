import type { DisplayBooking, DisplaySchedule, RoomStatus } from "@/lib/types";

// Fallback when the server omits availability.upcoming_threshold_minutes (backend default: 15).
export const DEFAULT_UPCOMING_THRESHOLD_MS = 15 * 60 * 1000;

export interface LiveState {
  state: RoomStatus;
  current: DisplayBooking | null;
  next: DisplayBooking | null;
  upcoming: DisplayBooking[];
  remainingMs: number | null;
  untilNextMs: number | null;
  freeUntil: number | null;
  nextAvailableAt: number | null;
  idle: boolean;
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Recompute room state locally every second from the last schedule + server-corrected time,
 * so meetings start/end on screen even without a server event.
 */
export function computeLive(s: DisplaySchedule, now: number): LiveState {
  const seen: Record<string, boolean> = {};
  const all: DisplayBooking[] = [];
  const candidates = [s.status.current, s.status.next].concat(s.upcoming);
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    if (!b || seen[b.id] || b.status === "cancelled") continue;
    seen[b.id] = true;
    all.push(b);
  }
  all.sort((a, b) => ms(a.start_at) - ms(b.start_at));

  let current: DisplayBooking | null = null;
  const future: DisplayBooking[] = [];
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    const st = ms(b.start_at);
    const en = ms(b.end_at);
    if (st <= now && now < en) {
      if (!current) current = b;
    } else if (st > now) {
      future.push(b);
    }
  }
  const next = future.length ? future[0] : null;

  const maintenance = s.room.maintenance_mode || s.settings.display_mode === "maintenance";
  let state: RoomStatus;
  if (maintenance) state = "maintenance";
  else if (current) state = "occupied";
  else if (s.status.state === "unavailable") state = "unavailable";
  else if (next && ms(next.start_at) - now <=
    (typeof s.upcoming_threshold_minutes === "number" ? s.upcoming_threshold_minutes * 60000 : DEFAULT_UPCOMING_THRESHOLD_MS)) state = "upcoming";
  else state = "available";

  let nextAvailableAt: number | null = null;
  if (current) {
    let t = ms(current.end_at);
    for (let i = 0; i < future.length; i++) {
      if (ms(future[i].start_at) <= t) t = Math.max(t, ms(future[i].end_at));
      else break;
    }
    nextAvailableAt = t;
  }

  const limit = Math.max(0, s.settings.upcoming_meetings_limit);
  return {
    state,
    current,
    next,
    upcoming: future.slice(0, limit),
    remainingMs: current ? ms(current.end_at) - now : null,
    untilNextMs: next ? ms(next.start_at) - now : null,
    freeUntil: !current && next ? ms(next.start_at) : null,
    nextAvailableAt,
    idle: !current && future.length === 0,
  };
}
