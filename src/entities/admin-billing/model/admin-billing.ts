import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { callWithSession } from "@/entities/session";
import {
  getAdminBillingOverview,
  getAdminBillingPlan,
  getAdminBillingReconciliation,
  getAdminBillingSubscription,
  getGetAdminBillingOverviewQueryKey,
  getGetAdminBillingPlanQueryKey,
  getGetAdminBillingReconciliationQueryKey,
  getGetAdminBillingSubscriptionQueryKey,
  getListAdminBillingInvoicesQueryKey,
  getListAdminBillingPlansQueryKey,
  getListAdminBillingSubscriptionsQueryKey,
  listAdminBillingInvoices,
  listAdminBillingPlans,
  listAdminBillingSubscriptions,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  ListAdminBillingInvoicesIssue,
  ListAdminBillingInvoicesStatus,
  ListAdminBillingSubscriptionsStatus,
  type AdminBillingInvoice,
  type AdminBillingOverviewResponseOverview,
  type AdminBillingPlan,
  type AdminBillingReconciliationResponseReconciliation,
  type AdminBillingSubscription,
  type AdminBillingSubscriptionResponseSubscription,
  type ListAdminBillingInvoicesParams,
  type ListAdminBillingSubscriptionsParams,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Operator billing oversight (SF-127; simplefit-api `/api/v1/admin/billing`). Read only:
 * the backend decides every figure, the Stripe mode it was read from and who may see
 * it; nothing here adds, converts or infers money. Each query is keyed by its exact
 * mode, filters and cursor, so a test answer never shows under live. A refusal (403,
 * or 404 for an operator gone) drops every billing answer from the cache at once, so a
 * revoked operator keeps nothing on screen. The cache is dropped at every session
 * boundary as well.
 */
export type BillingMode = "test" | "live";
export type BillingEnvironment = BillingMode | "none";
export type BillingOverview = AdminBillingOverviewResponseOverview;
export type BillingPlan = AdminBillingPlan;
export type BillingSubscription = AdminBillingSubscription;
export type BillingSubscriptionDetail = AdminBillingSubscriptionResponseSubscription;
export type BillingInvoice = AdminBillingInvoice;
export type BillingReconciliation = AdminBillingReconciliationResponseReconciliation;
export type SubscriptionFilters = Pick<ListAdminBillingSubscriptionsParams, "status" | "plan_key">;
export type InvoiceFilters = Pick<ListAdminBillingInvoicesParams, "status" | "issue" | "currency">;

export const SUBSCRIPTION_STATUSES = Object.values(ListAdminBillingSubscriptionsStatus);
export const INVOICE_STATUSES = Object.values(ListAdminBillingInvoicesStatus);
export const INVOICE_ISSUES = Object.values(ListAdminBillingInvoicesIssue);
export const BILLING_PAGE_SIZE = 25;
export const BILLING_PERMISSIONS = ["billing.read", "billing.reconciliation.read"] as const;

const BILLING_KEY_PREFIX = "/api/v1/admin/billing";

/** Drops every billing answer from the cache (a refusal or a revoked operator). */
export function forgetBilling(client: QueryClient) {
  client.removeQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(BILLING_KEY_PREFIX),
  });
}

/** Whether an error is the backend refusing this operator (no permission, or not an operator). */
export function isRefusal(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.status === 404);
}

/** Forgets billing data as soon as any billing read is refused. */
export function useForgetBillingOnRefusal(error: unknown) {
  const client = useQueryClient();
  const refused = isRefusal(error);
  useEffect(() => {
    if (refused) forgetBilling(client);
  }, [client, refused]);
}

const reads = { retry: false, staleTime: 0, refetchOnWindowFocus: true } as const;

/** The overview of `mode`, or of the deployment's configured mode while `mode` is unknown. */
export function useBillingOverview(mode: BillingMode | undefined, enabled = true) {
  const params = mode ? { mode } : {};
  return useQuery({
    queryKey: getGetAdminBillingOverviewQueryKey(params),
    queryFn: ({ signal }) =>
      callWithSession((init) => getAdminBillingOverview(params, { ...init, signal })).then(
        (answer) => answer.overview,
      ),
    enabled,
    ...reads,
  });
}

export function useBillingPlans(enabled = true) {
  return useQuery({
    queryKey: getListAdminBillingPlansQueryKey(),
    queryFn: ({ signal }) =>
      callWithSession((init) => listAdminBillingPlans({ ...init, signal })).then(
        (answer) => answer.plans,
      ),
    enabled,
    ...reads,
  });
}

export function useBillingPlan(key: string, enabled = true) {
  return useQuery({
    queryKey: getGetAdminBillingPlanQueryKey(key),
    queryFn: ({ signal }) =>
      callWithSession((init) => getAdminBillingPlan(key, { ...init, signal })).then(
        (answer) => answer.plan,
      ),
    enabled,
    ...reads,
  });
}

export function useBillingSubscriptions(
  environment: BillingEnvironment,
  filters: SubscriptionFilters,
  cursor: string | undefined,
  enabled = true,
) {
  const params: ListAdminBillingSubscriptionsParams = {
    mode: environment,
    ...filters,
    limit: BILLING_PAGE_SIZE,
    cursor,
  };
  return useQuery({
    queryKey: getListAdminBillingSubscriptionsQueryKey(params),
    queryFn: ({ signal }) =>
      callWithSession((init) => listAdminBillingSubscriptions(params, { ...init, signal })),
    enabled,
    ...reads,
  });
}

export function useBillingSubscription(id: string | null) {
  return useQuery({
    queryKey: getGetAdminBillingSubscriptionQueryKey(id ?? ""),
    queryFn: ({ signal }) =>
      callWithSession((init) => getAdminBillingSubscription(id ?? "", { ...init, signal })).then(
        (answer) => answer.subscription,
      ),
    enabled: id !== null,
    ...reads,
  });
}

export function useBillingInvoices(
  mode: BillingMode,
  filters: InvoiceFilters,
  cursor: string | undefined,
  enabled = true,
) {
  const params: ListAdminBillingInvoicesParams = {
    mode,
    ...filters,
    limit: BILLING_PAGE_SIZE,
    cursor,
  };
  return useQuery({
    queryKey: getListAdminBillingInvoicesQueryKey(params),
    queryFn: ({ signal }) =>
      callWithSession((init) => listAdminBillingInvoices(params, { ...init, signal })),
    enabled,
    ...reads,
  });
}

/** Reconciliation of `mode`, or of the deployment's configured mode while `mode` is unknown. */
export function useBillingReconciliation(
  mode: BillingMode | undefined,
  cursor: string | undefined,
  enabled: boolean,
) {
  const params = { ...(mode ? { mode } : {}), limit: BILLING_PAGE_SIZE, cursor };
  return useQuery({
    queryKey: getGetAdminBillingReconciliationQueryKey(params),
    queryFn: ({ signal }) =>
      callWithSession((init) => getAdminBillingReconciliation(params, { ...init, signal })).then(
        (answer) => answer.reconciliation,
      ),
    enabled,
    ...reads,
  });
}

/**
 * An amount as the backend sent it: the decimal string of `currency`, formatted for
 * `locale` without ever passing through a float (`Intl.NumberFormat` formats the
 * string exactly). `null` when there is no decimal string (a currency SimpleFit doesn't
 * list): the caller shows the minor units as they are, labelled, never guessed.
 */
export function formatAmount(
  locale: string,
  amount: string | null,
  currency: string,
): string | null {
  if (amount === null) return null;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    amount as `${number}`,
  );
}
