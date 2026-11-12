import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { ConfigurationPage } from "@/widgets/admin-configuration";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * SF-128 feature switches (AD6 reduced) on a deterministic stand-in of the API: `fetch`
 * is replaced per story and nothing reaches a backend. The registry mirrors the backend's
 * real switches; values and history are Storybook fixtures.
 */

const NOW = "2026-11-12T12:00:00Z";
const IDS = {
  member: "0e7c4d0a-5b1f-4d7e-9a2b-3c4d5e6f7a8b",
  staff: "1e7c4d0a-5b1f-4d7e-9a2b-3c4d5e6f7a8b",
  emails: "2e7c4d0a-5b1f-4d7e-9a2b-3c4d5e6f7a8b",
  uploads: "3e7c4d0a-5b1f-4d7e-9a2b-3c4d5e6f7a8b",
};

const suspendable = (
  key: string,
  id: string,
  variable: string,
  consumer: string,
  decision: string,
  overrides: Record<string, unknown> = {},
) => ({
  key,
  group: key.startsWith("gym") ? "gyms" : "sponsors",
  variable,
  consumer,
  control: "suspendable",
  risk: "medium",
  decision,
  impact: [],
  deployment_value: true,
  suspended: false,
  effective: true,
  flag_id: id,
  revision: 1,
  updated_at: NOW,
  ...overrides,
});

const fixed = (
  key: string,
  group: string,
  variable: string,
  consumer: string,
  control: string,
  risk: string,
  decision: string,
  value: boolean | string,
) => ({
  key,
  group,
  variable,
  consumer,
  control,
  risk,
  decision,
  impact: [],
  deployment_value: value,
  suspended: false,
  effective: value,
  flag_id: null,
  revision: null,
  updated_at: null,
});

const registry = (overrides: Record<string, Record<string, unknown>> = {}) => [
  suspendable(
    "gym.member_invitations",
    IDS.member,
    "GYM_MEMBER_INVITATIONS",
    "SimpleFit.Gyms.MemberInvitations.delivery_enabled?/0",
    "SF-95",
    overrides.member,
  ),
  suspendable(
    "gym.staff_invitations",
    IDS.staff,
    "GYM_STAFF_INVITATIONS",
    "SimpleFit.Gyms.StaffInvitations.delivery_enabled?/0",
    "SF-133",
    overrides.staff,
  ),
  suspendable(
    "sponsor.application_emails",
    IDS.emails,
    "SPONSOR_APPLICATION_EMAILS",
    "SimpleFit.Sponsors.ApplicationNotifications.enabled?/0",
    "SF-114",
    overrides.emails,
  ),
  suspendable(
    "sponsor.evidence_uploads",
    IDS.uploads,
    "SPONSOR_EVIDENCE_UPLOADS",
    "SimpleFit.Sponsors.Evidence.enabled?/0",
    "D-SA09",
    overrides.uploads,
  ),
  fixed(
    "coaching.access",
    "coaching",
    "COACHING_ACCESS_ENABLED",
    "SimpleFit.Coaching.access_enabled?/0",
    "read_only",
    "high",
    "ADR 0021",
    false,
  ),
  fixed(
    "stripe.billing",
    "payments",
    "STRIPE_BILLING_ENABLED",
    "SimpleFit.Billing.Stripe.Config.status/0",
    "read_only",
    "high",
    "SF-138",
    false,
  ),
  fixed(
    "stripe.mode",
    "payments",
    "STRIPE_MODE",
    "SimpleFit.Billing.Stripe.Config.status/0",
    "read_only",
    "high",
    "SF-138",
    "test",
  ),
  fixed(
    "stripe.connect",
    "payments",
    "STRIPE_CONNECT_ENABLED",
    "SimpleFit.Billing.Stripe.Config.status/0",
    "read_only",
    "high",
    "SF-102",
    false,
  ),
  fixed(
    "api.docs",
    "platform",
    "API_DOCS_ENABLED",
    "SimpleFitWeb.Router (compiled)",
    "build",
    "medium",
    "CLAUDE.md §15",
    false,
  ),
];

const configuration = (environment = "staging", flags = registry(), changes: unknown[] = []) =>
  ok({ configuration: { environment, observed_at: NOW, flags, changes } });

const HISTORY = [
  {
    key: "gym.member_invitations",
    revision: 3,
    change: "restore",
    suspended: false,
    previous_suspended: true,
    operator_id: IDS.staff,
    reason_code: "incident_resolved",
    changed_at: NOW,
  },
  {
    key: "gym.member_invitations",
    revision: 2,
    change: "suspend",
    suspended: true,
    previous_suspended: false,
    operator_id: IDS.staff,
    reason_code: "incident_response",
    changed_at: "2026-11-12T10:00:00Z",
  },
];

