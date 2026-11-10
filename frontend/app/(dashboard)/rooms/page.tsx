"use client";

import { useState } from "react";
import { DoorOpen, ExternalLink, MonitorCog, Pencil, Plus, Users, Wrench } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { ActiveBadge, RoomStatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth-provider";
import { DisplaySettingsDialog } from "@/features/rooms/display-settings-dialog";
import { RoomFormDialog } from "@/features/rooms/room-form-dialog";
import { useAvailability, useRooms } from "@/features/rooms/api";
import { useT } from "@/lib/i18n";
import type { Room } from "@/lib/types";

export default function RoomsPage() {
  const t = useT();
  const { can } = useAuth();
  const canManage = can("rooms.manage");
  const canDisplays = can("displays.manage");
  const [includeInactive, setIncludeInactive] = useState(false);
  const rooms = useRooms(includeInactive);
  const availability = useAvailability();
  const [editing, setEditing] = useState<Room | null | undefined>(undefined);
  const [displayRoom, setDisplayRoom] = useState<Room | null>(null);

  const statusOf = (id: string) => availability.data?.find((a) => a.room_id === id)?.status;

  return (
    <>
      <PageHeader
        title={t("Meeting Rooms")}
        description={t("Rooms, capacity, operating hours and TV display configuration")}
        actions={
          <>
            {canManage ? (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
                {t("Show inactive")}
              </label>
            ) : null}
            {canManage ? (
              <Button onClick={() => setEditing(null)}>
                <Plus /> {t("New room")}
              </Button>
            ) : null}
          </>
        }
      />

      {rooms.isLoading ? (
        <LoadingBlock />
      ) : rooms.error ? (
        <ErrorBlock error={rooms.error} onRetry={() => rooms.refetch()} />
      ) : rooms.data?.length === 0 ? (
        <EmptyState icon={DoorOpen} title={t("No rooms yet")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rooms.data?.map((r) => {
            const status = statusOf(r.id);
            return (
              <Card key={r.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{r.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {r.code}
                      {r.location ? ` · ${r.location}` : ""}
                      {r.floor ? ` · ${t("Floor")} ${r.floor}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {status ? <RoomStatusBadge status={status} /> : null}
                    {!r.is_active ? <ActiveBadge active={false} /> : null}
                  </div>
                </div>
                {r.maintenance_mode ? (
                  <p className="mt-3 flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                    <Wrench className="h-4 w-4" aria-hidden /> {r.maintenance_message || t("Room under maintenance")}
                  </p>
                ) : null}
                {r.description ? <p className="mt-3 text-sm text-muted-foreground">{r.description}</p> : null}
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {r.capacity} {t("seats")}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {r.equipment.map((e) => (
                    <Badge key={e} variant="muted">
                      {e}
                    </Badge>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {canManage ? (
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      <Pencil /> {t("Edit")}
                    </Button>
                  ) : null}
                  {canDisplays ? (
                    <Button variant="outline" size="sm" onClick={() => setDisplayRoom(r)}>
                      <MonitorCog /> {t("Display settings")}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/display/${r.display_slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink /> /display/{r.display_slug}
                    </a>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RoomFormDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} room={editing} />
      <DisplaySettingsDialog room={displayRoom} open={!!displayRoom} onOpenChange={(o) => !o && setDisplayRoom(null)} />
    </>
  );
}
