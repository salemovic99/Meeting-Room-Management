"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, CalendarClock, CircleDot, DoorOpen, Hourglass, Plus } from "lucide-react";
import { KpiCard } from "@/components/common/kpi-card";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { BookingStatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Can } from "@/features/auth/can";
import { useAuth } from "@/features/auth/auth-provider";
import { useDepartmentUsage, useOverview, useUtilization } from "@/features/analytics/api";
import { SharePieChart, UtilizationBarChart } from "@/features/analytics/charts";
import { BookingDetailsSheet } from "@/features/bookings/booking-details-sheet";
import { BookingFormDialog } from "@/features/bookings/booking-form-dialog";
import { RoomAvailabilityCard } from "@/features/rooms/room-availability-card";
import { useT } from "@/lib/i18n";
import { defaultRange } from "@/components/common/date-range";
import { formatLongDate, formatRange, formatRelative } from "@/lib/time";
import type { Booking } from "@/lib/types";
import { round1 } from "@/lib/utils";

export default function OverviewPage() {
  const t = useT();
  const { can } = useAuth();
  const overview = useOverview();
  const canAnalytics = can(["analytics.view", "analytics.view_department"]);
  const range = defaultRange(7);
  const utilization = useUtilization(range, canAnalytics);
  const departments = useDepartmentUsage(range, canAnalytics);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);

  if (overview.isLoading) return <LoadingBlock />;
  if (overview.error || !overview.data) return <ErrorBlock error={overview.error} onRetry={() => overview.refetch()} />;
  const o = overview.data;

  return (
    <>
      <PageHeader
        title={t("Overview")}
        description={formatLongDate(Date.now())}
        actions={
          <Can perm="bookings.create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {t("New reservation")}
            </Button>
          </Can>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard index={0} label={t("Total Rooms")} value={o.total_rooms} icon={DoorOpen} />
        <KpiCard index={1} label={t("Available Rooms")} value={o.available_rooms} icon={CalendarCheck} accent="success" />
        <KpiCard index={2} label={t("Occupied Rooms")} value={o.occupied_rooms} icon={CircleDot} accent="destructive" />
        <KpiCard index={3} label={t("Upcoming Meetings")} value={o.upcoming_meetings} icon={CalendarClock} accent="warning" />
        <KpiCard
          index={4}
          label={t("Today's Reservations")}
          value={o.todays_bookings}
          icon={CalendarCheck}
          hint={o.cancelled_today ? `${o.cancelled_today} ${t("cancelled")}` : undefined}
          accent="secondary"
        />
        <KpiCard
          index={5}
          label={t("Total Meeting Hours")}
          value={round1(o.booked_hours_today)}
          icon={Hourglass}
          hint={`${round1(o.utilization_today_pct)}% ${t("utilization")}`}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">{t("Room availability")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {o.rooms.map((a, i) => (
            <RoomAvailabilityCard key={a.room_id} a={a} index={i} />
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t("Today's meeting schedule")}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/calendar">{t("Open calendar")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {o.todays_schedule.length === 0 ? (
              <EmptyState title={t("No meetings today")} />
            ) : (
              <ul className="divide-y">
                {o.todays_schedule.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(b)}
                      className="flex w-full items-center gap-4 py-3 text-start hover:bg-muted/50"
                    >
                      <span className="w-28 shrink-0 tabular-nums text-sm font-medium">{formatRange(b.start_at, b.end_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{b.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {b.room.name} · {b.organizer.full_name} · {b.department.name}
                        </span>
                      </span>
                      <BookingStatusBadge status={b.effective_status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Recent activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {o.recent_activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No recent activity to show.")}</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {o.recent_activity.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex flex-col">
                    <span>
                      <span className="font-medium">{a.actor_user?.full_name ?? (a.actor_device_id ? "Display device" : "System")}</span>{" "}
                      <span className="text-muted-foreground">{a.action}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.entity_type} · {formatRelative(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {canAnalytics ? (
          <>
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{t("Room utilization (last 7 days)")}</CardTitle>
              </CardHeader>
              <CardContent>
                {utilization.data ? (
                  <UtilizationBarChart
                    data={utilization.data.rooms.map((r) => ({ name: r.room_name, value: round1(r.utilization_pct) }))}
                  />
                ) : (
                  <LoadingBlock />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Department usage (last 7 days)")}</CardTitle>
              </CardHeader>
              <CardContent>
                {departments.data ? (
                  departments.data.departments.length ? (
                    <SharePieChart
                      data={departments.data.departments.map((d) => ({
                        id: d.department_id,
                        name: d.name,
                        value: round1(d.booked_hours),
                      }))}
                    />
                  ) : (
                    <EmptyState title={t("No bookings in this period")} />
                  )
                ) : (
                  <LoadingBlock />
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <BookingFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BookingDetailsSheet booking={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
