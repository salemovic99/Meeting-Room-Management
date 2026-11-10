"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Announcement, AnnouncementInput } from "@/lib/types";

export function useAnnouncements(state?: string) {
  return useQuery({
    queryKey: ["announcements", state ?? "all"],
    queryFn: () => api<Announcement[]>("/announcements", { query: { state } }),
  });
}

export function useSaveAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<AnnouncementInput> }) =>
      id
        ? api<Announcement>(`/announcements/${id}`, { method: "PATCH", body: data })
        : api<Announcement>("/announcements", { method: "POST", body: data }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}
