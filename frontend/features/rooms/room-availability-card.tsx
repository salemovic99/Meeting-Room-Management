"use client";

import { motion } from "framer-motion";
import { Clock, Users } from "lucide-react";
import { RoomStatusBadge } from "@/components/common/status-badge";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";
import { formatRange, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Availability } from "@/lib/types";

const RING: Record<Availability["status"], string> = {
  available: "border-s-success",
  upcoming: "border-s-warning",
  occupied: "border-s-destructive",
  maintenance: "border-s-muted-foreground",
  unavailable: "border-s-muted-foreground",
};

export function RoomAvailabilityCard({ a, index = 0 }: { a: Availability; index?: number }) {
  const t = useT();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className={cn("h-full border-s-4 p-4", RING[a.status])}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{a.room_name}</p>
            <p className="text-xs text-muted-foreground">
              {a.room_code}
              {a.location ? ` · ${a.location}` : ""}
            </p>
          </div>
          <RoomStatusBadge status={a.status} />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {a.current_booking ? (
            <div>
              <p className="text-xs text-muted-foreground">{t("Now")}</p>
              <p className="font-medium">{a.current_booking.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatRange(a.current_booking.start_at, a.current_booking.end_at)}
                {a.current_booking.organizer_name ? ` · ${a.current_booking.organizer_name}` : ""}
              </p>
            </div>
          ) : null}
          {a.next_booking ? (
            <div>
              <p className="text-xs text-muted-foreground">{t("Next")}</p>
              <p className="font-medium">{a.next_booking.title}</p>
              <p className="text-xs text-muted-foreground">{formatRange(a.next_booking.start_at, a.next_booking.end_at)}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("No more meetings today")}</p>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden /> {a.capacity}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {a.status === "occupied" && a.next_available_at
              ? `${t("Free at")} ${formatTime(a.next_available_at)}`
              : a.free_until
                ? `${t("Free until")} ${formatTime(a.free_until)}`
                : a.status === "available"
                  ? t("Free for the rest of the day")
                  : "—"}
          </span>
        </div>
      </Card>
    </motion.div>
  );
}
