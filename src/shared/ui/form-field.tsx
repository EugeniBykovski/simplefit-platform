import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * A labelled onboarding field (WF0 / WF1, WCR1 / WCR2): the 12 px bold label, the control, then
 * the help line, replaced by the error when the field is invalid (the
 * artboards swap the text and colour in place). The control must carry
 * `id`, `aria-invalid` and `aria-describedby={describedBy(id)}`.
 */
export function FormField({
  id,
  label,
  help,
  error,
  helpTone = "faint",
  required = false,
  className,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  /**
   * Draws the amber required mark after the label (SPA1, SF-115). Visual
   * only: the control carries `aria-required` itself.
   */
  required?: boolean;
  /**
   * `muted` for fields on a raised surface (a dialog), where the faint help
   * colour falls below 4.5:1 against the popover background.
   */
  helpTone?: "faint" | "muted";
  className?: string;
  children: ReactNode;
}) {
  const note = error ?? help;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
      {note !== undefined && (
        <p
          id={describedBy(id)}
          className={cn(
            "type-caption",
            error !== undefined
              ? "text-destructive-subtle-foreground"
              : helpTone === "muted"
                ? "text-muted-foreground"
                : "text-faint-foreground",
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

export const describedBy = (id: string) => `${id}-note`;

/** The amber " *" of a required answer; hidden from assistive technology (the control says it). */
function RequiredMark() {
  return (
    <span aria-hidden className="text-warning">
      {" *"}
    </span>
  );
}

/**
 * A group of choices (Experience, Stance, Goals; coaching formats): a
 * fieldset whose legend is the 12 px label. `hint` follows the label on its
 * row (WCR2 "Coaching formats · Pick at least one."), drawn as an error when
 * `hintInvalid`; `error`, when set, follows the options.
 */
export function ChoiceField({
  id,
  legend,
  hint,
  hintInvalid = false,
  error,
  required = false,
  className,
  children,
}: {
  id: string;
  legend: string;
  hint?: string;
  hintInvalid?: boolean;
  error?: string;
  /** Draws the required mark after the legend (see `FormField`). */
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const invalid = error !== undefined || hintInvalid;
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-describedby={error === undefined ? undefined : describedBy(id)}
      aria-invalid={invalid ? true : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <legend className="mb-2 type-caption font-bold text-muted-foreground">
        {legend}
        {required ? <RequiredMark /> : null}
        {hint !== undefined && (
          <span
            className={cn(
              "ml-2 type-caption",
              hintInvalid ? "text-destructive-subtle-foreground" : "text-faint-foreground",
            )}
          >
            {hint}
          </span>
        )}
      </legend>
      {children}
      {error !== undefined && (
        <p id={describedBy(id)} className="type-caption text-destructive-subtle-foreground">
          {error}
        </p>
      )}
    </fieldset>
  );
}
