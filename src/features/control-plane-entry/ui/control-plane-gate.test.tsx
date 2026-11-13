import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestKeyEnrollment } from "@/entities/operator";
import type { OperatorSelf } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { ControlPlaneGate } from "./control-plane-gate";

/*
 * AD0 (SF-120, SF-157) with the network mocked at `fetch` and the browser's
 * WebAuthn stubbed: the gate opens on the backend's operator answer at session
 * assurance, key registration comes when an action needs it, and every ceremony
 * sends the backend's challenge back with the authenticator's answer.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const push = vi.fn();
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push }),
}));

const NOW = Date.now();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const operator = (overrides: Partial<OperatorSelf> = {}): { status: number; body: unknown } => ({
  status: 200,
  body: {
    operator: {
      id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
      status: "active",
      permissions: ["audit.read"],
      security_keys: { registered: 2, required: 2 },
      step_up: null,
      enrollment_expires_at: null,
      activated_at: iso(-86_400_000),
      ...overrides,
    },
  },
});
const checked = {
  verified_at: iso(0),
  expires_at: iso(30 * 60_000),
  fresh_seconds_remaining: 300,
};
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: "x", details } },
});
const options = { status: 200, body: { challenge_id: "c-1", public_key: { challenge: "AAEC" } } };

type Answer = { status: number; body?: unknown };

/** A fake API by "METHOD path": each answers its queue in order (the last repeats). */
function api(routes: Record<string, Answer[]>) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
      calls.push({ key, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected ${key}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(
        answer.status === 204
          ? new Response(null, { status: 204 })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}

const ME = "GET /api/v1/admin/me";

class FakeCredential {
  rawId = new Uint8Array([1, 2, 3]).buffer;
  constructor(readonly response: Record<string, ArrayBuffer>) {}
}
const bytes = (...values: number[]) => new Uint8Array(values).buffer;

const credentials = { create: vi.fn(), get: vi.fn() };

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", FakeCredential);
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "credentials", { value: credentials, configurable: true });
  credentials.create.mockReset();
  credentials.get.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const user = userEvent.setup();

function renderGate() {
  return renderWithProviders(
    <ControlPlaneGate>
      {(current) => <p data-testid="control-plane">open:{current.permissions.join(",")}</p>}
    </ControlPlaneGate>,
  );
}

const pending = (registered = 0, expiresIn = 86_400_000) =>
  operator({
    status: "pending_enrollment",
    permissions: ["audit.read"],
    activated_at: null,
    enrollment_expires_at: iso(expiresIn),
    security_keys: { registered, required: 2 },
  });

describe("ControlPlaneGate (AD0, SF-120; SF-157 session assurance)", () => {
  it("answers a non-operator, suspended or revoked operator (404) with the same unavailable page", async () => {
    api({ [ME]: [error(404, "not_found")] });
    renderGate();
    expect(await screen.findByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to SimpleFit" })).toHaveAttribute("href", "/en/");
    expect(screen.queryByTestId("control-plane")).toBeNull();
  });

  it("opens for an active operator without a key check, and asks for no key on entry", async () => {
    const calls = api({ [ME]: [operator()] });
    renderGate();
    expect(await screen.findByTestId("control-plane")).toHaveTextContent("open:audit.read");
    expect(screen.queryByText(/security keys aren’t registered yet/)).toBeNull();
    expect(calls.map((call) => call.key)).toEqual([ME]);
    expect(credentials.get).not.toHaveBeenCalled();
  });

  it("opens for a pending operator with a notice; registering both keys comes back to it", async () => {
    credentials.create.mockResolvedValue(
      new FakeCredential({ attestationObject: bytes(7), clientDataJSON: bytes(8) }),
    );
    const registered = (count: number, status: string) => ({
      status: 201,
      body: {
        credential: { id: "k", label: "x", created_at: iso(0), last_used_at: null },
        status,
        security_keys: { registered: count, required: 2 },
      },
    });
    const calls = api({
      [ME]: [pending(0), pending(1), operator()],
      "POST /api/v1/admin/credentials/options": [options],
      "POST /api/v1/admin/credentials": [
        registered(1, "pending_enrollment"),
        registered(2, "active"),
      ],
    });
    renderGate();
    expect(await screen.findByTestId("control-plane")).toBeVisible();
    expect(screen.getByText(/security keys aren’t registered yet/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Register keys" }));
    expect(
      await screen.findByRole("heading", { name: "Register two security keys" }),
    ).toBeVisible();
    expect(screen.getByText("Set up · step 1 of 2")).toBeVisible();
    expect(screen.queryByTestId("control-plane")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Register first key" }));
    expect(await screen.findByRole("heading", { name: "Now your backup key" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Register backup key" }));
    expect(await screen.findByRole("heading", { name: "Your keys are registered" })).toBeVisible();

    const bodies = calls.filter((call) => call.key === "POST /api/v1/admin/credentials");
    expect(bodies.map((call) => call.body)).toEqual([
      { challenge_id: "c-1", label: "First key", attestation_object: "Bw", client_data_json: "CA" },
      {
        challenge_id: "c-1",
        label: "Backup key",
        attestation_object: "Bw",
        client_data_json: "CA",
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByTestId("control-plane")).toBeVisible();
    expect(screen.queryByText(/security keys aren’t registered yet/)).toBeNull();
  });

  it("an action answered enrollment_required shows key registration; Back returns", async () => {
    api({ [ME]: [pending(0)] });
    renderGate();
    expect(await screen.findByTestId("control-plane")).toBeVisible();
    act(() => requestKeyEnrollment());
    expect(
      await screen.findByRole("heading", { name: "Register two security keys" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to the Control Plane" }));
    expect(await screen.findByTestId("control-plane")).toBeVisible();
  });

  it("an expired enrolment window is its own state, and the Control Plane still opens", async () => {
    api({ [ME]: [pending(0, -1_000)] });
    renderGate();
    expect(await screen.findByTestId("control-plane")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Register keys" }));
    expect(
      await screen.findByRole("heading", { name: "Your setup window has ended" }),
    ).toBeVisible();
  });

  it("an unconfigured backend (503) is its own state", async () => {
    api({
      [ME]: [pending(0)],
      "POST /api/v1/admin/credentials/options": [error(503, "service_unavailable")],
    });
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Register keys" }));
    await user.click(await screen.findByRole("button", { name: "Register first key" }));
    expect(
      await screen.findByRole("heading", { name: "Security keys aren’t available right now" }),
    ).toBeVisible();
  });

  it("a cancelled key changes nothing and says so", async () => {
    credentials.create.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    api({ [ME]: [pending(0)], "POST /api/v1/admin/credentials/options": [options] });
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Register keys" }));
    await user.click(await screen.findByRole("button", { name: "Register first key" }));
    expect(await screen.findByText(/Nothing changed/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Register two security keys" })).toBeVisible();
  });

  it("shows recovery guidance and comes back", async () => {
    api({ [ME]: [pending(0)] });
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Register keys" }));
    await user.click(await screen.findByRole("button", { name: "Recovery options" }));
    expect(await screen.findByRole("heading", { name: "Lost your keys?" })).toBeVisible();
    expect(screen.getByText(/There’s no self-service recovery/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("heading", { name: "Register two security keys" }),
    ).toBeVisible();
  });

  it("a failed read assumes nothing and can be retried", async () => {
    api({ [ME]: [error(500, "internal_error"), operator()] });
    renderGate();
    expect(
      await screen.findByRole("heading", { name: "We couldn’t check your access" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("control-plane")).toBeVisible();
  });

  it("Exit control plane ends the key check on the backend, then leaves", async () => {
    push.mockReset();
    const calls = api({
      [ME]: [operator({ step_up: checked }), operator()],
      "DELETE /api/v1/admin/step-up": [{ status: 204 }],
    });
    renderWithProviders(
      <ControlPlaneGate>
        {(_, exit) => (
          <button type="button" onClick={() => void exit()}>
            exit
          </button>
        )}
      </ControlPlaneGate>,
    );
    await user.click(await screen.findByRole("button", { name: "exit" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(calls.some((call) => call.key === "DELETE /api/v1/admin/step-up")).toBe(true);
  });
});
