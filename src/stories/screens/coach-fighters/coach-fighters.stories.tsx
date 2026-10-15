import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { CoachGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { CoachFighterDetail, CoachFighters } from "@/widgets/coach-fighters";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import deCoachFighters from "../../../../messages/de/coachFighters.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The Coach fighters (SF-58; Claude Design 1792056621-3707: WC7, WC4,
 * CoachWebNav): the route's own composition (session gate, Coach gate, Coach
 * shell, screen) on a deterministic stand-in of the SF-56 / SF-57 backend
 * (`fetch` is replaced per story; nothing reaches an API). Names and
 * addresses are Storybook fixtures, not accounts.
 */

const ENTRY = {
  entry: {
    destination: "coach_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: "coach",
    account_registration: "complete",
    fighter_profile: "not_started",
    coach_profile: "completed",
    capabilities: ["COACH"],
  },
};

const fighter = (id: string, name: string, username: string, extra = {}) => ({
  relationship_id: id,
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "storybook-disclosure",
  disclosed_fields: [
    "display_name",
    "username",
    "country_code",
    "city",
    "experience_level",
    "stance",
    "amateur_bout_count",
  ],
  fighter: {
    display_name: name,
    username,
    country_code: "PL",
    city: "Warsaw",
    experience_level: "amateur",
    stance: "orthodox",
    amateur_bout_count: 12,
  },
  fighter_display_name_at_end: null,
  ...extra,
});

const ACTIVE = [
  fighter("rel-1", "Alex K.", "alex_k"),
  fighter("rel-2", "Maja Nowak", "maja_boxes", {
    disclosed_fields: ["display_name", "username", "stance"],
    fighter: {
      display_name: "Maja Nowak",
      username: "maja_boxes",
      country_code: null,
      city: null,
      experience_level: null,
      stance: "southpaw",
      amateur_bout_count: null,
    },
  }),
  fighter("rel-3", "Oleksandr Petrenko-Kowalczyk", "sasha_pk", {
    fighter: {
      display_name: "Oleksandr Petrenko-Kowalczyk",
      username: "sasha_pk",
      country_code: "UA",
      city: "Kharkiv",
      experience_level: "competitive_amateur",
      stance: "switch",
      amateur_bout_count: 41,
    },
  }),
];

const ENDED = [
  {
    ...fighter("rel-9", "", ""),
    status: "ended",
    ended_at: "2026-10-02T10:00:00Z",
    ended_by: "fighter",
    disclosed_fields: [],
    fighter: null,
    fighter_display_name_at_end: "Sam R.",
  },
];

const invitation = (id: string, email: string, status: string, extra = {}) => ({
  invitation_id: id,
  status,
  recipient_email: email,
  message: null,
  created_at: "2026-10-10T10:00:00Z",
  expires_at: "2026-10-24T10:00:00Z",
  last_sent_at: "2026-10-10T10:00:00Z",
  resends_remaining: status === "pending" ? 2 : 0,
  responded_at: status === "pending" || status === "expired" ? null : "2026-10-12T10:00:00Z",
  ...extra,
});

const INVITATIONS = [
  invitation("inv-1", "j•••@example.com", "pending"),
  invitation("inv-2", "a•••@example.com", "accepted"),
  invitation("inv-3", "t•••@example.com", "expired", { expires_at: "2026-10-08T10:00:00Z" }),
];

const RULES = ok({
  data_rules: { document_version: "storybook-rules", acknowledged_at: "2026-10-01T10:00:00Z" },
});
const NO_RULES = ok({ data_rules: { document_version: null, acknowledged_at: null } });

