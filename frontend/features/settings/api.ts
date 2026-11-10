"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SystemSettings } from "@/lib/types";

export function useSystemSettings(enabled = true) {
  return useQuery({ queryKey: ["settings"], queryFn: () => api<SystemSettings>("/settings"), enabled });
}

export function useSaveSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SystemSettings) => api<SystemSettings>("/settings", { method: "PATCH", body: data }),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}
