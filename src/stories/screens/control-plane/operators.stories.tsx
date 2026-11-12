import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, waitFor, within } from "storybook/test";

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
import { OperatorsPage } from "@/widgets/admin-operators";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * SF-129 operators (AD20) on a deterministic stand-in of the API: `fetch` is replaced
 * per story and nothing reaches a backend. The permission catalog mirrors the backend's
 * real permissions; operators, names and dates are Storybook fixtures.
 */

const ME = "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e";
const PIOTR = "6c1d8a2f-4b3e-4d7c-8f9a-2e3b4c5d6e7f";
const MARTA = "7d2e9b3a-5c4f-4e8d-9a1b-3f4c5d6e7f8a";
const LENA = "8e3f0c4b-6d5a-4f9e-8b2c-4a5d6e7f8a9b";

const grant = (permission: string, overrides: Record<string, unknown> = {}) => ({
  permission,
  granted_at: "2026-11-03T10:00:00Z",
  granted_by_operator_id: ME,
  reason_code: "access_request_approved",
  bootstrap: false,
  ...overrides,
});

const governed = (id: string, overrides: Record<string, unknown> = {}) => {
  const grants = (overrides.grants as { permission: string }[] | undefined) ?? [
    grant("operators.read"),
  ];
  return {
    id,
    user_id: `${id.slice(0, 8)}-1111-4111-8111-111111111111`,
    status: "active",
    permissions: grants.map((g) => g.permission),
    grants,
    revision: 3,
    bootstrap: false,
    created_at: "2026-11-03T10:00:00Z",
    created_by_operator_id: ME,
    activated_at: "2026-11-03T11:00:00Z",
    enrollment_expires_at: null,
    suspended_at: null,
    revoked_at: null,
    security_keys: { registered: 2, required: 2 },
    short_name: "Piotr R.",
    last_key_check_at: "2026-11-12T09:30:00Z",
    ...overrides,
  };
};

const FOUNDER_GRANTS = ["audit.read", "operators.manage", "operators.read"].map((p) =>
  grant(p, { bootstrap: true, granted_by_operator_id: null, reason_code: null }),
);
const founder = governed(ME, {
  short_name: "Ewa N.",
  bootstrap: true,
  created_by_operator_id: null,
  grants: FOUNDER_GRANTS,
  revision: 1,
});
const piotr = governed(PIOTR, {
  grants: [
    grant("gyms.read"),
    grant("operators.read", { reason_code: "role_change", granted_at: "2026-11-05T09:00:00Z" }),
    grant("users.read"),
  ],
});
const marta = governed(MARTA, {
  short_name: "Marta D.",
  status: "pending_enrollment",
  grants: [grant("billing.read")],
  security_keys: { registered: 0, required: 2 },
  last_key_check_at: null,
  activated_at: null,
  enrollment_expires_at: "2026-11-19T10:00:00Z",
});
const lena = governed(LENA, {
  short_name: "Lena K.",
  status: "suspended",
  suspended_at: "2026-11-10T08:00:00Z",
  grants: [grant("audit.read")],
  last_key_check_at: "2026-11-09T17:20:00Z",
});
const OPERATORS = [founder, piotr, marta, lena];

const CATALOG = ok({
  permissions: [
    ["users.read", "key"],
    ["users.manage", "fresh_key"],
    ["gyms.read", "key"],
    ["sponsors.read", "key"],
    ["sponsors.review", "fresh_key"],
    ["billing.read", "key"],
    ["config.read", "key"],
    ["config.flags.write", "fresh_key"],
    ["audit.read", "key"],
    ["operators.read", "key"],
    ["operators.manage", "fresh_key"],
  ].map(([permission, assurance]) => ({ permission, assurance })),
});

const CREDENTIALS = ok({
  credentials: [
    {
      id: "c1",
      label: "YubiKey 5C (desk)",
      created_at: "2026-11-01T09:00:00Z",
      last_used_at: "2026-11-12T11:00:00Z",
      revoked_at: null,
      revoked_reason: null,
    },
    {
      id: "c2",
      label: "YubiKey 5 NFC (safe)",
      created_at: "2026-11-01T09:04:00Z",
      last_used_at: null,
      revoked_at: null,
      revoked_reason: null,
    },
  ],
});

const EVENTS = ok({
  events: [
    {
      id: "e2",
      action: "operator.permission_granted",
      outcome: "allowed",
      authority: "fresh_key",
      occurred_at: "2026-11-05T09:00:00Z",
      actor_operator_id: ME,
      permission: "operators.read",
      reason_code: "role_change",
    },
    {
      id: "e1",
      action: "operator.provisioned",
      outcome: "allowed",
      authority: "fresh_key",
      occurred_at: "2026-11-03T10:00:00Z",
      actor_operator_id: ME,
      reason_code: "access_request_approved",
    },
  ],
});

const PREVIEW = ok({
  preview: {
    action: "operator.suspend",
    target: { type: "operator", id: PIOTR, status: "active" },
    expected_revision: 3,
    current_state: "active",
    proposed_state: "suspended",
    permission: null,
    impact: ["access_blocked", "key_checks_ended"],
    required_permission: "operators.manage",
    required_assurance: "fresh_key",
    reason_code: "security_concern",
    confirmation: { required: true, token: "sfo_story", expires_at: "2026-11-12T12:05:00Z" },
  },
});

