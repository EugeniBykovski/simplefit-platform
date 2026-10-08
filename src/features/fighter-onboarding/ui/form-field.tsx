import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * A labelled WF field (WF0 / WF1): the 12 px bold label, the control, then
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
 * A group of choices (Experience, Stance, Goals): a fieldset whose legend is
 * the 12 px label; the error, when set, follows the options.
 */
export function ChoiceField({
  id,
  legend,
  error,
  className,
  children,
}: {
  id: string;
  legend: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      aria-describedby={error === undefined ? undefined : describedBy(id)}
      aria-invalid={error === undefined ? undefined : true}
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <legend className="mb-2 type-caption font-bold text-muted-foreground">{legend}</legend>
      {children}
      {error !== undefined && (
        <p id={describedBy(id)} className="type-caption text-destructive-subtle-foreground">
          {error}
        </p>
      )}
    </fieldset>
  );
}