function story({
  screen = "roster",
  view = "active",
  roster = ok({ relationships: ACTIVE, next_cursor: null }),
  invitations = ok({ invitations: INVITATIONS, next_cursor: null }),
  detail = ok({ relationship: ACTIVE[0] }),
  rules = RULES,
  extra = {},
  play,
}: {
  screen?: "roster" | "detail";
  view?: "active" | "ended";
  roster?: Answer | Answer[];
  invitations?: Answer | Answer[];
  detail?: Answer;
  rules?: Answer;
  extra?: Record<string, Answer | Answer[]>;
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: {
          pathname: screen === "roster" ? "/en/app/coach/fighters" : "/en/app/coach/fighters/rel-1",
        },
      },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(ENTRY),
        "/api/v1/me/coach/fighters": roster,
        "/api/v1/me/coach/fighters/rel-1": detail,
        "/api/v1/me/coach/invitations": invitations,
        "/api/v1/me/coach/data-rules": rules,
        ...extra,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <CoachGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <WorkspaceShell shell="web.app.coach">
            {screen === "roster" ? (
              <CoachFighters view={view} />
            ) : (
              <CoachFighterDetail relationshipId="rel-1" />
            )}
          </WorkspaceShell>
        </CoachGate>
      </RequireSession>
    ),
    play,
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
      messages={{ ...messages, coachFighters: deCoachFighters, shells: deShells }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Coach Fighters/Roster and Fighter",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 5000 };
const body = () => within(document.body);
const rosterReady = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("table", { name: "Active fighters" }, T);
const openInvite = async (canvasElement: HTMLElement) => {
  await rosterReady(canvasElement);
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Invite fighter" }));
};

/* ── WC7 roster ─────────────────────────────────────────────────────── */

export const Roster = story({
  play: async ({ canvasElement }) => {
    const table = await rosterReady(canvasElement);
    await expect(within(table).getAllByText("Not shared").length).toBeGreaterThan(0);
  },
});
Roster.name = "WC7 · active roster and invitations";

export const Ended = story({
  view: "ended",
  roster: ok({ relationships: ENDED, next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("table", { name: "Ended relationships" }, T);
  },
});
Ended.name = "WC7 · ended relationships";

export const MorePages = story({
  roster: [
    ok({ relationships: ACTIVE.slice(0, 2), next_cursor: "c2" }),
    ok({ relationships: ACTIVE.slice(2), next_cursor: null }),
  ],
  play: async ({ canvasElement }) => {
    await rosterReady(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Show more" }));
    await within(canvasElement).findByText("Oleksandr Petrenko-Kowalczyk", {}, T);
  },
});
MorePages.name = "WC7 · show more (cursor)";

export const Loading = story({ roster: "pending", invitations: "pending" });
Loading.name = "WC7 · loading";

export const Empty = story({
  roster: ok({ relationships: [], next_cursor: null }),
  invitations: ok({ invitations: [], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No fighters yet", {}, T);
  },
});
Empty.name = "WC7 · empty (real)";

export const Unavailable = story({
  roster: apiError(404, "not_found"),
  invitations: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Fighters aren’t available yet", {}, T);
    await expect(
      within(canvasElement).getByRole("button", { name: "Invite fighter" }),
    ).toBeDisabled();
  },
});
Unavailable.name = "WC7 · sharing not available (404)";

export const Failure = story({
  roster: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("We couldn’t load your fighters.", {}, T);
  },
});
Failure.name = "WC7 · backend failure (recoverable)";

/* ── Invitations ────────────────────────────────────────────────────── */

export const InviteComposer = story({
  play: async ({ canvasElement }) => {
    await openInvite(canvasElement);
    await body().findByRole("dialog", { name: "Invite a fighter" }, T);
  },
});
InviteComposer.name = "Invite · composer";

export const InvitePending = story({
  extra: {
    "POST /api/v1/me/coach/invitations": ok(
      { invitation: invitation("inv-new", "n•••@example.com", "pending") },
      201,
    ),
  },
  play: async ({ canvasElement }) => {
    await openInvite(canvasElement);
    const dialog = await body().findByRole("dialog", { name: "Invite a fighter" }, T);
    await userEvent.type(within(dialog).getByLabelText("Email"), "new.fighter@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    await body().findByText("Invitation pending", {}, T);
  },
});
InvitePending.name = "Invite · pending (created or already pending)";

export const InviteInvalid = story({
  play: async ({ canvasElement }) => {
    await openInvite(canvasElement);
    const dialog = await body().findByRole("dialog", { name: "Invite a fighter" }, T);
    await userEvent.type(within(dialog).getByLabelText("Email"), "not-an-address");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    await within(dialog).findByText("Enter a valid email address.", {}, T);
  },
});
InviteInvalid.name = "Invite · invalid address";

export const InviteLimited = story({
  extra: {
    "POST /api/v1/me/coach/invitations": apiError(429, "rate_limited", { "retry-after": "600" }),
  },
  play: async ({ canvasElement }) => {
    await openInvite(canvasElement);
    const dialog = await body().findByRole("dialog", { name: "Invite a fighter" }, T);
    await userEvent.type(within(dialog).getByLabelText("Email"), "new.fighter@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    await within(dialog).findByRole("alert", {}, T);
  },
});
InviteLimited.name = "Invite · rate limited";

export const InviteBlocked = story({
  rules: NO_RULES,
  play: async ({ canvasElement }) => {
    await openInvite(canvasElement);
    await body().findByRole("dialog", { name: "Inviting isn’t available yet" }, T);
  },
});
InviteBlocked.name = "Invite · blocked (data rules not published)";

export const CancelInvitation = story({
  play: async ({ canvasElement }) => {
    await rosterReady(canvasElement);
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: /Cancel the invitation/ }, T),
    );
    await body().findByRole("alertdialog", { name: "Cancel this invitation?" }, T);
  },
});
CancelInvitation.name = "Invitation · cancel confirmation";

/* ── WC4 one fighter ────────────────────────────────────────────────── */

export const Fighter = story({
  screen: "detail",
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { level: 1, name: "Alex K." }, T);
  },
});
Fighter.name = "WC4 · active relationship";

