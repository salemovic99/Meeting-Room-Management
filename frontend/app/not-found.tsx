import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Link href="/overview" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Back to overview
      </Link>
    </div>
  );
}
