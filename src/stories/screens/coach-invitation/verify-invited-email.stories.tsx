import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import deCoachInvitation from "../../../../messages/de/coachInvitation.json";
import deEmailIdentityLink from "../../../../messages/de/emailIdentityLink.json";
import { resetPendingCoachInvitationForTests } from "@/entities/pending-coach-invitation";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { AuthMinimalFrame } from "@/widgets/auth-screens";
import { CoachInvitation } from "@/widgets/coach-invitation";

/*
 * SF-78: verifying the invited email from WFI1 (Claude Design 1792666334-7310,
 * `link-*` states) on a deterministic stand-in of the SF-57 and SF-77 APIs
 * (`fetch` is replaced per story; nothing reaches an API). The production
 * page and flow render; the token, code and address are fixtures.
 */

const FIXTURE_TOKEN = `sfi_${"Storybook0".repeat(4)}abc`;
const FIXTURE_EMAIL = "fighter@example.com";
const FIXTURE_CODE = "000000";
const PREVIEW = {
  invitation: {
    coach: { display_name: "Coach Marek", brand_name: "Marek Boxing" },
    expires_at: "2026-10-30T10:00:00Z",
    message: "Saturday sparring is on — connect so I can plan with you.",
  },
  disclosure: {
    version: "storybook-disclosure",
    fields: ["display_name", "username", "country_code", "city", "experience_level", "stance"],
    never_shared: ["goals", "weight", "account_name", "date_of_birth", "email"],
  },
  document: {
    document_id: "fighter-coach-disclosure",
    version: "storybook-disclosure",
    status: "published",
    effective_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    requested_language: "en",
    language: "en",
    available_languages: ["en"],
    content_sha256: "c".repeat(64),
    title: "Storybook fixture disclosure",
    summary: "STORYBOOK FIXTURE, not a legal text.",
    checkbox: "STORYBOOK FIXTURE: I agree that {coach} sees the information listed above.",
    full: null,
  },
};
const ENTRY = ok({
  entry: {
    destination: "fighter_home",
    reason: "storybook",
    mandatory: false,
    intent: "fighter",
    context: null,
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    capabilities: ["FIGHTER"],
  },
});
const ACCEPTED = ok({ expires_in_seconds: 600, resend_after_seconds: 60 }, 202);
const LINKED = ok({
  outcome: "linked",
  email_identity: { email: FIXTURE_EMAIL, linked_at: "2026-10-22T10:00:00Z" },
});

type Step = "intro" | "typed" | "sent" | "typing" | "submitted";

function story({
  request = ACCEPTED,
  confirm = LINKED,
  list = ok({ email_identities: [] }),
  until,
  email = FIXTURE_EMAIL,
  code = FIXTURE_CODE,
  after,
}: {
  request?: Answer | Answer[];
  confirm?: Answer | Answer[];
  list?: Answer;
  /** How far the play goes. */
  until: Step;
  email?: string;
  code?: string;
  after?: (canvas: ReturnType<typeof within>) => Promise<void>;
}): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/en/invite/coach" } } },
    beforeEach: () => {
      resetPendingCoachInvitationForTests();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#token=${FIXTURE_TOKEN}`,
      );
      return installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/coach-invitations/preview": ok(PREVIEW),
        "/api/v1/me/entry": ENTRY,
        "/api/v1/me/coach-invitations/accept": apiError(403, "invitation_recipient_mismatch"),
        "/api/v1/me/email-identities/link-challenge": request,
        "/api/v1/me/email-identities/confirm-link": confirm,
        "/api/v1/me/email-identities": list,
      });
    },
    render: () => (
      <AuthMinimalFrame>
        <CoachInvitation />
      </AuthMinimalFrame>
    ),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const T = { timeout: 5000 };
      await userEvent.click(await canvas.findByRole("checkbox", {}, T));
      await userEvent.click(canvas.getByRole("button", { name: /Accept invitation|Einladung/ }));
      await userEvent.click(
        await canvas.findByRole("button", { name: /Verify the invited email|bestätigen/ }, T),
      );
      if (until !== "intro") {
        await userEvent.type(await canvas.findByRole("textbox", {}, T), email);
      }
      if (until === "sent" || until === "typing" || until === "submitted") {
        await userEvent.click(canvas.getByRole("button", { name: /Send code|Code senden/ }));
        const field = await canvas.findByLabelText(/6-digit code|6-stelliger Code/, {}, T);
        if (until === "typing") await userEvent.type(field, code.slice(0, 4));
        if (until === "submitted") {
          await userEvent.click(field);
          await userEvent.paste(code);
        }
      }
      if (until === "typed") {
        await userEvent.click(canvas.getByRole("button", { name: /Send code|Code senden/ }));
      }
      await after?.(canvas);
    },
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

