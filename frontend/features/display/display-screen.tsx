"use client";

/**
 * TV signage screen. Designed on a fixed 1920×1080 stage that is uniformly scaled to the
 * viewport. Compatibility rules (Samsung Tizen 5.5 / Chromium 69):
 *   - no flexbox `gap`, no `inset`, no `aspect-ratio` → use margins + explicit top/left
 *   - no newer JS APIs; fullscreen / wake lock are feature-detected
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, Ban, CheckCircle2, Clock, CircleDot, Megaphone, WifiOff, Wrench } from "lucide-react";
import { translate, type Language } from "@/lib/i18n";
import { formatDuration, formatLongDate, formatTime } from "@/lib/time";
import type { DisplayAnnouncement, DisplayBooking, DisplaySchedule, RoomStatus } from "@/lib/types";
import { computeLive, type LiveState } from "./compute";

const STAGE_W = 1920;
const STAGE_H = 1080;

const STATUS_STYLE: Record<RoomStatus, { bg: string; label: string; Icon: typeof CheckCircle2 }> = {
  available: { bg: "#15803d", label: "AVAILABLE", Icon: CheckCircle2 },
  upcoming: { bg: "#b45309", label: "STARTING SOON", Icon: Clock },
  occupied: { bg: "#b91c1c", label: "OCCUPIED", Icon: CircleDot },
  maintenance: { bg: "#4b5563", label: "ROOM UNDER MAINTENANCE", Icon: Wrench },
  unavailable: { bg: "#4b5563", label: "UNAVAILABLE", Icon: Ban },
};

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

/** Full-viewport black backdrop with the scaled, centered stage. */
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
  return (
    <Stage background="#0b1f1c" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex h-full flex-col items-center justify-center text-center" style={{ color: "#fff", padding: 80 }}>
        {icon ? <div style={{ marginBottom: 40 }}>{icon}</div> : null}
        <p style={{ fontSize: 72, fontWeight: 700 }}>{title}</p>
        {subtitle ? <p style={{ fontSize: 36, marginTop: 24, opacity: 0.75 }}>{subtitle}</p> : null}
      </div>
    </Stage>
  );
}

interface Palette {
  bg: string;
  fg: string;
  muted: string;
  panel: string;
  primary: string;
  secondary: string;
}

