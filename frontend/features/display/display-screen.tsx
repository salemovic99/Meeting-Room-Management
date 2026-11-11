"use client";

/**
 * TV signage screen. Designed on a fixed 1920×1080 stage that is uniformly scaled to the
 * viewport. Compatibility rules (Samsung Tizen 5.5 / Chromium 69):
 *   - no flexbox `gap`, no `inset`, no `aspect-ratio`, no `backdrop-filter`
 *     → use margins + explicit top/left/right/bottom
 *   - no newer JS APIs; fullscreen / wake lock are feature-detected
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CircleDot,
  MapPin,
  Megaphone,
  WifiOff,
  Wrench,
} from "lucide-react";
import { translate, type Language } from "@/lib/i18n";
import { formatDuration, formatLongDate, formatTime } from "@/lib/time";
import type { DisplayAnnouncement, DisplayBooking, DisplaySchedule, RoomStatus } from "@/lib/types";
import { computeLive, type LiveState } from "./compute";

const STAGE_W = 1920;
const STAGE_H = 1080;
const GUTTER = 64;

interface StatusSpec {
  /** "r,g,b" so it can be used at any alpha. */
  rgb: string;
  /** Solid fill that keeps white text readable. */
  solid: string;
  label: string;
  Icon: typeof CheckCircle2;
}

const STATUS_STYLE: Record<RoomStatus, StatusSpec> = {
  available: { rgb: "34,197,94", solid: "#16a34a", label: "AVAILABLE", Icon: CheckCircle2 },
  upcoming: { rgb: "245,158,11", solid: "#d97706", label: "STARTING SOON", Icon: Clock },
  occupied: { rgb: "239,68,68", solid: "#dc2626", label: "OCCUPIED", Icon: CircleDot },
  maintenance: { rgb: "148,163,184", solid: "#475569", label: "ROOM UNDER MAINTENANCE", Icon: Wrench },
  unavailable: { rgb: "148,163,184", solid: "#475569", label: "UNAVAILABLE", Icon: Ban },
};

function rgba(rgb: string, a: number): string {
  return "rgba(" + rgb + "," + a + ")";
}

function useStageScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

/** Full-viewport black backdrop with the scaled, centered stage. `background` may be any CSS background shorthand. */
export function Stage({ children, background, dir }: { children: ReactNode; background: string; dir: "ltr" | "rtl" }) {
  const scale = useStageScale();
  const outer: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    background: "#000",
    cursor: "none",
  };
  const stage: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: STAGE_W,
    height: STAGE_H,
    marginLeft: -STAGE_W / 2,
    marginTop: -STAGE_H / 2,
    transform: "scale(" + scale + ")",
    transformOrigin: "50% 50%",
    background,
    overflow: "hidden",
  };
  return (
    <div style={outer}>
      <div style={stage} dir={dir}>
        {children}
      </div>
    </div>
  );
}

/** Simple full-screen message (unpaired / revoked / loading). */
export function MessageScreen({ title, subtitle, lang = "en", icon }: { title: string; subtitle?: string; lang?: Language; icon?: ReactNode }) {
  const bg =
    "radial-gradient(ellipse 70% 60% at 50% 35%, rgba(187,157,90,0.16), rgba(187,157,90,0) 70%)," +
    "radial-gradient(ellipse 60% 50% at 50% 110%, rgba(0,89,79,0.45), rgba(0,89,79,0) 70%)," +
    "#07110f";
  return (
    <Stage background={bg} dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex h-full flex-col items-center justify-center text-center" style={{ color: "#fff", padding: 80 }}>
        {icon ? (
          <div
            className="flex items-center justify-center"
            style={{
              width: 260,
              height: 260,
              borderRadius: 130,
              marginBottom: 56,
              background: "rgba(255,255,255,0.05)",
              border: "2px solid rgba(255,255,255,0.1)",
              boxShadow: "0 0 120px rgba(187,157,90,0.18)",
            }}
          >
            {icon}
          </div>
        ) : null}
        <p style={{ fontSize: 76, fontWeight: 700, letterSpacing: lang === "ar" ? 0 : -1, lineHeight: 1.1 }}>{title}</p>
        {subtitle ? <p style={{ fontSize: 34, marginTop: 28, color: "rgba(255,255,255,0.6)" }}>{subtitle}</p> : null}
      </div>
    </Stage>
  );
}

