"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { JsonDiff } from "@/components/common/json-diff";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuditLogs, type AuditFilters } from "@/features/audit/api";
import { useDebounce } from "@/hooks/use-debounce";
import { useT } from "@/lib/i18n";
import { addDays, buildIso, formatDateTime } from "@/lib/time";

const ENTITY_TYPES = ["booking", "booking_series", "room", "user", "department", "role", "display_device", "display_settings", "announcement", "system_settings", "auth"];

export default function AuditLogsPage() {
  const t = useT();
  const [action, setAction] = useState("");
  const debouncedAction = useDebounce(action, 300);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, page_size: 50 });
  const [expanded, setExpanded] = useState<string | null>(null);

  const logs = useAuditLogs({
    ...filters,
    action: debouncedAction || undefined,
    from: fromDate ? buildIso(fromDate, "00:00") : undefined,
    to: toDate ? buildIso(addDays(toDate, 1), "00:00") : undefined,
  });

  return (
    <>
      <PageHeader title={t("Audit Logs")} description={t("Read-only record of security-relevant and administrative actions")} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-56 space-y-1">
          <Label htmlFor="al-action" className="text-xs">
            {t("Action")}
          </Label>
          <Input id="al-action" className="h-9" placeholder="booking.created" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <div className="w-52 space-y-1">
          <Label htmlFor="al-entity" className="text-xs">
            {t("Entity type")}
          </Label>
          <NativeSelect
            id="al-entity"
            className="h-9"
            value={filters.entity_type ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, entity_type: e.target.value || undefined, page: 1 }))}
          >
            <option value="">{t("All")}</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-60 space-y-1">
          <Label htmlFor="al-entity-id" className="text-xs">
            {t("Entity ID")}
          </Label>
          <Input
            id="al-entity-id"
            className="h-9 font-mono text-xs"
            value={filters.entity_id ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, entity_id: e.target.value || undefined, page: 1 }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-from" className="text-xs">
            {t("From")}
          </Label>
          <Input id="al-from" type="date" className="h-9" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-to" className="text-xs">
            {t("To")}
          </Label>
          <Input id="al-to" type="date" className="h-9" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </Card>

      <Card>
        {logs.isLoading ? (
          <LoadingBlock />
        ) : logs.error ? (
          <ErrorBlock error={logs.error} onRetry={() => logs.refetch()} />
        ) : logs.data?.items.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("No audit records match")} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>{t("When")}</TableHead>
                  <TableHead>{t("Actor")}</TableHead>
                  <TableHead>{t("Action")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("Entity")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("IP address")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data?.items.map((l) => {
                  const open = expanded === l.id;
                  return (
                    <Fragment key={l.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-expanded={open}
                            aria-label={t("Toggle details")}
                            onClick={() => setExpanded(open ? null : l.id)}
                          >
                            {open ? <ChevronDown /> : <ChevronRight className="rtl:rotate-180" />}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">{formatDateTime(l.created_at)}</TableCell>
                        <TableCell className="text-sm">
                          {l.actor_user?.full_name ?? (l.actor_device_id ? `${t("Device")} ${l.actor_device_id.slice(0, 8)}` : t("System"))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {l.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {l.entity_type}
                          {l.entity_id ? <span className="block font-mono text-muted-foreground">{l.entity_id}</span> : null}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs lg:table-cell">{l.ip_address ?? "—"}</TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-muted/30">
                            <JsonDiff oldValues={l.old_values} newValues={l.new_values} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {logs.data ? (
              <Pagination
                page={logs.data.page}
                pageSize={logs.data.page_size}
                total={logs.data.total}
                onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
              />
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
