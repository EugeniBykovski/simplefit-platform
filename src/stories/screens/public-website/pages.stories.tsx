import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";

import {
  CoachesPage,
  FightersPage,
  GymsPage,
  HomePage,
  MarketplacePage,
  PartnersApplyPage,
  PartnersPage,
  PlanComparePage,
  PricingPage,
  WhiteLabelPage,
} from "@/widgets/public-site";
import { SiteFrame } from "@/widgets/site-header";

/*
 * The public website pages (SF-43), each as its route renders it: the
 * production page component inside the SF-42 site frame, at the Claude Design
 * web frame (1440). Artboards: L1–L5 (LandHome, LandFighters, LandCoaches,
 * LandGyms, LandMarket), PR1–PR4 (PricingPublic, PricingFighter, PricingGym,
 * PricingEnterprise, the `?role=` states of /pricing), PR5 WhiteLabel, PR6
 * PlanCompare, SPX1 PartnersLanding and SPX2 BecomeSponsor.
 *
 * The pages flow from the top of `main` and the footer follows them; the
 * artboards' fixed frame heights include empty space above the footer that a
 * page does not reproduce.
 */
export default {
  title: "Public Website/Pages",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

function page(pathname: string, body: ReactNode, query?: Record<string, string>): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname, query } } },
    render: () => <SiteFrame>{body}</SiteFrame>,
  };
}

export const Home: StoryObj = { name: "Home (L1)", ...page("/en", <HomePage />) };

export const Fighters: StoryObj = {
  name: "For fighters (L2)",
  ...page("/en/fighters", <FightersPage />),
};

export const Coaches: StoryObj = {
  name: "For coaches (L3)",
  ...page("/en/coaches", <CoachesPage />),
};

export const Gyms: StoryObj = { name: "For gyms (L4)", ...page("/en/gyms", <GymsPage />) };

export const Marketplace: StoryObj = {
  name: "Marketplace (L5)",
  ...page("/en/marketplace", <MarketplacePage />),
  play: async ({ canvasElement }) => {
    const search = within(canvasElement).getByRole("search");
    await expect(within(search).getByRole("button", { name: "Search" })).toBeDisabled();
  },
};

export const PricingCoach: StoryObj = {
  name: "Pricing · Coach (PR1)",
  ...page("/en/pricing", <PricingPage audience="coach" billing="monthly" />),
  play: async ({ canvasElement }) => {
    const roles = within(canvasElement).getByRole("navigation", { name: "Plans for" });
    await expect(within(roles).getByRole("link", { name: "Coach" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

export const PricingCoachAnnual: StoryObj = {
  name: "Pricing · Coach · Annual (PR1)",
  ...page("/en/pricing", <PricingPage audience="coach" billing="annual" />, { billing: "annual" }),
};

export const PricingFighter: StoryObj = {
  name: "Pricing · Fighter (PR2)",
  ...page("/en/pricing", <PricingPage audience="fighter" billing="monthly" />, { role: "fighter" }),
};

export const PricingFighterAnnual: StoryObj = {
  name: "Pricing · Fighter · Annual (PR2)",
  ...page("/en/pricing", <PricingPage audience="fighter" billing="annual" />, {
    role: "fighter",
    billing: "annual",
  }),
};

export const PricingGym: StoryObj = {
  name: "Pricing · Gym (PR3)",
  ...page("/en/pricing", <PricingPage audience="gym" billing="monthly" />, { role: "gym" }),
};

export const PricingEnterprise: StoryObj = {
  name: "Pricing · Enterprise (PR4)",
  ...page("/en/pricing", <PricingPage audience="enterprise" billing="monthly" />, {
    role: "enterprise",
  }),
  play: async ({ canvasElement }) => {
    const form = within(canvasElement).getByRole("form", { name: "Talk to Sales" });
    await expect(within(form).getByRole("button", { name: "Talk to Sales" })).toBeDisabled();
  },
};

export const WhiteLabel: StoryObj = {
  name: "White label (PR5)",
  ...page("/en/white-label", <WhiteLabelPage />),
};

export const PlanCompare: StoryObj = {
  name: "Plan comparison (PR6)",
  ...page("/en/pricing/compare", <PlanComparePage />),
};

export const Partners: StoryObj = {
  name: "Partners (SPX1)",
  ...page("/en/partners", <PartnersPage />),
};

export const BecomeSponsor: StoryObj = {
  name: "Become a sponsor (SPX2)",
  ...page("/en/partners/apply", <PartnersApplyPage />),
};

/** Wider than the designed frame: the same composition, fluid between the 64 px gutters. */
export const HomeWide: StoryObj = {
  name: "Home · Wide · 1920",
  ...page("/en", <HomePage />),
  globals: { viewport: { value: "wide", isRotated: false } },
};

/** Tablet (768): the heroes stack, the card grids go to two columns. */
export const HomeTablet: StoryObj = {
  name: "Home · Tablet · 768",
  ...page("/en", <HomePage />),
  globals: { viewport: { value: "tablet", isRotated: false } },
};

/** Phone (390): one column; display headings step down to the section size. */
export const HomePhone: StoryObj = {
  name: "Home · Phone · 390",
  ...page("/en", <HomePage />),
  globals: { viewport: { value: "phone", isRotated: false } },
};

export const PricingPhone: StoryObj = {
  name: "Pricing · Coach · Phone · 390",
  ...page("/en/pricing", <PricingPage audience="coach" billing="monthly" />),
  globals: { viewport: { value: "phone", isRotated: false } },
};

/** The comparison table scrolls inside its card at narrow widths; the page itself never does. */
export const PlanCompareNarrow: StoryObj = {
  name: "Plan comparison · Narrow · 320",
  ...page("/en/pricing/compare", <PlanComparePage />),
  globals: { viewport: { value: "narrow", isRotated: false } },
};
