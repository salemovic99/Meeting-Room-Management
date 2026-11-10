import { z } from "zod";

export const announcementFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(150),
    message: z.string().trim().min(1, "Message is required").max(1000),
    priority: z.enum(["low", "normal", "high", "critical"]),
    start_date: z.string().min(1, "Required"),
    start_time: z.string().min(1, "Required"),
    end_date: z.string().min(1, "Required"),
    end_time: z.string().min(1, "Required"),
    is_active: z.boolean(),
    all_rooms: z.boolean(),
    room_ids: z.array(z.string()),
  })
  .refine((v) => `${v.start_date}T${v.start_time}` < `${v.end_date}T${v.end_time}`, {
    message: "End must be after start",
    path: ["end_time"],
  })
  .refine((v) => v.all_rooms || v.room_ids.length > 0, { message: "Select at least one room", path: ["room_ids"] });

export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;
