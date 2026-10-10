import type { EntryIntent } from "@/shared/routes/continuation";

/**
 * The public plans and prices (SF-43), exactly as the approved Claude Design
 * pricing artboards draw them (PR1 coach, PR2 fighter, PR3 gym, PR6
 * comparison; L1–L4 repeat them). This is the one place those figures live:
 * every page reads them from here. There is no billing domain yet, so no
 * plan can be bought: every plan action opens sign-up with its journey
 * (SF-45 `intent`), never a checkout.
 *
 * Amounts carry their currency code and are formatted by the locale
 * (`formatPrice`), never by hand.
 */
export type Price = { amount: number; currency: "EUR" | "PLN" };

const eur = (amount: number): Price => ({ amount, currency: "EUR" });

export type PricingRole = "fighter" | "coach" | "gym" | "enterprise";

/** The `/pricing?role=` states in the artboards' tab order. PR1 (coach) is the default. */
export const PRICING_ROLES: readonly PricingRole[] = ["fighter", "coach", "gym", "enterprise"];
export const DEFAULT_PRICING_ROLE: PricingRole = "coach";

export function parsePricingRole(value: unknown): PricingRole {
  return typeof value === "string" && (PRICING_ROLES as readonly string[]).includes(value)
    ? (value as PricingRole)
    : DEFAULT_PRICING_ROLE;
}

export type Billing = "monthly" | "annual";

export function parseBilling(value: unknown): Billing {
  return value === "annual" ? "annual" : "monthly";
}

export type Plan<Id extends string> = {
  id: Id;
  price: Price;
  /** The plan's capacity as the plans tables state it (fighters or members); `null` = unlimited. */
  limit: number | null;
  /** Number of feature lines in its messages. */
  features: number;
  /** Highlighted card ("Most popular", "Recommended"). */
  featured?: boolean;
  /** The olive (primary) action of the row. */
  primary?: boolean;
};

/** PR1: coach plans (L3 repeats the table). */
export const COACH_PLANS: readonly Plan<"free" | "starter" | "pro" | "elite" | "unlimited">[] = [
  { id: "free", price: eur(0), limit: 3, features: 5 },
  { id: "starter", price: eur(14.99), limit: 10, features: 4 },
  { id: "pro", price: eur(29.99), limit: 30, features: 8, featured: true, primary: true },
  { id: "elite", price: eur(49.99), limit: 75, features: 7 },
  { id: "unlimited", price: eur(69.99), limit: null, features: 2 },
];

/** PR3: gym plans (L4 and PR6 repeat them); Multi-location is a "from" price. */
export const GYM_PLANS: readonly Plan<"free" | "starter" | "pro" | "business" | "club">[] = [
  { id: "free", price: eur(0), limit: 30, features: 5 },
  { id: "starter", price: eur(39), limit: 100, features: 3 },
  { id: "pro", price: eur(89), limit: 300, features: 5, featured: true, primary: true },
  { id: "business", price: eur(179), limit: 750, features: 5 },
  { id: "club", price: eur(299), limit: 1500, features: 3 },
];
export const GYM_MULTI_LOCATION_FROM = eur(499);

/** PR2: SimpleFit Pro for fighters, monthly and the annual price the artboards state. */
export const FIGHTER_PRO = {
  monthly: eur(7.99),
  annualPerMonth: eur(6.39),
  annualPerYear: eur(76.7),
};
export const FIGHTER_FREE = eur(0);
export const FIGHTER_FREE_FEATURES = 6;
export const FIGHTER_PRO_FEATURES = 5;
export const FIGHTER_STAYS_FREE = 4;

/** The journey each pricing role's plan actions start (sign-up `intent`). */
export const PLAN_INTENT: Record<Exclude<PricingRole, "enterprise">, EntryIntent> = {
  fighter: "fighter",
  coach: "coach",
  gym: "gym",
};

/** PR6: the gym plan comparison, row by row, in the artboard's order. */
export type CompareValue =
  | { kind: "number"; value: number }
  | {
      kind: "text";
      key: "unlimited" | "basic" | "advanced" | "reports" | "logoColour" | "read" | "full";
    }
  | { kind: "yes" }
  | { kind: "no" };

const n = (value: number): CompareValue => ({ kind: "number", value });
const t = (key: Extract<CompareValue, { kind: "text" }>["key"]): CompareValue => ({
  kind: "text",
  key,
});
const Y: CompareValue = { kind: "yes" };
const N: CompareValue = { kind: "no" };

export const COMPARE_ROWS: readonly { id: string; values: readonly CompareValue[]; tip?: true }[] =
  [
    { id: "members", values: [n(30), n(100), n(300), n(750), n(1500)] },
    { id: "coaches", values: [n(2), n(5), n(15), t("unlimited"), t("unlimited")] },
    { id: "locations", values: [n(1), n(1), n(3), n(5), n(10)] },
    { id: "classes", values: [Y, Y, Y, Y, Y] },
    { id: "bookings", values: [t("basic"), Y, t("advanced"), t("advanced"), t("advanced")] },
    { id: "payments", values: [N, N, Y, Y, Y] },
    { id: "memberships", values: [N, N, Y, Y, Y] },
    { id: "packages", values: [N, N, Y, Y, Y], tip: true },
    { id: "community", values: [Y, Y, Y, Y, Y] },
    { id: "challenges", values: [N, N, Y, Y, Y] },
    {
      id: "analytics",
      values: [t("basic"), t("basic"), t("reports"), t("advanced"), t("advanced")],
    },
    { id: "automations", values: [N, N, N, Y, Y] },
    { id: "branding", values: [N, N, t("logoColour"), Y, Y] },
    { id: "api", values: [N, N, N, t("read"), t("full")] },
    { id: "support", values: [N, N, N, N, Y] },
  ];
