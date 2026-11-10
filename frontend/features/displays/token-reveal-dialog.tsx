"use client";

import { useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import type { DeviceTokenResponse } from "@/lib/types";

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} className="h-10 flex-1 rounded-md border bg-muted px-3 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked — user can select manually */
            }
          }}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Shows a freshly issued device credential exactly once. The secret is held only in this
 * component's props/state — never logged, cached in TanStack Query, or persisted.
 */
export function TokenRevealDialog({ result, onClose }: { result: DeviceTokenResponse | null; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("Device credential for {name}", { name: result?.device.device_name ?? "" })}</DialogTitle>
          <DialogDescription>{result?.device.room.name}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden />
          <p>
            {t("This credential is shown only once. Open the pairing URL on the TV browser (or kiosk player) to pair it. Anyone with this link can display this room's schedule — do not share it.")}
          </p>
        </div>
        {result ? (
          <div className="space-y-4">
            <CopyField id="pairing-url" label={t("Pairing URL (open on the TV)")} value={result.pairing_url} />
            <CopyField id="device-token" label={t("Device token")} value={result.device_token} />
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>{t("I have saved it")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
