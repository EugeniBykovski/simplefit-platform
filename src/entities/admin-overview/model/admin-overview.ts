import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getAdminOverview,
  getGetAdminOverviewQueryKey,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  GetAdminOverviewPeriod,
  type AdminOverview,
  type AdminOverviewCheck,
  type AdminOverviewMetric,
} from "@/shared/api/generated/model";

/**
 * The Control Plane overview (SF-121; simplefit-api `GET /api/v1/admin/overview`).
 * Every number is the backend's: counts computed in the database as one snapshot,
 * with a per-permission state (`restricted` and `unavailable` carry no value and are
 * never shown as zero). Nothing is counted, derived or cached in the browser beyond
 * the query cache, which is dropped at every session boundary (SF-28).
 */
export type Overview = AdminOverview;
export type OverviewMetric = AdminOverviewMetric;
export type OverviewCheck = AdminOverviewCheck;
export type OverviewPeriod = GetAdminOverviewPeriod;

export const OVERVIEW_PERIODS: readonly OverviewPeriod[] = Object.values(GetAdminOverviewPeriod);
export const DEFAULT_OVERVIEW_PERIOD: OverviewPeriod = GetAdminOverviewPeriod["7d"];

export const overviewQueryKey = (period: OverviewPeriod) => getGetAdminOverviewQueryKey({ period });

/** `GET /api/v1/admin/overview?period=…`. */
export async function fetchOverview(
  period: OverviewPeriod,
  signal?: AbortSignal,
): Promise<Overview> {
  const { overview } = await callWithSession((init) =>
    getAdminOverview({ period }, { ...init, signal }),
  );
  return overview;
}

/**
 * The overview for `period`. One query per period: an answer for another period can
 * only land under its own key. While a new period loads, the previous answer stays
 * on screen (`isPlaceholderData`) and the page labels every period count with the
 * period the backend actually answered for, so two periods never mix. Re-read on
 * focus, so a revocation or a lapsed key check shows on the next read.
 */
export function useOverview(period: OverviewPeriod) {
  return useQuery({
    queryKey: overviewQueryKey(period),
    queryFn: ({ signal }) => fetchOverview(period, signal),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** One metric of an overview, by id. */
export function metricOf(overview: Overview, id: OverviewMetric["id"]): OverviewMetric | undefined {
  return overview.metrics.find((metric) => metric.id === id);
}

/** A named count of a metric or check (`breakdown`, `period_counts`, `counts`). */
export function countOf(
  list: readonly { key: string; value: number }[],
  key: string,
): number | undefined {
  return list.find((entry) => entry.key === key)?.value;
}
