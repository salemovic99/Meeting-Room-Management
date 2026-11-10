"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuditLog, Page } from "@/lib/types";

export interface AuditFilters {
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_user_id?: string;
  from?: string;
  to?: string;
  page: number;
  page_size: number;
}

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => api<Page<AuditLog>>("/audit-logs", { query: { ...filters } }),
    placeholderData: keepPreviousData,
  });
}
