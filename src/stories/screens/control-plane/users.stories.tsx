import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { AccountDetail, AccountSearch } from "@/widgets/admin-users";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * AD7 and AD8 with AD9 (SF-122; Claude Design `AdminUsers`, `AdminUserDetail`,
 * `AdminBan`, MVP) on a deterministic stand-in of the API: `fetch` is replaced per
 * story and nothing reaches a backend. The accounts are Storybook fixtures.
 */

const ID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const contexts = {
  fighter_profile: "completed",
  coach_profile: "not_started",
  gym_staff: 0,
  gym_member: 1,
  sponsor_memberships: 0,
  platform_operator: false,
};
const summary = {
  id: ID,
  name: "Natalia W.",
  joined_at: "2026-10-01T10:00:00Z",
  status: "active",
  masked_emails: ["n•••@example.com"],
  contexts,
};
const account = (overrides: Record<string, unknown> = {}) =>
  ok({
    user: {
      ...summary,
      revision: 1,
      suspension: null,
      registration: "complete",
      providers: ["email", "google"],
      sessions: [
        { started_at: "2026-11-10T09:00:00Z", expires_at: "2027-02-08T09:00:00Z" },
        { started_at: "2026-11-02T18:30:00Z", expires_at: "2027-01-31T18:30:00Z" },
      ],
      last_sign_in_at: "2026-11-10T09:00:00Z",
      ...overrides,
    },
  });
const preview = ok({
  preview: {
    action: "user.suspend",
    target: { type: "user", id: ID, status: "active" },
    expected_revision: 1,
    current_state: "active",
    proposed_state: "suspended",
    permission: null,
    impact: ["signed_out_everywhere", "sign_in_refused", "data_kept", "memberships_unchanged"],
    required_permission: "users.restrict",
    required_assurance: "fresh_key",
    reason_code: "fraud",
    confirmation: { required: true, token: "sfc_story", expires_at: "2099-01-01T00:00:00Z" },
  },
});

function story(
  routes: Record<string, Answer | Answer[]>,
  render: () => ReactNode,
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: "/en/admin/users", segments: [] } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        ...routes,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web.admin")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        {render()}
      </RequireSession>
    ),
    play,
  };
}

async function searchFor(canvasElement: HTMLElement, query: string) {
  const canvas = within(canvasElement);
  await userEvent.type(
    await canvas.findByRole("textbox", { name: /Exact email or user ID/ }, { timeout: 5000 }),
    query,
  );
  await userEvent.click(canvas.getByRole("combobox", { name: /Reason/ }));
  await userEvent.click(
    await within(document.body).findByRole("option", { name: "Support request" }),
  );
  await userEvent.click(canvas.getByRole("button", { name: "Search" }));
}

export const SearchIdle = story({}, () => <AccountSearch />);
SearchIdle.name = "AD7 · idle";

export const SearchResult = story(
  { "/api/v1/admin/users": ok({ users: [summary] }) },
  () => <AccountSearch />,
  async ({ canvasElement }) => {
    await searchFor(canvasElement, "natalia@example.com");
    await expect(
      await within(canvasElement).findByRole("link", { name: "Natalia W." }),
    ).toBeVisible();
  },
);
SearchResult.name = "AD7 · result";

export const SearchNoMatch = story(
  { "/api/v1/admin/users": ok({ users: [] }) },
  () => <AccountSearch />,
  async ({ canvasElement }) => {
    await searchFor(canvasElement, "nobody@example.com");
    await expect(await within(canvasElement).findByText("No account matches")).toBeVisible();
  },
);
SearchNoMatch.name = "AD7 · no match";

export const SearchRestricted = story(
  { "/api/v1/admin/users": apiError(403, "forbidden") },
  () => <AccountSearch />,
  async ({ canvasElement }) => {
    await searchFor(canvasElement, "natalia@example.com");
    await expect(
      await within(canvasElement).findByText("You don’t have access to this section"),
    ).toBeVisible();
  },
);
SearchRestricted.name = "AD7 · restricted";

export const SearchError = story(
  { "/api/v1/admin/users": apiError(500, "internal_error") },
  () => <AccountSearch />,
  async ({ canvasElement }) => {
    await searchFor(canvasElement, "natalia@example.com");
    await expect(await within(canvasElement).findByText("We couldn’t load this")).toBeVisible();
  },
);
SearchError.name = "AD7 · error";

const detail = (
  answer: Answer,
  play?: StoryObj["play"],
  extra: Record<string, Answer | Answer[]> = {},
) =>
  story(
    { [`/api/v1/admin/users/${ID}`]: answer, ...extra },
    () => <AccountDetail accountId={ID} initialReason="support_request" />,
    play ??
      (async ({ canvasElement }) => {
        await expect(
          await within(canvasElement).findByRole(
            "heading",
            { name: /Natalia W\./ },
            { timeout: 5000 },
          ),
        ).toBeVisible();
      }),
  );

export const AccountActive = detail(account());
AccountActive.name = "AD8 · ready (active)";

export const AccountSuspended = detail(
  account({
    status: "suspended",
    revision: 2,
    suspension: { since: "2026-11-10T10:00:00Z", reason_code: "fraud" },
  }),
);
AccountSuspended.name = "AD8 · suspended";

export const AccountOperator = detail(
  account({ contexts: { ...contexts, platform_operator: true } }),
);
AccountOperator.name = "AD8 · a platform operator (protected)";

export const AccountReason = story({ [`/api/v1/admin/users/${ID}`]: account() }, () => (
  <AccountDetail accountId={ID} initialReason={null} />
));
AccountReason.name = "AD8 · reason first";

export const AccountNotFound = detail(apiError(404, "not_found"), async ({ canvasElement }) => {
  await expect(
    await within(canvasElement).findByText("No such account", {}, { timeout: 5000 }),
  ).toBeVisible();
});
AccountNotFound.name = "AD8 · not found";

export const SuspendPreview = detail(
  account(),
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Suspend account" }, { timeout: 5000 }),
    );
    const box = await within(document.body).findByRole("dialog");
    await userEvent.click(within(box).getByRole("combobox", { name: /Reason/ }));
    await userEvent.click(await within(document.body).findByRole("option", { name: "Fraud" }));
    await userEvent.click(within(box).getByRole("button", { name: "Review" }));
    await expect(await within(box).findByRole("button", { name: "Confirm" })).toBeVisible();
  },
  { [`POST /api/v1/admin/users/${ID}/suspend/preview`]: preview },
);
SuspendPreview.name = "AD9 · suspend: confirm";

export const SuspendConflict = detail(
  account(),
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Suspend account" }, { timeout: 5000 }),
    );
    const box = await within(document.body).findByRole("dialog");
    await userEvent.click(within(box).getByRole("combobox", { name: /Reason/ }));
    await userEvent.click(await within(document.body).findByRole("option", { name: "Fraud" }));
    await userEvent.click(within(box).getByRole("button", { name: "Review" }));
    await expect(await within(box).findByRole("alert")).toBeVisible();
  },
  { [`POST /api/v1/admin/users/${ID}/suspend/preview`]: apiError(409, "revision_conflict") },
);
SuspendConflict.name = "AD9 · conflict";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Users",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
