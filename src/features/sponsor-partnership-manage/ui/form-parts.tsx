"use client";

import { CircleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ComponentProps } from "react";

import { describedBy } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { Textarea } from "@/shared/ui/textarea";

import type { Outcome } from "../model/outcome";

/**
 * A text answer with its label, a character counter (the API's limit) and the
 * backend's error under it. `multiline` renders a textarea.
 */
export function CountedText({
  id,
  label,
  value,
  limit,
  error,
  required = false,
  multiline = false,
  help,
  ...control
}: {
  id: string;
  label: string;
  value: string;
  limit: number;
  error?: string;
  required?: boolean;
  multiline?: boolean;
  help?: string;
} & Omit<ComponentProps<"input"> & ComponentProps<"textarea">, "id" | "value">) {
  const t = useTranslations("sponsorPartnerships.fields");
  const format = useFormatter();
  const notes = [`${id}-count`, ...(error === undefined ? [] : [describedBy(id)])];
  if (help !== undefined) notes.unshift(`${id}-help`);
  const shared = {
    id,
    "aria-required": required || undefined,
    "aria-invalid": error !== undefined,
    "aria-describedby": notes.join(" "),
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {label}
        {required ? (
          <span aria-hidden className="text-warning">
            {" *"}
          </span>
        ) : null}
      </label>
      {help !== undefined && (
        <p id={`${id}-help`} className="type-caption text-muted-foreground">
          {help}
        </p>
      )}
      {multiline ? (
        <Textarea
          rows={6}
          className="min-h-36 type-body"
          {...shared}
          {...(control as ComponentProps<"textarea">)}
        />
      ) : (
        <Input fieldSize="lg" {...shared} {...(control as ComponentProps<"input">)} />
      )}
      <span id={`${id}-count`} className="self-end type-caption text-muted-foreground">
        {t("count", { count: format.number(value.length), max: format.number(limit) })}
      </span>
      {error !== undefined ? (
        <p id={describedBy(id)} className="type-caption text-destructive-subtle-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a refused or unconfirmed write means, in words. Nothing is claimed as
 * saved unless the API answered; `unconfirmed` says a retry is safe.
 */
export function OutcomeNotice({ outcome }: { outcome: Outcome }) {
  const t = useTranslations("sponsorPartnerships.errors");
  const format = useFormatter();
  let text: string;
  switch (outcome.kind) {
    case "rateLimited":
      text =
        outcome.retryAfter === null
          ? t("rateLimited")
          : t("rateLimitedFor", { seconds: format.number(outcome.retryAfter) });
      break;
    default:
      text = t(outcome.kind);
  }
  return (
    <Notice tone="coral" icon={CircleAlertIcon} role="alert">
      {text}
    </Notice>
  );
}