const PREVIEW = ok({
  preview: {
    action: "config.flag.suspend",
    target: { type: "runtime_flag", id: IDS.member, status: "active" },
    expected_revision: 1,
    current_state: "active",
    proposed_state: "suspended",
    permission: null,
    impact: [
      "new_member_invitation_emails_stop",
      "sent_invitations_unchanged",
      "deployment_enabled",
      "effective_next_check_every_instance",
      "not_retroactive",
    ],
    required_permission: "config.flags.write",
    required_assurance: "fresh_key",
    reason_code: "incident_response",
    confirmation: { required: true, token: "sfc_story", expires_at: NOW },
  },
});

const operator = (permissions: string[]) =>
  ok({
    operator: {
      id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: {
        verified_at: "2026-11-12T11:00:00Z",
        expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
        fresh_seconds_remaining: 300,
      },
      enrollment_expires_at: null,
      activated_at: "2026-11-09T10:00:00Z",
    },
  });

const READ = ["config.read"];
const WRITE = ["config.read", "config.flags.write"];
const PATH = "/api/v1/admin/configuration";

function story(
  permissions: string[],
  routes: Record<string, Answer | Answer[]>,
  text: string,
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: "/en/admin/flags", segments: [] } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/admin/me": operator(permissions),
        ...routes,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web.admin")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <ConfigurationPage />
      </RequireSession>
    ),
    play:
      play ??
      (async ({ canvasElement }) => {
        await expect(
          await within(canvasElement).findByText(text, {}, { timeout: 5000 }),
        ).toBeVisible();
      }),
  };
}

async function openSuspend(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole(
      "button",
      { name: "Suspend Gym member invitation emails (E07)" },
      { timeout: 5000 },
    ),
  );
  const body = within(canvasElement.ownerDocument.body);
  const dialog = await body.findByRole("dialog");
  await userEvent.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
  await userEvent.click(await body.findByRole("option", { name: "Incident response" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Review the change" }));
  return { body, dialog };
}

export const ReadOnly = story(
  READ,
  { [PATH]: configuration() },
  "Suspending or restoring needs configuration write access.",
);
ReadOnly.name = "AD6 · read-only operator (no controls)";

export const Editable = story(
  WRITE,
  { [PATH]: configuration() },
  "Gym member invitation emails (E07)",
);
Editable.name = "AD6 · editable switches; high-risk read-only";

export const Suspended = story(
  WRITE,
  {
    [PATH]: configuration(
      "production",
      registry({ member: { suspended: true, effective: false, revision: 2 } }),
      HISTORY,
    ),
  },
  "Suspended",
);
Suspended.name = "AD6 · production, one switch suspended, history";

export const DeploymentOff = story(
  WRITE,
  {
    [PATH]: configuration(
      "development",
      registry({ staff: { deployment_value: false, effective: false } }),
    ),
  },
  "Gym staff invitation emails (E06)",
);
DeploymentOff.name = "AD6 · deployment left a switch off (restore can't enable it)";

export const Preview = story(
  WRITE,
  { [PATH]: configuration(), [`${PATH}/flags/${IDS.member}/suspend/preview`]: PREVIEW },
  "",
  async ({ canvasElement }) => {
    const { dialog } = await openSuspend(canvasElement);
    await expect(
      await within(dialog).findByText(
        "Nothing that already happened is undone.",
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
  },
);
Preview.name = "AD6 · server preview (diff and impact)";

export const Conflict = story(
  WRITE,
  {
    [PATH]: configuration(),
    [`${PATH}/flags/${IDS.member}/suspend/preview`]: apiError(409, "revision_conflict"),
  },
  "",
  async ({ canvasElement }) => {
    const { dialog } = await openSuspend(canvasElement);
    await expect(
      await within(dialog).findByText(/changed since you read it/, {}, { timeout: 5000 }),
    ).toBeVisible();
  },
);
Conflict.name = "AD6 · revision conflict (read again)";

export const StepUp = story(
  WRITE,
  {
    [PATH]: configuration(),
    [`${PATH}/flags/${IDS.member}/suspend/preview`]: apiError(403, "step_up_required"),
  },
  "",
  async ({ canvasElement }) => {
    const { dialog } = await openSuspend(canvasElement);
    await expect(
      await within(dialog).findByText(/Confirm with your security key/, {}, { timeout: 5000 }),
    ).toBeVisible();
  },
);
StepUp.name = "AD6 · fresh key check required";

export const Unreachable = story(
  READ,
  { [PATH]: apiError(503, "service_unavailable") },
  "We can’t reach the configuration.",
);
Unreachable.name = "AD6 · unreachable";

export const Loading = story(READ, { [PATH]: "pending" }, "", async ({ canvasElement }) => {
  await expect(
    await within(canvasElement).findByRole(
      "status",
      { name: "Loading feature switches" },
      { timeout: 5000 },
    ),
  ).toBeVisible();
});
Loading.name = "AD6 · loading";

export const Restricted = story(
  [],
  { [PATH]: apiError(403, "forbidden") },
  "You don’t have access to this section",
);
Restricted.name = "AD6 · restricted";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Feature switches",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

export const Mobile: StoryObj = {
  ...Suspended,
  name: "AD6 · phone",
  globals: { viewport: { value: "phone", isRotated: false } },
};
