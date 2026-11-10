"use client";

import {
  Ban,
  CheckCircle2,
  CircleDot,
  CircleHelp,
  Clock,
  PlayCircle,
  Power,
  Wifi,
  WifiOff,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";
import type { AnnouncementState, BookingStatus, DeviceStatus, RoomStatus } from "@/lib/types";

type Variant = NonNullable<BadgeProps["variant"]>;
interface Spec {
  label: string;
  icon: LucideIcon;
  variant: Variant;
}

// Status is always communicated with icon + text, never color alone (PRD §10 Accessibility).
const ROOM: Record<RoomStatus, Spec> = {
  available: { label: "Available", icon: CheckCircle2, variant: "success" },
  upcoming: { label: "Upcoming", icon: Clock, variant: "warning" },
  occupied: { label: "Occupied", icon: CircleDot, variant: "destructive" },
  maintenance: { label: "Maintenance", icon: Wrench, variant: "muted" },
  unavailable: { label: "Unavailable", icon: Ban, variant: "muted" },
};

const BOOKING: Record<BookingStatus, Spec> = {
  confirmed: { label: "Confirmed", icon: CheckCircle2, variant: "default" },
  in_progress: { label: "In progress", icon: PlayCircle, variant: "warning" },
  completed: { label: "Completed", icon: CheckCircle2, variant: "muted" },
  cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
};

const DEVICE: Record<DeviceStatus, Spec> = {
  online: { label: "Online", icon: Wifi, variant: "success" },
  offline: { label: "Offline", icon: WifiOff, variant: "destructive" },
  unknown: { label: "Unknown", icon: CircleHelp, variant: "muted" },
  disabled: { label: "Disabled", icon: Power, variant: "muted" },
};

const ANNOUNCEMENT: Record<AnnouncementState, Spec> = {
  active: { label: "Active", icon: PlayCircle, variant: "success" },
  scheduled: { label: "Scheduled", icon: Clock, variant: "warning" },
  expired: { label: "Expired", icon: XCircle, variant: "muted" },
  inactive: { label: "Inactive", icon: Power, variant: "muted" },
};

function Render({ spec }: { spec: Spec }) {
  const t = useT();
  const Icon = spec.icon;
  return (
    <Badge variant={spec.variant}>
      <Icon aria-hidden />
      {t(spec.label)}
    </Badge>
  );
}

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  return <Render spec={ROOM[status]} />;
}
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Render spec={BOOKING[status]} />;
}
export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return <Render spec={DEVICE[status]} />;
}
export function AnnouncementStateBadge({ state }: { state: AnnouncementState }) {
  return <Render spec={ANNOUNCEMENT[state]} />;
}
export function ActiveBadge({ active }: { active: boolean }) {
  return <Render spec={active ? ANNOUNCEMENT.active : ANNOUNCEMENT.inactive} />;
}
