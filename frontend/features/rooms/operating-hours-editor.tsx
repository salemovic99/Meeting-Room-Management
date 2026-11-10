"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n";
import type { DayHours, OperatingHours, Weekday } from "@/lib/types";

export const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
];

/** Saudi working week default: Sun–Thu 08:00–17:00, Fri/Sat closed. */
export const DEFAULT_HOURS: OperatingHours = {
  sun: { open: "08:00", close: "17:00" },
  mon: { open: "08:00", close: "17:00" },
  tue: { open: "08:00", close: "17:00" },
  wed: { open: "08:00", close: "17:00" },
  thu: { open: "08:00", close: "17:00" },
  fri: null,
  sat: null,
};

export function OperatingHoursEditor({
  value,
  onChange,
  errors,
}: {
  value: Record<string, DayHours>;
  onChange: (v: Record<string, DayHours>) => void;
  errors?: Partial<Record<string, string>>;
}) {
  const t = useT();
  const set = (day: Weekday, h: DayHours) => onChange({ ...value, [day]: h });
  return (
    <div className="space-y-2">
      {WEEKDAYS.map(({ key, label }) => {
        const h = value[key] ?? null;
        return (
          <div key={key} className="grid grid-cols-[110px_auto_1fr] items-center gap-3">
            <span className="text-sm">{t(label)}</span>
            <Switch
              checked={!!h}
              onCheckedChange={(on) => set(key, on ? { open: "08:00", close: "17:00" } : null)}
              aria-label={`${t(label)} ${t("open")}`}
            />
            {h ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={h.open}
                  onChange={(e) => set(key, { ...h, open: e.target.value })}
                  className="h-9 w-28"
                  aria-label={`${t(label)} ${t("opens")}`}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={h.close}
                  onChange={(e) => set(key, { ...h, close: e.target.value })}
                  className="h-9 w-28"
                  aria-label={`${t(label)} ${t("closes")}`}
                />
                {errors?.[key] ? <span className="text-xs text-destructive">{errors[key]}</span> : null}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{t("Closed")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
