import { Info } from "lucide-react";
import { useId } from "react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

import { SiteCard } from "./sections";

/**
 * The request forms of PR4 (Talk to Sales) and PR5 (Request White Label).
 * There is no lead endpoint yet (SF-43 decision): the drawn fields are shown
 * with their labels and the artboards' examples as placeholders, but the
 * form is disabled and says so, so nothing can be typed, sent or stored, and
 * no success is ever shown.
 */
export function LeadForm({
  title,
  fields,
  submit,
  unavailable,
}: {
  title: string;
  fields: readonly {
    key: string;
    label: string;
    placeholder: string;
    half?: boolean;
    type?: "text" | "email";
  }[];
  submit: string;
  unavailable: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <SiteCard className="gap-3 p-5.5">
      <form
        aria-labelledby={`${id}-title`}
        aria-describedby={noteId}
        className="flex flex-col gap-3"
      >
        <h2 id={`${id}-title`} className="type-title font-display">
          {title}
        </h2>
        <fieldset disabled className="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <div
              key={field.key}
              className={cn("flex min-w-0 flex-col gap-1.5", !field.half && "col-span-2")}
            >
              <Label
                htmlFor={`${id}-${field.key}`}
                className="type-caption font-bold text-muted-foreground"
              >
                {field.label}
              </Label>
              <Input
                id={`${id}-${field.key}`}
                name={field.key}
                type={field.type ?? "text"}
                fieldSize="lg"
                placeholder={field.placeholder}
              />
            </div>
          ))}
        </fieldset>
        <Button type="submit" size="xl" disabled>
          {submit}
        </Button>
        <p id={noteId} className="flex items-start gap-2 type-caption text-muted-foreground">
          <Info aria-hidden className="mt-px size-4 flex-none text-faint-foreground" />
          {unavailable}
        </p>
      </form>
    </SiteCard>
  );
}
