"use client";

import { useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useRooms } from "@/features/rooms/api";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { addDays, buildIso, toDateInput, toTimeInput, todayRiyadh } from "@/lib/time";
import type { Announcement } from "@/lib/types";
import { announcementFormSchema, type AnnouncementFormValues } from "@/schemas/announcement";
import { useSaveAnnouncement } from "./api";

export function AnnouncementFormDialog({
  open,
  onOpenChange,
  announcement,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  announcement?: Announcement | null;
}) {
  const t = useT();
  const rooms = useRooms();
  const save = useSaveAnnouncement();
  const form = useForm<AnnouncementFormValues>({ resolver: zodResolver(announcementFormSchema) });
  const errors = form.formState.errors;

  useEffect(() => {
    if (!open) return;
    const a = announcement;
    form.reset({
      title: a?.title ?? "",
      message: a?.message ?? "",
      priority: a?.priority ?? "normal",
      start_date: a ? toDateInput(a.start_at) : todayRiyadh(),
      start_time: a ? toTimeInput(a.start_at) : "08:00",
      end_date: a ? toDateInput(a.end_at) : addDays(todayRiyadh(), 7),
      end_time: a ? toTimeInput(a.end_at) : "18:00",
      is_active: a?.is_active ?? true,
      all_rooms: a ? a.room_ids.length === 0 : true,
      room_ids: a?.room_ids ?? [],
    });
  }, [open, announcement, form]);

  const v = form.watch();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        id: announcement?.id,
        data: {
          title: values.title,
          message: values.message,
          priority: values.priority,
          start_at: buildIso(values.start_date, values.start_time),
          end_at: buildIso(values.end_date, values.end_time),
          is_active: values.is_active,
          room_ids: values.all_rooms ? [] : values.room_ids,
        },
      });
      toast.success(announcement ? t("Announcement updated") : t("Announcement created"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const toggleRoom = (id: string) => {
    const cur = v.room_ids ?? [];
    form.setValue("room_ids", cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id], { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{announcement ? t("Edit announcement") : t("New announcement")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label={t("Title")} htmlFor="an-title" error={errors.title?.message} required className="sm:col-span-2">
            <Input id="an-title" {...form.register("title")} />
          </FormField>
          <FormField label={t("Message")} htmlFor="an-msg" error={errors.message?.message} required className="sm:col-span-2">
            <Textarea id="an-msg" rows={3} {...form.register("message")} />
          </FormField>
          <FormField label={t("Priority")} htmlFor="an-prio">
            <NativeSelect id="an-prio" {...form.register("priority")}>
              <option value="low">{t("Low")}</option>
              <option value="normal">{t("Normal")}</option>
              <option value="high">{t("High")}</option>
              <option value="critical">{t("Critical")}</option>
            </NativeSelect>
          </FormField>
          <label className="flex items-center justify-between self-end pb-2 text-sm font-medium">
            {t("Active")}
            <Switch checked={!!v.is_active} onCheckedChange={(c) => form.setValue("is_active", c)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <FormField label={t("Starts")} htmlFor="an-sd" error={errors.start_date?.message} required>
              <Input id="an-sd" type="date" {...form.register("start_date")} />
            </FormField>
            <FormField label={"\u00a0"} htmlFor="an-st">
              <Input id="an-st" type="time" aria-label={t("Start time")} {...form.register("start_time")} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label={t("Ends")} htmlFor="an-ed" error={errors.end_date?.message} required>
              <Input id="an-ed" type="date" {...form.register("end_date")} />
            </FormField>
            <FormField label={"\u00a0"} htmlFor="an-et" error={errors.end_time?.message}>
              <Input id="an-et" type="time" aria-label={t("End time")} {...form.register("end_time")} />
            </FormField>
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3 sm:col-span-2">
            <legend className="px-1 text-sm font-medium">{t("Target rooms")}</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={v.all_rooms} onCheckedChange={(c) => form.setValue("all_rooms", c === true, { shouldValidate: true })} />
              {t("All rooms")}
            </label>
            {!v.all_rooms ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {rooms.data?.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={v.room_ids?.includes(r.id)} onCheckedChange={() => toggleRoom(r.id)} />
                    {r.name}
                  </label>
                ))}
              </div>
            ) : null}
            {errors.room_ids?.message ? <p className="text-xs text-destructive">{errors.room_ids.message}</p> : null}
          </fieldset>
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
