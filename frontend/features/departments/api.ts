"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Department } from "@/lib/types";

export interface DepartmentInput {
  name: string;
  code: string;
  description?: string | null;
  manager_id?: string | null;
  is_active?: boolean;
}

export function useDepartments(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: ["departments", { includeInactive }],
    queryFn: () => api<Department[]>("/departments", { query: { include_inactive: includeInactive } }),
    enabled,
  });
}

export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<DepartmentInput> }) =>
      id
        ? api<Department>(`/departments/${id}`, { method: "PATCH", body: data })
        : api<Department>("/departments", { method: "POST", body: data }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["departments"] }),
  });
}

export function useDeactivateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Department>(`/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["departments"] }),
  });
}
