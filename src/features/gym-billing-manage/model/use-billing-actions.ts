"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { gymBillingKey, gymBillingSummaryKey } from "@/entities/gym-billing";
import { callWithSession } from "@/entities/session";
import {
  cancelGymSaasSubscription,
  createGymBillingPortalSession,
  createGymSaasCheckoutSession,
  reconcileGymSaasSubscription,
  requestGymSaasSubscription,
} from "@/shared/api/generated/endpoints/simplefit-plans/simplefit-plans";
import type { SubscriptionCancelRequestMode } from "@/shared/api/generated/model";

import { billingProblem } from "./billing-problem";

/**
 * Leaves for a Stripe-hosted page (Checkout or the Customer Portal). Only an
 * `https:` URL the backend answered is ever followed; it is never stored.
 */
export type Navigate = (url: string) => void;

export const leaveForStripe: Navigate = (url) => {
  if (new URL(url).protocol !== "https:") throw new Error("refusing a non-https billing URL");
  window.location.assign(url);
};

/** After any billing answer the gym's billing reads are read again. */
export function useBillingRefresh(gymId: string) {
  const client = useQueryClient();
  return useCallback(
    () => client.invalidateQueries({ queryKey: gymBillingKey(gymId) }),
    [client, gymId],
  );
}

/**
 * Chooses a plan and goes to Stripe-hosted Checkout:
 *
 * 1. Without a pending intent, one is recorded (`requestGymSaasSubscription`)
 *    with one `client_request_id` per attempt; a lost answer keeps the key,
 *    so trying again returns the same intent instead of a second one.
 * 2. The backend creates (or returns) the hosted checkout of that intent
 *    (`createGymSaasCheckoutSession`, idempotent at the backend and Stripe)
 *    and the browser leaves for its URL.
 *
 * Nothing is paid until Stripe confirms: the return is checked by the
 * backend (`useReconcile`).
 */
export function useStartCheckout(gymId: string, navigate: Navigate = leaveForStripe) {
  const key = useRef<string | null>(null);
  const refresh = useBillingRefresh(gymId);

  return useMutation({
    mutationFn: async (choice: {
      subscriptionId?: string;
      planVersionId?: string;
      priceVersionId?: string;
    }) => {
      let subscriptionId = choice.subscriptionId;

      if (subscriptionId === undefined) {
        key.current ??= crypto.randomUUID();
        const intent = await callWithSession((init) =>
          requestGymSaasSubscription(
            gymId,
            {
              plan_version_id: choice.planVersionId ?? "",
              price_version_id: choice.priceVersionId ?? "",
              client_request_id: key.current ?? crypto.randomUUID(),
            },
            init,
          ),
        );
        subscriptionId = intent.subscription.subscription_id;
        key.current = null;
      }

      const { checkout } = await callWithSession((init) =>
        createGymSaasCheckoutSession(gymId, subscriptionId, init),
      );
      return checkout.url;
    },
    onSuccess: (url) => navigate(url),
    onError: (error) => {
      if (billingProblem(error).kind !== "unknown") key.current = null;
      void refresh();
    },
  });
}

/** Opens the Stripe Customer Portal (payment methods, invoices, billing details). */
export function useOpenPortal(gymId: string, navigate: Navigate = leaveForStripe) {
  const refresh = useBillingRefresh(gymId);
  return useMutation({
    mutationFn: () => callWithSession((init) => createGymBillingPortalSession(gymId, init)),
    onSuccess: (answer) => navigate(answer.portal.url),
    onError: () => void refresh(),
  });
}

/**
 * Asks the backend to read the subscription from Stripe now (the return
 * from checkout or the portal, or a manual refresh). The answer is the
 * reconciled summary; invoices are read again.
 */
export function useReconcile(gymId: string) {
  const client = useQueryClient();
  const refresh = useBillingRefresh(gymId);
  return useMutation({
    mutationFn: (subscriptionId: string) =>
      callWithSession((init) => reconcileGymSaasSubscription(gymId, subscriptionId, init)),
    onSuccess: (answer) => {
      client.setQueryData(gymBillingSummaryKey(gymId), answer);
    },
    onSettled: () => refresh(),
  });
}

/**
 * Cancels the gym's plan: `period_end` keeps it until the paid period ends,
 * `immediate` ends it now (a pending request is always withdrawn at once).
 * The backend cancels at Stripe first; no refund is implied.
 */
export function useCancelPlan(gymId: string) {
  const refresh = useBillingRefresh(gymId);
  return useMutation({
    mutationFn: (input: { subscriptionId: string; mode: SubscriptionCancelRequestMode }) =>
      callWithSession((init) =>
        cancelGymSaasSubscription(gymId, input.subscriptionId, { mode: input.mode }, init),
      ),
    onSettled: () => refresh(),
  });
}
