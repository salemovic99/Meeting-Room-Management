"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CancellationReport,
  DepartmentReport,
  Overview,
  PeakHoursReport,
  UtilizationReport,
} from "@/lib/types";

export interface PeriodParams {
  from: string;
  to: string;
}

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: () => api<Overview>("/analytics/overview"),
    refetchInterval: 60_000,
  });
}

export function useUtilization(p: PeriodParams, enabled = true) {
  return useQuery({
    queryKey: ["analytics", "utilization", p],
    queryFn: () => api<UtilizationReport>("/analytics/utilization", { query: { ...p } }),
    enabled,
  });
}

export function useDepartmentUsage(p: PeriodParams, enabled = true) {
  return useQuery({
    queryKey: ["analytics", "departments", p],
    queryFn: () => api<DepartmentReport>("/analytics/departments", { query: { ...p } }),
    enabled,
  });
}

export function useCancellations(p: PeriodParams, enabled = true) {
  return useQuery({
    queryKey: ["analytics", "cancellations", p],
    queryFn: () => api<CancellationReport>("/analytics/cancellations", { query: { ...p } }),
    enabled,
  });
}

export function usePeakHours(p: PeriodParams, enabled = true) {
  return useQuery({
    queryKey: ["analytics", "peak-hours", p],
    queryFn: () => api<PeakHoursReport>("/analytics/peak-hours", { query: { ...p } }),
    enabled,
  });
}