function palette(s: DisplaySchedule): Palette {
  const dark = s.settings.theme === "dark";
  return {
    bg: s.settings.background_color || (dark ? "#0b1f1c" : "#f5f7f6"),
    fg: dark ? "#ffffff" : "#0f172a",
    muted: dark ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.6)",
    panel: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    primary: s.settings.primary_color || "#00594F",
    secondary: s.settings.secondary_color || "#BB9D5A",
  };
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

  let body: ReactNode;
  if (mode === "maintenance") {
    body = <MaintenanceBody message={schedule.room.maintenance_message} tr={tr} p={p} />;
  } else if (mode === "announcement") {
    body = <AnnouncementBody text={st.announcement_text} featured={featured} tr={tr} p={p} />;
  } else if (mode === "current_meeting" || mode === "availability") {
    body = (
      <div style={{ padding: "0 80px", height: "100%" }}>
        <StatusPanel live={live} tr={tr} p={p} lang={lang} big showOrganizer={st.show_organizer} showDepartment={st.show_department} />
      </div>
    );
  } else {
    body = (
      <div className="flex h-full" style={{ padding: "0 64px" }}>
        <div style={{ width: "58%", height: "100%" }}>
          <StatusPanel live={live} tr={tr} p={p} lang={lang} showOrganizer={st.show_organizer} showDepartment={st.show_department} />
        </div>
        <div style={{ width: "42%", height: "100%", paddingInlineStart: 48 }}>
          <UpcomingList items={live.upcoming} tr={tr} p={p} lang={lang} showOrganizer={st.show_organizer} showDepartment={st.show_department} />
        </div>
      </div>
    );
  }

  return (
    <Stage background={p.bg} dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex h-full flex-col" style={{ color: p.fg, opacity: dimmed ? 0.35 : 1, transition: "opacity 1s" }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ height: 150, padding: "0 64px", borderBottom: "4px solid " + p.secondary }}>
          <div className="flex items-center">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" style={{ height: 88, maxWidth: 280, objectFit: "contain", marginInlineEnd: 36 }} />
            ) : null}
            <div>
              <p style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{schedule.room.name}</p>
              <p style={{ fontSize: 28, color: p.muted }}>
                {schedule.room.code}
                {schedule.room.location ? " · " + schedule.room.location : ""}
              </p>
            </div>
          </div>
          <div style={{ textAlign: lang === "ar" ? "left" : "right" }}>
            {st.show_clock ? (
              <p style={{ fontSize: 80, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatTime(now, lang)}</p>
            ) : null}
            {st.show_date ? <p style={{ fontSize: 30, color: p.muted, marginTop: 8 }}>{formatLongDate(now, lang)}</p> : null}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, paddingTop: 40, paddingBottom: 32, minHeight: 0 }}>{body}</div>

        {/* Footer */}
        <div className="flex items-center" style={{ height: 120, padding: "0 64px", background: p.panel }}>
          <div style={{ flexShrink: 0, marginInlineEnd: 40 }}>
            <p style={{ fontSize: 26, fontWeight: 600 }}>{schedule.company.name}</p>
            <p style={{ fontSize: 20, color: online ? p.muted : "#f59e0b" }}>
              {online ? (
                tr("Last sync") + " " + (lastSync ? formatTime(lastSync, lang) : "—")
              ) : (
                <span className="inline-flex items-center">
                  <WifiOff style={{ width: 22, height: 22, marginInlineEnd: 8 }} aria-hidden />
                  {tr("Offline — last synced") + " " + (lastSync ? formatTime(lastSync, lang) : "—")}
                </span>
              )}
            </p>
          </div>
          <div style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
            {announcements.length && mode !== "announcement" ? (
              <div className="tv-marquee" style={{ fontSize: 34 }}>
                {announcements.map((a) => (
                  <span key={a.id} style={{ marginInlineEnd: 120 }}>
                    <Megaphone style={{ display: "inline", width: 30, height: 30, marginInlineEnd: 12, color: p.secondary }} aria-hidden />
                    <b>{a.title}</b> — {a.message}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {st.show_qr_code && schedule.qr_target_url ? (
            <div className="flex items-center" style={{ flexShrink: 0, marginInlineStart: 32 }}>
              <span style={{ fontSize: 22, color: p.muted, marginInlineEnd: 16 }}>{tr("Scan to book")}</span>
              <div style={{ background: "#fff", padding: 8, borderRadius: 8 }}>
                <QRCodeSVG value={schedule.qr_target_url} size={88} />
              </div>
            </div>
          ) : null}
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

function StatusPanel({
  live,
  tr,
  p,
  lang,
  big,
  showOrganizer,
  showDepartment,
}: {
  live: LiveState;
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
  return (
    <div className="flex h-full flex-col" style={{ borderRadius: 32, overflow: "hidden", background: p.panel }}>
      {/* Status banner — icon + text, never color alone */}
      <div className="flex items-center" style={{ background: spec.bg, color: "#fff", padding: big ? "48px 56px" : "36px 48px" }}>
        <Icon style={{ width: big ? 120 : 96, height: big ? 120 : 96, marginInlineEnd: 32, flexShrink: 0 }} aria-hidden />
        <p style={{ fontSize: big ? 120 : 92, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>{tr(spec.label)}</p>
      </div>

      <div className="flex flex-col justify-center" style={{ flex: 1, padding: big ? "48px 56px" : "36px 48px" }}>
        {cur ? (
          <>
            <p style={{ fontSize: big ? 84 : 64, fontWeight: 700, lineHeight: 1.15 }}>{cur.title}</p>
            {metaLine(cur, showOrganizer, showDepartment) ? (
              <p style={{ fontSize: big ? 44 : 36, color: p.muted, marginTop: 16 }}>{metaLine(cur, showOrganizer, showDepartment)}</p>
            ) : null}
            <p style={{ fontSize: big ? 56 : 44, marginTop: 28, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(cur.start_at, lang)} – {formatTime(cur.end_at, lang)}
            </p>
            <div className="flex items-center" style={{ marginTop: 32 }}>
              <span style={{ fontSize: big ? 40 : 34, color: p.muted, marginInlineEnd: 20 }}>{tr("Remaining")}</span>
              <span style={{ fontSize: big ? 96 : 76, fontWeight: 800, color: p.secondary, fontVariantNumeric: "tabular-nums" }}>
                {formatDuration(live.remainingMs || 0)}
              </span>
            </div>
            {live.nextAvailableAt ? (
              <p style={{ fontSize: big ? 36 : 30, color: p.muted, marginTop: 16 }}>
                {tr("Free at")} {formatTime(live.nextAvailableAt, lang)}
              </p>
            ) : null}
          </>
        ) : live.state === "maintenance" ? null : live.next ? (
          <>
            <p style={{ fontSize: big ? 44 : 36, color: p.muted }}>{tr("Next meeting")}</p>
            <p style={{ fontSize: big ? 76 : 60, fontWeight: 700, marginTop: 12, lineHeight: 1.15 }}>{live.next.title}</p>
            <p style={{ fontSize: big ? 52 : 42, marginTop: 20, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(live.next.start_at, lang)} – {formatTime(live.next.end_at, lang)}
            </p>
            <div className="flex items-center" style={{ marginTop: 32 }}>
              <span style={{ fontSize: big ? 40 : 34, color: p.muted, marginInlineEnd: 20 }}>{tr("Starts in")}</span>
              <span style={{ fontSize: big ? 96 : 76, fontWeight: 800, color: p.secondary, fontVariantNumeric: "tabular-nums" }}>
                {formatDuration(live.untilNextMs || 0)}
              </span>
            </div>
          </>
        ) : (
          <p style={{ fontSize: big ? 64 : 52, color: p.muted }}>{tr("Free for the rest of the day")}</p>
        )}
      </div>
    </div>
  );
}

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
  return (
    <div className="flex h-full flex-col">
      <p style={{ fontSize: 40, fontWeight: 700, marginBottom: 24, color: p.secondary }}>{tr("Upcoming meetings")}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 36, color: p.muted }}>{tr("No more meetings today")}</p>
      ) : (
        <div style={{ overflow: "hidden" }}>
          {items.map((b) => (
            <div
              key={b.id}
              className="flex"
              style={{ background: p.panel, borderRadius: 20, padding: "22px 28px", marginBottom: 18, borderInlineStart: "8px solid " + p.primary }}
            >
              <div style={{ width: 230, flexShrink: 0, fontSize: 34, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {formatTime(b.start_at, lang)}
                <span style={{ display: "block", fontSize: 26, fontWeight: 400, color: p.muted }}>{formatTime(b.end_at, lang)}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 34, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</p>
                {metaLine(b, showOrganizer, showDepartment) ? (
                  <p style={{ fontSize: 26, color: p.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {metaLine(b, showOrganizer, showDepartment)}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenanceBody({ message, tr, p }: { message: string | null; tr: Tr; p: Palette }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center" style={{ padding: "0 120px" }}>
      <Wrench style={{ width: 220, height: 220, color: p.secondary }} aria-hidden />
      <p style={{ fontSize: 110, fontWeight: 800, marginTop: 40 }}>{tr("ROOM UNDER MAINTENANCE")}</p>
      {message ? <p style={{ fontSize: 48, color: p.muted, marginTop: 24 }}>{message}</p> : null}
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
  return (
    <div className="flex h-full flex-col items-center justify-center text-center" style={{ padding: "0 140px" }}>
      {critical ? (
        <AlertTriangle style={{ width: 180, height: 180, color: "#f59e0b" }} aria-hidden />
      ) : (
        <Megaphone style={{ width: 180, height: 180, color: p.secondary }} aria-hidden />
      )}
      {featured ? (
        <>
          <p style={{ fontSize: 96, fontWeight: 800, marginTop: 40, lineHeight: 1.1 }}>{featured.title}</p>
          <p style={{ fontSize: 52, color: p.muted, marginTop: 28, lineHeight: 1.3 }}>{featured.message}</p>
        </>
      ) : (
        <p style={{ fontSize: 80, fontWeight: 700, marginTop: 40, lineHeight: 1.2 }}>{text || tr("Announcements")}</p>
      )}
    </div>
  );
}
