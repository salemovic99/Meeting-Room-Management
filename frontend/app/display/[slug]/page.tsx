import type { Metadata } from "next";
import { DisplayClient } from "@/features/display/display-client";

export const metadata: Metadata = {
  title: "Room Display",
  robots: { index: false, follow: false },
};

// Next.js 15: route params are async in server components.
export default async function DisplayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DisplayClient slug={slug} />;
}
