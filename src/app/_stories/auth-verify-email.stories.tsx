import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { VerifyEmailScreen } from "@/widgets/auth-screens";
import { SiteFrame } from "@/widgets/site-header";

import { apiError, installApi, ok } from "./auth-story-api";

/*
 * WA4b, the E01 link result (WebEmailVerified.dc.html: verified, already,
 * expired), plus the production verifying and network-error states the
 * design does not draw. The token is read from the URL fragment and removed
 * at once; nothing here creates a session.
 */
export default {
  title: "Authentication/Verify Email",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

function linkStory(answer: Parameters<typeof installApi>[0][string], token = true): StoryObj {
  return {
    // As the route renders it: the web.site chrome around the screen.
    render: () => (
      <SiteFrame>
        <VerifyEmailScreen />
      </SiteFrame>
    ),
    beforeEach: () => {
      const { pathname, search } = window.location;
      if (token) window.history.replaceState(null, "", `${pathname}${search}#token=sfl_storybook`);
      return installApi({ "/api/auth/email/verification-links/verify": answer });
    },
  };
}

export const Verified = linkStory(ok({ status: "verified" }));
export const AlreadyVerified = linkStory(ok({ status: "already_verified" }));
export const Expired = linkStory(apiError(422, "code_expired"));
export const MissingToken = linkStory(ok({ status: "verified" }), false);
export const Verifying = linkStory("pending");
export const NetworkError = linkStory(apiError(503, "service_unavailable"));
export const Phone: StoryObj = {
  ...linkStory(ok({ status: "verified" })),
  globals: { viewport: { value: "phone", isRotated: false } },
};
