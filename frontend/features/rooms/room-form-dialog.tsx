"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { DayHours, OperatingHours, Room } from "@/lib/types";
import { roomFormSchema, type RoomFormValues } from "@/schemas/room";
import { useSaveRoom } from "./api";
import { EquipmentInput } from "./equipment-input";
import { DEFAULT_HOURS, OperatingHoursEditor } from "./operating-hours-editor";

export function RoomFormDialog({ open, onOpenChange, room }: { open: boolean; onOpenChange: (o: boolean) => void; room?: Room | null }) {
  const t = useT();
  const save = useSaveRoom();
  const form = useForm<RoomFormValues>({ resolver: zodResolver(roomFormSchema) });
  const { register, watch, setValue, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: room?.name ?? "",
      code: room?.code ?? "",
      display_slug: room?.display_slug ?? "",
      location: room?.location ?? "",
      floor: room?.floor ?? "",
      capacity: room?.capacity ?? 8,
      description: room?.description ?? "",
      equipment: room?.equipment ?? ["TV", "HDMI"],
      limit_hours: room ? room.operating_hours !== null : true,
      operating_hours: (room?.operating_hours ?? DEFAULT_HOURS) as Record<string, DayHours>,
      is_active: room?.is_active ?? true,
      maintenance_mode: room?.maintenance_mode ?? false,
      maintenance_message: room?.maintenance_message ?? "",
    });
  }, [open, room, form]);

  const v = watch();
  const hoursErrors: Record<string, string> = {};
  const ohErr = errors.operating_hours as Record<string, { message?: string }> | undefined;
  if (ohErr) Object.entries(ohErr).forEach(([k, e]) => e?.message && (hoursErrors[k] = e.message));

  const onSubmit = form.handleSubmit(async (values) => {
    const data = {
      name: values.name,
      code: values.code,
      display_slug: values.display_slug,
      location: values.location || null,
      floor: values.floor || null,
      capacity: Number(values.capacity),
      description: values.description || null,
      equipment: values.equipment,
      operating_hours: values.limit_hours ? (values.operating_hours as OperatingHours) : null,
      is_active: values.is_active,
      maintenance_mode: values.maintenance_mode,
      maintenance_message: values.maintenance_message || null,
    };
    try {
      const res = await save.mutateAsync({ id: room?.id, data });
      const affected = (res as { affected_future_bookings?: number }).affected_future_bookings;
      if (affected && (values.maintenance_mode || !values.is_active)) {
        toast.warning(
          t("{n} future reservations exist for this room. They were not cancelled — review them in Reservations.", { n: affected }),
          { duration: 10_000 },
        );
      } else {
        toast.success(room ? t("Room updated") : t("Room created"));
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        Object.entries(err.fieldErrors).forEach(([k, msg]) => form.setError(k as keyof RoomFormValues, { message: msg }));
      }
      toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{room ? t("Edit room") : t("New room")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2" noValidate>
          <FormField label={t("Name")} htmlFor="rm-name" error={errors.name?.message} required>
            <Input id="rm-name" placeholder="Meeting Room 01" {...register("name")} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("Code")} htmlFor="rm-code" error={errors.code?.message} required>
              <Input id="rm-code" placeholder="MR-001" {...register("code")} />
            </FormField>
            <FormField label={t("Capacity")} htmlFor="rm-cap" error={errors.capacity?.message} required>
              <Input id="rm-cap" type="number" min={1} {...register("capacity")} />
            </FormField>
          </div>
          <FormField
            label={t("Display slug")}
            htmlFor="rm-slug"
            error={errors.display_slug?.message}
            hint={v.display_slug ? `/display/${v.display_slug}` : undefined}
            required
          >
            <Input id="rm-slug" placeholder="room-01" {...register("display_slug")} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("Location")} htmlFor="rm-loc">
              <Input id="rm-loc" placeholder="HQ Building" {...register("location")} />
            </FormField>
            <FormField label={t("Floor")} htmlFor="rm-floor">
              <Input id="rm-floor" {...register("floor")} />
            </FormField>
          </div>
          <FormField label={t("Description")} htmlFor="rm-desc" className="md:col-span-2">
            <Textarea id="rm-desc" rows={2} {...register("description")} />
          </FormField>
          <FormField label={t("Equipment")} htmlFor="rm-eq">
            <EquipmentInput id="rm-eq" value={v.equipment ?? []} onChange={(eq) => setValue("equipment", eq)} />
          </FormField>
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm font-medium">
              {t("Restrict to operating hours")}
              <Switch checked={!!v.limit_hours} onCheckedChange={(c) => setValue("limit_hours", c)} />
            </label>
            {v.limit_hours ? (
              <OperatingHoursEditor
                value={(v.operating_hours ?? DEFAULT_HOURS) as Record<string, DayHours>}
                onChange={(oh) => setValue("operating_hours", oh, { shouldValidate: true })}
                errors={hoursErrors}
              />
            ) : (
              <p className="text-xs text-muted-foreground">{t("Bookable 24/7. Utilization uses 24h per day as denominator.")}</p>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3 md:col-span-2">
            <label className="flex items-center justify-between text-sm font-medium">
              {t("Active")}
              <Switch checked={!!v.is_active} onCheckedChange={(c) => setValue("is_active", c)} />
            </label>
            <label className="flex items-center justify-between text-sm font-medium">
              {t("Maintenance mode")}
              <Switch checked={!!v.maintenance_mode} onCheckedChange={(c) => setValue("maintenance_mode", c)} />
            </label>
            {v.maintenance_mode ? (
              <>
                <p className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t("New reservations are blocked and the TV shows the maintenance screen. Existing future reservations are kept — you will be told how many.")}
                </p>
                <FormField label={t("Maintenance message")} htmlFor="rm-mmsg">
                  <Input id="rm-mmsg" placeholder={t("Room under maintenance until 2 PM")} {...register("maintenance_message")} />
                </FormField>
              </>
            ) : null}
          </div>

          <DialogFooter className="md:col-span-2">
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
