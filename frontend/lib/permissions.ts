import type { Me, PermissionCode } from "./types";

export function hasPermission(user: Me | null | undefined, perm: PermissionCode | PermissionCode[]): boolean {
  if (!user) return false;
  const list = Array.isArray(perm) ? perm : [perm];
  return list.some((p) => user.permissions.includes(p));
}

/** UI hint only — the backend is authoritative and returns `can_manage` per booking. */
export function canCreateBookingFor(user: Me | null | undefined): boolean {
  return hasPermission(user, ["users.lookup", "users.read"]);
}