interface Palette {
  dark: boolean;
  /** Arabic UI: letter-spacing must stay 0 on translated labels or Chromium breaks the letter joins. */
  ar: boolean;
  bg: string;
  fg: string;
  muted: string;
  faint: string;
  card: string;
  border: string;
  track: string;
  primary: string;
  secondary: string;
}

function palette(s: DisplaySchedule): Palette {
  const dark = s.settings.theme === "dark";
  return {
    dark,
    ar: s.settings.language === "ar",
    bg: s.settings.background_color || (dark ? "#07110f" : "#f3f5f4"),
    fg: dark ? "#ffffff" : "#0f172a",
    muted: dark ? "rgba(255,255,255,0.62)" : "rgba(15,23,42,0.6)",
    faint: dark ? "rgba(255,255,255,0.4)" : "rgba(15,23,42,0.4)",
    card: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.78)",
    border: dark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)",
    track: dark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)",
    primary: s.settings.primary_color || "#00594F",
    secondary: s.settings.secondary_color || "#BB9D5A",
  };
}

/** Layered background: a soft glow tinted by the live room status over the base colour. */
function stageBackground(p: Palette, spec: StatusSpec): string {
  const a = p.dark ? 0.22 : 0.16;
  return (
    "radial-gradient(ellipse 55% 65% at 18% 30%, " + rgba(spec.rgb, a) + ", " + rgba(spec.rgb, 0) + " 70%)," +
    "radial-gradient(ellipse 45% 55% at 100% 100%, " + rgba(spec.rgb, a * 0.45) + ", " + rgba(spec.rgb, 0) + " 70%)," +
    p.bg
  );
}

function cardStyle(p: Palette, extra?: CSSProperties): CSSProperties {
  const base: CSSProperties = {
    background: p.card,
    border: "2px solid " + p.border,
    borderRadius: 40,
    boxShadow: p.dark ? "0 30px 80px rgba(0,0,0,0.35)" : "0 24px 60px rgba(15,23,42,0.08)",
  };
  return extra ? Object.assign(base, extra) : base;
}

const tabular: CSSProperties = { fontVariantNumeric: "tabular-nums" };

const ellipsis: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

