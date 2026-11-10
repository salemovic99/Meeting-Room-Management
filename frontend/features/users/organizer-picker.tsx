"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import type { UserLookup } from "@/lib/types";
import { useUserLookup } from "./api";

/** Searchable employee selector backed by GET /users/lookup. */
export function OrganizerPicker({
  id,
  value,
  selectedName,
  onSelect,
}: {
  id?: string;
  value?: string;
  selectedName?: string;
  onSelect: (u: UserLookup) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 250);
  const { data, isFetching } = useUserLookup(debounced, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !selectedName && "text-muted-foreground")}>{selectedName || "Select employee…"}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-2">
        <div className="relative mb-2">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className="h-9 ps-8"
            aria-label="Search employees"
          />
        </div>
        <ul role="listbox" className="max-h-64 overflow-y-auto">
          {isFetching && !data ? (
            <li className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </li>
          ) : null}
          {data?.length === 0 ? <li className="p-2 text-sm text-muted-foreground">No employees found</li> : null}
          {data?.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                role="option"
                aria-selected={u.id === value}
                onClick={() => {
                  onSelect(u);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent"
              >
                <Check className={cn("h-4 w-4", u.id === value ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{u.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
