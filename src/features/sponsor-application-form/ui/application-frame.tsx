"use client";

import { CheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  useAnswerLabels,
  type SponsorApplication,
  type SponsorApplicationPolicy,
} from "@/entities/sponsor-application";
import { cn } from "@/shared/lib/utils";

import { fieldsOf, STEPS, type StepKey } from "../model/steps";

/*
 * SPA1's frame (Claude Design SponsorApply at 1440, and the SponsorResponsive
 * sheet): the 260 px step rail, the form and the 320 px "Your application"
 * aside from 1280 px; from 1024 the aside is hidden and the rail is 230 px;
 * below 1024 the rail becomes "Step n of 8" and a progress bar above the
 * form, one column. Presentation only.
 */

export function ApplicationGrid({
  rail,
  aside,
  children,
}: {
  rail: ReactNode;
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <div className="hidden lg:block">{rail}</div>
      <div className="flex min-w-0 flex-col gap-5.5">{children}</div>
      <div className="hidden xl:block">{aside}</div>
    </div>
  );
}

/** Whether a step's answers are complete as the backend sees them (never the current step's mark). */
export function stepDone(
  step: StepKey,
  application: SponsorApplication | null,
  policy: SponsorApplicationPolicy,
): boolean {
  if (application === null || step === "review") return false;
  if (step === "uploads") return application.evidence.some((item) => item.status === "uploaded");
  const fields: readonly string[] = fieldsOf(step, policy);
  return !application.missing_fields.some((field) => fields.includes(field));
}

export function StepRail({
  current,
  done,
  note,
  onSelect,
  disabled,
}: {
  current: StepKey;
  done: (step: StepKey) => boolean;
  note: string;
  onSelect: (step: StepKey) => void;
  disabled: boolean;
}) {
  const t = useTranslations("sponsorApplication");
  return (
    <nav
      aria-label={t("rail.label")}
      className="flex flex-col gap-1 rounded-3xl border border-border bg-surface p-4.5"
    >
      <p className="type-label text-warning">{t("rail.title")}</p>
      <p className="pt-1 pb-2.5 type-caption text-muted-foreground">{note}</p>
      <ol className="flex flex-col gap-1">
        {STEPS.map((step, index) => {
          const isCurrent = step === current;
          const ok = !isCurrent && done(step);
          return (
            <li key={step}>
              <button
                type="button"
                disabled={disabled}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onSelect(step)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  isCurrent
                    ? "bg-accent text-accent-foreground"
                    : ok
                      ? "text-muted-foreground hover:bg-muted"
                      : "text-faint-foreground hover:bg-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6.5 flex-none items-center justify-center rounded-full type-micro font-mono",
                    ok
                      ? "bg-highlight text-highlight-foreground"
                      : isCurrent
                        ? "border-2 border-highlight text-accent-foreground"
                        : "border-[1.5px] border-border-strong",
                  )}
                >
                  {ok ? <CheckIcon className="size-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <span className="type-body-sm font-extrabold">
                  {t(`steps.${step}.title`)}
                  {ok ? <span className="sr-only"> ({t("rail.done")})</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Below 1024: "Step n of 8 · Title" and the progress bar instead of the rail. */
export function StepProgress({ current }: { current: StepKey }) {
  const t = useTranslations("sponsorApplication");
  const n = STEPS.indexOf(current) + 1;
  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <p id="sa-progress" className="type-body-sm font-extrabold">
        {t("progress.narrow", { step: n, total: STEPS.length, title: t(`steps.${current}.title`) })}
      </p>
      <span
        role="progressbar"
        aria-labelledby="sa-progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={n}
        className="block h-1.5 overflow-hidden rounded-full bg-border"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.round((n / STEPS.length) * 100)}%` }}
        />
      </span>
    </div>
  );
}

/** "Your application": the saved answers, as the backend has them. */
export function AnswersAside({
  application,
  policy,
}: {
  application: SponsorApplication | null;
  policy: SponsorApplicationPolicy;
}) {
  const t = useTranslations("sponsorApplication.summary");
  const labels = useAnswerLabels(policy);
  const format = useFormatter();
  const a = application?.answers;
  const dash = "—";
  const list = (items: string[] | undefined) =>
    items === undefined || items.length === 0 ? dash : format.list(items);
  const rows: [string, string][] = [
    [t("company"), a?.company_name ?? dash],
    [
      t("contact"),
      [a?.contact_full_name, a?.contact_position].filter((x) => x != null && x !== "").join(", ") ||
        dash,
    ],
    [t("interests"), list(a?.interests.map(labels.interest))],
    [
      t("markets"),
      a?.market_scope == null
        ? dash
        : a.market_scope === "global"
          ? labels.scope("global")
          : list([...a.market_countries.map(labels.country), ...a.market_cities]),
    ],
    [t("budgetShort"), a?.budget_band == null ? dash : labels.budget(a.budget_band)],
    [t("goals"), a?.goals ?? dash],
  ];
  return (
    <aside
      aria-label={t("asideLabel")}
      className="flex flex-col gap-0.5 rounded-3xl border border-border bg-surface px-4.5 py-4"
    >
      <p className="type-label text-faint-foreground">{t("asideTitle")}</p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 border-b border-border-subtle py-2.5">
            <dt className="type-body-sm font-extrabold">{label}</dt>
            <dd className="line-clamp-3 type-caption break-words text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
