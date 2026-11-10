"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock, Loader2, MapPin, Minus, Plus, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { RoomStatusBadge, BookingStatusBadge } from "@/components/common/status-badge";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { ConflictList, conflictsFromError, type ConflictLike } from "@/features/bookings/conflict-list";
import { useCancelBooking, useCreateBooking } from "@/features/bookings/api";
import { useQuickBook } from "@/features/qr-booking/api";
import { ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { formatDuration, formatRange, formatTime } from "@/lib/time";
import type { Booking, QuickBookBlockReason, QuickBookInfo, TimeSlot } from "@/lib/types";
import { cn } from "@/lib/utils";

const LATER_DURATIONS = [30, 60, 90, 120];
const MINUTE = 60_000;

const BLOCK_MESSAGES: Record<QuickBookBlockReason, string> = {
  no_permission: "Your account can view rooms but cannot make bookings.",
  inactive: "This room is not available for booking.",
  maintenance: "This room is under maintenance.",
  closed: "No more free time today",
};

interface Selection {
  start_at: string;
  end_at: string;
}

function ms(iso: string) {
  return new Date(iso).getTime();
}

function laterOptions(slot: TimeSlot, min: number, max: number): Selection[] {
  const room = (ms(slot.end_at) - ms(slot.start_at)) / MINUTE;
  return LATER_DURATIONS.filter((m) => m >= min && m <= max && m <= room).map((m) => ({
    start_at: slot.start_at,
    end_at: new Date(ms(slot.start_at) + m * MINUTE).toISOString(),
  }));
}

export function QuickBookScreen({ slug }: { slug: string }) {
  const t = useT();
  const qc = useQueryClient();
  const query = useQuickBook(slug);
  const create = useCreateBooking();
  const cancel = useCancelBooking();

  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState(1);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [booked, setBooked] = useState<Booking | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictLike[]>([]);

  const info = query.data;

  // Drop a selection that is no longer offered after a refresh (e.g. someone else booked it).
  useEffect(() => {
    if (!info || !selected) return;
    const stillFree = info.free_slots.some((s) => ms(s.start_at) <= ms(selected.start_at) && ms(selected.end_at) <= ms(s.end_at))
      || info.now_options.some((o) => ms(o.end_at) === ms(selected.end_at));
    if (!stillFree) setSelected(null);
  }, [info, selected]);

  const nowSlotStart = info?.now_options[0]?.start_at;
  const laterSlots = useMemo(
    () => (info ? info.free_slots.filter((s) => !nowSlotStart || ms(s.end_at) <= ms(nowSlotStart) || ms(s.start_at) > ms(nowSlotStart)) : []),
    [info, nowSlotStart],
  );

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !info) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;

  const confirm = async () => {
    if (!selected) return;
    setError(null);
    setConflicts([]);
    try {
      const b = await create.mutateAsync({
        room_id: info.room.id,
        title: title.trim() || t("Ad-hoc meeting"),
        meeting_type: "internal",
        start_at: selected.start_at,
        end_at: selected.end_at,
        attendee_count: attendees,
        source: "qr",
      });
      setBooked(b);
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ["quick-book", slug] });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflicts(conflictsFromError(err.details));
        setError(t("Someone just booked this time. Please pick another slot."));
      } else if (err instanceof ApiError && err.code === "start_in_past") {
        setError(t("That start time has passed. The options have been refreshed."));
      } else {
        setError(errorMessage(err));
      }
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ["quick-book", slug] });
    }
  };

  const undo = async () => {
    if (!booked) return;
    setError(null);
    try {
      await cancel.mutateAsync({ id: booked.id, reason: "Cancelled from QR page" });
      setCancelled(true);
      void qc.invalidateQueries({ queryKey: ["quick-book", slug] });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const reset = () => {
    setBooked(null);
    setCancelled(false);
    setError(null);
    setConflicts([]);
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4 pb-10">
      <RoomHeader info={info} />

      {booked ? (
        <Card className="border-primary/40">
          <CardContent className="space-y-3 pt-6 text-center">
            {cancelled ? (
              <XCircle className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
            ) : (
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden />
            )}
            <p className="text-lg font-semibold">{cancelled ? t("Booking cancelled") : t("Booking confirmed")}</p>
            <p className="text-sm">
              <span className="font-medium">{booked.title}</span>
              <br />
              <span className="tabular-nums">{formatRange(booked.start_at, booked.end_at)}</span> · {info.room.name}
            </p>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-col gap-2 pt-2">
              {!cancelled ? (
                <Button variant="outline" size="lg" onClick={undo} disabled={cancel.isPending}>
                  {cancel.isPending ? <Loader2 className="animate-spin" /> : <XCircle />}
                  {t("Cancel this booking")}
                </Button>
              ) : null}
              <Button size="lg" onClick={reset}>{t("Book another time")}</Button>
              <Button asChild variant="link">
                <Link href="/reservations">{t("Open dashboard")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !info.can_book ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            {t(BLOCK_MESSAGES[info.reason ?? "closed"])}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("Book this room")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {info.now_options.length ? (
              <section aria-labelledby="qb-now">
                <h2 id="qb-now" className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" aria-hidden /> {t("Book now")}
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  {info.now_options.map((o) => (
                    <ChoiceButton
                      key={o.minutes}
                      active={selected?.start_at === o.start_at && selected?.end_at === o.end_at}
                      onClick={() => setSelected({ start_at: o.start_at, end_at: o.end_at })}
                      label={formatDuration(o.minutes * MINUTE)}
                      sub={`${t("until")} ${formatTime(o.end_at)}`}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {laterSlots.length ? (
              <section aria-labelledby="qb-later">
                <h2 id="qb-later" className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="h-4 w-4" aria-hidden /> {t("Later today")}
                </h2>
                <ul className="space-y-3">
                  {laterSlots.map((s) => {
                    const opts = laterOptions(s, info.min_duration_minutes, info.max_duration_minutes);
                    if (!opts.length) return null;
                    return (
                      <li key={s.start_at}>
                        <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                          {t("Free")} {formatRange(s.start_at, s.end_at)}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {opts.map((o) => (
                            <ChoiceButton
                              key={o.end_at}
                              active={selected?.start_at === o.start_at && selected?.end_at === o.end_at}
                              onClick={() => setSelected(o)}
                              label={formatTime(o.start_at)}
                              sub={formatDuration(ms(o.end_at) - ms(o.start_at))}
                            />
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {!info.now_options.length && !laterSlots.length ? (
              <p className="text-center text-sm text-muted-foreground">{t("No more free time today")}</p>
            ) : null}

            {selected ? (
              <div className="space-y-4 rounded-lg border bg-muted/40 p-3">
                <p className="text-sm font-medium tabular-nums">{formatRange(selected.start_at, selected.end_at)}</p>
                <FormField label={t("Meeting title")} htmlFor="qb-title">
                  <Input
                    id="qb-title"
                    value={title}
                    maxLength={200}
                    placeholder={t("Ad-hoc meeting")}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-11"
                  />
                </FormField>
                <FormField
                  label={t("Attendees")}
                  htmlFor="qb-attendees"
                  hint={`${t("Capacity")}: ${info.room.capacity}`}
                  error={attendees > info.room.capacity ? t("More attendees than the room's capacity") : undefined}
                >
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" aria-label={t("Fewer")}
                      onClick={() => setAttendees((n) => Math.max(1, n - 1))}>
                      <Minus />
                    </Button>
                    <Input id="qb-attendees" inputMode="numeric" className="h-11 w-20 text-center tabular-nums"
                      value={attendees}
                      onChange={(e) => setAttendees(Math.max(1, Math.min(10000, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
                    <Button type="button" variant="outline" size="icon" aria-label={t("More")}
                      onClick={() => setAttendees((n) => n + 1)}>
                      <Plus />
                    </Button>
                  </div>
                </FormField>
                <Button className="w-full" size="lg" onClick={confirm}
                  disabled={create.isPending || attendees > info.room.capacity}>
                  {create.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {t("Confirm booking")}
                </Button>
              </div>
            ) : null}

            {error ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            <ConflictList conflicts={conflicts} />
          </CardContent>
        </Card>
      )}

      <TodaySchedule bookings={info.todays_bookings} />
    </div>
  );
}

function ChoiceButton({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
      )}
    >
      <span className="font-semibold tabular-nums">{label}</span>
      {sub ? <span className={cn("text-xs tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>{sub}</span> : null}
    </button>
  );
}

function RoomHeader({ info }: { info: QuickBookInfo }) {
  const t = useT();
  const a = info.availability;
  return (
    <header className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold leading-tight">{info.room.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            {info.room.location ? (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{info.room.location}</span>
            ) : null}
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{info.room.capacity}</span>
          </p>
        </div>
        <RoomStatusBadge status={a.status} />
      </div>
      {a.current_booking ? (
        <p className="text-sm">
          {t("Occupied until")} <b className="tabular-nums">{formatTime(a.next_available_at ?? a.current_booking.end_at)}</b>
          {" · "}{a.current_booking.title}
        </p>
      ) : a.free_until ? (
        <p className="text-sm">{t("Free until")} <b className="tabular-nums">{formatTime(a.free_until)}</b></p>
      ) : null}
    </header>
  );
}

function TodaySchedule({ bookings }: { bookings: Booking[] }) {
  const t = useT();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("Today's schedule")}</CardTitle>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No meetings today")}</p>
        ) : (
          <ul className="divide-y">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatRange(b.start_at, b.end_at)}
                    {!b.redacted ? ` · ${b.organizer.full_name}` : ""}
                  </p>
                </div>
                <BookingStatusBadge status={b.effective_status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
