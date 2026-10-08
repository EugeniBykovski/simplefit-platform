import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, within } from "storybook/test";

import { SiteFrame } from "@/widgets/site-header";

/*
 * The public website shell (SF-42): the header and footer every
 * public-website artboard shares (Claude Design 1791448557-b0b9: L1–L5,
 * PR1–PR6, SPX1–SPX2, O02w), as the site layout renders them.
 *
 * Pages are built by their own tickets, so the body here is a stand-in of the
 * artboard's content height: header, body and footer then sit exactly where
 * the artboard draws them (for example L2 · 1440 × 1820: header 0–76, footer
 * 1630–1820). The current page's header item comes from the route.
 */
export default {
  title: "Public Website/Shell",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

/** Header 76 + footer 190: the artboard height minus both is its content height. */
const SHELL_HEIGHT = 76 + 190;

function shellStory(artboardHeight: number, pathname: string, query?: Record<string, string>) {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname, query } } },
    render: () => (
      <SiteFrame>
        {/* Stand-in for the page body: the artboard's content height, nothing drawn. */}
        <div data-page-body style={{ height: artboardHeight - SHELL_HEIGHT }} />
      </SiteFrame>
    ),
  } satisfies StoryObj;
}

/** L1 LandHome · 1440 × 2180: no current item. */
export const Home: StoryObj = { name: "Home (L1) · 1440", ...shellStory(2180, "/en") };

/** L2 LandFighters · 1440 × 1820: Fighters is the current item. */
export const Fighters: StoryObj = {
  name: "For fighters (L2) · 1440",
  ...shellStory(1820, "/en/fighters"),
};

/** PR4 PricingEnterprise · 1440 × 1280: Enterprise, the `?role=enterprise` state of /pricing. */
export const Enterprise: StoryObj = {
  name: "Enterprise (PR4) · 1440",
  ...shellStory(1280, "/en/pricing", { role: "enterprise" }),
};

/** SPX2 BecomeSponsor · 1440 × 900: Partners; the whole frame fits the window. */
export const BecomeSponsor: StoryObj = {
  name: "Become a sponsor (SPX2) · 1440 × 900",
  ...shellStory(900, "/en/partners/apply"),
};

/** A window taller than the page: the composition keeps its height; the footer band continues below. */
export const TallWindow: StoryObj = {
  name: "Taller window · 1440 × 1080",
  ...shellStory(900, "/en/partners/apply"),
  globals: { viewport: { value: "wide", isRotated: false } },
};

/** Wider than the designed frame: the same composition, fluid; the brand and actions keep their 64 px gutters. */
export const Wide: StoryObj = {
  name: "Wide · 1920",
  ...shellStory(1820, "/en/fighters"),
  globals: { viewport: { value: "wide", isRotated: false } },
};

/** Tablet (768): the site links move into the menu sheet; Sign in and Get started stay. */
export const Tablet: StoryObj = {
  name: "Tablet · 768",
  ...shellStory(1820, "/en/fighters"),
  globals: { viewport: { value: "tablet", isRotated: false } },
};

/** Phone (390): brand, language, theme and the menu; everything else is in the menu. */
export const Phone: StoryObj = {
  name: "Phone · 390",
  ...shellStory(1820, "/en/fighters"),
  globals: { viewport: { value: "phone", isRotated: false } },
};

/** The narrowest supported width (320). */
export const Narrow: StoryObj = {
  name: "Narrow · 320",
  ...shellStory(1820, "/en/fighters"),
  globals: { viewport: { value: "narrow", isRotated: false } },
};

/** Phone with the menu open: site links (current one marked), Sign in and Get started. */
export const PhoneMenu: StoryObj = {
  name: "Phone · menu open",
  ...shellStory(1820, "/en/fighters"),
  globals: { viewport: { value: "phone", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog");
    const menu = within(dialog).getByRole("navigation", { name: "Site" });
    await expect(within(menu).getByRole("link", { name: "Fighters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(within(menu).getByRole("link", { name: "Get started" })).toBeVisible();
  },
};
