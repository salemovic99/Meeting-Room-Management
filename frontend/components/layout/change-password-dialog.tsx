"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { changePasswordSchema, type ChangePasswordValues } from "@/schemas/auth";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await api<void>("/auth/change-password", {
        method: "POST",
        body: { current_password: v.current_password, new_password: v.new_password },
      });
      toast.success(t("Password changed"));
      form.reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Change password")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label={t("Current password")} htmlFor="cp-current" error={errors.current_password?.message} required>
            <Input id="cp-current" type="password" autoComplete="current-password" {...form.register("current_password")} />
          </FormField>
          <FormField label={t("New password")} htmlFor="cp-new" error={errors.new_password?.message} required>
            <Input id="cp-new" type="password" autoComplete="new-password" {...form.register("new_password")} />
          </FormField>
          <FormField label={t("Confirm new password")} htmlFor="cp-confirm" error={errors.confirm_password?.message} required>
            <Input id="cp-confirm" type="password" autoComplete="new-password" {...form.register("confirm_password")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
