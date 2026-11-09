"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { SponsorApplicationAnswers } from "@/shared/api/generated/model";
import { countryName } from "@/shared/lib/countries";
import { cn } from "@/shared/lib/utils";

import type { SponsorApplicationPolicy } from "../model/sponsor-application";

/**
 * Words for the backend's answer codes (`sponsorApplication.codes`) and the
 * summary rows SPA1's review, SP9 and SPX5 share. Unknown codes (a newer
 * policy) are shown as they are, never guessed.
 */
export function useAnswerLabels(policy?: Pick<SponsorApplicationPolicy, "budget_bands">) {
  const t = useTranslations("sponsorApplication.codes");
  const format = useFormatter();
  const locale = useLocale();

  const known = (group: "industry" | "interest" | "scope", code: string) => {
    const key = `${group}.${code}` as "industry.other";
    return t.has(key) ? t(key) : code;
  };

  const money = (amount: number, currency: string) =>
    format.number(amount, { style: "currency", currency, maximumFractionDigits: 0 });

  /** A budget band from its policy bounds (currency from the data), or its own word. */
  const budget = (code: string) => {
    const band = policy?.budget_bands.find((entry) => entry.code === code);
    if (band === undefined || (band.min === null && band.max === null)) {
      const key = `budget.${code}` as "budget.to_be_discussed";
      return t.has(key) ? t(key) : code;
    }
    if (band.min === null)
      return t("budgetUnder", { max: money(band.max as number, band.currency) });
    if (band.max === null) return t("budgetOver", { min: money(band.min, band.currency) });
    return t("budgetBetween", {
      min: money(band.min, band.currency),
      max: money(band.max, band.currency),
    });
  };

  return {
    industry: (code: string) => known("industry", code),
    interest: (code: string) => known("interest", code),
    scope: (code: string) => known("scope", code),
    country: (code: string) => countryName(code, locale),
    budget,
  };
}

/** The design's key / value row ("Company · [Company name]"). */
export function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border-subtle py-2.5 type-body-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-bold break-words">{children}</dd>
    </div>
  );
}

/**
 * The answers as the review (SPA1 `review`) and the status (SPX5 "What you
 * submitted") list them. `empty` stands for an answer not given.
 */
export function AnswerSummary({
  answers,
  policy,
  detailed = false,
  className,
}: {
  answers: SponsorApplicationAnswers;
  policy?: Pick<SponsorApplicationPolicy, "budget_bands">;
  /** SPX5 adds "Country and industry". */
  detailed?: boolean;
  className?: string;
}) {
  const t = useTranslations("sponsorApplication.summary");
  const label = useAnswerLabels(policy);
  const format = useFormatter();
  const empty = t("empty");
  const list = (items: string[]) => (items.length === 0 ? empty : format.list(items));

  const contact = [answers.contact_full_name, answers.contact_position]
    .filter((part): part is string => part !== null && part !== "")
    .join(", ");
  const markets =
    answers.market_scope === null
      ? empty
      : answers.market_scope === "global"
        ? label.scope("global")
        : list([...answers.market_countries.map(label.country), ...answers.market_cities]);

  return (
    <dl className={cn("flex flex-col", className)}>
      <SummaryRow label={t("company")}>{answers.company_name ?? empty}</SummaryRow>
      {detailed ? (
        <SummaryRow label={t("countryIndustry")}>
          {[
            answers.country_code === null ? null : label.country(answers.country_code),
            answers.industry === null ? null : label.industry(answers.industry),
          ]
            .filter((part): part is string => part !== null)
            .join(" · ") || empty}
        </SummaryRow>
      ) : null}
      <SummaryRow label={t("contact")}>{contact === "" ? empty : contact}</SummaryRow>
      <SummaryRow label={t("interests")}>{list(answers.interests.map(label.interest))}</SummaryRow>
      <SummaryRow label={t("markets")}>{markets}</SummaryRow>
      <SummaryRow label={t("budget")}>
        {answers.budget_band === null
          ? empty
          : t("estimate", { range: label.budget(answers.budget_band) })}
      </SummaryRow>
      <SummaryRow label={t("goals")}>{answers.goals ?? empty}</SummaryRow>
    </dl>
  );
}
