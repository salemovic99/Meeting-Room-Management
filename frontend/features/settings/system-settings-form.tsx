"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LoadingBlock, ErrorBlock } from "@/components/common/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSaveSystemSettings, useSystemSettings } from "./api";

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "url";
  hint?: string;
  min?: number;
}

// Keys documented in docs/API.md → "System settings".
const FIELDS: FieldDef[] = [
  { key: "company.name", label: "Company name", type: "text" },
  { key: "company.logo_url", label: "Company logo URL", type: "url", hint: "Default logo for TV displays" },
  { key: "booking.min_duration_minutes", label: "Minimum booking duration (min)", type: "number", min: 5 },
  { key: "booking.max_duration_minutes", label: "Maximum booking duration (min)", type: "number", min: 15 },
  { key: "booking.advance_days", label: "Advance booking limit (days)", type: "number", min: 1 },
  {
    key: "availability.upcoming_threshold_minutes",
    label: "\"Upcoming\" threshold (min)",
    type: "number",
    min: 1,
    hint: "A room shows as Upcoming when the next meeting starts within this many minutes",
  },
];

export function SystemSettingsForm() {
  const t = useT();
  const settings = useSystemSettings();
  const save = useSaveSystemSettings();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!settings.data) return;
    const d: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const v = settings.data[f.key];
      d[f.key] = v === null || v === undefined ? "" : String(v);
    });
    setDraft(d);
  }, [settings.data]);

  if (settings.isLoading) return <LoadingBlock />;
  if (settings.error) return <ErrorBlock error={settings.error} onRetry={() => settings.refetch()} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const raw = draft[f.key] ?? "";
      if (f.type === "number") {
        const n = Number(raw);
        if (!Number.isFinite(n) || (f.min !== undefined && n < f.min)) {
          toast.error(`${t(f.label)}: ${t("invalid value")}`);
          return;
        }
        payload[f.key] = n;
      } else {
        payload[f.key] = raw.trim() === "" ? null : raw.trim();
      }
    }
    const min = payload["booking.min_duration_minutes"] as number;
    const max = payload["booking.max_duration_minutes"] as number;
    if (min > max) {
      toast.error(t("Minimum duration cannot exceed maximum duration"));
      return;
    }
    try {
      await save.mutateAsync(payload);
      toast.success(t("Settings saved"));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("System settings")}</CardTitle>
        <CardDescription>{t("Booking rules and branding. Timezone is fixed to Asia/Riyadh for this deployment.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          {FIELDS.map((f) => (
            <FormField key={f.key} label={t(f.label)} htmlFor={`set-${f.key}`} hint={f.hint ? t(f.hint) : undefined}>
              <Input
                id={`set-${f.key}`}
                type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
                min={f.min}
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </FormField>
          ))}
          <div className="md:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("Save settings")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
