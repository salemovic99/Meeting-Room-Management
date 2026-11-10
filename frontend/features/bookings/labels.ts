import type { MeetingType } from "@/lib/types";

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  internal: "Internal Meeting",
  external: "External Meeting",
  management: "Management Meeting",
  interview: "Interview",
  training: "Training",
  project: "Project Meeting",
  other: "Other",
};

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
