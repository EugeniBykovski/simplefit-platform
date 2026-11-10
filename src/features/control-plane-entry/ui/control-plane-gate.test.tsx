import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorSelf } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { ControlPlaneGate } from "./control-plane-gate";

/*
 * AD0 (SF-120) with the network mocked at `fetch` and the browser's WebAuthn
 * stubbed: the gate opens only on the backend's answer, and every ceremony sends
 * the backend's challenge back with the authenticator's answer.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
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

describe("ControlPlaneGate (AD0, SF-120)", () => {
  it("answers a non-operator, suspended or revoked operator (404) with the same unavailable page", async () => {
    api({ [ME]: [error(404, "not_found")] });
    renderGate();
    expect(await screen.findByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to SimpleFit" })).toHaveAttribute("href", "/en/");
    expect(screen.queryByTestId("control-plane")).toBeNull();
  });

  it("asks an active operator for the key, then opens on the backend's key check", async () => {
    credentials.get.mockResolvedValue(
      new FakeCredential({
        authenticatorData: bytes(4),
        clientDataJSON: bytes(5),
        signature: bytes(6),
      }),
    );
    const calls = api({
      [ME]: [operator(), operator({ step_up: checked })],
      "POST /api/v1/admin/step-up/options": [options],
      "POST /api/v1/admin/step-up": [{ status: 200, body: { step_up: checked } }],
    });
    renderGate();
    expect(await screen.findByRole("heading", { name: "Use your security key" })).toBeVisible();
    expect(screen.queryByTestId("control-plane")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Use security key" }));
    expect(await screen.findByTestId("control-plane")).toHaveTextContent("open:audit.read");

    const verify = calls.find((call) => call.key === "POST /api/v1/admin/step-up");
    expect(verify?.body).toEqual({
      challenge_id: "c-1",
      credential_id: "AQID",
      authenticator_data: "BA",
      client_data_json: "BQ",
      signature: "Bg",
    });
    expect(credentials.get.mock.calls[0]?.[0].publicKey.userVerification).toBe("required");
  });

  it("a cancelled or failed key keeps the gate shut and says nothing changed", async () => {
    credentials.get.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    api({ [ME]: [operator()], "POST /api/v1/admin/step-up/options": [options] });
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Use security key" }));
    expect(await screen.findByRole("heading", { name: "That key didn’t work" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByTestId("control-plane")).toBeNull();
  });

  it("a key the backend rejects is not verified, and the gate stays shut", async () => {
    credentials.get.mockResolvedValue(
      new FakeCredential({
        authenticatorData: bytes(1),
        clientDataJSON: bytes(1),
        signature: bytes(1),
      }),
    );
    api({
      [ME]: [operator()],
      "POST /api/v1/admin/step-up/options": [options],
      "POST /api/v1/admin/step-up": [error(422, "security_key_rejected")],
    });
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Use security key" }));
    expect(await screen.findByText("Not verified")).toBeVisible();
    expect(screen.queryByTestId("control-plane")).toBeNull();
  });

  it("an expired key check asks to confirm again", async () => {
    api({
      [ME]: [
        operator({ step_up: { ...checked, expires_at: iso(-1_000), fresh_seconds_remaining: 0 } }),
      ],
    });
    renderGate();
    expect(await screen.findByRole("heading", { name: "Confirm it’s you again" })).toBeVisible();
    expect(screen.queryByTestId("control-plane")).toBeNull();
  });

  it("enrols the two required keys, then asks for the key check", async () => {
    credentials.create.mockResolvedValue(
      new FakeCredential({ attestationObject: bytes(7), clientDataJSON: bytes(8) }),
    );
    const pending = (registered: number) =>
      operator({
        status: "pending_enrollment",
        permissions: [],
        activated_at: null,
        enrollment_expires_at: iso(86_400_000),
        security_keys: { registered, required: 2 },
      });
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
    expect(
      await screen.findByRole("heading", { name: "Register two security keys" }),
    ).toBeVisible();
    expect(screen.getByText("Set up · step 1 of 2")).toBeVisible();

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
    expect(await screen.findByRole("heading", { name: "Use your security key" })).toBeVisible();
  });

  it("an expired enrolment window is its own state", async () => {
    api({
      [ME]: [
        operator({
          status: "pending_enrollment",
          enrollment_expires_at: iso(-1_000),
          security_keys: { registered: 0, required: 2 },
        }),
      ],
    });
    renderGate();
    expect(
      await screen.findByRole("heading", { name: "Your setup window has ended" }),
    ).toBeVisible();
  });

  it("an unconfigured backend (503) is its own state", async () => {
    api({
      [ME]: [operator()],
      "POST /api/v1/admin/step-up/options": [error(503, "service_unavailable")],
    });
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Use security key" }));
    expect(
      await screen.findByRole("heading", { name: "Security keys aren’t available right now" }),
    ).toBeVisible();
  });

  it("shows recovery guidance and comes back", async () => {
    api({ [ME]: [operator()] });
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Recovery options" }));
    expect(await screen.findByRole("heading", { name: "Lost your keys?" })).toBeVisible();
    expect(screen.getByText(/There’s no self-service recovery/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Use your security key" })).toBeVisible();
  });

  it("a failed read assumes nothing and can be retried", async () => {
    api({ [ME]: [error(500, "internal_error"), operator({ step_up: checked })] });
    renderGate();
    expect(
      await screen.findByRole("heading", { name: "We couldn’t check your access" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("control-plane")).toBeVisible();
  });

  it("Exit control plane ends the key check and asks for the key, not 'expired'", async () => {
    api({
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
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Use your security key" })).toBeVisible(),
    );
  });
});
