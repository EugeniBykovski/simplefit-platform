"use client";

import { useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetGymBillingSummaryQueryKey,
  getGymBillingSummary,
  getListGymBillingInvoicesQueryKey,
  getListSaasPlansQueryKey,
  listGymBillingInvoices,
  listSaasPlans,
} from "@/shared/api/generated/endpoints/simplefit-plans/simplefit-plans";
import type {
  GymBillingInvoice as Invoice,
  GymBillingSummary as Summary,
  GymBillingSummaryPaymentState as PaymentState,
  GymSaasSubscription as Subscription,
  GymViewer,
  SaasPlan as Plan,
  SaasPrice as Price,
} from "@/shared/api/generated/model";

/**
 * A gym's SimpleFit SaaS billing (SF-101 plans, SF-102 Stripe) as the web
 * reads it. The backend owns every rule and every state; nothing here is
 * decided by the client:
 *
 * - The **summary** is the backend's answer for the gym: whether payments
 *   are ready in this environment (and in Stripe's test or live mode), the
 *   latest subscription and its **payment state**, reconciled by the backend
 *   from Stripe (never from a browser redirect), and whether the Stripe
 *   Customer Portal is available.
 * - **Invoices** are Stripe's, as the backend last reconciled them. Only
 *   `paid` is paid; a draft or open invoice never is. Documents are Stripe's
 *   hosted invoice page and PDF; nothing is rendered here.
 * - **Plans** are the versions SimpleFit published under an approval; a
 *   price is a decimal string with its currency, never a float.
 *
 * No card, bank or payment method detail exists in the contract.
 */
export type GymBillingSummary = Summary;
export type GymBillingPaymentState = PaymentState;
export type GymBillingInvoice = Invoice;
export type GymSaasSubscription = Subscription;
export type SaasPlan = Plan;
export type SaasPrice = Price;

/**
 * Whether the viewer acts for the gym's SimpleFit plan (`manage_billing`,
 * the owner's alone). A display hint only: the backend checks every call
 * and answers 403 to anyone else.
 */
export const canManageBilling = (viewer: GymViewer) =>
  viewer.permissions.includes("manage_billing");

/** Every billing read of one gym (summary and invoices), named by the gym. */
export const gymBillingKey = (gymId: string) => ["gym-billing", gymId] as const;
export const gymBillingSummaryKey = (gymId: string) =>
  [...gymBillingKey(gymId), ...getGetGymBillingSummaryQueryKey(gymId)] as const;
export const gymBillingInvoicesKey = (gymId: string) =>
  [...gymBillingKey(gymId), ...getListGymBillingInvoicesQueryKey(gymId)] as const;

/** The gym's billing summary, read again whenever the page regains focus. */
export function useGymBillingSummary(gymId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: gymBillingSummaryKey(gymId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getGymBillingSummary(gymId, { ...init, signal })),
    select: (answer) => answer.billing,
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** The gym's Stripe invoices, newest first. */
export function useGymBillingInvoices(gymId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: gymBillingInvoicesKey(gymId),
    queryFn: ({ signal }) =>
      callWithSession((init) => listGymBillingInvoices(gymId, { ...init, signal })),
    select: (answer) => answer.invoices,
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** The published SimpleFit plans (empty until one is published). */
export function useSaasPlans({ enabled = true } = {}) {
  return useQuery({
    queryKey: getListSaasPlansQueryKey(),
    queryFn: ({ signal }) => callWithSession((init) => listSaasPlans({ ...init, signal })),
    select: (answer) => answer.plans,
    enabled,
    staleTime: 60_000,
  });
}

/** The plan's fixed prices a gym can pay for (a quote-only price is never zero). */
export const payablePrices = (plan: SaasPlan) =>
  plan.prices.filter((price) => price.pricing === "fixed" && price.amount !== null);
