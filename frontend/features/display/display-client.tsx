"use client";

import { useEffect } from "react";
import { KeyRound, Loader2, MonitorX, ShieldOff } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { translate } from "@/lib/i18n";
import { DisplayScreen, MessageScreen } from "./display-screen";
import { useDisplay } from "./use-display";

/** Try to enter fullscreen on first interaction (browsers require a user gesture). */
function useKioskBehaviour() {
  useEffect(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      documentElement: HTMLElement & { webkitRequestFullscreen?: () => void };
    };
    const enter = () => {
      try {
        const el = doc.documentElement;
        if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
        if (el.requestFullscreen) {
          // Chromium < 71 returns undefined instead of a Promise.
          const r = el.requestFullscreen() as Promise<void> | undefined;
          if (r && typeof r.catch === "function") r.catch(() => undefined);
        }
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (e) {
        /* not supported */
      }
    };
    window.addEventListener("click", enter);
    window.addEventListener("keydown", enter);

    // Keep the screen awake where the Wake Lock API exists (feature-detected; absent on older TVs).
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const requestLock = () => {
      if (nav.wakeLock && document.visibilityState === "visible") {
        nav.wakeLock
          .request("screen")
          .then((l) => (lock = l))
          .catch(() => undefined);
      }
    };
    requestLock();
    document.addEventListener("visibilitychange", requestLock);

    return () => {
      window.removeEventListener("click", enter);
      window.removeEventListener("keydown", enter);
      document.removeEventListener("visibilitychange", requestLock);
      if (lock) void lock.release().catch(() => undefined);
    };
  }, []);
}

export function DisplayClient({ slug }: { slug: string }) {
  useKioskBehaviour();
  const d = useDisplay(slug);
  const now = useNow(1000, d.clockOffset);
  const lang = d.schedule?.settings.language === "ar" ? "ar" : "en";
  const tr = (k: string) => translate(lang, k);
  const iconStyle = { width: 160, height: 160, color: "#BB9D5A" };

  if (d.phase === "unpaired") {
    return (
      <MessageScreen
        lang={lang}
        icon={<KeyRound style={iconStyle} aria-hidden />}
        title={tr("Display not paired")}
        subtitle={`/display/${slug} — ${tr("Ask IT to pair this display.")}`}
      />
    );
  }
  if (d.phase === "revoked") {
    return (
      <MessageScreen
        lang={lang}
        icon={<ShieldOff style={iconStyle} aria-hidden />}
        title={tr("Display credentials revoked")}
        subtitle={tr("Ask IT to pair this display.")}
      />
    );
  }
  if (d.phase === "wrong_room") {
    return (
      <MessageScreen
        lang={lang}
        icon={<MonitorX style={iconStyle} aria-hidden />}
        title={tr("This display is assigned to a different room")}
        subtitle={`/display/${slug}`}
      />
    );
  }
  if (!d.schedule) {
    return <MessageScreen icon={<Loader2 style={iconStyle} className="animate-spin" aria-hidden />} title="…" subtitle={`/display/${slug}`} />;
  }

  return <DisplayScreen schedule={d.schedule} now={now} lastSync={d.lastSync} online={d.socket === "open" && d.reachable} />;
}
