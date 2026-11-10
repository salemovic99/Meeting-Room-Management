"use client";

import { useState } from "react";
import { Pencil, Plus, Search, UserX } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { ActiveBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/auth-provider";
import { useDepartments } from "@/features/departments/api";
import { UserFormDialog } from "@/features/users/user-form-dialog";
import { useDeactivateUser, useRoles, useUsers, type UserFilters } from "@/features/users/api";
import { useDebounce } from "@/hooks/use-debounce";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { UserOut } from "@/lib/types";

export default function EmployeesPage() {
  const t = useT();
  const { can, user: me } = useAuth();
  const canManage = can("users.manage");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [filters, setFilters] = useState<Omit<UserFilters, "q">>({ page: 1, page_size: 25, is_active: true });
  const users = useUsers({ ...filters, q: debouncedQ || undefined });
  const departments = useDepartments();
  const roles = useRoles();
  const deactivate = useDeactivateUser();
  const [editing, setEditing] = useState<UserOut | null | undefined>(undefined);
  const [deactivating, setDeactivating] = useState<UserOut | null>(null);

  const setFilter = (patch: Partial<UserFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <>
      <PageHeader
        title={t("Employees")}
        description={t("Users, departments and role assignments")}
        actions={
          canManage ? (
            <Button onClick={() => setEditing(null)}>
              <Plus /> {t("New employee")}
            </Button>
          ) : null
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setFilters((f) => ({ ...f, page: 1 }));
            }}
            placeholder={t("Search by name or email")}
            className="h-9 ps-8"
            aria-label={t("Search")}
          />
        </div>
        <NativeSelect className="h-9 w-52" value={filters.department_id ?? ""} onChange={(e) => setFilter({ department_id: e.target.value || undefined })} aria-label={t("Department")}>
          <option value="">{t("All departments")}</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="h-9 w-48" value={filters.role ?? ""} onChange={(e) => setFilter({ role: e.target.value || undefined })} aria-label={t("Role")}>
          <option value="">{t("All roles")}</option>
          {roles.data?.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name.replace(/_/g, " ")}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-40"
          value={filters.is_active === "" ? "" : String(filters.is_active)}
          onChange={(e) => setFilter({ is_active: e.target.value === "" ? "" : e.target.value === "true" })}
          aria-label={t("Status")}
        >
          <option value="true">{t("Active")}</option>
          <option value="false">{t("Inactive")}</option>
          <option value="">{t("All")}</option>
        </NativeSelect>
      </Card>

      <Card>
        {users.isLoading ? (
          <LoadingBlock />
        ) : users.error ? (
          <ErrorBlock error={users.error} onRetry={() => users.refetch()} />
        ) : users.data?.items.length === 0 ? (
          <EmptyState title={t("No employees found")} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("Department")}</TableHead>
                  <TableHead>{t("Roles")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  {canManage ? <TableHead className="w-28" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="block font-medium">{u.full_name}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.department?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="outline">
                            {r.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ActiveBadge active={u.is_active} />
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={t("Edit")}>
                            <Pencil />
                          </Button>
                          {u.is_active && u.id !== me?.id ? (
                            <Button variant="ghost" size="icon" onClick={() => setDeactivating(u)} aria-label={t("Deactivate")}>
                              <UserX className="text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {users.data ? (
              <Pagination
                page={users.data.page}
                pageSize={users.data.page_size}
                total={users.data.total}
                onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
              />
            ) : null}
          </>
        )}
      </Card>

      <UserFormDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} user={editing} />
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        destructive
        title={t("Deactivate employee?")}
        description={t("{name} will no longer be able to sign in or create reservations. Their history is kept.", {
          name: deactivating?.full_name ?? "",
        })}
        confirmLabel={t("Deactivate")}
        onConfirm={async () => {
          if (!deactivating) return;
          try {
            const res = await deactivate.mutateAsync(deactivating.id);
            if (res.future_bookings_count > 0) {
              toast.warning(
                t("Deactivated. {n} future reservations are still organized by this employee — reassign or cancel them.", {
                  n: res.future_bookings_count,
                }),
                { duration: 12_000 },
              );
            } else {
              toast.success(t("Employee deactivated"));
            }
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </>
  );
}
