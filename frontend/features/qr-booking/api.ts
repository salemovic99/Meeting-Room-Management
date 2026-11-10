"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { QuickBookInfo } from "@/lib/types";

/** Room status + bookable slots for the QR walk-up page. Polls so the page stays honest while
 *  someone stands in front of the room deciding. */
export function useQuickBook(slug: string) {
  return useQuery({
    queryKey: ["quick-book", slug],
    queryFn: () => api<QuickBookInfo>(`/rooms/by-slug/${encodeURIComponent(slug)}/quick-book`),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
