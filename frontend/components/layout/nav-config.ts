import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  LayoutDashboard,
  Megaphone,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PermissionCode } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Visible if the user has ANY of these permissions. */
  perm: PermissionCode[];
}

// Order is fixed by the PRD (§8.2).
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, perm: ["rooms.read"] },
  { label: "Calendar", href: "/calendar", icon: CalendarDays, perm: ["rooms.read"] },
  { label: "Reservations", href: "/reservations", icon: ClipboardList, perm: ["bookings.create", "bookings.read_all"] },
  { label: "Meeting Rooms", href: "/rooms", icon: DoorOpen, perm: ["rooms.read"] },
  { label: "Employees", href: "/employees", icon: Users, perm: ["users.read"] },
  { label: "Departments", href: "/departments", icon: Building2, perm: ["departments.manage"] },
  { label: "TV Displays", href: "/displays", icon: MonitorSmartphone, perm: ["displays.manage"] },
  { label: "Announcements", href: "/announcements", icon: Megaphone, perm: ["announcements.manage"] },
  { label: "Analytics", href: "/analytics", icon: BarChart3, perm: ["analytics.view", "analytics.view_department"] },
  { label: "Audit Logs", href: "/audit-logs", icon: ScrollText, perm: ["audit.view"] },
  { label: "Settings", href: "/settings", icon: Settings, perm: ["settings.manage", "roles.manage"] },
];
