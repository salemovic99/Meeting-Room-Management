import { useEffect, useState } from "react";

/** Current epoch ms, re-rendering every `intervalMs`. `offsetMs` corrects for client clock skew. */
export function useNow(intervalMs = 1000, offsetMs = 0): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    const t = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, offsetMs]);
  return now;
}
