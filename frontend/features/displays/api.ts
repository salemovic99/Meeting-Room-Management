"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Device, DeviceTokenResponse } from "@/lib/types";

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => api<Device[]>("/display/devices"),
    refetchInterval: 30_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["devices"] });
}

export function useRegisterDevice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: { device_name: string; room_id: string }) =>
      api<DeviceTokenResponse>("/display/devices/register", { method: "POST", body: data }),
    onSuccess: invalidate,
  });
}

export function useUpdateDevice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { device_name?: string; room_id?: string; is_active?: boolean } }) =>
      api<Device>(`/display/devices/${id}`, { method: "PATCH", body: data }),
    onSuccess: invalidate,
  });
}

export function useRotateDeviceToken() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<DeviceTokenResponse>(`/display/devices/${id}/rotate-token`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useRefreshDevice() {
  return useMutation({
    mutationFn: (id: string) => api<void>(`/display/devices/${id}/refresh`, { method: "POST" }),
  });
}
