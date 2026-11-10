"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Availability, Booking, DisplaySettings, OperatingHours, Room } from "@/lib/types";

export interface RoomInput {
  name: string;
  code: string;
  display_slug: string;
  location?: string | null;
  floor?: string | null;
  capacity: number;
  description?: string | null;
  equipment?: string[];
  operating_hours?: OperatingHours | null;
  is_active?: boolean;
  maintenance_mode?: boolean;
  maintenance_message?: string | null;
}

export function useRooms(includeInactive = false) {
  return useQuery({
    queryKey: ["rooms", { includeInactive }],
    queryFn: () => api<Room[]>("/rooms", { query: { include_inactive: includeInactive } }),
  });
}

export function useAvailability() {
  return useQuery({
    queryKey: ["availability"],
    queryFn: () => api<Availability[]>("/rooms/availability"),
    refetchInterval: 60_000,
  });
}

export function useRoomBookings(roomId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["room-bookings", roomId, from, to],
    queryFn: () => api<Booking[]>(`/rooms/${roomId}/bookings`, { query: { from, to } }),
    enabled: !!roomId,
  });
}

export function useSaveRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<RoomInput> }) =>
      id
        ? api<Room & { affected_future_bookings: number }>(`/rooms/${id}`, { method: "PATCH", body: data })
        : api<Room>("/rooms", { method: "POST", body: data }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rooms"] });
      void qc.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useDisplaySettings(roomId: string | null) {
  return useQuery({
    queryKey: ["display-settings", roomId],
    queryFn: () => api<DisplaySettings>(`/rooms/${roomId}/display-settings`),
    enabled: !!roomId,
  });
}

export function useSaveDisplaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: Partial<DisplaySettings> }) =>
      api<DisplaySettings>(`/rooms/${roomId}/display-settings`, { method: "PUT", body: data }),
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ["display-settings", v.roomId] }),
  });
}
