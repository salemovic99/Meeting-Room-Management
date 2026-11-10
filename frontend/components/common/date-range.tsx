"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { addDays, todayRiyadh } from "@/lib/time";
import { useT } from "@/lib/i18n";

export interface DateRangeValue {
  from: string;
  to: string;
}

export function defaultRange(days = 30): DateRangeValue {
  const to = todayRiyadh();
  return { from: addDays(to, -(days - 1)), to };
}

export function DateRange({ value, onChange }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void }) {
  const t = useT();
  const presets: [string, number][] = [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="range-from" className="text-xs">
          {t("From")}
        </Label>
        <Input
          id="range-from"
          type="date"
          value={value.from}
          max={value.to}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="range-to" className="text-xs">
          {t("To")}
        </Label>
        <Input
          id="range-to"
          type="date"
          value={value.to}
          min={value.from}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="h-9 w-40"
        />
      </div>
      {presets.map(([label, days]) => (
        <Button key={label} variant="outline" size="sm" onClick={() => onChange(defaultRange(days))}>
          {label}
        </Button>
      ))}
    </div>
  );
}
