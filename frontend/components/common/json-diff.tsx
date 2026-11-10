/** Side-by-side old → new values for audit records. */
export function JsonDiff({
  oldValues,
  newValues,
}: {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}) {
  const keys = Array.from(new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})])).sort();
  if (keys.length === 0) return <p className="text-sm text-muted-foreground">No field changes recorded.</p>;
  const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <div className="overflow-hidden rounded-md border text-xs">
      <div className="grid grid-cols-[minmax(120px,1fr)_2fr_2fr] bg-muted font-medium">
        <span className="p-2">Field</span>
        <span className="p-2">Old</span>
        <span className="p-2">New</span>
      </div>
      {keys.map((k) => {
        const o = oldValues?.[k];
        const n = newValues?.[k];
        const changed = JSON.stringify(o) !== JSON.stringify(n);
        return (
          <div key={k} className="grid grid-cols-[minmax(120px,1fr)_2fr_2fr] border-t">
            <span className="p-2 font-mono">{k}</span>
            <span className={changed ? "break-all bg-destructive/10 p-2 font-mono" : "break-all p-2 font-mono"}>{show(o)}</span>
            <span className={changed ? "break-all bg-success/10 p-2 font-mono" : "break-all p-2 font-mono"}>{show(n)}</span>
          </div>
        );
      })}
    </div>
  );
}
