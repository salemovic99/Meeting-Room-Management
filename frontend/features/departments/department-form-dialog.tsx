"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { OrganizerPicker } from "@/features/users/organizer-picker";
import { ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Department } from "@/lib/types";
import { departmentFormSchema, type DepartmentFormValues } from "@/schemas/user";
import { useSaveDepartment } from "./api";

export function DepartmentFormDialog({
  open,
  onOpenChange,
  department,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  department?: Department | null;
}) {
  const t = useT();
  const save = useSaveDepartment();
  const [managerName, setManagerName] = useState("");
  const form = useForm<DepartmentFormValues>({ resolver: zodResolver(departmentFormSchema) });
  const errors = form.formState.errors;

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: department?.name ?? "",
      code: department?.code ?? "",
      description: department?.description ?? "",
      manager_id: department?.manager_id ?? "",
      is_active: department?.is_active ?? true,
    });
    setManagerName(department?.manager?.full_name ?? "");
  }, [open, department, form]);

  const v = form.watch();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        id: department?.id,
        data: { ...values, description: values.description || null, manager_id: values.manager_id || null },
      });
      toast.success(department ? t("Department updated") : t("Department created"));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        Object.entries(err.fieldErrors).forEach(([k, msg]) => form.setError(k as keyof DepartmentFormValues, { message: msg }));
      }
      toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? t("Edit department") : t("New department")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-3 gap-3">
            <FormField label={t("Name")} htmlFor="dp-name" error={errors.name?.message} required className="col-span-2">
              <Input id="dp-name" {...form.register("name")} />
            </FormField>
            <FormField label={t("Code")} htmlFor="dp-code" error={errors.code?.message} required>
              <Input id="dp-code" placeholder="HR" {...form.register("code")} />
            </FormField>
          </div>
          <FormField label={t("Description")} htmlFor="dp-desc">
            <Textarea id="dp-desc" rows={2} {...form.register("description")} />
          </FormField>
          <FormField label={t("Department manager")} htmlFor="dp-mgr">
            <OrganizerPicker
              id="dp-mgr"
              value={v.manager_id}
              selectedName={managerName}
              onSelect={(u) => {
                form.setValue("manager_id", u.id);
                setManagerName(u.full_name);
              }}
            />
          </FormField>
          <label className="flex items-center justify-between text-sm font-medium">
            {t("Active")}
            <Switch checked={!!v.is_active} onCheckedChange={(c) => form.setValue("is_active", c)} />
          </label>
          <DialogFooter>
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
