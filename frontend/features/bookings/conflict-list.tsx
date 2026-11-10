"use client";

import { AlertTriangle } from "lucide-react";
import { formatDate, formatRange } from "@/lib/time";
import { useT } from "@/lib/i18n";

export interface ConflictLike {
  id?: string;
  conflicting_booking_id?: string;
  title?: string;
  start_at: string;
  end_at: string;
}

/** Clear conflict presentation. Titles arrive pre-redacted ("Reserved") from the backend when not visible. */
export function ConflictList({ conflicts, heading }: { conflicts: ConflictLike[]; heading?: string }) {
  const t = useT();
  if (conflicts.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="mb-2 flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {heading ?? t("This time conflicts with existing reservations")}
      </p>
      <ul className="space-y-1">
        {conflicts.slice(0, 10).map((c, i) => (
          <li key={(c.id ?? c.conflicting_booking_id ?? "") + i} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{formatDate(c.start_at)}</span>
            <span className="tabular-nums">{formatRange(c.start_at, c.end_at)}</span>
            {c.title ? <span className="text-muted-foreground">· {c.title}</span> : null}
          </li>
        ))}
        {conflicts.length > 10 ? <li className="text-muted-foreground">+{conflicts.length - 10} more</li> : null}
      </ul>
    </div>
  );
}

export function conflictsFromError(details: Record<string, unknown> | null | undefined): ConflictLike[] {
  const list = details?.conflicts;
  return Array.isArray(list) ? (list as ConflictLike[]) : [];
}
