"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { firstDayOfWeek, printable } from "@/entities/gym-timetable";
import { formatOffset, type WallTimeResolution } from "@/shared/lib/time-zone";
import { cn } from "@/shared/lib/utils";
import { ChoiceField, describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

/** The value of "none" in a select (Radix needs a non-empty value). */
export const NONE = "none";

export type Option = { value: string; label: string; disabled?: boolean };

/** A labelled single choice of a short list (venue, template, instructor, location). */
export function SelectField({
  id,
  label,
  help,
  error,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  field,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  placeholder?: string;
  disabled?: boolean;
  /** `data-field` for tests: the request field this choice sends. */
  field: string;
}) {
  return (
    <FormField helpTone="muted" id={id} label={label} help={help} error={error}>
      <Select value={value === "" ? undefined : value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className="h-11 w-full"
          data-field={field}
          aria-invalid={error ? true : undefined}
          aria-describedby={help || error ? describedBy(id) : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

/** A whole-number field with its unit drawn inside ("min", "people"). */
export function NumberField({
  id,
  label,
  help,
  error,
  unit,
  disabled,
  field,
  registration,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  unit: string;
  disabled?: boolean;
  field: string;
  registration: Record<string, unknown>;
}) {
  return (
    <FormField helpTone="muted" id={id} label={label} help={help} error={error}>
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          fieldSize="lg"
          className="pr-20"
          data-field={field}
          aria-invalid={error ? true : undefined}
          aria-describedby={help || error ? describedBy(id) : undefined}
          disabled={disabled}
          {...registration}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center type-caption text-faint-foreground"
        >
          {unit}
        </span>
      </div>
    </FormField>
  );
}

/** Whether a field's text is a whole number within `[min, max]`. */
export const wholeIn = (value: string, min: number, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;

/** A choice drawn as the artboards' chip: a native input, visually hidden. */
export const chipClass =
  "relative flex h-9 min-w-11 cursor-pointer items-center justify-center rounded-md border border-input px-3 type-body-sm font-extrabold text-muted-foreground transition-colors has-checked:border-accent-border has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50";

/** ISO weekdays (1 = Monday … 7 = Sunday) in the order the locale's week runs. */
export function useWeekOrder(): number[] {
  const locale = useLocale();
  const first = firstDayOfWeek(locale);
  return Array.from({ length: 7 }, (_, index) => ((first - 1 + index) % 7) + 1);
}

/** The locale's name of an ISO weekday (`long` or `short`). */
export function useWeekdayName() {
  const format = useFormatter();
  // 2024-01-01 was a Monday: ISO weekday n is 2024-01-0n.
  return (weekday: number, width: "long" | "short" = "short") =>
    format.dateTime(printable(`2024-01-0${weekday}`), { weekday: width, timeZone: "UTC" });
}

/**
 * The days a weekly class repeats on: seven checkboxes in the locale's week
 * order, each named in full for assistive technology.
 */
export function WeekdayPicker({
  id,
  legend,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  legend: string;
  value: readonly number[];
  onChange: (value: number[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const order = useWeekOrder();
  const name = useWeekdayName();
  return (
    <ChoiceField id={id} legend={legend} error={error}>
      <div className="flex flex-wrap gap-1.5" data-field="weekdays">
        {order.map((weekday) => (
          <label key={weekday} className={chipClass} data-weekday={weekday}>
            <input
              type="checkbox"
              className="sr-only"
              aria-label={name(weekday, "long")}
              checked={value.includes(weekday)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, weekday].sort((a, b) => a - b)
                    : value.filter((day) => day !== weekday),
                )
              }
            />
            <span aria-hidden>{name(weekday)}</span>
          </label>
        ))}
      </div>
    </ChoiceField>
  );
}

/**
 * What the chosen wall time means in the venue's zone, before anything is
 * sent: a time the clocks skip that day (the backend will refuse it; it is
 * never moved to the next hour) or one they repeat (the user picks which of
 * the two, with its UTC offset; nothing is chosen for them).
 */
export function WallTimeNotice({
  resolution,
  zone,
  time,
  occurrence,
  onOccurrence,
  error,
  disabled,
}: {
  resolution: WallTimeResolution;
  zone: string;
  time: string;
  occurrence: "" | "first" | "second";
  onOccurrence: (value: "first" | "second") => void;
  error?: string;
  disabled?: boolean;
}): ReactNode {
  const t = useTranslations("gymConsole.timetable.form.wallTime");
  if (resolution.kind === "gap") {
    return (
      <Notice tone="amber" role="alert" data-schedule="gap">
        <strong className="font-extrabold">{t("gap.title")}</strong> {t("gap.body", { zone, time })}
      </Notice>
    );
  }
  if (resolution.kind !== "overlap") return null;
  const options = [
    ["first", resolution.first],
    ["second", resolution.second],
  ] as const;
  return (
    <fieldset
      data-schedule="overlap"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? describedBy("class-occurrence") : undefined}
      className="flex flex-col gap-2 rounded-lg border border-warning-border bg-warning-subtle px-3.5 py-3 type-caption text-warning-subtle-foreground"
    >
      <legend className="float-left font-extrabold">{t("overlap.title")}</legend>
      <p className="clear-both">{t("overlap.body", { zone, time })}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([option, at]) => (
          <label
            key={option}
            className={cn(chipClass, "h-8 border-warning-border text-warning-subtle-foreground")}
          >
            <input
              type="radio"
              name="class-occurrence"
              value={option}
              className="sr-only"
              checked={occurrence === option}
              disabled={disabled}
              onChange={() => onOccurrence(option)}
            />
            {t(`overlap.${option}`, { offset: formatOffset(at.offsetMinutes) })}
          </label>
        ))}
      </div>
      {error && (
        <p id={describedBy("class-occurrence")} className="font-bold" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
