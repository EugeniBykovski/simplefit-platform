import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { ConfigurationPage } from "./configuration-page";

/*
 * SF-128 with the network mocked at `fetch`: the backend's registry as it is, controls
 * only on suspendable switches and only with write access, a suspension through
 * preview, reason and confirmation that shows as done only after the backend's answer,
 * a stale revision that asks to read again, and no request without read access.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const permissions = vi.hoisted(() => ({ current: [] as string[] }));
vi.mock("@/entities/operator", () => ({
  useOperator: () => ({ data: { permissions: permissions.current } }),
  useOperatorKeys: () => ({ verifyKey: vi.fn() }),
  grants: (operator: { permissions: string[] }, permission: string) =>
    operator.permissions.includes(permission),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
}));

const NOW = "2026-11-12T12:00:00Z";
const ID = "0e7c4d0a-5b1f-4d7e-9a2b-3c4d5e6f7a8b";

const flag = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  group: "gyms",
  variable: "GYM_MEMBER_INVITATIONS",
  consumer: "SimpleFit.Gyms.MemberInvitations.delivery_enabled?/0",
  control: "suspendable",
  risk: "medium",
  decision: "SF-95",
  impact: ["new_member_invitation_emails_stop"],
  deployment_value: true,
  suspended: false,
  effective: true,
  flag_id: ID,
  revision: 4,
  updated_at: NOW,
  ...overrides,
});

const configuration = (flags = [flag("gym.member_invitations")]) => ({
  configuration: {
    environment: "staging",
    observed_at: NOW,
    flags: [
      ...flags,
      flag("stripe.billing", {
        group: "payments",
        variable: "STRIPE_BILLING_ENABLED",
        consumer: "SimpleFit.Billing.Stripe.Config.status/0",
        control: "read_only",
        risk: "high",
        decision: "SF-138",
        impact: [],
        deployment_value: false,
        effective: false,
        flag_id: null,
        revision: null,
        updated_at: null,
      }),
    ],
    changes: [],
  },
});

const preview = {
  preview: {
    action: "config.flag.suspend",
    target: { type: "runtime_flag", id: ID, status: "active" },
    expected_revision: 4,
    current_state: "active",
    proposed_state: "suspended",
    permission: null,
    impact: ["new_member_invitation_emails_stop", "not_retroactive"],
    required_permission: "config.flags.write",
    required_assurance: "fresh_key",
    reason_code: "incident_response",
    confirmation: { required: true, token: "sfc_token", expires_at: NOW },
  },
};

type Answer = { status: number; body?: unknown };

function api(routes: Record<string, Answer[]>) {
  const calls: { url: URL; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      const queue = routes[url.pathname];
      if (!queue) throw new Error(`unexpected ${url.pathname}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const CONFIG = "/api/v1/admin/configuration";
const user = userEvent.setup();

afterEach(() => {
  vi.unstubAllGlobals();
  permissions.current = [];
});

describe("AD6 feature switches (SF-128)", () => {
  it("shows the registry as the backend sent it; read-only access has no control", async () => {
    permissions.current = ["config.read"];
    api({ [CONFIG]: [{ status: 200, body: configuration() }] });
    await renderWithProviders(<ConfigurationPage />);

    const row = await screen.findByRole("row", { name: /Gym member invitation emails/ });
    expect(within(row).getByText("GYM_MEMBER_INVITATIONS")).toBeInTheDocument();
    expect(within(row).getByText("Can be suspended")).toBeInTheDocument();
    expect(within(row).getByText("Medium risk")).toBeInTheDocument();
    const stripe = screen.getByRole("row", { name: /Stripe billing/ });
    expect(within(stripe).getByText("Read-only")).toBeInTheDocument();
    expect(within(stripe).getByText("High risk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suspend|Restore/ })).not.toBeInTheDocument();
    expect(screen.getByText(/needs configuration write access/)).toBeInTheDocument();
    expect(screen.getByText(/No percentage rollout/)).toBeInTheDocument();
    expect(screen.getByText("Environment: staging", { exact: false })).toBeInTheDocument();
  });

  it("suspends through preview and confirmation; done only after the backend answers", async () => {
    permissions.current = ["config.read", "config.flags.write"];
    const calls = api({
      [CONFIG]: [
        { status: 200, body: configuration() },
        {
          status: 200,
          body: configuration([
            flag("gym.member_invitations", { suspended: true, effective: false, revision: 5 }),
          ]),
        },
      ],
      [`${CONFIG}/flags/${ID}/suspend/preview`]: [{ status: 200, body: preview }],
      [`${CONFIG}/flags/${ID}/suspend`]: [
        {
          status: 200,
          body: {
            flag: {
              ...flag("gym.member_invitations", { suspended: true, effective: false, revision: 5 }),
              history: [],
            },
          },
        },
      ],
    });
    await renderWithProviders(<ConfigurationPage />);

    // Stripe has no control; the allowlisted switch does.
    const stripe = await screen.findByRole("row", { name: /Stripe billing/ });
    expect(within(stripe).queryByRole("button")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Suspend Gym member invitation emails (E07)" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Review the change" })).toBeDisabled();
    await user.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Incident response" }));
    await user.click(within(dialog).getByRole("button", { name: "Review the change" }));

    const diff = await within(dialog).findByText("Now");
    expect(diff).toBeInTheDocument();
    expect(within(dialog).getByText("Active")).toBeInTheDocument();
    expect(within(dialog).getByText("Suspended")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Nothing that already happened is undone."),
    ).toBeInTheDocument();
    // The preview named the revision the operator saw.
    const previewCall = calls.find((c) => c.url.pathname.endsWith("/suspend/preview"));
    expect(previewCall?.body).toEqual({ reason_code: "incident_response", expected_revision: 4 });

    await user.click(within(dialog).getByRole("button", { name: "Suspend now" }));
    expect(await within(dialog).findByText(/The change is committed/)).toBeInTheDocument();
    const execute = calls.find((c) => c.url.pathname.endsWith(`${ID}/suspend`));
    expect(execute?.body).toMatchObject({
      reason_code: "incident_response",
      expected_revision: 4,
      confirmation_token: "sfc_token",
    });

    const closers = within(dialog).getAllByRole("button", { name: "Close" });
    await user.click(closers[closers.length - 1]!);
    await waitFor(() =>
      expect(screen.getByRole("row", { name: /Gym member invitation emails/ })).toHaveAttribute(
        "data-effective",
        "false",
      ),
    );
  });

  it("a stale revision asks to read again and never resubmits", async () => {
    permissions.current = ["config.read", "config.flags.write"];
    const calls = api({
      [CONFIG]: [{ status: 200, body: configuration() }],
      [`${CONFIG}/flags/${ID}/suspend/preview`]: [
        {
          status: 409,
          body: {
            error: { code: "revision_conflict", message: "x", details: { current_revision: 5 } },
          },
        },
      ],
    });
    await renderWithProviders(<ConfigurationPage />);
    await user.click(await screen.findByRole("button", { name: /^Suspend / }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Release issue" }));
    await user.click(within(dialog).getByRole("button", { name: "Review the change" }));
    expect(await within(dialog).findByText(/changed since you read it/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Read the current state" }),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.url.pathname.endsWith("/suspend"))).toHaveLength(0);
  });

  it("without config.read: restricted and nothing is read", async () => {
    permissions.current = ["billing.read"];
    const calls = api({});
    await renderWithProviders(<ConfigurationPage />);
    expect(await screen.findByText("You don’t have access to this section")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
