"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Page, Permission, Role, UserLookup, UserOut } from "@/lib/types";

export interface UserFilters {
  q?: string;
  department_id?: string;
  is_active?: boolean | "";
  role?: string;
  page: number;
  page_size: number;
}

export interface UserInput {
  full_name: string;
  email: string;
  password?: string;
  department_id?: string | null;
  roles?: string[];
  is_active?: boolean;
}

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: () =>
      api<Page<UserOut>>("/users", {
        query: { ...filters, is_active: filters.is_active === "" ? undefined : filters.is_active },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useUserLookup(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["user-lookup", q],
    queryFn: () => api<UserLookup[]>("/users/lookup", { query: { q, limit: 20 } }),
    enabled,
    staleTime: 60_000,
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<UserInput> }) =>
      id ? api<UserOut>(`/users/${id}`, { method: "PATCH", body: data }) : api<UserOut>("/users", { method: "POST", body: data }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ user: UserOut; future_bookings_count: number }>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useRoles(enabled = true) {
  return useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles"), enabled });
}

export function usePermissions(enabled = true) {
  return useQuery({ queryKey: ["permissions"], queryFn: () => api<Permission[]>("/permissions"), enabled });
}

export function useSaveRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: string; permissions: string[] }) =>
      api<Role>(`/roles/${roleId}/permissions`, { method: "PUT", body: { permissions } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}
