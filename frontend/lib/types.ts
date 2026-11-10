// API model types mirroring docs/API.md. Keep in sync with the backend contract.

export type UUID = string;
export type ISODateTime = string; // ISO-8601 with offset
export type ISODate = string; // YYYY-MM-DD

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> | null };
}

// ---------- Auth / users ----------
export type PermissionCode =
  | "users.read"
  | "users.lookup"
  | "users.manage"
  | "roles.manage"
  | "departments.read"
  | "departments.manage"
  | "rooms.read"
  | "rooms.manage"
  | "bookings.create"
  | "bookings.read_all"
  | "bookings.manage_all"
  | "bookings.manage_department"
  | "bookings.manage_own"
  | "bookings.override_capacity"
  | "displays.manage"
  | "announcements.manage"
  | "analytics.view"
  | "analytics.view_department"
  | "audit.view"
  | "settings.manage";

export type RoleName = "super_admin" | "it_admin" | "receptionist" | "department_manager" | "employee";

export interface DepartmentRef {
  id: UUID;
  name: string;
  code: string;
}

export interface UserOut {
  id: UUID;
  full_name: string;
  email: string;
  department_id: UUID | null;
  department: DepartmentRef | null;
  is_active: boolean;
  roles: string[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Me extends UserOut {
  permissions: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: Me;
}

export interface UserLookup {
  id: UUID;
  full_name: string;
  email: string;
  department_id: UUID | null;
}

export interface Role {
  id: UUID;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface Permission {
  id: UUID;
  code: string;
  description: string | null;
}

// ---------- Departments ----------
export interface Department {
  id: UUID;
  name: string;
  code: string;
  description: string | null;
  manager_id: UUID | null;
  manager: { id: UUID; full_name: string } | null;
  is_active: boolean;
  member_count: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ---------- Rooms ----------
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayHours = { open: string; close: string } | null;
export type OperatingHours = Record<Weekday, DayHours>;

export interface Room {
  id: UUID;
  name: string;
  code: string;
  display_slug: string;
  location: string | null;
  floor: string | null;
  capacity: number;
  description: string | null;
  equipment: string[];
  operating_hours: OperatingHours | null;
  is_active: boolean;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  display_url: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type RoomStatus = "available" | "upcoming" | "occupied" | "maintenance" | "unavailable";

export interface BookingBrief {
  id: UUID;
  title: string;
  organizer_name: string | null;
  department_name: string | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
}

export interface Availability {
  room_id: UUID;
  room_name: string;
  room_code: string;
  capacity: number;
  location: string | null;
  status: RoomStatus;
  current_booking: BookingBrief | null;
  next_booking: BookingBrief | null;
  next_available_at: ISODateTime | null;
  free_until: ISODateTime | null;
  server_time: ISODateTime;
}

// ---------- Bookings ----------
export const MEETING_TYPES = [
  "internal",
  "external",
  "management",
  "interview",
  "training",
  "project",
  "other",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export type BookingStatus = "confirmed" | "in_progress" | "completed" | "cancelled";

export interface Booking {
  id: UUID;
  room_id: UUID;
  room: { id: UUID; name: string; code: string };
  organizer_id: UUID;
  organizer: { id: UUID; full_name: string; email: string | null };
  department_id: UUID;
  department: DepartmentRef;
  series_id: UUID | null;
  is_series_exception: boolean;
  title: string;
  description: string | null;
  meeting_type: MeetingType;
  start_at: ISODateTime;
  end_at: ISODateTime;
  attendee_count: number;
  status: BookingStatus;
  effective_status: BookingStatus;
  /** "dashboard" or "qr" (walk-up booking via the TV's QR code). */
  source: BookingSource;
  notes: string | null;
  created_by_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  cancelled_at: ISODateTime | null;
  cancellation_reason: string | null;
  can_manage: boolean;
  redacted: boolean;
}

export interface BookingCreate {
  room_id: UUID;
  title: string;
  meeting_type: MeetingType;
  start_at: ISODateTime;
  end_at: ISODateTime;
  attendee_count: number;
  organizer_id?: UUID;
  department_id?: UUID;
  description?: string | null;
  notes?: string | null;
  override_capacity?: boolean;
  source?: BookingSource;
}

export type BookingUpdate = Partial<Omit<BookingCreate, "source">>;

export type BookingSource = "dashboard" | "qr";

export interface TimeSlot {
  start_at: ISODateTime;
  end_at: ISODateTime;
}

export interface QuickBookOption extends TimeSlot {
  minutes: number;
}

export type QuickBookBlockReason = "no_permission" | "inactive" | "maintenance" | "closed";

/** GET /rooms/by-slug/{slug}/quick-book — data for the QR walk-up page. */
export interface QuickBookInfo {
  server_time: ISODateTime;
  room: Room;
  availability: Availability;
  can_book: boolean;
  reason: QuickBookBlockReason | null;
  min_duration_minutes: number;
  max_duration_minutes: number;
  now_options: QuickBookOption[];
  free_slots: TimeSlot[];
  todays_bookings: Booking[];
}

export interface ConflictItem {
  id: UUID;
  title: string;
  start_at: ISODateTime;
  end_at: ISODateTime;
}

export interface ConflictCheck {
  has_conflict: boolean;
  conflicts: ConflictItem[];
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays?: number[]; // 0=Mon..6=Sun
  end_date: ISODate;
}

export interface RecurringCreate extends BookingCreate {
  recurrence: Recurrence;
  skip_conflicts: boolean;
}

export interface Series {
  id: UUID;
  organizer_id: UUID;
  recurrence_rule: string;
  series_start_date: ISODate;
  series_end_date: ISODate;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface RecurringResult {
  series: Series;
  created: Booking[];
  skipped: { start_at: ISODateTime; end_at: ISODateTime; reason: string }[];
}

export interface SeriesDetail {
  series: Series;
  occurrences: Booking[];
}

export interface SeriesUpdate {
  title?: string;
  description?: string | null;
  meeting_type?: MeetingType;
  attendee_count?: number;
  notes?: string | null;
  room_id?: UUID;
  start_time?: string;
  end_time?: string;
}

// ---------- Displays ----------
export type DeviceStatus = "online" | "offline" | "unknown" | "disabled";

export interface Device {
  id: UUID;
  device_name: string;
  room_id: UUID;
  room: { id: UUID; name: string; code: string; display_slug: string };
  status: DeviceStatus;
  is_active: boolean;
  last_heartbeat_at: ISODateTime | null;
  last_connected_at: ISODateTime | null;
  browser_info: string | null;
  firmware_info: string | null;
  display_url: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface DeviceTokenResponse {
  device: Device;
  device_token: string;
  pairing_url: string;
}

export type DisplayMode = "full_schedule" | "current_meeting" | "availability" | "announcement" | "maintenance";
export type IdleBehavior = "show_availability" | "show_announcement" | "dim";

export interface DisplaySettings {
  room_id: UUID;
  display_mode: DisplayMode;
  theme: "light" | "dark";
  primary_color: string;
  secondary_color: string;
  background_color: string;
  logo_url: string | null;
  show_clock: boolean;
  show_date: boolean;
  show_organizer: boolean;
  show_department: boolean;
  show_announcements: boolean;
  show_qr_code: boolean;
  qr_code_url: string | null;
  upcoming_meetings_limit: number;
  refresh_interval_seconds: number;
  idle_behavior: IdleBehavior;
  language: "en" | "ar";
  announcement_text: string | null;
  updated_at: ISODateTime;
}

export interface DisplayBooking {
  id: UUID;
  title: string;
  organizer_name: string | null;
  department_name: string | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
  status: BookingStatus;
}

export interface DisplayAnnouncement {
  id: UUID;
  title: string;
  message: string;
  priority: AnnouncementPriority;
}

export interface DisplaySchedule {
  server_time: ISODateTime;
  timezone: string;
  /** Minutes before a meeting when the room shows "upcoming". */
  upcoming_threshold_minutes: number;
  room: {
    name: string;
    code: string;
    location: string | null;
    capacity: number;
    maintenance_mode: boolean;
    maintenance_message: string | null;
  };
  status: {
    state: RoomStatus;
    current: DisplayBooking | null;
    next: DisplayBooking | null;
    next_available_at: ISODateTime | null;
    free_until: ISODateTime | null;
  };
  upcoming: DisplayBooking[];
  announcements: DisplayAnnouncement[];
  settings: DisplaySettings;
  company: { name: string; logo_url: string | null };
  /** URL encoded in the TV's QR code: custom settings.qr_code_url, else /book/{slug}. */
  qr_target_url: string;
}

export interface DisplayBootstrap {
  room_name: string;
  display_slug: string;
  company_name: string;
}

export interface DisplaySession {
  access_token: string;
  expires_in: number;
  room_slug: string;
  device_id: UUID;
}

// ---------- Announcements ----------
export type AnnouncementPriority = "low" | "normal" | "high" | "critical";
export type AnnouncementState = "scheduled" | "active" | "expired" | "inactive";

export interface Announcement {
  id: UUID;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  start_at: ISODateTime;
  end_at: ISODateTime;
  is_active: boolean;
  room_ids: UUID[];
  state: AnnouncementState;
  created_by: { id: UUID; full_name: string } | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AnnouncementInput {
  title: string;
  message: string;
  priority: AnnouncementPriority;
  start_at: ISODateTime;
  end_at: ISODateTime;
  is_active: boolean;
  room_ids: UUID[];
}

// ---------- Analytics ----------
export interface Period {
  from: ISODate;
  to: ISODate;
}

export interface AuditLog {
  id: UUID;
  actor_user_id: UUID | null;
  actor_user: { id: UUID; full_name: string } | null;
  actor_device_id: UUID | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: ISODateTime;
}

export interface Overview {
  total_rooms: number;
  available_rooms: number;
  occupied_rooms: number;
  upcoming_meetings: number;
  todays_bookings: number;
  cancelled_today: number;
  booked_hours_today: number;
  utilization_today_pct: number;
  rooms: Availability[];
  todays_schedule: Booking[];
  recent_activity: AuditLog[];
}

export interface UtilizationReport {
  period: Period;
  rooms: {
    room_id: UUID;
    room_name: string;
    booking_count: number;
    booked_hours: number;
    available_hours: number;
    utilization_pct: number;
  }[];
  most_used_room_id: UUID | null;
}

export interface DepartmentReport {
  period: Period;
  departments: {
    department_id: UUID;
    name: string;
    booking_count: number;
    booked_hours: number;
    share_pct: number;
  }[];
}

export interface CancellationReport {
  period: Period;
  total_bookings: number;
  cancelled: number;
  cancellation_rate_pct: number;
  by_room: { room_id: UUID; room_name: string; cancelled: number }[];
  by_department: { department_id: UUID; name: string; cancelled: number }[];
}

export interface PeakHoursReport {
  period: Period;
  hours: { hour: number; booking_count: number; booked_hours: number }[];
  weekdays: { weekday: number; booking_count: number }[];
}

export type ReportName =
  | "bookings"
  | "room-utilization"
  | "department-utilization"
  | "organizer-activity"
  | "cancellations";

// ---------- Settings ----------
export type SystemSettings = Record<string, unknown>;

// ---------- Realtime ----------
export type RealtimeEventType =
  | "booking.created"
  | "booking.updated"
  | "booking.cancelled"
  | "booking.started"
  | "booking.ended"
  | "room.status_changed"
  | "display.settings_updated"
  | "display.announcement_updated"
  | "display.refresh"
  | "display.device_status";

export interface RealtimeMessage {
  type: RealtimeEventType | "auth.ok" | "pong";
  room_id?: UUID | null;
  data?: Record<string, unknown>;
  ts?: ISODateTime;
  server_time?: ISODateTime;
}
