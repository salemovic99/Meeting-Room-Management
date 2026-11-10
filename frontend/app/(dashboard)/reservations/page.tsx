"use client";

import { useState } from "react";
import { Eye, MoreHorizontal, Pencil, Plus, Repeat, Search, XCircle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { BookingStatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/auth-provider";
import { useBookings, type BookingFilters } from "@/features/bookings/api";
import { BookingDetailsSheet } from "@/features/bookings/booking-details-sheet";
import { BookingFormDialog } from "@/features/bookings/booking-form-dialog";
import { CancelBookingDialog } from "@/features/bookings/cancel-booking-dialog";
import { MEETING_TYPE_LABELS } from "@/features/bookings/labels";
import { SeriesDialog } from "@/features/bookings/series-dialog";
import { useDepartments } from "@/features/departments/api";
import { useRooms } from "@/features/rooms/api";
import { useDebounce } from "@/hooks/use-debounce";
import { useT } from "@/lib/i18n";
import { addDays, buildIso, formatDate, formatRange } from "@/lib/time";
import type { Booking } from "@/lib/types";

export default function ReservationsPage() {
  const t = useT();
  const { can } = useAuth();
  const seeAll = can(["bookings.read_all", "bookings.manage_all", "bookings.manage_department"]);
  const rooms = useRooms();
  const departments = useDepartments();

  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 350);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filters, setFilters] = useState<Omit<BookingFilters, "q" | "from" | "to">>({
    page: 1,
    page_size: 25,
    mine: !seeAll,
  });

  const query: BookingFilters = {
    ...filters,
    q: debouncedQ || undefined,
    from: fromDate ? buildIso(fromDate, "00:00") : undefined,
    to: toDate ? buildIso(addDays(toDate, 1), "00:00") : undefined,
  };
  const bookings = useBookings(query);

  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<Booking | null>(null);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState<{ b: Booking; scope: "single" | "series" } | null>(null);
  const [seriesId, setSeriesId] = useState<string | null>(null);

  const setFilter = (patch: Partial<BookingFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <>
      <PageHeader
        title={t("Reservations")}
        description={t("Search, filter and manage meeting reservations")}
        actions={
          can("bookings.create") ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {t("New reservation")}
            </Button>
          ) : null
        }
      />

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="relative space-y-1 sm:col-span-2">
          <Label htmlFor="rs-q" className="text-xs">
            {t("Search")}
          </Label>
          <Search className="absolute start-2.5 top-[2.1rem] h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            id="rs-q"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setFilters((f) => ({ ...f, page: 1 }));
            }}
            placeholder={t("Title, organizer…")}
            className="h-9 ps-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-room" className="text-xs">
            {t("Room")}
          </Label>
          <NativeSelect id="rs-room" className="h-9" value={filters.room_id ?? ""} onChange={(e) => setFilter({ room_id: e.target.value || undefined })}>
            <option value="">{t("All rooms")}</option>
            {rooms.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-dept" className="text-xs">
            {t("Department")}
          </Label>
          <NativeSelect
            id="rs-dept"
            className="h-9"
            value={filters.department_id ?? ""}
            onChange={(e) => setFilter({ department_id: e.target.value || undefined })}
          >
            <option value="">{t("All departments")}</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-status" className="text-xs">
            {t("Status")}
          </Label>
          <NativeSelect id="rs-status" className="h-9" value={filters.status ?? ""} onChange={(e) => setFilter({ status: e.target.value || undefined })}>
            <option value="">{t("Any status")}</option>
            <option value="confirmed">{t("Confirmed")}</option>
            <option value="in_progress">{t("In progress")}</option>
            <option value="completed">{t("Completed")}</option>
            <option value="cancelled">{t("Cancelled")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-from" className="text-xs">
            {t("From")}
          </Label>
          <Input id="rs-from" type="date" className="h-9" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-to" className="text-xs">
            {t("To")}
          </Label>
          <Input id="rs-to" type="date" className="h-9" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        {seeAll ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4 xl:col-span-7">
            <Switch checked={!!filters.mine} onCheckedChange={(c) => setFilter({ mine: c })} />
            {t("Only my reservations")}
          </label>
        ) : null}
      </Card>

      <Card>
        {bookings.isLoading ? (
          <LoadingBlock />
        ) : bookings.error ? (
          <ErrorBlock error={bookings.error} onRetry={() => bookings.refetch()} />
        ) : bookings.data && bookings.data.items.length === 0 ? (
          <EmptyState title={t("No reservations found")} description={t("Try adjusting the filters.")} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Title")}</TableHead>
                  <TableHead>{t("Room")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("Organizer")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("Department")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("Meeting type")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t("Actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.data?.items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">
                      <span className="block font-medium">{formatDate(b.start_at)}</span>
                      <span className="block text-xs tabular-nums text-muted-foreground">{formatRange(b.start_at, b.end_at)}</span>
                    </TableCell>
                    <TableCell>
                      <button type="button" className="text-start font-medium hover:underline" onClick={() => setViewing(b)}>
                        {b.title}
                      </button>
                      {b.series_id ? (
                        <span className="ms-1.5 inline-flex items-center text-xs text-muted-foreground" title={t("Recurring")}>
                          <Repeat className="h-3 w-3" aria-label={t("Recurring")} />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{b.room.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{b.organizer.full_name}</TableCell>
                    <TableCell className="hidden lg:table-cell">{b.department.name}</TableCell>
                    <TableCell className="hidden xl:table-cell">{t(MEETING_TYPE_LABELS[b.meeting_type])}</TableCell>
                    <TableCell>
                      <BookingStatusBadge status={b.effective_status} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t("Actions")}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setViewing(b)}>
                            <Eye /> {t("View details")}
                          </DropdownMenuItem>
                          {b.series_id ? (
                            <DropdownMenuItem onSelect={() => setSeriesId(b.series_id)}>
                              <Repeat /> {t("View series")}
                            </DropdownMenuItem>
                          ) : null}
                          {b.can_manage && b.status !== "cancelled" && b.effective_status !== "completed" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setEditing(b)}>
                                <Pencil /> {t("Edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem destructive onSelect={() => setCancelling({ b, scope: "single" })}>
                                <XCircle /> {b.series_id ? t("Cancel this occurrence") : t("Cancel reservation")}
                              </DropdownMenuItem>
                              {b.series_id ? (
                                <DropdownMenuItem destructive onSelect={() => setCancelling({ b, scope: "series" })}>
                                  <XCircle /> {t("Cancel series")}
                                </DropdownMenuItem>
                              ) : null}
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {bookings.data ? (
              <Pagination
                page={bookings.data.page}
                pageSize={bookings.data.page_size}
                total={bookings.data.total}
                onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
              />
            ) : null}
          </>
        )}
      </Card>

      <BookingFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BookingFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} booking={editing} />
      <BookingDetailsSheet booking={viewing} open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} />
      <CancelBookingDialog
        booking={cancelling?.b ?? null}
        scope={cancelling?.scope}
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
      />
      <SeriesDialog seriesId={seriesId} open={!!seriesId} onOpenChange={(o) => !o && setSeriesId(null)} />
    </>
  );
}
