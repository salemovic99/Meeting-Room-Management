"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { formatDate, formatRange } from "@/lib/time";
import type { Booking } from "@/lib/types";
import { useCancelBooking, useCancelSeries } from "./api";

export function CancelBookingDialog({
  booking,
  scope = "single",
  open,
  onOpenChange,
  onDone,
}: {
  booking: Booking | null;
  scope?: "single" | "series";
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const cancelOne = useCancelBooking();
  const cancelSeries = useCancelSeries();

  if (!booking) return null;
  const series = scope === "series" && booking.series_id;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("");
        onOpenChange(o);
      }}
      destructive
      title={series ? t("Cancel all future occurrences?") : t("Cancel reservation?")}
      description={
        <>
          <strong>{booking.title}</strong> · {booking.room.name} · {formatDate(booking.start_at)}{" "}
          {formatRange(booking.start_at, booking.end_at)}
        </>
      }
      confirmLabel={series ? t("Cancel series") : t("Cancel reservation")}
      onConfirm={async () => {
        try {
          if (series && booking.series_id) {
            const res = await cancelSeries.mutateAsync({ id: booking.series_id, reason });
            toast.success(t("{n} occurrences cancelled", { n: res.cancelled_count }));
          } else {
            await cancelOne.mutateAsync({ id: booking.id, reason });
            toast.success(t("Reservation cancelled"));
          }
          onDone?.();
        } catch (err) {
          toast.error(errorMessage(err));
          throw err;
        }
      }}
    >
      <FormField label={t("Reason (optional)")} htmlFor="cancel-reason">
        <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </ConfirmDialog>
  );
}