const me = (permissions: string[]) =>
  ok({
    operator: {
      id: ME,
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: {
        verified_at: "2026-11-12T11:00:00Z",
        expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
        fresh_seconds_remaining: 300,
      },
      enrollment_expires_at: null,
      activated_at: "2026-11-01T10:00:00Z",
    },
  });

const READ = ["operators.read"];
const MANAGE = ["audit.read", "operators.manage", "operators.read"];
const OPS = "/api/v1/admin/operators";

const ready = (): Record<string, Answer | Answer[]> => ({
  [OPS]: ok({ operators: OPERATORS }),
  [`${OPS}/${PIOTR}`]: ok({ operator: piotr }),
  [`${OPS}/${ME}`]: ok({ operator: founder }),
  "/api/v1/admin/operator-permissions": CATALOG,
  "/api/v1/admin/credentials": CREDENTIALS,
  "/api/v1/admin/audit-events": EVENTS,
});

function story(
  permissions: string[],
  routes: Record<string, Answer | Answer[]>,
  text: string,
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: "/en/admin/staff", segments: [] } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/admin/me": me(permissions),
        ...routes,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web.admin")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <OperatorsPage />
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

async function openDetail(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole("button", { name: `Details for ${name}` }, { timeout: 5000 }),
  );
  return canvas.findByRole("region", { name }, { timeout: 5000 });
}

async function openSuspend(canvasElement: HTMLElement) {
  const detail = await openDetail(canvasElement, "Piotr R.");
  await userEvent.click(await within(detail).findByRole("button", { name: "Suspend" }));
  const body = within(canvasElement.ownerDocument.body);
  const dialog = await body.findByRole("dialog");
  await userEvent.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
  await userEvent.click(await body.findByRole("option", { name: "Security concern" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Review" }));
  return dialog;
}

export const Ready = story(MANAGE, ready(), "Setting up keys");
Ready.name = "AD20 · ready (operator manager)";

export const ReadOnly = story(
  READ,
  ready(),
  "You can see operators. Changing them needs operators.manage.",
);
ReadOnly.name = "AD20 · read-only operator (no controls)";

export const Detail = story(MANAGE, ready(), "", async ({ canvasElement }) => {
  const detail = await openDetail(canvasElement, "Piotr R.");
  await expect(
    await within(detail).findByText("Changes to this operator", {}, { timeout: 5000 }),
  ).toBeVisible();
});
Detail.name = "AD20 · detail (provenance, actions, history)";

export const Self = story(MANAGE, ready(), "", async ({ canvasElement }) => {
  const detail = await openDetail(canvasElement, "Ewa N.");
  await expect(await within(detail).findByText(/This is you/)).toBeVisible();
});
Self.name = "AD20 · self (no actions on oneself)";

export const AddOperator = story(MANAGE, ready(), "", async ({ canvasElement }) => {
  const open = await within(canvasElement).findByRole(
    "button",
    { name: "Add an operator" },
    { timeout: 5000 },
  );
  // Enabled once the permission catalog is in.
  await waitFor(() => expect(open).toBeEnabled(), { timeout: 5000 });
  await userEvent.click(open);
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
  await expect(within(dialog).getByText(/register their own two security keys/)).toBeVisible();
});
AddOperator.name = "AD20 · add an operator";

export const Preview = story(
  MANAGE,
  { ...ready(), [`${OPS}/${PIOTR}/suspend/preview`]: PREVIEW },
  "",
  async ({ canvasElement }) => {
    const dialog = await openSuspend(canvasElement);
    await expect(
      await within(dialog).findByText("They can’t open the Control Plane.", {}, { timeout: 5000 }),
    ).toBeVisible();
  },
);
Preview.name = "AD20 · suspend preview (diff and impact)";

export const StepUp = story(
  MANAGE,
  { ...ready(), [`${OPS}/${PIOTR}/suspend/preview`]: apiError(403, "step_up_required") },
  "",
  async ({ canvasElement }) => {
    const dialog = await openSuspend(canvasElement);
    await expect(
      await within(dialog).findByText(/needs a fresh security-key check/, {}, { timeout: 5000 }),
    ).toBeVisible();
  },
);
StepUp.name = "AD20 · fresh key check required";

export const Unreachable = story(
  READ,
  { ...ready(), [OPS]: apiError(503, "service_unavailable") },
  "Couldn’t load operators",
);
Unreachable.name = "AD20 · error";

export const Loading = story(
  READ,
  { ...ready(), [OPS]: "pending" },
  "",
  async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole(
        "status",
        { name: "Loading operators…" },
        { timeout: 5000 },
      ),
    ).toBeVisible();
  },
);
Loading.name = "AD20 · loading";

export const Restricted = story(
  ["gyms.read"],
  { "/api/v1/admin/credentials": CREDENTIALS },
  "You don’t have access to the operator list",
);
Restricted.name = "AD20 · restricted (own security only)";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Operators",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

export const Mobile: StoryObj = {
  ...Detail,
  name: "AD20 · phone",
  globals: { viewport: { value: "phone", isRotated: false } },
};
