"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, refreshSession, wsUrl } from "@/lib/api";
import { ReconnectingSocket, type SocketState } from "@/lib/ws";
import type { RealtimeMessage } from "@/lib/types";

const BOOKING_KEYS = ["bookings", "calendar", "availability", "overview", "analytics", "series", "room-bookings"];

/** Keeps dashboard data fresh: invalidates TanStack queries when the backend publishes events. */
export function useDashboardSocket(enabled: boolean): SocketState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SocketState>("closed");

  useEffect(() => {
    if (!enabled) return;

    const invalidate = (keys: string[]) => {
      keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
    };

    const socket = new ReconnectingSocket({
      url: wsUrl("/ws/dashboard"),
      getToken: async () => getAccessToken() ?? (await refreshSession())?.access_token ?? null,
      onStateChange: setState,
      // Reconnected after a gap: anything may have changed.
      onAuthenticated: () => invalidate([...BOOKING_KEYS, "devices", "rooms", "announcements"]),
      onServerClose: (code) => {
        if (code === 4401) void refreshSession();
        return true;
      },
      onMessage: (msg: RealtimeMessage) => {
        if (msg.type.indexOf("booking.") === 0) invalidate(BOOKING_KEYS);
        else if (msg.type === "room.status_changed") invalidate(["availability", "overview", "rooms"]);
        else if (msg.type === "display.device_status") invalidate(["devices"]);
        else if (msg.type === "display.announcement_updated") invalidate(["announcements"]);
        else if (msg.type === "display.settings_updated") invalidate(["display-settings"]);
      },
    });
    socket.start();
    return () => socket.stop();
  }, [enabled, queryClient]);

  return state;
}