export const FighterPartlyShared = story({
  screen: "detail",
  detail: ok({ relationship: { ...ACTIVE[1], relationship_id: "rel-1" } }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { level: 1, name: "Maja Nowak" }, T);
  },
});
FighterPartlyShared.name = "WC4 · fields not shared";

export const EndConfirm = story({
  screen: "detail",
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { level: 1, name: "Alex K." }, T);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "End relationship" }));
    await body().findByRole("alertdialog", { name: "End your relationship with Alex K.?" }, T);
  },
});
EndConfirm.name = "WC4 · end confirmation";

export const EndFailed = story({
  screen: "detail",
  extra: { "POST /api/v1/me/coach/fighters/rel-1/end": apiError(503, "service_unavailable") },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { level: 1, name: "Alex K." }, T);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "End relationship" }));
    const dialog = await body().findByRole("alertdialog", {}, T);
    await userEvent.click(within(dialog).getByRole("button", { name: "End relationship" }));
    await within(dialog).findByText(/Nothing changed/, {}, T);
  },
});
EndFailed.name = "WC4 · end failed";

export const FighterUnavailable = story({
  screen: "detail",
  detail: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("This fighter isn’t available", {}, T);
  },
});
FighterUnavailable.name = "WC4 · not available (404)";

export const EndUnavailable = story({
  screen: "detail",
  extra: { "POST /api/v1/me/coach/fighters/rel-1/end": apiError(404, "not_found") },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { level: 1, name: "Alex K." }, T);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "End relationship" }));
    const dialog = await body().findByRole("alertdialog", {}, T);
    await userEvent.click(within(dialog).getByRole("button", { name: "End relationship" }));
    await body().findByText(/This relationship is no longer available/, {}, T);
  },
});
EndUnavailable.name = "WC4 · end answered 404 (no longer available)";

/* ── Locale ─────────────────────────────────────────────────────────── */

export const RosterGerman: StoryObj = {
  ...story(),
  decorators: [
    (Story) => (
      <German>
        <Story />
      </German>
    ),
  ],
};
RosterGerman.name = "WC7 · German (longest labels)";
