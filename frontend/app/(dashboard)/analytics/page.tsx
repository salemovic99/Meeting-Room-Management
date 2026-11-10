"use client";

import { useState } from "react";
import { Ban, Building2, DoorOpen, Download, Hourglass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DateRange, defaultRange } from "@/components/common/date-range";
import { EmptyState } from "@/components/common/empty-state";
import { KpiCard } from "@/components/common/kpi-card";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/auth-provider";
import { useCancellations, useDepartmentUsage, usePeakHours, useUtilization } from "@/features/analytics/api";
import { SharePieChart, SimpleBarChart, UtilizationBarChart } from "@/features/analytics/charts";
import { WEEKDAY_LABELS } from "@/features/bookings/labels";
import { apiDownload, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { round1 } from "@/lib/utils";
import type { ReportName } from "@/lib/types";

const REPORTS: { name: ReportName; label: string }[] = [
  { name: "bookings", label: "Bookings" },
  { name: "room-utilization", label: "Room utilization" },
  { name: "department-utilization", label: "Department utilization" },
  { name: "organizer-activity", label: "Organizer activity" },
  { name: "cancellations", label: "Cancellations" },
];

function ExportButtons({ range }: { range: { from: string; to: string } }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (report: ReportName, format: "csv" | "xlsx") => {
    const key = `${report}.${format}`;
    setBusy(key);
    try {
      await apiDownload(`/reports/${report}`, { ...range, format }, `${report}_${range.from}_${range.to}.${format}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Export reports")}</CardTitle>
        <CardDescription>
          {t("Period")}: {range.from} → {range.to} (Asia/Riyadh)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {REPORTS.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <span className="text-sm font-medium">{t(r.label)}</span>
            <div className="flex gap-1">
              {(["csv", "xlsx"] as const).map((f) => (
                <Button key={f} variant="outline" size="sm" disabled={!!busy} onClick={() => run(r.name, f)}>
                  {busy === `${r.name}.${f}` ? <Loader2 className="animate-spin" /> : <Download />}
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const t = useT();
  const { can } = useAuth();
  const departmentOnly = !can("analytics.view");
  const [range, setRange] = useState(defaultRange(30));
  const utilization = useUtilization(range);
  const departments = useDepartmentUsage(range);
  const cancellations = useCancellations(range);
  const peak = usePeakHours(range);

  const totalHours = utilization.data?.rooms.reduce((s, r) => s + r.booked_hours, 0) ?? 0;
  const avgUtil = utilization.data?.rooms.length
    ? utilization.data.rooms.reduce((s, r) => s + r.utilization_pct, 0) / utilization.data.rooms.length
    : 0;
  const mostUsed = utilization.data?.rooms.find((r) => r.room_id === utilization.data?.most_used_room_id);

  return (
    <>
      <PageHeader
        title={t("Analytics")}
        description={
          departmentOnly
            ? t("Scoped to your department")
            : t("Utilization uses each room's configured operating hours as the denominator")
        }
        actions={<DateRange value={range} onChange={setRange} />}
      />

      {utilization.error ? <ErrorBlock error={utilization.error} onRetry={() => utilization.refetch()} /> : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard index={0} label={t("Booked hours")} value={round1(totalHours)} icon={Hourglass} />
        <KpiCard index={1} label={t("Avg. utilization")} value={`${round1(avgUtil)}%`} icon={DoorOpen} accent="secondary" />
        <KpiCard index={2} label={t("Most used room")} value={mostUsed?.room_name ?? "—"} icon={Building2} accent="success" />
        <KpiCard
          index={3}
          label={t("Cancellation rate")}
          value={cancellations.data ? `${round1(cancellations.data.cancellation_rate_pct)}%` : "—"}
          hint={cancellations.data ? `${cancellations.data.cancelled} / ${cancellations.data.total_bookings}` : undefined}
          icon={Ban}
          accent="destructive"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("Room utilization")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!utilization.data ? (
              <LoadingBlock />
            ) : (
              <>
                <UtilizationBarChart
                  data={utilization.data.rooms.map((r) => ({ name: r.room_name, value: round1(r.utilization_pct) }))}
                />
                <Table className="mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Room")}</TableHead>
                      <TableHead className="text-end">{t("Bookings")}</TableHead>
                      <TableHead className="text-end">{t("Booked h")}</TableHead>
                      <TableHead className="text-end">{t("Available h")}</TableHead>
                      <TableHead className="text-end">{t("Utilization")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {utilization.data.rooms.map((r) => (
                      <TableRow key={r.room_id}>
                        <TableCell>{r.room_name}</TableCell>
                        <TableCell className="text-end tabular-nums">{r.booking_count}</TableCell>
                        <TableCell className="text-end tabular-nums">{round1(r.booked_hours)}</TableCell>
                        <TableCell className="text-end tabular-nums">{round1(r.available_hours)}</TableCell>
                        <TableCell className="text-end tabular-nums">{round1(r.utilization_pct)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
        <ExportButtons range={range} />

        <Card>
          <CardHeader>
            <CardTitle>{t("Department usage")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!departments.data ? (
              <LoadingBlock />
            ) : departments.data.departments.length === 0 ? (
              <EmptyState title={t("No bookings in this period")} />
            ) : (
              <SharePieChart
                data={departments.data.departments.map((d) => ({ id: d.department_id, name: d.name, value: round1(d.booked_hours) }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Peak booking hours")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!peak.data ? (
              <LoadingBlock />
            ) : (
              <SimpleBarChart
                label={t("Bookings")}
                data={peak.data.hours.map((h) => ({ name: `${h.hour < 10 ? "0" : ""}${h.hour}:00`, value: h.booking_count }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Bookings by weekday")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!peak.data ? (
              <LoadingBlock />
            ) : (
              <SimpleBarChart
                label={t("Bookings")}
                color="hsl(var(--secondary))"
                data={peak.data.weekdays.map((w) => ({ name: t(WEEKDAY_LABELS[w.weekday] ?? String(w.weekday)), value: w.booking_count }))}
              />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>{t("Cancellations")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            {!cancellations.data ? (
              <LoadingBlock />
            ) : (
              <>
                <div>
                  <h4 className="mb-2 text-sm font-medium">{t("By room")}</h4>
                  <SimpleBarChart
                    height={200}
                    label={t("Cancelled")}
                    color="hsl(var(--destructive))"
                    data={cancellations.data.by_room.map((r) => ({ name: r.room_name, value: r.cancelled }))}
                  />
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium">{t("By department")}</h4>
                  <SimpleBarChart
                    height={200}
                    label={t("Cancelled")}
                    color="hsl(var(--destructive))"
                    data={cancellations.data.by_department.map((d) => ({ name: d.name, value: d.cancelled }))}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
