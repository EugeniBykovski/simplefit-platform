"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";

/**
 * SPA1's choice chips (industry, interests, market scope, budget; reused by
 * the SF-131 partnership forms): 44 px
 * pills around native radio or checkbox inputs, so the group is a real
 * radio group or checkbox list for the keyboard and screen readers. A
 * chosen pill is olive with a check (state never shown by colour alone).
 */
export function ChoicePills({
  name,
  type,
  options,
  value,
  onChange,
  disabled = false,
  describedBy,
}: {
  name: string;
  type: "radio" | "checkbox";
  options: readonly { value: string; label: string }[];
  value: string | readonly string[];
  onChange: (next: string | string[]) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const chosen = (option: string) =>
    typeof value === "string" ? value === option : value.includes(option);

  const toggle = (option: string) => {
    if (type === "radio") return onChange(option);
    const list = typeof value === "string" ? [] : [...value];
    onChange(chosen(option) ? list.filter((item) => item !== option) : [...list, option]);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = chosen(option.value);
        return (
          <label
            key={option.value}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 type-body-sm font-bold transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
              on
                ? "border-[1.5px] border-primary-muted bg-accent text-accent-foreground"
                : "border-input text-muted-foreground hover:border-border-strong",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type={type}
              name={name}
              value={option.value}
              checked={on}
              disabled={disabled}
              aria-describedby={describedBy}
              onChange={() => toggle(option.value)}
              className="sr-only"
            />
            {on ? <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} /> : null}
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
