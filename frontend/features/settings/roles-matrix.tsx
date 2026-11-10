"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions, useRoles, useSaveRolePermissions } from "@/features/users/api";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";

/** Role × permission matrix editor (roles.manage). super_admin always has everything and is locked. */
export function RolesMatrix() {
  const t = useT();
  const roles = useRoles();
  const permissions = usePermissions();
  const save = useSaveRolePermissions();
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!roles.data) return;
    const d: Record<string, Set<string>> = {};
    roles.data.forEach((r) => (d[r.id] = new Set(r.permissions)));
    setDraft(d);
  }, [roles.data]);

  const dirty = useMemo(() => {
    if (!roles.data) return [] as string[];
    return roles.data
      .filter((r) => {
        const cur = draft[r.id];
        if (!cur) return false;
        return cur.size !== r.permissions.length || r.permissions.some((p) => !cur.has(p));
      })
      .map((r) => r.id);
  }, [roles.data, draft]);

  if (roles.isLoading || permissions.isLoading) return <LoadingBlock />;
  if (roles.error || permissions.error) return <ErrorBlock error={roles.error ?? permissions.error} />;

  const toggle = (roleId: string, code: string) =>
    setDraft((d) => {
      const next = new Set(d[roleId]);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...d, [roleId]: next };
    });

  const saveAll = async () => {
    try {
      for (const roleId of dirty) {
        await save.mutateAsync({ roleId, permissions: Array.from(draft[roleId]) });
      }
      toast.success(t("Permissions updated"));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const roleList = roles.data ?? [];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> {t("Roles & permissions")}
          </CardTitle>
          <CardDescription>{t("Changes apply on the next request of affected users. All checks are enforced by the backend.")}</CardDescription>
        </div>
        <Button onClick={saveAll} disabled={dirty.length === 0 || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : null}
          {t("Save changes")} {dirty.length ? `(${dirty.length})` : ""}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Permission")}</TableHead>
              {roleList.map((r) => (
                <TableHead key={r.id} className="text-center">
                  {r.name.replace(/_/g, " ")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <span className="block font-mono text-xs">{p.code}</span>
                  {p.description ? <span className="block text-xs text-muted-foreground">{p.description}</span> : null}
                </TableCell>
                {roleList.map((r) => {
                  const locked = r.name === "super_admin";
                  return (
                    <TableCell key={r.id} className="text-center">
                      <Checkbox
                        checked={locked || !!draft[r.id]?.has(p.code)}
                        disabled={locked}
                        onCheckedChange={() => toggle(r.id, p.code)}
                        aria-label={`${r.name} ${p.code}`}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