/** German copy over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{
        ...messages,
        coachInvitation: deCoachInvitation,
        emailIdentityLink: deEmailIdentityLink,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
const german: Decorator = (Story) => (
  <German>
    <Story />
  </German>
);

const meta = {
  title: "Coach Invitation/Verify invited email",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 5000 };

export const EmailEmpty = story({ until: "intro" });
EmailEmpty.name = "SF-78 · email · empty";

export const EmailPopulated = story({
  until: "intro",
  after: async (canvas) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Email address" }), FIXTURE_EMAIL);
  },
});
EmailPopulated.name = "SF-78 · email · populated";

export const EmailInvalid = story({ until: "typed", email: "fighter@example" });
EmailInvalid.name = "SF-78 · email · invalid format";

export const RequestPending = story({
  until: "typed",
  request: "pending",
  after: async (canvas) => {
    await expect(await canvas.findByRole("button", { name: "Sending…" }, T)).toBeDisabled();
  },
});
RequestPending.name = "SF-78 · email · sending";

export const RequestLimited = story({
  until: "typed",
  request: apiError(429, "rate_limited", { "retry-after": "60" }),
  after: async (canvas) =>
    void (await canvas.findByText("Too many attempts. Try again shortly.", {}, T)),
});
RequestLimited.name = "SF-78 · email · rate limited";

export const RequestNetworkError = story({
  until: "typed",
  request: "offline",
  after: async (canvas) =>
    void (await canvas.findByText(/Check your connection and try again\./, {}, T)),
});
RequestNetworkError.name = "SF-78 · email · network error";

export const CodeSent = story({ until: "sent" });
CodeSent.name = "SF-78 · code · sent";

export const CodeEntry = story({ until: "typing" });
CodeEntry.name = "SF-78 · code · typing";

export const CodeIncorrect = story({
  until: "submitted",
  confirm: apiError(422, "code_invalid"),
  after: async (canvas) =>
    void (await canvas.findAllByText(
      "That code isn’t right. Check the digits and try again.",
      {},
      T,
    )),
});
CodeIncorrect.name = "SF-78 · code · incorrect";

export const CodeExpired = story({
  until: "submitted",
  confirm: apiError(422, "code_expired"),
  after: async (canvas) => void (await canvas.findByRole("button", { name: "Send a new code" }, T)),
});
CodeExpired.name = "SF-78 · code · expired or used";

export const CodeThrottled = story({
  until: "submitted",
  confirm: apiError(429, "rate_limited", { "retry-after": "60" }),
  after: async (canvas) => void (await canvas.findByText("Resend unavailable for now", {}, T)),
});
CodeThrottled.name = "SF-78 · code · too many attempts";

// A refused confirmation refreshes once; refused again, the session ends and
// the invitation token bound to it goes too (SF-60): the page asks for the
// link again. Nothing links.
export const SessionExpired = story({
  until: "submitted",
  confirm: apiError(401, "unauthorized"),
  after: async (canvas) =>
    void (await canvas.findByRole("heading", { name: "No invitation to show" }, T)),
});
SessionExpired.name = "SF-78 · session ended during the flow (invitation dropped)";

export const OwnershipConflict = story({
  until: "submitted",
  confirm: apiError(409, "conflict"),
  after: async (canvas) =>
    void (await canvas.findByRole("button", { name: "Sign out and switch account" }, T)),
});
OwnershipConflict.name = "SF-78 · code · address belongs to another account";

export const NetworkUncertain = story({
  until: "submitted",
  confirm: "offline",
  after: async (canvas) => void (await canvas.findByRole("button", { name: "Try again" }, T)),
});
NetworkUncertain.name = "SF-78 · code · answer lost, not linked";

export const Retry = story({
  until: "submitted",
  confirm: ["offline", LINKED],
  after: async (canvas) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Try again" }, T));
    await canvas.findByRole("heading", { name: "Email verified" }, T);
  },
});
Retry.name = "SF-78 · code · retry after a lost answer";

export const Linked = story({
  until: "submitted",
  after: async (canvas) => void (await canvas.findByRole("heading", { name: "Email verified" }, T)),
});
Linked.name = "SF-78 · linked";

export const InvitationContinuation = story({
  until: "submitted",
  after: async (canvas) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Back to the invitation" }, T));
    await expect(await canvas.findByRole("checkbox", {}, T)).not.toBeChecked();
  },
});
InvitationContinuation.name = "SF-78 · back to the invitation (review again, unticked)";

export const GermanCode = {
  ...story({
    until: "submitted",
    confirm: apiError(409, "conflict"),
    after: async (canvas) =>
      void (await canvas.findByRole("button", { name: "Abmelden und Konto wechseln" }, T)),
  }),
  decorators: [german],
} satisfies StoryObj;
GermanCode.name = "SF-78 · long language (de) · conflict";

export const NarrowCode = {
  ...story({ until: "typing" }),
  globals: { viewport: { value: "narrow", isRotated: false } },
} satisfies StoryObj;
NarrowCode.name = "SF-78 · narrow 320 · code";

export const NarrowLinked = {
  ...story({
    until: "submitted",
    after: async (canvas) =>
      void (await canvas.findByRole("heading", { name: "Email verified" }, T)),
  }),
  globals: { viewport: { value: "narrow", isRotated: false } },
} satisfies StoryObj;
NarrowLinked.name = "SF-78 · narrow 320 · linked";
