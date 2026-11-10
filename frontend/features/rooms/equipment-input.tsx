"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = ["TV", "HDMI", "Conference phone", "Webcam", "Whiteboard", "Projector", "Speakers"];

export function EquipmentInput({ id, value, onChange }: { id?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (item: string) => {
    const v = item.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((e) => (
          <Badge key={e} variant="secondary" className="gap-1 pe-1">
            {e}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} aria-label={`Remove ${e}`}>
              <X />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        id={id}
        value={draft}
        placeholder="Type and press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
      />
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS.filter((s) => !value.includes(s)).map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
