import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { TrustSafetyUnavailable } from "@/widgets/admin-trust-safety";

/*
 * AD4 Moderation and AD11 Enforcement (SF-125; Claude Design `AdminModeration`,
 * `AdminEnforcement`, FUTURE): the truthful "not available" screens. No API call and no
 * data: no reports, content or enforcement domain exists (simplefit-api D-SA32).
 */

const story = (area: "moderation" | "enforcement", heading: string): StoryObj => ({
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: `/en/admin/${area}`, segments: [] } },
  },
  render: () => <TrustSafetyUnavailable area={area} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("heading", { level: 2, name: heading }),
    ).toBeVisible();
  },
});

export const ModerationUnavailable = story(
  "moderation",
  "Moderation isn’t part of the Control Plane yet",
);
ModerationUnavailable.name = "AD4 · not available";

export const EnforcementUnavailable = story(
  "enforcement",
  "Enforcement and appeals aren’t part of the Control Plane yet",
);
EnforcementUnavailable.name = "AD11 · not available";

const meta = {
  title: "Control Plane/Trust and safety",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
