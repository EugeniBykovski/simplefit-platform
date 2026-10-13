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
  className,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const note = error ?? help;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {label}
      </label>
      {children}
      {note !== undefined && (
        <p
          id={describedBy(id)}
          className={cn(
            "type-caption",
            error === undefined ? "text-faint-foreground" : "text-destructive-subtle-foreground",
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

export const describedBy = (id: string) => `${id}-note`;

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
  className,
  children,
}: {
  id: string;
  legend: string;
  hint?: string;
  hintInvalid?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const invalid = error !== undefined || hintInvalid;
  return (
    <fieldset
      aria-describedby={error === undefined ? undefined : describedBy(id)}
      aria-invalid={invalid ? true : undefined}
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <legend className="mb-2 type-caption font-bold text-muted-foreground">
        {legend}
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
