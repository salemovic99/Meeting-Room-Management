import { z } from "zod";
import { MEETING_TYPES } from "@/lib/types";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const bookingFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    room_id: z.string().min(1, "Select a room"),
    organizer_id: z.string().optional(),
    department_id: z.string().optional(),
    date,
    start_time: time,
    end_time: time,
    attendee_count: z.coerce.number({ invalid_type_error: "Enter a number" }).int().min(1, "At least 1 attendee"),
    meeting_type: z.enum(MEETING_TYPES),
    description: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
    override_capacity: z.boolean().default(false),
    recurring: z.boolean().default(false),
    frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
    interval: z.coerce.number().int().min(1).max(12).default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).default([]),
    end_date: z.string().optional(),
    skip_conflicts: z.boolean().default(false),
  })
  .refine((v) => v.start_time < v.end_time, { message: "End time must be after start time", path: ["end_time"] })
  .refine((v) => !v.recurring || (!!v.end_date && v.end_date > v.date), {
    message: "Series end date must be after the first meeting",
    path: ["end_date"],
  })
  .refine((v) => !v.recurring || v.frequency !== "weekly" || v.weekdays.length > 0, {
    message: "Pick at least one weekday",
    path: ["weekdays"],
  });

export type BookingFormValues = z.infer<typeof bookingFormSchema>;

export const seriesFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    room_id: z.string().min(1),
    start_time: time,
    end_time: time,
    attendee_count: z.coerce.number().int().min(1),
    meeting_type: z.enum(MEETING_TYPES),
    description: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => v.start_time < v.end_time, { message: "End time must be after start time", path: ["end_time"] });

export type SeriesFormValues = z.infer<typeof seriesFormSchema>;
