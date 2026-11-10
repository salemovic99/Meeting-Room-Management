"use client";

import { useState } from "react";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { AnnouncementStateBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnnouncementFormDialog } from "@/features/announcements/announcement-form-dialog";
import { useAnnouncements, useDeleteAnnouncement } from "@/features/announcements/api";
import { useRooms } from "@/features/rooms/api";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/time";
import type { Announcement } from "@/lib/types";

const PRIORITY_VARIANT = { low: "muted", normal: "outline", high: "warning", critical: "destructive" } as const;

export default function AnnouncementsPage() {
  const t = useT();
  const [state, setState] = useState("");
  const announcements = useAnnouncements(state || undefined);
  const rooms = useRooms();
  const remove = useDeleteAnnouncement();
  const [editing, setEditing] = useState<Announcement | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  const roomNames = (ids: string[]) =>
    ids.length === 0 ? t("All rooms") : ids.map((id) => rooms.data?.find((r) => r.id === id)?.name ?? "?").join(", ");

  return (
    <>
      <PageHeader
        title={t("Announcements")}
        description={t("Messages shown on meeting room TVs during their scheduled window")}
        actions={
          <>
            <NativeSelect className="h-9 w-40" value={state} onChange={(e) => setState(e.target.value)} aria-label={t("State")}>
              <option value="">{t("All states")}</option>
              <option value="active">{t("Active")}</option>
              <option value="scheduled">{t("Scheduled")}</option>
              <option value="expired">{t("Expired")}</option>
              <option value="inactive">{t("Inactive")}</option>
            </NativeSelect>
            <Button onClick={() => setEditing(null)}>
              <Plus /> {t("New announcement")}
            </Button>
          </>
        }
      />
      <Card>
        {announcements.isLoading ? (
          <LoadingBlock />
        ) : announcements.error ? (
          <ErrorBlock error={announcements.error} onRetry={() => announcements.refetch()} />
        ) : announcements.data?.length === 0 ? (
          <EmptyState icon={Megaphone} title={t("No announcements")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Title")}</TableHead>
                <TableHead>{t("Priority")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("Window")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("Rooms")}</TableHead>
                <TableHead>{t("State")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.data?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <span className="block font-medium">{a.title}</span>
                    <span className="line-clamp-1 block text-xs text-muted-foreground">{a.message}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={PRIORITY_VARIANT[a.priority]}>{t(a.priority.charAt(0).toUpperCase() + a.priority.slice(1))}</Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs md:table-cell">
                    {formatDateTime(a.start_at)}
                    <br />→ {formatDateTime(a.end_at)}
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">{roomNames(a.room_ids)}</TableCell>
                  <TableCell>
                    <AnnouncementStateBadge state={a.state} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(a)} aria-label={t("Edit")}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(a)} aria-label={t("Delete")}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <AnnouncementFormDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} announcement={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t("Delete announcement?")}
        description={deleting?.title}
        confirmLabel={t("Delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t("Announcement deleted"));
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </>
  );
}
