import type {
  PartnershipPreferencesView,
  PartnershipProposal,
  PreferencesPatch,
  ProposalAnswersPatch,
} from "@/entities/sponsor-partnership";
import type { CreateSponsorPartnershipProposalRequestMarketScope } from "@/shared/api/generated/model";

/** Character limits the API documents (shown as counters; the API decides). */
export const TITLE_MAX = 120;
export const SUMMARY_MAX = 4000;
export const GOALS_MAX = 2000;
export const CITY_MAX = 80;

/** The interest and market answers both forms share. Choices are `""` until chosen. */
export type MarketValues = {
  interests: string[];
  market_scope: string;
  market_countries: string[];
  market_cities: string[];
};

export type PreferencesValues = MarketValues & { goals: string };
export type ProposalValues = MarketValues & { title: string; summary: string };

export const MARKET_FIELDS = [
  "interests",
  "market_scope",
  "market_countries",
  "market_cities",
] as const;
export const PREFERENCE_FIELDS = [...MARKET_FIELDS, "goals"] as const;
export const PROPOSAL_FIELDS = ["title", ...MARKET_FIELDS, "summary"] as const;

export type PreferenceField = (typeof PREFERENCE_FIELDS)[number];
export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

const EMPTY_MARKETS: MarketValues = {
  interests: [],
  market_scope: "",
  market_countries: [],
  market_cities: [],
};

/** The form's copy of the saved preferences (empty when none are saved yet). */
export function preferencesValues(view: PartnershipPreferencesView): PreferencesValues {
  const saved = view.preferences;
  if (saved === null) return { ...EMPTY_MARKETS, goals: "" };
  return {
    interests: [...saved.interests],
    market_scope: saved.market_scope ?? "",
    market_countries: [...saved.market_countries],
    market_cities: [...saved.market_cities],
    goals: saved.goals ?? "",
  };
}

/** The form's copy of a request's answers (empty for a new one). */
export function proposalValues(proposal: PartnershipProposal | null): ProposalValues {
  if (proposal === null) return { ...EMPTY_MARKETS, title: "", summary: "" };
  const answers = proposal.answers;
  return {
    title: answers.title ?? "",
    interests: [...answers.interests],
    market_scope: answers.market_scope ?? "",
    market_countries: [...answers.market_countries],
    market_cities: [...answers.market_cities],
    summary: answers.summary ?? "",
  };
}

type Scope = CreateSponsorPartnershipProposalRequestMarketScope;

const text = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};
const scope = (value: string) => (value === "" ? null : (value as Scope));
const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * The fields that differ from `before`, in the API's shape: "" becomes `null`
 * (cleared). Only changed fields are sent, so a value another member saved
 * meanwhile is never written back from this copy (the revision also guards it).
 */
function changed<V extends Record<string, string | string[]>>(
  values: V,
  before: V,
  fields: readonly (keyof V & string)[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    const now = values[field];
    const then = before[field];
    if (Array.isArray(now) && Array.isArray(then)) {
      if (!same(now, then)) patch[field] = [...now];
    } else if (now !== then) {
      patch[field] = field === "market_scope" ? scope(now as string) : text(now as string);
    }
  }
  return patch;
}

export const preferencesPatch = (values: PreferencesValues, before: PreferencesValues) =>
  changed(values, before, PREFERENCE_FIELDS) as PreferencesPatch;

export const proposalPatch = (values: ProposalValues, before: ProposalValues) =>
  changed(values, before, PROPOSAL_FIELDS) as ProposalAnswersPatch;

/** Every non-empty answer of a new request (the create body). */
export const draftInput = (values: ProposalValues) => proposalPatch(values, proposalValues(null));
