"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useRooms } from "@/features/rooms/api";
import { errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Device, DeviceTokenResponse } from "@/lib/types";
import { useRegisterDevice, useUpdateDevice } from "./api";

/** Register a new TV (device = undefined) or rename / reassign an existing one. */
export function DeviceFormDialog({
  open,
  onOpenChange,
  device,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  device?: Device | null;
  onRegistered: (r: DeviceTokenResponse) => void;
}) {
  const t = useT();
  const rooms = useRooms();
  const register = useRegisterDevice();
  const update = useUpdateDevice();
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(device?.device_name ?? "");
      setRoomId(device?.room_id ?? "");
      setError(null);
    }
  }, [open, device]);

  const busy = register.isPending || update.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !roomId) {
      setError(t("Name and room are required"));
      return;
    }
    try {
      if (device) {
        await update.mutateAsync({ id: device.id, data: { device_name: name.trim(), room_id: roomId } });
        toast.success(t("Display updated"));
        onOpenChange(false);
      } else {
        const res = await register.mutateAsync({ device_name: name.trim(), room_id: roomId });
        onOpenChange(false);
        onRegistered(res);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{device ? t("Edit display") : t("Register display")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label={t("Device name")} htmlFor="dv-name" required>
            <Input id="dv-name" placeholder="Samsung TV – Room 01" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField
            label={t("Assigned room")}
            htmlFor="dv-room"
            required
            hint={device && roomId !== device.room_id ? t("The TV will need to load the new room's display URL.") : undefined}
          >
            <NativeSelect id="dv-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">{t("Select room")}</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (/display/{r.display_slug})
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {device ? t("Save") : t("Register & generate credential")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
