"use client";

import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import arLocale from "@fullcalendar/core/locales/ar";
import enGbLocale from "@fullcalendar/core/locales/en-gb";
import type { DatesSetArg, EventClickArg, EventContentArg } from "@fullcalendar/core";
import type { DateSelectArg } from "@fullcalendar/core";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth-provider";
import { useCalendar } from "@/features/bookings/api";
import { BookingDetailsSheet } from "@/features/bookings/booking-details-sheet";
import { BookingFormDialog, type BookingPrefill } from "@/features/bookings/booking-form-dialog";
import { useDepartments } from "@/features/departments/api";
import { useRooms } from "@/features/rooms/api";
import { useI18n } from "@/lib/i18n";
import { fromRiyadhWall, toRiyadhWall } from "@/lib/time";
import { colorFor } from "@/lib/utils";
import type { Booking } from "@/lib/types";

/**
 * FullCalendar has no named-timezone support without a plugin, so we run it in "UTC" and
 * feed it Riyadh wall-clock times (Riyadh is a fixed UTC+3, no DST). See lib/time.ts.
 */
export default function CalendarPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const rooms = useRooms();
  const departments = useDepartments();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [roomId, setRoomId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [prefill, setPrefill] = useState<BookingPrefill | undefined>();
  const [createOpen, setCreateOpen] = useState(false);

  const calendar = useCalendar({
    from: range?.from ?? "",
    to: range?.to ?? "",
    room_id: roomId || undefined,
    department_id: departmentId || undefined,
    include_cancelled: showCancelled || undefined,
  });

  const roomColor = useMemo(() => {
    const map: Record<string, string> = {};
    rooms.data?.forEach((r, i) => (map[r.id] = colorFor(r.id, i)));
    return map;
  }, [rooms.data]);

  const events = useMemo(
    () =>
      (calendar.data?.items ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        start: toRiyadhWall(b.start_at),
        end: toRiyadhWall(b.end_at),
        backgroundColor: roomColor[b.room_id] ?? "#00594F",
        borderColor: roomColor[b.room_id] ?? "#00594F",
        classNames: b.status === "cancelled" ? ["is-cancelled"] : [],
        extendedProps: { booking: b },
      })),
    [calendar.data, roomColor],
  );

  const onDatesSet = (arg: DatesSetArg) => {
    setRange({ from: fromRiyadhWall(arg.start), to: fromRiyadhWall(arg.end) });
  };

  const onSelect = (arg: DateSelectArg) => {
    if (!can("bookings.create")) return;
    const startIso = arg.start.toISOString();
    const endIso = arg.end.toISOString();
    setPrefill({
      room_id: roomId || undefined,
      date: startIso.slice(0, 10),
      start_time: arg.allDay ? "09:00" : startIso.slice(11, 16),
      end_time: arg.allDay ? "10:00" : endIso.slice(11, 16),
    });
    setCreateOpen(true);
    arg.view.calendar.unselect();
  };

  const onEventClick = (arg: EventClickArg) => {
    setSelected(arg.event.extendedProps.booking as Booking);
  };

  const renderEvent = (arg: EventContentArg) => {
    const b = arg.event.extendedProps.booking as Booking;
    return (
      <div className="overflow-hidden px-1 text-xs leading-tight">
        <b className="block truncate">
          {arg.timeText} {b.status === "cancelled" ? `· ${t("Cancelled")}` : ""}
        </b>
        <span className="block truncate">{arg.event.title}</span>
        <span className="block truncate opacity-80">{b.room.name}</span>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={t("Calendar")}
        description={t("All times shown in Asia/Riyadh")}
        actions={
          can("bookings.create") ? (
            <Button
              onClick={() => {
                setPrefill(undefined);
                setCreateOpen(true);
              }}
            >
              <Plus /> {t("New reservation")}
            </Button>
          ) : null
        }
      />

      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <div className="w-56 space-y-1">
          <Label htmlFor="cal-room" className="text-xs">
            {t("Room")}
          </Label>
          <NativeSelect id="cal-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-9">
            <option value="">{t("All rooms")}</option>
            {rooms.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-56 space-y-1">
          <Label htmlFor="cal-dept" className="text-xs">
            {t("Department")}
          </Label>
          <NativeSelect id="cal-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="h-9">
            <option value="">{t("All departments")}</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Switch checked={showCancelled} onCheckedChange={setShowCancelled} />
          {t("Show cancelled")}
        </label>
        <div className="ms-auto flex flex-wrap gap-3 pb-2 text-xs">
          {rooms.data?.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: roomColor[r.id] }} aria-hidden />
              {r.name}
            </span>
          ))}
        </div>
      </Card>

      <Card className="p-3 md:p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
          }}
          buttonText={{ today: t("Today"), day: t("Day"), week: t("Week"), month: t("Month"), list: t("Agenda") }}
          timeZone="UTC"
          now={() => toRiyadhWall(Date.now())}
          locales={[enGbLocale, arLocale]}
          locale={lang === "ar" ? "ar" : "en-gb"}
          direction={lang === "ar" ? "rtl" : "ltr"}
          firstDay={0}
          nowIndicator
          selectable={can("bookings.create")}
          selectMirror
          editable={false}
          eventStartEditable={false}
          eventDurationEditable={false}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          slotDuration="00:30:00"
          allDaySlot={false}
          height="auto"
          expandRows
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          events={events}
          datesSet={onDatesSet}
          select={onSelect}
          eventClick={onEventClick}
          eventContent={renderEvent}
        />
      </Card>

      <BookingFormDialog open={createOpen} onOpenChange={setCreateOpen} prefill={prefill} />
      <BookingDetailsSheet booking={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
