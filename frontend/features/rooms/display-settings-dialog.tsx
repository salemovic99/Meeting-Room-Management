"use client";

import { useEffect } from "react";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LoadingBlock } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Room } from "@/lib/types";
import { displaySettingsSchema, type DisplaySettingsValues } from "@/schemas/room";
import { useDisplaySettings, useSaveDisplaySettings } from "./api";

const TOGGLES: { key: Path<DisplaySettingsValues>; label: string }[] = [
  { key: "show_clock", label: "Show clock" },
  { key: "show_date", label: "Show date" },
  { key: "show_organizer", label: "Show organizer" },
  { key: "show_department", label: "Show department" },
  { key: "show_announcements", label: "Show announcements" },
  { key: "show_qr_code", label: "Show QR code" },
];

/** Remote TV configuration. Saving pushes `display.settings_updated` to the room's TV(s). */
export function DisplaySettingsDialog({ room, open, onOpenChange }: { room: Room | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const settings = useDisplaySettings(open && room ? room.id : null);
  const save = useSaveDisplaySettings();
  const form = useForm<DisplaySettingsValues>({ resolver: zodResolver(displaySettingsSchema) });
  const { register, watch, setValue } = form;
  const errors = form.formState.errors;

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    form.reset({
      display_mode: s.display_mode,
      theme: s.theme,
      primary_color: s.primary_color,
      secondary_color: s.secondary_color,
      background_color: s.background_color,
      logo_url: s.logo_url ?? "",
      show_clock: s.show_clock,
      show_date: s.show_date,
      show_organizer: s.show_organizer,
      show_department: s.show_department,
      show_announcements: s.show_announcements,
      show_qr_code: s.show_qr_code,
      qr_code_url: s.qr_code_url ?? "",
      upcoming_meetings_limit: s.upcoming_meetings_limit,
      refresh_interval_seconds: s.refresh_interval_seconds,
      idle_behavior: s.idle_behavior,
      language: s.language,
      announcement_text: s.announcement_text ?? "",
    });
  }, [settings.data, form]);

  const v = watch();

  const onSubmit = form.handleSubmit(async (values) => {
    if (!room) return;
    try {
      await save.mutateAsync({
        roomId: room.id,
        data: {
          ...values,
          logo_url: values.logo_url || null,
          qr_code_url: values.qr_code_url || null,
          announcement_text: values.announcement_text || null,
          upcoming_meetings_limit: Number(values.upcoming_meetings_limit),
          refresh_interval_seconds: Number(values.refresh_interval_seconds),
        },
      });
      toast.success(t("Display settings saved — the TV will update automatically"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Display settings")} · {room?.name}</DialogTitle>
          <DialogDescription>{room ? `/display/${room.display_slug}` : null}</DialogDescription>
        </DialogHeader>
        {!settings.data ? (
          <LoadingBlock />
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3" noValidate>
            <FormField label={t("Display mode")} htmlFor="ds-mode">
              <NativeSelect id="ds-mode" {...register("display_mode")}>
                <option value="full_schedule">{t("Full schedule")}</option>
                <option value="current_meeting">{t("Current meeting")}</option>
                <option value="availability">{t("Availability")}</option>
                <option value="announcement">{t("Announcement")}</option>
                <option value="maintenance">{t("Maintenance")}</option>
              </NativeSelect>
            </FormField>
            <FormField label={t("Theme")} htmlFor="ds-theme">
              <NativeSelect id="ds-theme" {...register("theme")}>
                <option value="dark">{t("Dark")}</option>
                <option value="light">{t("Light")}</option>
              </NativeSelect>
            </FormField>
            <FormField label={t("Language")} htmlFor="ds-lang">
              <NativeSelect id="ds-lang" {...register("language")}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </NativeSelect>
            </FormField>

            {(["primary_color", "secondary_color", "background_color"] as const).map((k) => (
              <FormField key={k} label={t(k.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()))} htmlFor={`ds-${k}`} error={errors[k]?.message}>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={v[k] || "#000000"}
                    onChange={(e) => setValue(k, e.target.value, { shouldValidate: true })}
                    className="h-10 w-12 cursor-pointer rounded-md border bg-background p-1"
                    aria-label={k}
                  />
                  <Input id={`ds-${k}`} {...register(k)} />
                </div>
              </FormField>
            ))}

            <FormField label={t("Upcoming meetings shown")} htmlFor="ds-limit" error={errors.upcoming_meetings_limit?.message}>
              <Input id="ds-limit" type="number" min={0} max={20} {...register("upcoming_meetings_limit")} />
            </FormField>
            <FormField
              label={t("Safety refresh interval (s)")}
              htmlFor="ds-refresh"
              error={errors.refresh_interval_seconds?.message}
              hint={t("Realtime updates arrive instantly; this is a fallback poll.")}
            >
              <Input id="ds-refresh" type="number" min={15} {...register("refresh_interval_seconds")} />
            </FormField>
            <FormField label={t("When idle")} htmlFor="ds-idle">
              <NativeSelect id="ds-idle" {...register("idle_behavior")}>
                <option value="show_availability">{t("Show availability")}</option>
                <option value="show_announcement">{t("Show announcement")}</option>
                <option value="dim">{t("Dim screen")}</option>
              </NativeSelect>
            </FormField>

            <FormField label={t("Logo URL")} htmlFor="ds-logo" error={errors.logo_url?.message} className="md:col-span-3">
              <Input id="ds-logo" placeholder="https://…/logo.png" {...register("logo_url")} />
            </FormField>

            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 md:col-span-3 md:grid-cols-3">
              {TOGGLES.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-2 text-sm">
                  {t(label)}
                  <Switch checked={!!v[key]} onCheckedChange={(c) => setValue(key, c as never)} />
                </label>
              ))}
            </div>
            {v.show_qr_code ? (
              <FormField
                label={t("Custom QR link (optional)")}
                hint={t("Leave empty to use this room's walk-up booking page (/book/…).")}
                htmlFor="ds-qr"
                error={errors.qr_code_url?.message}
                className="md:col-span-3"
              >
                <Input id="ds-qr" placeholder="https://meetings.company.com/book/room-01" {...register("qr_code_url")} />
              </FormField>
            ) : null}
            <FormField
              label={t("Announcement text (announcement mode)")}
              htmlFor="ds-ann"
              className="md:col-span-3"
              hint={t("Used in Announcement mode when no scheduled announcement is active.")}
            >
              <Textarea id="ds-ann" rows={2} {...register("announcement_text")} />
            </FormField>

            <DialogFooter className="md:col-span-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : null}
                {t("Save & push to TV")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
