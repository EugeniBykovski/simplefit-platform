import { Check, Info, Minus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

import {
  COMPARE_ROWS,
  GYM_MULTI_LOCATION_FROM,
  GYM_PLANS,
  type CompareValue,
} from "../model/pricing";
import { formatPrice } from "../model/price-format";
import { RoleTabs } from "./pricing-page";
import { Lead, PageTitle, SitePage } from "./sections";

/**
 * PR6 · Plan comparison (`web.pricing.compare`; Claude Design PlanCompare,
 * 1440 × 1320): every gym plan feature by feature, Pro highlighted. Only the
 * Packages row has approved detail copy, so it alone carries the ⓘ tooltip
 * (the artboard draws it open); the other rows draw an ⓘ without any text,
 * and an empty control is not shown (SF-43 decision).
 */
export function PlanComparePage() {
  const t = useTranslations("site.compare");
  const plans = useTranslations("site.pricing.gym.plans");
  const pricing = useTranslations("site.pricing");
  const common = useTranslations("site.common");
  const format = useFormatter();

  return (
    <SitePage gap="10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-6 desktop:flex-row desktop:items-end desktop:gap-2.5">
          <div className="flex flex-col gap-2">
            <PageTitle size="site-title-md">{t("title")}</PageTitle>
            <Lead size="md">
              {t("lead", { price: formatPrice(format, GYM_MULTI_LOCATION_FROM) })}
            </Lead>
          </div>
          <div className="desktop:ml-auto">
            <RoleTabs active="gym" current="true" />
          </div>
        </div>
        <div className="relative overflow-x-auto rounded-3xl border border-border bg-surface px-5 py-4">
          <table className="w-full min-w-170 table-fixed border-collapse">
            <caption className="sr-only">{t("title")}</caption>
            <colgroup>
              <col className="w-45 desktop:w-55" />
              {GYM_PLANS.map((plan) => (
                <col key={plan.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-input">
                <td className="pb-3" />
                {GYM_PLANS.map((plan) => (
                  <th key={plan.id} scope="col" className="pb-3 align-bottom type-body">
                    <span
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-t-2xl p-3",
                        plan.featured && "border-[1.5px] border-b-0 border-highlight bg-accent",
                      )}
                    >
                      {plan.featured ? (
                        <Badge variant="primary">{pricing("recommended")}</Badge>
                      ) : null}
                      <b className="type-body-lg font-extrabold">{plans(`${plan.id}.name`)}</b>
                      <span className="type-body-sm text-muted-foreground">
                        {formatPrice(format, plan.price)}
                        {plan.price.amount > 0 ? common("perMonth") : ""}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    "h-11.25 border-b border-muted",
                    index % 2 === 1 && "bg-highlight/4",
                  )}
                >
                  <th scope="row" className="pl-3 text-left type-body-sm font-bold">
                    <span className="flex items-center gap-2">
                      {t(`rows.${row.id}` as "rows.members")}
                      {row.tip ? (
                        <Tooltip>
                          <TooltipTrigger
                            aria-label={t("details", {
                              feature: t(`rows.${row.id}` as "rows.members"),
                            })}
                            className="flex size-6 items-center justify-center rounded-full text-faint-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Info aria-hidden className="size-4" />
                          </TooltipTrigger>
                          <TooltipContent
                            className="w-65 max-w-none rounded-md-lg px-3.5 py-3"
                            side="top"
                          >
                            <span>{t.rich("packagesTip", { b: (chunks) => <b>{chunks}</b> })}</span>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </span>
                  </th>
                  {row.values.map((value, column) => (
                    <td key={column} className="text-center type-body-sm">
                      <Cell value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SitePage>
  );
}

function Cell({ value }: { value: CompareValue }) {
  const t = useTranslations("site.compare");
  const format = useFormatter();
  switch (value.kind) {
    case "number":
      return <span className="font-extrabold">{format.number(value.value, "integer")}</span>;
    case "text":
      return <span className="font-extrabold">{t(`values.${value.key}`)}</span>;
    case "yes":
      return (
        <span className="inline-flex text-highlight">
          <Check aria-hidden className="size-4" strokeWidth={3} />
          <span className="sr-only">{t("yes")}</span>
        </span>
      );
    case "no":
      return (
        <span className="inline-flex text-faint-foreground/70">
          <Minus aria-hidden className="size-4" />
          <span className="sr-only">{t("no")}</span>
        </span>
      );
  }
}
