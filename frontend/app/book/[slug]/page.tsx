"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { QuickBookScreen } from "@/features/qr-booking/quick-book-screen";

/**
 * QR walk-up booking page, opened by scanning the code on a room's TV (/book/{display_slug}).
 * Standalone mobile layout (no dashboard sidebar). The URL carries no secret: users sign in with
 * their normal account and are sent back here after login.
 */
export default function BookRoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <QuickBookScreen slug={slug} />
    </main>
  );
}
