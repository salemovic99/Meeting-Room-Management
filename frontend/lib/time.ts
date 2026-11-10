/**
 * Time helpers. ALL rendering uses the Asia/Riyadh timezone explicitly — never the
 * browser's local timezone (TVs and admin laptops may be misconfigured).
 * Riyadh is UTC+3 with no DST, so the offset is a constant.
 *
 * Keep this file free of newer browser APIs: it is also used by the TV display page
 * (Chromium 69). Intl.DateTimeFormat#formatToParts and the timeZone option are fine there.
 */

export const TIMEZONE = "Asia/Riyadh";
export const TZ_OFFSET = "+03:00";
const OFFSET_MS = 3 * 60 * 60 * 1000;

type Locale = "en" | "ar";

function intlLocale(locale: Locale): string {
  // Force Gregorian calendar + latin digits for Arabic so dates stay unambiguous.
  return locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
}

const fmtCache: Record<string, Intl.DateTimeFormat> = {};
function fmt(locale: Locale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIMEZONE, ...opts });
  return fmtCache[key];
}

function toDate(v: string | number | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function fixMidnight(s: string): string {
  // Some Chromium versions render midnight as "24:xx" with hour12:false.
  return s.replace(/^24/, "00");
}

export function formatTime(v: string | number | Date, locale: Locale = "en"): string {
  return fixMidnight(fmt(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(toDate(v)));
}

export function formatTimeSeconds(v: string | number | Date, locale: Locale = "en"): string {
  return fixMidnight(
    fmt(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(toDate(v)),
  );
}

export function formatDate(v: string | number | Date, locale: Locale = "en"): string {
  return fmt(locale, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(toDate(v));
}

export function formatLongDate(v: string | number | Date, locale: Locale = "en"): string {
  return fmt(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(toDate(v));
}

export function formatDateTime(v: string | number | Date, locale: Locale = "en"): string {
  return `${formatDate(v, locale)} ${formatTime(v, locale)}`;
}

export function formatRange(start: string, end: string, locale: Locale = "en"): string {
  return `${formatTime(start, locale)} – ${formatTime(end, locale)}`;
}

/** Wall-clock parts in Riyadh. */
export function riyadhParts(v: string | number | Date) {
  const d = new Date(toDate(v).getTime() + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: (d.getUTCDay() + 6) % 7, // 0=Mon..6=Sun
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM-DD" in Riyadh. */
export function toDateInput(v: string | number | Date): string {
  const p = riyadhParts(v);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" in Riyadh. */
export function toTimeInput(v: string | number | Date): string {
  const p = riyadhParts(v);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Build an ISO string with the Riyadh offset from a local date + "HH:MM". */
export function buildIso(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}${TZ_OFFSET}`;
}

export function todayRiyadh(): string {
  return toDateInput(Date.now());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO instant → Riyadh wall-clock string without offset (for FullCalendar with timeZone "UTC"). */
export function toRiyadhWall(v: string | number | Date): string {
  return new Date(toDate(v).getTime() + OFFSET_MS).toISOString().slice(0, 19);
}

/** A FullCalendar Date (UTC-coerced wall time) → real ISO instant with Riyadh offset. */
export function fromRiyadhWall(d: Date): string {
  return buildIso(d.toISOString().slice(0, 10), d.toISOString().slice(11, 16));
}

export function minutesBetween(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

/** "1h 05m" / "45m" / "30s" */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m`;
  return `${totalSec}s`;
}

export function formatRelative(v: string, now: number = Date.now()): string {
  const diff = now - new Date(v).getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return diff > 0 ? `${mins} min ago` : `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return diff > 0 ? `${hours} h ago` : `in ${hours} h`;
  return formatDateTime(v);
}
