"use client";

import { useState } from "react";
import { Building2, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { ActiveBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeactivateDepartment, useDepartments } from "@/features/departments/api";
import { DepartmentFormDialog } from "@/features/departments/department-form-dialog";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Department } from "@/lib/types";

export default function DepartmentsPage() {
  const t = useT();
  const [includeInactive, setIncludeInactive] = useState(false);
  const departments = useDepartments(includeInactive);
  const deactivate = useDeactivateDepartment();
  const [editing, setEditing] = useState<Department | null | undefined>(undefined);
  const [deactivating, setDeactivating] = useState<Department | null>(null);

  return (
    <>
      <PageHeader
        title={t("Departments")}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
              {t("Show inactive")}
            </label>
            <Button onClick={() => setEditing(null)}>
              <Plus /> {t("New department")}
            </Button>
          </>
        }
      />
      <Card>
        {departments.isLoading ? (
          <LoadingBlock />
        ) : departments.error ? (
          <ErrorBlock error={departments.error} onRetry={() => departments.refetch()} />
        ) : departments.data?.length === 0 ? (
          <EmptyState icon={Building2} title={t("No departments yet")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Name")}</TableHead>
                <TableHead>{t("Code")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("Manager")}</TableHead>
                <TableHead>{t("Members")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.data?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <span className="block font-medium">{d.name}</span>
                    {d.description ? <span className="block text-xs text-muted-foreground">{d.description}</span> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="hidden md:table-cell">{d.manager?.full_name ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{d.member_count}</TableCell>
                  <TableCell>
                    <ActiveBadge active={d.is_active} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(d)} aria-label={t("Edit")}>
                        <Pencil />
                      </Button>
                      {d.is_active ? (
                        <Button variant="ghost" size="icon" onClick={() => setDeactivating(d)} aria-label={t("Deactivate")}>
                          <Power className="text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <DepartmentFormDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} department={editing} />
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        destructive
        title={t("Deactivate department?")}
        description={deactivating?.name}
        confirmLabel={t("Deactivate")}
        onConfirm={async () => {
          if (!deactivating) return;
          try {
            await deactivate.mutateAsync(deactivating.id);
            toast.success(t("Department deactivated"));
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </>
  );
}
