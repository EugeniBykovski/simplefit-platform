"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type ComboboxOption = { value: string; label: string };

/** Case- and accent-insensitive search text ("Åland" matches "aland"). */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

/**
 * A searchable single choice from a long list (SF-38: the country selector).
 * The trigger looks like the 44 px `lg` field (`controls.field.webLarge`) and
 * is the labelled control (`<label htmlFor={id}>`); opening it moves focus to
 * a search box that filters the options as you type (WAI-ARIA combobox with a
 * listbox popup): ↑ / ↓ / Home / End move, Enter chooses, Escape closes and
 * returns focus. Labels come from the caller, already translated.
 */
function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  searchLabel,
  searchPlaceholder,
  emptyLabel,
  disabled,
  invalid,
  className,
  ...aria
}: {
  id?: string;
  value: string | null;
  onValueChange: (value: string) => void;
  options: readonly ComboboxOption[];
  placeholder: string;
  /** The accessible name of the search box. */
  searchLabel: string;
  searchPlaceholder?: string;
  emptyLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const optionId = (index: number) => `${listId}-${index}`;
  const list = React.useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);
  const visible = React.useMemo(() => {
    const needle = fold(query.trim());
    return needle === ""
      ? options
      : options.filter((option) => fold(option.label).includes(needle));
  }, [options, query]);

  function openWith(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery("");
      setActive(Math.max(0, selected ? options.indexOf(selected) : 0));
    }
  }

  function choose(option: ComboboxOption | undefined) {
    if (option === undefined) return;
    onValueChange(option.value);
    setOpen(false);
  }

  // Keep the active option in view while moving through a long list.
  React.useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector(`[id="${listId}-${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, visible, listId]);

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const last = visible.length - 1;
    const moves: Record<string, () => number> = {
      ArrowDown: () => Math.min(last, active + 1),
      ArrowUp: () => Math.max(0, active - 1),
      Home: () => 0,
      End: () => Math.max(0, last),
      PageDown: () => Math.min(last, active + 8),
      PageUp: () => Math.max(0, active - 8),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setActive(move());
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(visible[active]);
    }
  }

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={aria["aria-describedby"]}
          data-slot="combobox"
          className={cn(
            "flex h-11 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-3.5 text-left type-body font-semibold text-foreground transition-colors outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/25",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-faint-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDownIcon aria-hidden className="size-4 flex-none text-faint-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 gap-2 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector("input")?.focus();
        }}
      >
        <input
          type="text"
          role="combobox"
          aria-label={searchLabel}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={visible.length > 0 ? optionId(active) : undefined}
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onSearchKeyDown}
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 type-body-sm text-foreground outline-none placeholder:text-faint-foreground focus-visible:border-primary max-md:text-[1rem]"
        />
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label={searchLabel}
          className="flex max-h-64 flex-col overflow-y-auto"
        >
          {visible.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                // Focus stays in the search box (aria-activedescendant); never in the tab order.
                tabIndex={-1}
                aria-selected={isSelected}
                data-active={index === active || undefined}
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") choose(option);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 type-body-sm text-foreground data-active:bg-surface-elevated"
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected && (
                  <CheckIcon aria-hidden className="size-4 flex-none text-highlight" />
                )}
              </div>
            );
          })}
        </div>
        {visible.length === 0 && (
          <p role="status" className="px-2.5 py-2 type-body-sm text-muted-foreground">
            {emptyLabel}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
