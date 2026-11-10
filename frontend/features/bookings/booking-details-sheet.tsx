"use client";

import { useState } from "react";
import { CalendarClock, DoorOpen, Lock, Pencil, Repeat, User, Users, XCircle } from "lucide-react";
import { BookingStatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { formatDateTime, formatLongDate, formatRange } from "@/lib/time";
import type { Booking } from "@/lib/types";
import { useBooking } from "./api";
import { BookingFormDialog } from "./booking-form-dialog";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import { SeriesDialog } from "./series-dialog";
import { MEETING_TYPE_LABELS } from "./labels";

export function BookingDetailsSheet({
  booking: initial,
  open,
  onOpenChange,
}: {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelScope, setCancelScope] = useState<"single" | "series" | null>(null);
  const [seriesOpen, setSeriesOpen] = useState(false);
  // Always show the freshest copy (it may have been edited/cancelled via realtime or this sheet).
  const fresh = useBooking(open && initial ? initial.id : null);
  const booking = fresh.data ?? initial;

  if (!booking) return null;
  const active = booking.status !== "cancelled" && booking.effective_status !== "completed";

  const row = (Icon: typeof User, label: string, value: React.ReactNode) => (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center gap-2">
              <BookingStatusBadge status={booking.effective_status} />
              {booking.redacted ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden /> {t("Private")}
                </span>
              ) : null}
            </div>
            <SheetTitle className="pe-6">{booking.title}</SheetTitle>
            <SheetDescription>{t(MEETING_TYPE_LABELS[booking.meeting_type])}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {row(CalendarClock, t("When"), (
              <>
                {formatLongDate(booking.start_at)}
                <br />
                <span className="tabular-nums">{formatRange(booking.start_at, booking.end_at)}</span>
              </>
            ))}
            {row(DoorOpen, t("Room"), `${booking.room.name} (${booking.room.code})`)}
            {row(User, t("Organizer"), (
              <>
                {booking.organizer.full_name}
                {booking.organizer.email ? <span className="block text-xs text-muted-foreground">{booking.organizer.email}</span> : null}
              </>
            ))}
            {row(Users, t("Department · Attendees"), `${booking.department.name} · ${booking.attendee_count}`)}
            {booking.series_id ? row(Repeat, t("Recurring"), (
              <Button variant="link" className="h-auto p-0" onClick={() => setSeriesOpen(true)}>
                {t("View series")}
              </Button>
            )) : null}
            {booking.description ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("Description")}</p>
                <p className="whitespace-pre-wrap text-sm">{booking.description}</p>
              </div>
            ) : null}
            {booking.notes ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("Notes")}</p>
                <p className="whitespace-pre-wrap text-sm">{booking.notes}</p>
              </div>
            ) : null}
            {booking.cancelled_at ? (
              <div className="rounded-md bg-destructive/10 p-3 text-sm">
                {t("Cancelled")} {formatDateTime(booking.cancelled_at)}
                {booking.cancellation_reason ? <> — {booking.cancellation_reason}</> : null}
              </div>
            ) : null}

            {booking.can_manage && active ? (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil /> {booking.series_id ? t("Edit this occurrence") : t("Edit")}
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => setCancelScope("single")}>
                    <XCircle /> {booking.series_id ? t("Cancel this occurrence") : t("Cancel reservation")}
                  </Button>
                  {booking.series_id ? (
                    <>
                      <Button variant="outline" onClick={() => setSeriesOpen(true)}>
                        <Repeat /> {t("Edit series")}
                      </Button>
                      <Button variant="destructive" onClick={() => setCancelScope("series")}>
                        <XCircle /> {t("Cancel series")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <BookingFormDialog open={editOpen} onOpenChange={setEditOpen} booking={booking} />
      <CancelBookingDialog
        booking={booking}
        scope={cancelScope ?? "single"}
        open={cancelScope !== null}
        onOpenChange={(o) => !o && setCancelScope(null)}
        onDone={() => onOpenChange(false)}
      />
      <SeriesDialog seriesId={booking.series_id} open={seriesOpen} onOpenChange={setSeriesOpen} />
    </>
  );
}
