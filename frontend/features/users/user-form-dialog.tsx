"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth-provider";
import { useDepartments } from "@/features/departments/api";
import { ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { UserOut } from "@/lib/types";
import { userFormSchema, type UserFormValues } from "@/schemas/user";
import { useRoles, useSaveUser, type UserInput } from "./api";

export function UserFormDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user?: UserOut | null }) {
  const t = useT();
  const { user: me, can } = useAuth();
  const isEdit = !!user;
  const canManageRoles = can("roles.manage");
  const isSuperAdmin = !!me?.roles.includes("super_admin");
  const roles = useRoles(open);
  const departments = useDepartments(false, open);
  const save = useSaveUser();
  const schema = useMemo(() => userFormSchema(isEdit), [isEdit]);
  const form = useForm<UserFormValues>({ resolver: zodResolver(schema) });
  const errors = form.formState.errors;

  useEffect(() => {
    if (!open) return;
    form.reset({
      full_name: user?.full_name ?? "",
      email: user?.email ?? "",
      password: "",
      department_id: user?.department_id ?? "",
      roles: user?.roles ?? ["employee"],
      is_active: user?.is_active ?? true,
    });
  }, [open, user, form]);

  const v = form.watch();

  const onSubmit = form.handleSubmit(async (values) => {
    const data: Partial<UserInput> = {
      full_name: values.full_name,
      email: values.email,
      department_id: values.department_id || null,
      is_active: values.is_active,
    };
    if (values.password) data.password = values.password;
    // Only send roles when the caller may change them (backend enforces regardless).
    if (!isEdit || canManageRoles) data.roles = values.roles;
    try {
      await save.mutateAsync({ id: user?.id, data });
      toast.success(isEdit ? t("Employee updated") : t("Employee created"));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        Object.entries(err.fieldErrors).forEach(([k, msg]) => form.setError(k as keyof UserFormValues, { message: msg }));
      }
      toast.error(errorMessage(err));
    }
  });

  const toggleRole = (name: string) => {
    const cur = v.roles ?? [];
    form.setValue("roles", cur.includes(name) ? cur.filter((r) => r !== name) : [...cur, name], { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Edit employee") : t("New employee")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label={t("Full name")} htmlFor="us-name" error={errors.full_name?.message} required className="sm:col-span-2">
            <Input id="us-name" {...form.register("full_name")} />
          </FormField>
          <FormField label={t("Email")} htmlFor="us-email" error={errors.email?.message} required>
            <Input id="us-email" type="email" autoComplete="off" {...form.register("email")} />
          </FormField>
          <FormField
            label={isEdit ? t("Reset password") : t("Password")}
            htmlFor="us-pw"
            error={errors.password?.message}
            hint={isEdit ? t("Leave blank to keep the current password") : undefined}
            required={!isEdit}
          >
            <Input id="us-pw" type="password" autoComplete="new-password" {...form.register("password")} />
          </FormField>
          <FormField label={t("Department")} htmlFor="us-dept" className="sm:col-span-2">
            <NativeSelect id="us-dept" {...form.register("department_id")}>
              <option value="">{t("No department")}</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <fieldset className="space-y-2 sm:col-span-2" disabled={isEdit && !canManageRoles}>
            <legend className="mb-1 text-sm font-medium">{t("Roles")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.data?.map((r) => {
                const blocked = r.name === "super_admin" && !isSuperAdmin;
                return (
                  <label key={r.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <Checkbox
                      checked={v.roles?.includes(r.name)}
                      onCheckedChange={() => toggleRole(r.name)}
                      disabled={blocked || (isEdit && !canManageRoles)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium">{r.name.replace(/_/g, " ")}</span>
                      {r.description ? <span className="block text-xs text-muted-foreground">{r.description}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.roles?.message ? <p className="text-xs text-destructive">{errors.roles.message}</p> : null}
            {isEdit && !canManageRoles ? (
              <p className="text-xs text-muted-foreground">{t("You don't have permission to change roles.")}</p>
            ) : null}
          </fieldset>
          <label className="flex items-center justify-between text-sm font-medium sm:col-span-2">
            {t("Active")}
            <Switch checked={!!v.is_active} onCheckedChange={(c) => form.setValue("is_active", c)} />
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
