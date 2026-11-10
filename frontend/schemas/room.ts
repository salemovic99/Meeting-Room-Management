import { z } from "zod";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM");

export const dayHoursSchema = z
  .object({ open: hhmm, close: hhmm })
  .nullable()
  .refine((v) => !v || v.open < v.close, { message: "Close must be after open" });

export const roomFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(30)
    .regex(/^[A-Za-z0-9-_]+$/, "Letters, numbers, - and _ only"),
  display_slug: z
    .string()
    .trim()
    .min(1, "Display slug is required")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes (e.g. room-01)"),
  location: z.string().max(200).optional(),
  floor: z.string().max(50).optional(),
  capacity: z.coerce.number().int().min(1, "At least 1").max(1000),
  description: z.string().max(2000).optional(),
  equipment: z.array(z.string()).default([]),
  limit_hours: z.boolean().default(false),
  operating_hours: z.record(dayHoursSchema).optional(),
  is_active: z.boolean().default(true),
  maintenance_mode: z.boolean().default(false),
  maintenance_message: z.string().max(500).optional(),
});
export type RoomFormValues = z.infer<typeof roomFormSchema>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use #RRGGBB");

export const displaySettingsSchema = z.object({
  display_mode: z.enum(["full_schedule", "current_meeting", "availability", "announcement", "maintenance"]),
  theme: z.enum(["light", "dark"]),
  primary_color: hex,
  secondary_color: hex,
  background_color: hex,
  logo_url: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
  show_clock: z.boolean(),
  show_date: z.boolean(),
  show_organizer: z.boolean(),
  show_department: z.boolean(),
  show_announcements: z.boolean(),
  show_qr_code: z.boolean(),
  qr_code_url: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
  upcoming_meetings_limit: z.coerce.number().int().min(0).max(20),
  refresh_interval_seconds: z.coerce.number().int().min(15).max(3600),
  idle_behavior: z.enum(["show_availability", "show_announcement", "dim"]),
  language: z.enum(["en", "ar"]),
  announcement_text: z.string().max(500).optional(),
});
export type DisplaySettingsValues = z.infer<typeof displaySettingsSchema>;
