"use client";

import { useState } from "react";
import { KeyRound, MonitorSmartphone, MoreHorizontal, Pencil, Plus, Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { DeviceStatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDevices, useRefreshDevice, useRotateDeviceToken, useUpdateDevice } from "@/features/displays/api";
import { DeviceFormDialog } from "@/features/displays/device-form-dialog";
import { TokenRevealDialog } from "@/features/displays/token-reveal-dialog";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { formatDateTime, formatRelative } from "@/lib/time";
import type { Device, DeviceTokenResponse } from "@/lib/types";

export default function DisplaysPage() {
  const t = useT();
  const devices = useDevices();
  const update = useUpdateDevice();
  const rotate = useRotateDeviceToken();
  const refresh = useRefreshDevice();
  const [editing, setEditing] = useState<Device | null | undefined>(undefined);
  const [revealed, setRevealed] = useState<DeviceTokenResponse | null>(null);
  const [rotating, setRotating] = useState<Device | null>(null);
  const [disabling, setDisabling] = useState<Device | null>(null);

  const counts = (devices.data ?? []).reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title={t("TV Displays")}
        description={t("Register Samsung TVs / kiosk players, manage credentials and monitor connectivity")}
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> {t("Register display")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        {(["online", "offline", "unknown", "disabled"] as const).map((s) => (
          <Card key={s} className="flex items-center gap-3 px-4 py-2">
            <DeviceStatusBadge status={s} />
            <span className="text-lg font-semibold tabular-nums">{counts[s] ?? 0}</span>
          </Card>
        ))}
      </div>

      <Card>
        {devices.isLoading ? (
          <LoadingBlock />
        ) : devices.error ? (
          <ErrorBlock error={devices.error} onRetry={() => devices.refetch()} />
        ) : devices.data?.length === 0 ? (
          <EmptyState
            icon={MonitorSmartphone}
            title={t("No displays registered")}
            description={t("Register a TV to generate its pairing URL.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Device")}</TableHead>
                <TableHead>{t("Room")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("Last heartbeat")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("Browser / firmware")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.data?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <span className="block font-medium">{d.device_name}</span>
                    <a href={d.display_url} target="_blank" rel="noreferrer" className="block text-xs text-muted-foreground hover:underline">
                      {d.display_url}
                    </a>
                  </TableCell>
                  <TableCell>{d.room.name}</TableCell>
                  <TableCell>
                    <DeviceStatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {d.last_heartbeat_at ? (
                      <span title={formatDateTime(d.last_heartbeat_at)}>{formatRelative(d.last_heartbeat_at)}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("Never")}</span>
                    )}
                    {d.last_connected_at ? (
                      <span className="block text-xs text-muted-foreground">
                        {t("Connected")} {formatDateTime(d.last_connected_at)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden max-w-xs lg:table-cell">
                    <span className="block truncate text-xs" title={d.browser_info ?? ""}>
                      {d.browser_info ?? "—"}
                    </span>
                    {d.firmware_info ? <span className="block truncate text-xs text-muted-foreground">{d.firmware_info}</span> : null}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t("Actions")}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={!d.is_active}
                          onSelect={async () => {
                            try {
                              await refresh.mutateAsync(d.id);
                              toast.success(t("Refresh command sent"));
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          <RefreshCw /> {t("Refresh display")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditing(d)}>
                          <Pencil /> {t("Rename / reassign room")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setRotating(d)}>
                          <KeyRound /> {t("Regenerate credential")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {d.is_active ? (
                          <DropdownMenuItem destructive onSelect={() => setDisabling(d)}>
                            <Power /> {t("Disable display")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onSelect={async () => {
                              try {
                                await update.mutateAsync({ id: d.id, data: { is_active: true } });
                                toast.success(t("Display enabled"));
                              } catch (err) {
                                toast.error(errorMessage(err));
                              }
                            }}
                          >
                            <Power /> {t("Enable display")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <DeviceFormDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        device={editing}
        onRegistered={setRevealed}
      />
      <TokenRevealDialog result={revealed} onClose={() => setRevealed(null)} />
      <ConfirmDialog
        open={!!rotating}
        onOpenChange={(o) => !o && setRotating(null)}
        destructive
        title={t("Regenerate credential?")}
        description={t("The current credential for {name} stops working immediately. You will need to re-pair the TV with the new pairing URL.", {
          name: rotating?.device_name ?? "",
        })}
        confirmLabel={t("Regenerate")}
        onConfirm={async () => {
          if (!rotating) return;
          try {
            const res = await rotate.mutateAsync(rotating.id);
            setRevealed(res);
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
      <ConfirmDialog
        open={!!disabling}
        onOpenChange={(o) => !o && setDisabling(null)}
        destructive
        title={t("Disable display?")}
        description={t("{name} will be disconnected and can no longer read the schedule until re-enabled.", {
          name: disabling?.device_name ?? "",
        })}
        confirmLabel={t("Disable")}
        onConfirm={async () => {
          if (!disabling) return;
          try {
            await update.mutateAsync({ id: disabling.id, data: { is_active: false } });
            toast.success(t("Display disabled"));
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </>
  );
}
