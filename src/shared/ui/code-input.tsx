"use client";

import { useState, type ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

export const CODE_LENGTH = 6;

/**
 * Visual state of the code (Claude Design component "AuthCodeInput").
 * `typing` shows the caret cell while focused; `filled` is a complete code at
 * rest. `expired`, `submitting`, `success` and `locked` make the field
 * read-only.
 */
export type CodeInputState =
  "typing" | "filled" | "error" | "expired" | "submitting" | "success" | "locked";

const READ_ONLY: ReadonlySet<CodeInputState> = new Set([
  "expired",
  "submitting",
  "success",
  "locked",
]);

const CELL_STATE: Record<CodeInputState, string> = {
  typing: "border-border bg-surface text-foreground",
  filled: "border-border bg-surface text-foreground",
  error: "border-destructive bg-surface text-destructive-subtle-foreground",
  expired: "border-border bg-surface-subtle text-faint-foreground",
  locked: "border-border bg-surface-subtle text-faint-foreground",
  submitting: "border-border bg-surface text-faint-foreground",
  success: "border-highlight bg-accent text-accent-foreground",
};

type CodeInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "size" | "type" | "maxLength"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Called once the sixth digit is entered or pasted. */
  onComplete?: (code: string) => void;
  state?: CodeInputState;
  /** Accessible name of the field, e.g. "6-digit code". */
  label: string;
};

/**
 * The shared 6-digit code field of email verification (O03, WA4) and email
 * sign-in (O01c, WA1b). One real input (`autocomplete="one-time-code"`, so
 * the platform can offer the code from the email) sits over six decorative
 * cells: typing, deleting, pasting and screen readers work as in any text
 * field. Purpose, copy, resend and outcome belong to the screens.
 *
 * Web cells are 64 × 76 px, radius `xl`, `type-code-digit`
 * (typography.authRoles.web), 10 px apart. Below `sm` (the design draws only
 * 1440) they share the column like the 390 artboards: 62 px tall, radius
 * `lg`, 8 px apart.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  state = "typing",
  label,
  className,
  onFocus,
  onBlur,
  ...props
}: CodeInputProps) {
  const [focused, setFocused] = useState(false);
  const readOnly = READ_ONLY.has(state);
  const digits = value.slice(0, CODE_LENGTH);

  function handleChange(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    onChange(next);
    if (next.length === CODE_LENGTH && next !== digits) onComplete?.(next);
  }

  return (
    <div className={cn("relative w-full sm:w-fit", className)}>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        spellCheck={false}
        aria-label={label}
        aria-invalid={state === "error" || undefined}
        readOnly={readOnly}
        value={digits}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        data-slot="code-input"
        className="peer absolute inset-0 z-10 size-full cursor-text text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
      />
      <div
        aria-hidden
        className="flex gap-2 rounded-xl peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40 peer-focus-visible:ring-offset-4 peer-focus-visible:ring-offset-background sm:gap-2.5"
      >
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const caret = state === "typing" && focused && index === digits.length;
          return (
            <span
              key={index}
              data-caret={caret || undefined}
              className={cn(
                "flex h-15.5 min-w-0 flex-1 items-center justify-center rounded-lg border type-code-digit transition-colors sm:h-19 sm:w-16 sm:flex-none sm:rounded-xl",
                CELL_STATE[state],
                caret && "border-[1.5px] border-primary text-border-strong",
                state === "error" && "border-[1.5px]",
                state === "success" && "border-[1.5px]",
              )}
            >
              {caret ? "|" : (digits[index] ?? "")}
            </span>
          );
        })}
      </div>
    </div>
  );
}
