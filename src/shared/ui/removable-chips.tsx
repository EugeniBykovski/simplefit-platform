"use client";

import { XIcon } from "lucide-react";

/**
 * Chosen items as olive chips, each with its own remove button (SPA1 markets,
 * SF-131 partnership markets). The list is empty, not rendered, without items.
 */
export function RemovableChips({
  items,
  removeLabel,
  onRemove,
  disabled,
}: {
  items: { value: string; label: string }[];
  removeLabel: (label: string) => string;
  onRemove: (value: string) => void;
  disabled: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item.value}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] border-primary-muted bg-accent ps-3.5 pe-1 type-body-sm font-bold text-accent-foreground"
        >
          {item.label}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(item.value)}
            aria-label={removeLabel(item.label)}
            className="flex size-9 items-center justify-center rounded-full outline-none hover:bg-background/30 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <XIcon aria-hidden className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
