"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { gymQueryKey } from "@/entities/gym";
import { isApiError } from "@/shared/api/http/api-error";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

/**
 * A read refused with 404 means this gym is gone for the viewer (removed
 * meanwhile): the console's gym is read again, and the console then shows
 * that it is not available. Nothing of the gym stays on screen.
 */
export function useGoneGym(gymId: string, error: unknown) {
  const client = useQueryClient();
  const gone = isApiError(error) && error.status === 404;
  useEffect(() => {
    if (gone) void client.invalidateQueries({ queryKey: gymQueryKey(gymId) });
  }, [client, gone, gymId]);
}

/** The state of a read that has nothing to show yet: loading, refused, failed (retry). */
export function ReadState({
  error,
  loading,
  ready,
  label,
  onRetry,
  rows = 4,
  children,
}: {
  error: unknown;
  loading: boolean;
  ready: boolean;
  label: string;
  onRetry: () => void;
  rows?: number;
  children: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.read");
  if (error) {
    const status = isApiError(error) ? error.status : undefined;
    if (status === 403) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-2.5 px-2 py-8"
          data-timetable-restricted
        >
          <p className="flex items-center gap-2 type-title font-display">
            <LockIcon aria-hidden className="size-4.5 text-faint-foreground" />
            {t("restricted.title")}
          </p>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t("restricted.body")}</p>
        </div>
      );
    }
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2.5 px-2 py-8"
        data-timetable-failed
      >
        <p className="type-title font-display">{t("failed.title")}</p>
        <p className="max-w-130 type-body-sm text-muted-foreground">
          {status === 429 ? t("failed.limited") : t("failed.body")}
        </p>
        <Button variant="quiet" onClick={onRetry}>
          {t("failed.retry")}
        </Button>
      </div>
    );
  }
  if (loading || !ready) {
    return (
      <div
        role="status"
        aria-label={label}
        className="flex flex-col gap-2.5"
        data-timetable-loading
      >
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-13 rounded-xl" />
        ))}
      </div>
    );
  }
  return children;
}

/** A label and value row of a details card. */
export function Fact({
  label,
  children,
  tone,
  field,
}: {
  label: string;
  children: ReactNode;
  tone?: "warning";
  field?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-2.5 type-body-sm first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn("text-right font-bold break-words", tone === "warning" && "text-warning")}
        data-fact={field}
      >
        {children}
      </dd>
    </div>
  );
}

/** A segmented choice of two or three views (toolbar), each a pressed button. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  marker,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  marker: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-0.5 rounded-xl border bg-surface p-1"
      data-segmented={marker}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-sm px-3 type-caption font-extrabold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            option.value === value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
