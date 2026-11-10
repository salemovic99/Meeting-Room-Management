"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BookingStatusBadge } from "@/components/common/status-badge";
import { LoadingBlock } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRooms } from "@/features/rooms/api";
import { ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { formatDate, formatRange, toTimeInput } from "@/lib/time";
import { MEETING_TYPES } from "@/lib/types";
import { seriesFormSchema, type SeriesFormValues } from "@/schemas/booking";
import { useSeries, useUpdateSeries } from "./api";
import { ConflictList, conflictsFromError, type ConflictLike } from "./conflict-list";
import { MEETING_TYPE_LABELS } from "./labels";

/** View a recurring series and edit all future occurrences at once. */
export function SeriesDialog({
  seriesId,
  open,
  onOpenChange,
}: {
  seriesId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const { data, isLoading } = useSeries(open ? seriesId : null);
  const rooms = useRooms();
  const update = useUpdateSeries();
  const [conflicts, setConflicts] = useState<ConflictLike[]>([]);
  const first = data?.occurrences.find((o) => o.status !== "cancelled") ?? data?.occurrences[0];
  const canManage = !!first?.can_manage;

  const form = useForm<SeriesFormValues>({ resolver: zodResolver(seriesFormSchema) });
  const errors = form.formState.errors;

  const firstKey = first ? `${first.id}:${first.updated_at}` : "";
  useEffect(() => {
    if (first) {
      form.reset({
        title: first.title,
        room_id: first.room_id,
        start_time: toTimeInput(first.start_at),
        end_time: toTimeInput(first.end_at),
        attendee_count: first.attendee_count,
        meeting_type: first.meeting_type,
        description: first.description ?? "",
        notes: first.notes ?? "",
      });
      setConflicts([]);
    }
    // Re-seed only when the first occurrence actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!seriesId) return;
    setConflicts([]);
    try {
      await update.mutateAsync({
        id: seriesId,
        data: { ...v, attendee_count: Number(v.attendee_count), description: v.description || null, notes: v.notes || null },
      });
      toast.success(t("Series updated"));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "booking_conflict") setConflicts(conflictsFromError(err.details));
      toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Recurring series")}</DialogTitle>
          {data ? (
            <DialogDescription>
              {data.series.recurrence_rule} · {data.series.series_start_date} → {data.series.series_end_date}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {isLoading || !data ? (
          <LoadingBlock />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium">{t("Occurrences")} ({data.occurrences.length})</h4>
              <ul className="max-h-[50vh] space-y-1 overflow-y-auto pe-1 text-sm">
                {data.occurrences.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                    <span>
                      <span className="font-medium">{formatDate(o.start_at)}</span>{" "}
                      <span className="tabular-nums text-muted-foreground">{formatRange(o.start_at, o.end_at)}</span>
                      {o.is_series_exception ? <span className="ms-1 text-xs text-secondary">({t("edited")})</span> : null}
                    </span>
                    <BookingStatusBadge status={o.effective_status} />
                  </li>
                ))}
              </ul>
            </div>
            {canManage ? (
              <form onSubmit={onSubmit} className="space-y-3" noValidate>
                <h4 className="text-sm font-medium">{t("Edit all future occurrences")}</h4>
                <FormField label={t("Title")} htmlFor="sr-title" error={errors.title?.message} required>
                  <Input id="sr-title" {...form.register("title")} />
                </FormField>
                <FormField label={t("Room")} htmlFor="sr-room" required>
                  <NativeSelect id="sr-room" {...form.register("room_id")}>
                    {rooms.data?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t("Start time")} htmlFor="sr-start" error={errors.start_time?.message} required>
                    <Input id="sr-start" type="time" {...form.register("start_time")} />
                  </FormField>
                  <FormField label={t("End time")} htmlFor="sr-end" error={errors.end_time?.message} required>
                    <Input id="sr-end" type="time" {...form.register("end_time")} />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t("Attendees")} htmlFor="sr-att" error={errors.attendee_count?.message} required>
                    <Input id="sr-att" type="number" min={1} {...form.register("attendee_count")} />
                  </FormField>
                  <FormField label={t("Meeting type")} htmlFor="sr-type" required>
                    <NativeSelect id="sr-type" {...form.register("meeting_type")}>
                      {MEETING_TYPES.map((m) => (
                        <option key={m} value={m}>
                          {t(MEETING_TYPE_LABELS[m])}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>
                <FormField label={t("Description")} htmlFor="sr-desc">
                  <Textarea id="sr-desc" rows={2} {...form.register("description")} />
                </FormField>
                <FormField label={t("Notes")} htmlFor="sr-notes">
                  <Textarea id="sr-notes" rows={2} {...form.register("notes")} />
                </FormField>
                <ConflictList conflicts={conflicts} heading={t("Some occurrences would conflict — nothing was changed")} />
                <DialogFooter>
                  <Button type="submit" disabled={update.isPending}>
                    {update.isPending ? <Loader2 className="animate-spin" /> : null}
                    {t("Save series")}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">{t("You can view this series but not modify it.")}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
