"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-provider";
import { useDepartments } from "@/features/departments/api";
import { useRooms } from "@/features/rooms/api";
import { OrganizerPicker } from "@/features/users/organizer-picker";
import { useDebounce } from "@/hooks/use-debounce";
import { ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { buildIso, toDateInput, toTimeInput, todayRiyadh } from "@/lib/time";
import { cn } from "@/lib/utils";
import { MEETING_TYPES, type Booking, type BookingCreate } from "@/lib/types";
import { bookingFormSchema, type BookingFormValues } from "@/schemas/booking";
import { useConflictCheck, useCreateBooking, useCreateRecurring, useUpdateBooking } from "./api";
import { ConflictList, conflictsFromError, type ConflictLike } from "./conflict-list";
import { MEETING_TYPE_LABELS, WEEKDAY_LABELS } from "./labels";

export interface BookingPrefill {
  room_id?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
}

export function BookingFormDialog({
  open,
  onOpenChange,
  booking,
  prefill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Present → edit mode. */
  booking?: Booking | null;
  prefill?: BookingPrefill;
}) {
  const t = useT();
  const { user, can } = useAuth();
  const isEdit = !!booking;
  const canPickOrganizer = can(["users.lookup", "users.read"]);
  const canOverride = can("bookings.override_capacity");

  const rooms = useRooms();
  const departments = useDepartments(false, open);
  const createBooking = useCreateBooking();
  const createRecurring = useCreateRecurring();
  const updateBooking = useUpdateBooking();

  const [organizerName, setOrganizerName] = useState<string>("");
  const [serverConflicts, setServerConflicts] = useState<ConflictLike[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const defaults = useMemo<BookingFormValues>(() => {
    if (booking) {
      return {
        title: booking.title,
        room_id: booking.room_id,
        organizer_id: booking.organizer_id,
        department_id: booking.department_id,
        date: toDateInput(booking.start_at),
        start_time: toTimeInput(booking.start_at),
        end_time: toTimeInput(booking.end_at),
        attendee_count: booking.attendee_count,
        meeting_type: booking.meeting_type,
        description: booking.description ?? "",
        notes: booking.notes ?? "",
        override_capacity: false,
        recurring: false,
        frequency: "weekly",
        interval: 1,
        weekdays: [],
        end_date: "",
        skip_conflicts: false,
      };
    }
    return {
      title: "",
      room_id: prefill?.room_id ?? "",
      organizer_id: user?.id,
      department_id: user?.department_id ?? "",
      date: prefill?.date ?? todayRiyadh(),
      start_time: prefill?.start_time ?? "09:00",
      end_time: prefill?.end_time ?? "10:00",
      attendee_count: 2,
      meeting_type: "internal",
      description: "",
      notes: "",
      override_capacity: false,
      recurring: false,
      frequency: "weekly",
      interval: 1,
      weekdays: [],
      end_date: "",
      skip_conflicts: false,
    };
  }, [booking, prefill, user]);

  const form = useForm<BookingFormValues>({ resolver: zodResolver(bookingFormSchema), defaultValues: defaults });
  const { register, watch, setValue, formState, reset } = form;
  const errors = formState.errors;

  // Reset only when the dialog opens, so a realtime refetch of `booking` can't wipe in-progress edits.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset(defaults);
      setOrganizerName(booking?.organizer.full_name ?? user?.full_name ?? "");
      setServerConflicts([]);
      setFormError(null);
    }
    wasOpen.current = open;
  }, [open, defaults, reset, booking, user]);

  const values = watch();
  const room = rooms.data?.find((r) => r.id === values.room_id);
  const overCapacity = !!room && Number(values.attendee_count) > room.capacity;

  // Live conflict check (debounced). Only for the first occurrence of a series; the server validates every occurrence.
  // Debounce a string key (not an object) so re-renders don't keep restarting the timer.
  const slotKey = JSON.stringify({
    room_id: values.room_id || undefined,
    start_at: values.date && values.start_time ? buildIso(values.date, values.start_time) : undefined,
    end_at: values.date && values.end_time ? buildIso(values.date, values.end_time) : undefined,
    exclude_booking_id: booking?.id,
  });
  const debouncedKey = useDebounce(slotKey, 400);
  const debouncedSlot = useMemo(
    () => JSON.parse(debouncedKey) as { room_id?: string; start_at?: string; end_at?: string; exclude_booking_id?: string },
    [debouncedKey],
  );
  const conflictCheck = useConflictCheck(open ? debouncedSlot : {});
  const liveConflicts = conflictCheck.data?.conflicts ?? [];

  const busy = createBooking.isPending || createRecurring.isPending || updateBooking.isPending;

  const onSubmit = form.handleSubmit(async (v) => {
    setServerConflicts([]);
    setFormError(null);
    const payload: BookingCreate = {
      room_id: v.room_id,
      title: v.title,
      meeting_type: v.meeting_type,
      start_at: buildIso(v.date, v.start_time),
      end_at: buildIso(v.date, v.end_time),
      attendee_count: Number(v.attendee_count),
      description: v.description || null,
      notes: v.notes || null,
      override_capacity: canOverride ? v.override_capacity : undefined,
    };
    if (canPickOrganizer && v.organizer_id) payload.organizer_id = v.organizer_id;
    if (v.department_id) payload.department_id = v.department_id;

    try {
      if (isEdit && booking) {
        await updateBooking.mutateAsync({ id: booking.id, data: payload });
        toast.success(t("Reservation updated"));
      } else if (v.recurring) {
        const res = await createRecurring.mutateAsync({
          ...payload,
          recurrence: {
            frequency: v.frequency,
            interval: Number(v.interval),
            weekdays: v.frequency === "weekly" ? v.weekdays : undefined,
            end_date: v.end_date as string,
          },
          skip_conflicts: v.skip_conflicts,
        });
        toast.success(
          t("Created {n} occurrences", { n: res.created.length }) +
            (res.skipped.length ? ` · ${t("{n} skipped due to conflicts", { n: res.skipped.length })}` : ""),
        );
      } else {
        await createBooking.mutateAsync(payload);
        toast.success(t("Reservation created"));
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "booking_conflict") {
        setServerConflicts(conflictsFromError(err.details));
        setFormError(err.message);
      } else if (err instanceof ApiError && err.status === 422) {
        const fe = err.fieldErrors;
        Object.entries(fe).forEach(([k, msg]) => {
          if (k in v) form.setError(k as keyof BookingFormValues, { message: msg });
        });
        setFormError(err.message);
      } else {
        setFormError(errorMessage(err));
      }
    }
  });

  const toggleWeekday = (d: number) => {
    const cur = values.weekdays ?? [];
    setValue("weekdays", cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort(), { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Edit reservation") : t("New reservation")}</DialogTitle>
          {isEdit && booking?.series_id ? (
            <DialogDescription>
              {t("You are editing a single occurrence of a recurring series.")}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label={t("Title")} htmlFor="bk-title" error={errors.title?.message} required className="sm:col-span-2">
            <Input id="bk-title" {...register("title")} />
          </FormField>

          <FormField label={t("Room")} htmlFor="bk-room" error={errors.room_id?.message} required>
            <NativeSelect id="bk-room" {...register("room_id")}>
              <option value="">{t("Select room")}</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id} disabled={r.maintenance_mode}>
                  {r.name} ({r.code}) · {r.capacity} {t("seats")}
                  {r.maintenance_mode ? ` · ${t("Maintenance")}` : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <FormField label={t("Meeting type")} htmlFor="bk-type" error={errors.meeting_type?.message} required>
            <NativeSelect id="bk-type" {...register("meeting_type")}>
              {MEETING_TYPES.map((m) => (
                <option key={m} value={m}>
                  {t(MEETING_TYPE_LABELS[m])}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <FormField label={t("Organizer")} htmlFor="bk-organizer" required>
            {canPickOrganizer ? (
              <OrganizerPicker
                id="bk-organizer"
                value={values.organizer_id}
                selectedName={organizerName}
                onSelect={(u) => {
                  setValue("organizer_id", u.id);
                  setOrganizerName(u.full_name);
                  if (u.department_id) setValue("department_id", u.department_id);
                }}
              />
            ) : (
              <Input id="bk-organizer" value={organizerName} disabled readOnly />
            )}
          </FormField>

          <FormField label={t("Department")} htmlFor="bk-dept" error={errors.department_id?.message} required>
            <NativeSelect id="bk-dept" {...register("department_id")}>
              <option value="">{t("Organizer's department")}</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <FormField label={t("Date")} htmlFor="bk-date" error={errors.date?.message} required>
            <Input id="bk-date" type="date" {...register("date")} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("Start time")} htmlFor="bk-start" error={errors.start_time?.message} required>
              <Input id="bk-start" type="time" step={300} {...register("start_time")} />
            </FormField>
            <FormField label={t("End time")} htmlFor="bk-end" error={errors.end_time?.message} required>
              <Input id="bk-end" type="time" step={300} {...register("end_time")} />
            </FormField>
          </div>

          <FormField
            label={t("Attendees")}
            htmlFor="bk-attendees"
            error={errors.attendee_count?.message}
            hint={room ? t("Room capacity: {n}", { n: room.capacity }) : undefined}
            required
          >
            <Input id="bk-attendees" type="number" min={1} {...register("attendee_count")} />
          </FormField>

          <div className="flex flex-col justify-end">
            {overCapacity ? (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-2 text-xs text-warning">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {t("Attendees exceed room capacity ({n}).", { n: room?.capacity ?? 0 })}
                </p>
                {canOverride ? (
                  <label className="mt-2 flex items-center gap-2 text-foreground">
                    <Checkbox
                      checked={values.override_capacity}
                      onCheckedChange={(c) => setValue("override_capacity", c === true)}
                    />
                    {t("Override capacity limit")}
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>

          <FormField label={t("Description")} htmlFor="bk-desc" className="sm:col-span-2">
            <Textarea id="bk-desc" rows={2} {...register("description")} />
          </FormField>
          <FormField label={t("Notes")} htmlFor="bk-notes" className="sm:col-span-2">
            <Textarea id="bk-notes" rows={2} {...register("notes")} />
          </FormField>

          {!isEdit ? (
            <div className="space-y-3 rounded-lg border p-3 sm:col-span-2">
              <label className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Repeat className="h-4 w-4" aria-hidden /> {t("Recurring meeting")}
                </span>
                <Switch checked={values.recurring} onCheckedChange={(c) => setValue("recurring", c)} />
              </label>
              {values.recurring ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label={t("Repeats")} htmlFor="bk-freq">
                    <NativeSelect id="bk-freq" {...register("frequency")}>
                      <option value="daily">{t("Daily")}</option>
                      <option value="weekly">{t("Weekly")}</option>
                      <option value="monthly">{t("Monthly")}</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label={t("Every")} htmlFor="bk-interval" error={errors.interval?.message}>
                    <Input id="bk-interval" type="number" min={1} max={12} {...register("interval")} />
                  </FormField>
                  <FormField label={t("Until")} htmlFor="bk-until" error={errors.end_date?.message} required>
                    <Input id="bk-until" type="date" min={values.date} {...register("end_date")} />
                  </FormField>
                  {values.frequency === "weekly" ? (
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label>{t("On")}</Label>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Weekdays")}>
                        {WEEKDAY_LABELS.map((d, i) => {
                          const on = values.weekdays?.includes(i);
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleWeekday(i)}
                              className={cn(
                                "h-9 min-w-12 rounded-md border px-2 text-sm",
                                on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                              )}
                            >
                              {t(d)}
                            </button>
                          );
                        })}
                      </div>
                      {errors.weekdays?.message ? (
                        <p className="text-xs text-destructive">{errors.weekdays.message}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="flex items-start gap-2 text-sm sm:col-span-3">
                    <Checkbox
                      checked={values.skip_conflicts}
                      onCheckedChange={(c) => setValue("skip_conflicts", c === true)}
                      className="mt-0.5"
                    />
                    <span>
                      {t("Skip conflicting dates")}
                      <span className="block text-xs text-muted-foreground">
                        {t("Off: nothing is created if any date conflicts. On: conflicting dates are skipped and reported.")}
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2" aria-live="polite">
            {serverConflicts.length ? (
              <ConflictList conflicts={serverConflicts} />
            ) : liveConflicts.length ? (
              <ConflictList conflicts={liveConflicts} />
            ) : conflictCheck.data && !conflictCheck.data.has_conflict ? (
              <p className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t("Room is free at this time")}
              </p>
            ) : null}
            {formError && !serverConflicts.length ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {isEdit ? t("Save") : t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