function clampLines(n: number): CSSProperties {
  return { display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" };
}

/** Tracking for translated UI labels only; never apply it to free text (room names, titles may be Arabic). */
function spacing(p: Palette, v: number): number {
  return p.ar ? 0 : v;
}

export function DisplayScreen({
  schedule,
  now,
  lastSync,
  online,
}: {
  schedule: DisplaySchedule;
  now: number;
  lastSync: number | null;
  online: boolean;
}) {
  const st = schedule.settings;
  const lang: Language = st.language === "ar" ? "ar" : "en";
  const tr = (k: string) => translate(lang, k);
  const p = palette(schedule);
  const live = computeLive(schedule, now);
  const spec = STATUS_STYLE[live.state];
  const announcements = st.show_announcements ? schedule.announcements : [];
  const featured = pickAnnouncement(announcements);
  const logo = st.logo_url || schedule.company.logo_url;

  // Decide which body to render based on mode, maintenance and idle behaviour.
  let mode = st.display_mode;
  if (live.state === "maintenance") mode = "maintenance";
  const dimmed = live.idle && st.idle_behavior === "dim" && mode !== "maintenance" && mode !== "announcement";
  if (live.idle && st.idle_behavior === "show_announcement" && (featured || st.announcement_text) && mode !== "maintenance") {
    mode = "announcement";
  }

  const panelProps = { live, now, tr, p, lang, showOrganizer: st.show_organizer, showDepartment: st.show_department };

  let body: ReactNode;
  if (mode === "maintenance") {
    body = <MaintenanceBody message={schedule.room.maintenance_message} tr={tr} p={p} />;
  } else if (mode === "announcement") {
    body = <AnnouncementBody text={st.announcement_text} featured={featured} tr={tr} p={p} />;
  } else if (mode === "current_meeting" || mode === "availability") {
    body = (
      <div style={{ padding: "0 " + GUTTER + "px", height: "100%" }}>
        <StatusPanel {...panelProps} big />
      </div>
    );
  } else {
    body = (
      <div className="flex h-full" style={{ padding: "0 " + GUTTER + "px" }}>
        <div style={{ width: "60%", height: "100%" }}>
          <StatusPanel {...panelProps} />
        </div>
        <div style={{ width: "40%", height: "100%", paddingInlineStart: 36 }}>
          <UpcomingList items={live.upcoming} tr={tr} p={p} lang={lang} showOrganizer={st.show_organizer} showDepartment={st.show_department} />
        </div>
      </div>
    );
  }

  const showMarquee = announcements.length > 0 && mode !== "announcement";

  return (
    <Stage background={stageBackground(p, spec)} dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* Brand accent strip */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: "linear-gradient(90deg, " + p.primary + ", " + p.secondary + ")",
        }}
      />
      <div className="flex h-full flex-col" style={{ color: p.fg, opacity: dimmed ? 0.35 : 1, transition: "opacity 1s" }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ height: 168, padding: "0 " + GUTTER + "px", paddingTop: 12 }}>
          <div className="flex items-center" style={{ minWidth: 0 }}>
            {logo ? (
              <div
                className="flex items-center justify-center"
                style={{
                  height: 104,
                  padding: "0 24px",
                  marginInlineEnd: 36,
                  borderRadius: 28,
                  background: p.dark ? "rgba(255,255,255,0.92)" : "#fff",
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" style={{ height: 72, maxWidth: 240, objectFit: "contain" }} />
              </div>
            ) : null}
            <div style={{ minWidth: 0 }}>
              <p style={Object.assign({ fontSize: 64, fontWeight: 700, lineHeight: 1.15 }, ellipsis)}>{schedule.room.name}</p>
              <div className="flex items-center" style={{ marginTop: 10 }}>
                {schedule.room.code ? (
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 600,
                      letterSpacing: 2,
                      padding: "4px 16px",
                      borderRadius: 999,
                      border: "2px solid " + p.border,
                      color: p.muted,
                      marginInlineEnd: 20,
                    }}
                  >
                    {schedule.room.code}
                  </span>
                ) : null}
                {schedule.room.location ? (
                  <span className="inline-flex items-center" style={{ fontSize: 28, color: p.muted }}>
                    <MapPin style={{ width: 28, height: 28, marginInlineEnd: 8 }} aria-hidden />
                    {schedule.room.location}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div style={{ textAlign: lang === "ar" ? "left" : "right", flexShrink: 0, marginInlineStart: 40 }}>
            {st.show_clock ? (
              <p style={Object.assign({ fontSize: 104, fontWeight: 300, lineHeight: 1, letterSpacing: -2 }, tabular)}>{formatTime(now, lang)}</p>
            ) : null}
            {st.show_date ? <p style={{ fontSize: 28, color: p.muted, marginTop: 10, fontWeight: 500 }}>{formatLongDate(now, lang)}</p> : null}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, paddingTop: 8, paddingBottom: 28, minHeight: 0 }}>{body}</div>

        {/* Footer */}
        <div style={{ padding: "0 " + GUTTER + "px", paddingBottom: 36 }}>
          <div
            className="flex items-center"
            style={cardStyle(p, { height: 128, borderRadius: 32, paddingInlineStart: 36, paddingInlineEnd: 20, overflow: "hidden" })}
          >
            <div style={{ flexShrink: 0, marginInlineEnd: 36 }}>
              <p style={{ fontSize: 26, fontWeight: 700 }}>{schedule.company.name}</p>
              <p className="flex items-center" style={{ fontSize: 21, color: online ? p.muted : "#f59e0b", marginTop: 4 }}>
                {online ? (
                  <span className="tv-pulse" style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, background: "#22c55e", marginInlineEnd: 10 }} />
                ) : (
                  <WifiOff style={{ width: 22, height: 22, marginInlineEnd: 8 }} aria-hidden />
                )}
                {(online ? tr("Last sync") : tr("Offline — last synced")) + " " + (lastSync ? formatTime(lastSync, lang) : "—")}
              </p>
            </div>
            <div style={{ width: 2, height: 64, background: p.border, flexShrink: 0, marginInlineEnd: 36 }} />
            <div style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", minWidth: 0 }}>
              {showMarquee ? (
                <div className="tv-marquee" style={{ fontSize: 32 }}>
                  {announcements.map((a) => (
                    <span key={a.id} style={{ marginInlineEnd: 120 }}>
                      <Megaphone style={{ display: "inline", width: 30, height: 30, marginInlineEnd: 14, color: p.secondary, verticalAlign: -4 }} aria-hidden />
                      <b>{a.title}</b>
                      <span style={{ color: p.muted }}> — {a.message}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {st.show_qr_code && schedule.qr_target_url ? (
              <div className="flex items-center" style={{ flexShrink: 0, marginInlineStart: 32 }}>
                <div style={{ textAlign: lang === "ar" ? "left" : "right", marginInlineEnd: 20 }}>
                  <p style={{ fontSize: 24, fontWeight: 700 }}>{tr("Scan to book")}</p>
                  <p style={{ fontSize: 20, color: p.muted }}>{tr("Book this room")}</p>
                </div>
                <div style={{ background: "#fff", padding: 8, borderRadius: 16 }}>
                  <QRCodeSVG value={schedule.qr_target_url} size={88} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Stage>
  );
}

function pickAnnouncement(list: DisplayAnnouncement[]): DisplayAnnouncement | null {
  const order = { critical: 0, high: 1, normal: 2, low: 3 } as const;
  let best: DisplayAnnouncement | null = null;
  for (let i = 0; i < list.length; i++) {
    if (!best || order[list[i].priority] < order[best.priority]) best = list[i];
  }
  return best;
}

type Tr = (k: string) => string;

function metaLine(b: DisplayBooking, showOrganizer: boolean, showDepartment: boolean): string {
  const parts: string[] = [];
  if (showOrganizer && b.organizer_name) parts.push(b.organizer_name);
  if (showDepartment && b.department_name) parts.push(b.department_name);
  return parts.join(" · ");
}

function Eyebrow({ children, p }: { children: ReactNode; p: Palette }) {
  return (
    <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, letterSpacing: spacing(p, 4), textTransform: "uppercase", color: p.faint }}>
      {children}
    </p>
  );
}

/*
 * Vertical budget (stage 1080): header 168 + footer 164 + body padding 36 → body 712.
 * Split card: 712 − 2×52 padding − 136 status row = 472 for details (occupied ≈ 444).
 * Big card:   712 − 2×56 padding − 156 status row = 444 for details (occupied ≈ 419).
 * Every line has an explicit lineHeight so these numbers hold. Re-check them when changing sizes.
 */
function StatusPanel({
  live,
  now,
  tr,
  p,
  lang,
  big,
  showOrganizer,
  showDepartment,
}: {
  live: LiveState;
  now: number;
  tr: Tr;
  p: Palette;
  lang: Language;
  big?: boolean;
  showOrganizer: boolean;
  showDepartment: boolean;
}) {
  const spec = STATUS_STYLE[live.state];
  const Icon = spec.Icon;
  const cur = live.current;
  const shown = cur || live.next;
  const k = big ? 1.15 : 1;
  // The full-width layout has room for long titles on one line; the split layout wraps to two.
  const titleLines = big ? 1 : 2;
  const meta = shown ? metaLine(shown, showOrganizer, showDepartment) : "";
  const end = lang === "ar" ? "left" : "right";

  let progress = 0;
  if (cur) {
    const s = new Date(cur.start_at).getTime();
    const e = new Date(cur.end_at).getTime();
    progress = e > s ? Math.min(1, Math.max(0, (now - s) / (e - s))) : 0;
  }

  // One short line under the status label: when the room frees up / until when it stays free.
  let subtitle: ReactNode = null;
  if (cur && live.nextAvailableAt) {
    subtitle = (
      <>
        {tr("Free at")} <span style={tabular}>{formatTime(live.nextAvailableAt, lang)}</span>
      </>
    );
  } else if (!cur && live.freeUntil) {
    subtitle = (
      <>
        {tr("Free until")} <span style={tabular}>{formatTime(live.freeUntil, lang)}</span>
      </>
    );
  }

  const countdownStyle: CSSProperties = Object.assign(
    { fontSize: big ? 120 : 100, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: p.secondary },
    tabular,
  );

  return (
    <div
      className="flex h-full flex-col"
      style={cardStyle(p, {
        position: "relative",
        overflow: "hidden",
        padding: big ? "56px 72px" : "52px 56px",
        background:
          "linear-gradient(155deg, " + rgba(spec.rgb, p.dark ? 0.2 : 0.14) + " 0%, " + rgba(spec.rgb, 0.02) + " 55%), " + p.card,
        border: "2px solid " + rgba(spec.rgb, p.dark ? 0.32 : 0.28),
      })}
    >
      {/* Status — icon + text, never color alone */}
      <div className="flex items-center" style={{ flexShrink: 0 }}>
        <div
          className="flex items-center justify-center"
          style={{
            width: 136 * k,
            height: 136 * k,
            borderRadius: 40 * k,
            background: spec.solid,
            color: "#fff",
            flexShrink: 0,
            boxShadow: "0 18px 50px " + rgba(spec.rgb, 0.45),
          }}
        >
          <Icon style={{ width: 80 * k, height: 80 * k }} aria-hidden />
        </div>
        <div style={{ marginInlineStart: 36, minWidth: 0 }}>
          <p
            style={{
              fontSize: 88 * k,
              fontWeight: 800,
              letterSpacing: spacing(p, -1),
              lineHeight: 1,
              color: p.dark ? "#fff" : spec.solid,
            }}
          >
            {tr(spec.label)}
          </p>
          {subtitle ? <p style={{ fontSize: 30 * k, fontWeight: 600, lineHeight: 1.3, marginTop: 12, color: p.muted }}>{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex flex-col justify-end" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {shown ? (
          <>
            <Eyebrow p={p}>{tr(cur ? "In progress" : "Next meeting")}</Eyebrow>
            <p style={Object.assign({ fontSize: 60 * k, fontWeight: 700, lineHeight: 1.12, marginTop: 12 }, clampLines(titleLines))}>{shown.title}</p>
            {meta ? <p style={Object.assign({ fontSize: 32 * k, lineHeight: 1.3, color: p.muted, marginTop: 10 }, ellipsis)}>{meta}</p> : null}

            <div className="flex items-end justify-between" style={{ marginTop: 28 }}>
              <p style={Object.assign({ fontSize: 40 * k, fontWeight: 600, lineHeight: 1.2 }, tabular)}>
                {formatTime(shown.start_at, lang)} – {formatTime(shown.end_at, lang)}
              </p>
              <div style={{ textAlign: end, flexShrink: 0, marginInlineStart: 32 }}>
                <p style={{ fontSize: 28 * k, lineHeight: 1.3, color: p.muted, marginBottom: 6 }}>{tr(cur ? "Remaining" : "Starts in")}</p>
                <p style={countdownStyle}>{formatDuration((cur ? live.remainingMs : live.untilNextMs) || 0)}</p>
              </div>
            </div>

            {/* Meeting progress */}
            {cur ? (
              <div style={{ marginTop: 28, height: 14, borderRadius: 7, background: p.track, overflow: "hidden", flexShrink: 0 }}>
                <div
                  style={{
                    height: "100%",
                    width: Math.round(progress * 1000) / 10 + "%",
                    borderRadius: 7,
                    background: "linear-gradient(90deg, " + spec.solid + ", " + rgba(spec.rgb, 0.75) + ")",
                    transition: "width 1s linear",
                  }}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex items-center">
            <CalendarCheck style={{ width: 64 * k, height: 64 * k, color: STATUS_STYLE.available.solid, marginInlineEnd: 24, flexShrink: 0 }} aria-hidden />
            <p style={{ fontSize: 52 * k, fontWeight: 600, color: p.muted, lineHeight: 1.2 }}>{tr("Free for the rest of the day")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/*
 * Rows are fixed height (≈80px, first ≈126px with its tag, 26px apart) and the list area is ≈528px,
 * so at most 4 fit. Render only those rather than slicing a 5th row in half; the badge shows the full count.
 */
const MAX_VISIBLE_UPCOMING = 4;

function UpcomingList({
  items,
  tr,
  p,
  lang,
  showOrganizer,
  showDepartment,
}: {
  items: DisplayBooking[];
  tr: Tr;
  p: Palette;
  lang: Language;
  showOrganizer: boolean;
  showDepartment: boolean;
}) {
  const ITEM_GAP = 26;
  const visible = items.slice(0, MAX_VISIBLE_UPCOMING);
  return (
    <div className="flex h-full flex-col" style={cardStyle(p, { padding: "48px 44px", overflow: "hidden" })}>
      <div className="flex items-center justify-between" style={{ marginBottom: 36, flexShrink: 0 }}>
        <p style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.3, letterSpacing: spacing(p, -0.5) }}>{tr("Upcoming meetings")}</p>
        {items.length ? (
          <span
            style={Object.assign(
              {
                minWidth: 52,
                height: 52,
                lineHeight: "52px",
                padding: "0 16px",
                borderRadius: 26,
                fontSize: 26,
                fontWeight: 700,
                textAlign: "center" as const,
                background: p.track,
              },
              tabular,
            )}
          >
            {items.length}
          </span>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center" style={{ flex: 1 }}>
          <CalendarCheck style={{ width: 96, height: 96, color: p.faint }} aria-hidden />
          <p style={{ fontSize: 34, lineHeight: 1.3, color: p.muted, marginTop: 24 }}>{tr("No more meetings today")}</p>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {visible.map((b, i) => {
            const first = i === 0;
            const last = i === visible.length - 1;
            const meta = metaLine(b, showOrganizer, showDepartment);
            return (
              <div key={b.id} className="flex" style={{ marginBottom: last ? 0 : ITEM_GAP }}>
                <div style={Object.assign({ width: 150, flexShrink: 0, paddingTop: 2 }, tabular)}>
                  <p style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{formatTime(b.start_at, lang)}</p>
                  <p style={{ fontSize: 24, lineHeight: 1.4, color: p.faint, marginTop: 4 }}>{formatTime(b.end_at, lang)}</p>
                </div>
                {/* Timeline rail */}
                <div style={{ position: "relative", width: 44, flexShrink: 0 }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      left: "50%",
                      width: 20,
                      height: 20,
                      marginLeft: -10,
                      borderRadius: 10,
                      background: first ? p.secondary : "transparent",
                      border: "3px solid " + (first ? p.secondary : p.faint),
                      boxShadow: first ? "0 0 0 8px " + (p.dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)") : "none",
                    }}
                  />
                  {!last ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 38,
                        bottom: -ITEM_GAP + 4,
                        left: "50%",
                        width: 2,
                        marginLeft: -1,
                        background: p.border,
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ minWidth: 0, flex: 1, paddingInlineStart: 12 }}>
                  {first ? (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 20,
                        fontWeight: 700,
                        lineHeight: 1.4,
                        letterSpacing: spacing(p, 2),
                        textTransform: "uppercase",
                        padding: "2px 14px",
                        borderRadius: 999,
                        marginBottom: 8,
                        color: p.secondary,
                        border: "2px solid " + p.secondary,
                      }}
                    >
                      {tr("Up next")}
                    </span>
                  ) : null}
                  <p style={Object.assign({ fontSize: 32, fontWeight: 600, lineHeight: 1.25 }, ellipsis)}>{b.title}</p>
                  {meta ? <p style={Object.assign({ fontSize: 24, lineHeight: 1.4, color: p.muted, marginTop: 4 }, ellipsis)}>{meta}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HeroIcon({ children, rgb, size }: { children: ReactNode; rgb: string; size: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        flexShrink: 0,
        background: rgba(rgb, 0.12),
        border: "3px solid " + rgba(rgb, 0.3),
        boxShadow: "0 0 160px " + rgba(rgb, 0.3),
      }}
    >
      {children}
    </div>
  );
}

// Both bodies below fit 712px: icon + gap + clamped title + clamped message.
function MaintenanceBody({ message, tr, p }: { message: string | null; tr: Tr; p: Palette }) {
  return (
    <div style={{ padding: "0 " + GUTTER + "px", height: "100%" }}>
      <div className="flex h-full flex-col items-center justify-center text-center" style={cardStyle(p, { padding: "0 120px", overflow: "hidden" })}>
        <HeroIcon rgb={STATUS_STYLE.maintenance.rgb} size={260}>
          <Wrench style={{ width: 130, height: 130, color: p.secondary }} aria-hidden />
        </HeroIcon>
        <p style={Object.assign({ fontSize: 88, fontWeight: 800, marginTop: 48, letterSpacing: spacing(p, -1), lineHeight: 1.1 }, clampLines(2))}>
          {tr("ROOM UNDER MAINTENANCE")}
        </p>
        {message ? <p style={Object.assign({ fontSize: 44, color: p.muted, marginTop: 24, lineHeight: 1.3 }, clampLines(3))}>{message}</p> : null}
      </div>
    </div>
  );
}

function AnnouncementBody({
  text,
  featured,
  tr,
  p,
}: {
  text: string | null;
  featured: DisplayAnnouncement | null;
  tr: Tr;
  p: Palette;
}) {
  const critical = featured && (featured.priority === "critical" || featured.priority === "high");
  const rgb = critical ? STATUS_STYLE.upcoming.rgb : "187,157,90";
  return (
    <div style={{ padding: "0 " + GUTTER + "px", height: "100%" }}>
      <div className="flex h-full flex-col items-center justify-center text-center" style={cardStyle(p, { padding: "0 140px", overflow: "hidden" })}>
        <HeroIcon rgb={rgb} size={210}>
          {critical ? (
            <AlertTriangle style={{ width: 110, height: 110, color: "#f59e0b" }} aria-hidden />
          ) : (
            <Megaphone style={{ width: 110, height: 110, color: p.secondary }} aria-hidden />
          )}
        </HeroIcon>
        {featured ? (
          <>
            <p style={Object.assign({ fontSize: 80, fontWeight: 800, marginTop: 44, lineHeight: 1.1 }, clampLines(2))}>{featured.title}</p>
            <p style={Object.assign({ fontSize: 44, color: p.muted, marginTop: 24, lineHeight: 1.35 }, clampLines(3))}>{featured.message}</p>
          </>
        ) : (
          <p style={Object.assign({ fontSize: 72, fontWeight: 700, marginTop: 44, lineHeight: 1.2 }, clampLines(4))}>{text || tr("Announcements")}</p>
        )}
      </div>
    </div>
  );
}
