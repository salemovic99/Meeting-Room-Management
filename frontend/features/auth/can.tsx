"use client";

import type { ReactNode } from "react";
import type { PermissionCode } from "@/lib/types";
import { usePermission } from "./auth-provider";

/** Render children only if the user has ANY of the given permissions. UI hint only — the backend enforces. */
export function Can({
  perm,
  children,
  fallback = null,
}: {
  perm: PermissionCode | PermissionCode[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return usePermission(perm) ? <>{children}</> : <>{fallback}</>;
}
