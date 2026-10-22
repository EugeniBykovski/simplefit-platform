import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { EmailIdentityLinkFlow } from "./email-identity-link-flow";

/*
 * The SF-78 flow on the SF-77 API, network mocked at `fetch`. The backend
 * decides every outcome; the code never leaves component state.
 */

const session = vi.hoisted(() => ({
  boundary: new Set<() => void>(),
  changed: false,
}));
vi.mock("@/entities/session", () => {
  class SessionChangedError extends Error {}
  return {
    SessionChangedError,
    callWithSession: async <T,>(call: (init: RequestInit) => Promise<T>) => {
      const result = await call({ headers: { Authorization: "Bearer test" } });
      if (session.changed) throw new SessionChangedError();
      return result;
    },
    onSessionBoundary: (listener: () => void) => {
      session.boundary.add(listener);
      return () => session.boundary.delete(listener);
    },
  };
});

const EMAIL = "fighter@example.com";
// Canary code: must never reach a URL, storage or the console.
const CODE = "730419";

type Call = { method: string; url: string; body: Record<string, unknown> | undefined };
type Reply = Response | ((call: Call) => Response | Promise<Response>);

function server(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const queues = new Map(
    Object.entries(routes).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const call: Call = {
        method: (init.method ?? "GET").toUpperCase(),
        url,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const key = `${call.method} ${new URL(url, "http://localhost").pathname}`;
      const entry = queues.get(key);
      const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry;
      if (reply === undefined) return Promise.reject(new Error(`unexpected ${key}`));
      return Promise.resolve(typeof reply === "function" ? reply(call) : reply.clone());
    }),
  );
  return calls;
}

const REQUEST = "POST /api/v1/me/email-identities/link-challenge";
const CONFIRM = "POST /api/v1/me/email-identities/confirm-link";
const LIST = "GET /api/v1/me/email-identities";
const ACCEPTED = () =>
  jsonResponse({ expires_in_seconds: 600, resend_after_seconds: 60 }, { status: 202 });
const LINKED = (outcome = "linked") =>
  jsonResponse({ outcome, email_identity: { email: EMAIL, linked_at: "2026-10-22T10:00:00Z" } });
const error = (status: number, code: string, headers: Record<string, string> = {}) =>
  jsonResponse(
    { error: { code, message: "x", details: {}, request_id: "r" } },
    { status, headers },
  );

const handlers = () => ({
  onDone: vi.fn(),
  onCancel: vi.fn(),
  onSwitchAccount: vi.fn(),
  onSignIn: vi.fn(),
});

async function render(props = handlers()) {
  await renderWithProviders(
    <EmailIdentityLinkFlow {...props} backLabel="Back to the invitation" doneHint="Review it." />,
  );
  return props;
}

async function sendCode() {
  await userEvent.type(await screen.findByRole("textbox", { name: "Email address" }), EMAIL);
  await userEvent.click(screen.getByRole("button", { name: "Send code" }));
  return screen.findByRole("textbox", { name: "6-digit code" });
}

const log = vi.spyOn(console, "log");
const warn = vi.spyOn(console, "warn");

beforeEach(() => {
  session.boundary.clear();
  session.changed = false;
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  // Q: the code is never in the URL, browser storage or the console.
  expect(window.location.href).not.toContain(CODE);
  expect(JSON.stringify({ ...window.sessionStorage, ...window.localStorage })).not.toContain(CODE);
  for (const spy of [log, warn]) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE);
  }
});

describe("email identity link flow (SF-78)", () => {
  it("A/B: sends a code, links on the backend's answer and only then shows success", async () => {
    const calls = server({ [REQUEST]: ACCEPTED(), [CONFIRM]: LINKED() });
    const props = await render();

    const code = await sendCode();
    expect(
      screen.getByText("Code sent. Check spam if you don’t see it.", { selector: "[role=status]" }),
    ).toBeInTheDocument();
    // A 202 is never a link.
    expect(screen.queryByRole("heading", { name: "Email verified" })).toBeNull();
    expect(screen.getByText(/It expires in 10 minutes\./)).toBeVisible();

    await userEvent.click(code);
    await userEvent.paste(CODE);

    const heading = await screen.findByRole("heading", { name: "Email verified" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText(/is now an email of this account\..*Review it\./)).toBeVisible();
    expect(calls.filter((call) => call.url.includes("confirm-link"))).toHaveLength(1);
    expect(calls.find((call) => call.url.includes("confirm-link"))?.body).toEqual({
      email: EMAIL,
      code: CODE,
    });
    expect(calls.every((call) => !call.url.includes(CODE))).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Back to the invitation" }));
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it("sends the address that is in the field when the form is submitted", async () => {
    // A browser autofill (or a keystroke not yet rendered) sets the field
    // without React seeing an input event before the submission.
    const calls = server({ [REQUEST]: ACCEPTED() });
    await render();
    const field = await screen.findByRole("textbox", { name: "Email address" });
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(field, EMAIL);
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("textbox", { name: "6-digit code" })).toBeInTheDocument();
    expect(calls.find((call) => call.url.includes("link-challenge"))?.body).toEqual({
      email: EMAIL,
    });
  });

  it("C: an address already on the account is reported as such, with nothing changed", async () => {
    server({ [REQUEST]: ACCEPTED(), [CONFIRM]: LINKED("already_linked") });
    await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste(CODE);
    expect(
      await screen.findByRole("heading", { name: "This email is already on your account" }),
    ).toBeVisible();
  });

  it("checks the email shape before sending, and shows the API's validation", async () => {
    const calls = server({ [REQUEST]: error(422, "validation_error") });
    await render();
    const field = await screen.findByRole("textbox", { name: "Email address" });
    await userEvent.type(field, "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(calls).toHaveLength(0);

    await userEvent.clear(field);
    await userEvent.type(field, "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
  });

  it("G: a rate-limited request says so and stays on the email step", async () => {
    server({ [REQUEST]: error(429, "rate_limited", { "retry-after": "40" }) });
    await render();
    await userEvent.type(await screen.findByRole("textbox", { name: "Email address" }), EMAIL);
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again shortly.",
    );
    expect(screen.queryByRole("textbox", { name: "6-digit code" })).toBeNull();
  });

  it("E: a wrong code can be corrected and submitted again", async () => {
    server({ [REQUEST]: ACCEPTED(), [CONFIRM]: [error(422, "code_invalid"), LINKED()] });
    await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste("111111");
    expect(
      await screen.findByText("That code isn’t right. Check the digits and try again.", {
        selector: "[role=status]",
      }),
    ).toBeInTheDocument();
    expect(code).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(code);
    await userEvent.paste(CODE);
    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeVisible();
  });

  it("F/H: an expired or used code offers a new one; the new code supersedes the old", async () => {
    const calls = server({ [REQUEST]: ACCEPTED(), [CONFIRM]: error(422, "code_expired") });
    await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste(CODE);
    expect(
      await screen.findByText("This code no longer works. Send a new one.", {
        selector: "[role=status]",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(
      await screen.findByText("We sent a new code. Earlier codes no longer work.", {
        selector: "[role=status]",
      }),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.url.includes("link-challenge"))).toHaveLength(2);
    expect(screen.getByRole("textbox", { name: "6-digit code" })).toHaveValue("");
  });

  it("D: another account's address is a conflict only after the code, with no merge offered", async () => {
    server({ [REQUEST]: ACCEPTED(), [CONFIRM]: error(409, "conflict") });
    const props = await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste(CODE);
    expect(
      await screen.findByText(
        /it belongs to another SimpleFit account\. Accounts are never merged\./,
        {
          selector: "[role=status]",
        },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "6-digit code" })).toBeNull();
    expect(screen.queryByRole("button", { name: /merge|transfer/i })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign out and switch account" }));
    expect(props.onSwitchAccount).toHaveBeenCalled();
  });

  it("I: a session that ended cannot confirm; it asks to sign in again", async () => {
    server({ [REQUEST]: ACCEPTED(), [CONFIRM]: error(401, "unauthorized") });
    const props = await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste(CODE);
    expect(
      await screen.findByText("Your session ended. Sign in again, then request a new code.", {
        selector: "[role=status]",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(props.onSignIn).toHaveBeenCalled();
  });

  it("J: a session boundary (sign-out, another account) clears the flow and the code", async () => {
    server({ [REQUEST]: ACCEPTED() });
    await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.type(code, "7304");
    act(() => {
      for (const listener of session.boundary) listener();
    });
    expect(await screen.findByRole("textbox", { name: "Email address" })).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "6-digit code" })).toBeNull();
  });

  it("J: an answer that arrives after the session changed is dropped, never shown", async () => {
    server({ [REQUEST]: ACCEPTED(), [CONFIRM]: LINKED() });
    await render();
    const code = await sendCode();
    session.changed = true;
    await userEvent.click(code);
    await userEvent.paste(CODE);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Email verified" })).toBeNull(),
    );
  });

  it("L: a lost confirmation answer is reconciled with the identity list, without resubmitting", async () => {
    const calls = server({
      [REQUEST]: ACCEPTED(),
      [CONFIRM]: () => Promise.reject(new TypeError("Failed to fetch")),
      [LIST]: jsonResponse({
        email_identities: [{ email: EMAIL, linked_at: "2026-10-22T10:00:00Z" }],
      }),
    });
    await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste(CODE);
    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeVisible();
    expect(calls.filter((call) => call.url.includes("confirm-link"))).toHaveLength(1);
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(1);
  });

  it("L: when the list does not show the address, success is not claimed; retry re-checks first", async () => {
    const calls = server({
      [REQUEST]: ACCEPTED(),
      [CONFIRM]: [() => Promise.reject(new TypeError("Failed to fetch")), LINKED()],
      [LIST]: jsonResponse({ email_identities: [] }),
    });
    await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste(CODE);
    expect(
      await screen.findByText(
        "We couldn’t confirm the code. Check your connection and try again.",
        {
          selector: "[role=status]",
        },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Email verified" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeVisible();
    // Re-checked the list before the second submission.
    const order = calls.map((call) =>
      call.method === "GET" ? "list" : call.url.includes("confirm") ? "confirm" : "request",
    );
    expect(order).toEqual(["request", "confirm", "list", "list", "confirm"]);
  });

  it("T: repeated submissions while one is pending send one confirmation", async () => {
    let answer: (response: Response) => void = () => undefined;
    const calls = server({
      [REQUEST]: ACCEPTED(),
      [CONFIRM]: () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    await render();
    const code = await sendCode();
    await userEvent.click(code);
    await userEvent.paste(CODE);
    const pending = await screen.findByRole("button", { name: "Verifying…" });
    expect(pending).toBeDisabled();
    await userEvent.click(pending);
    await userEvent.keyboard("{Enter}");
    expect(calls.filter((call) => call.url.includes("confirm-link"))).toHaveLength(1);
    await act(async () => answer(LINKED()));
    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeVisible();
  });

  it("shows the resend countdown and a different-address way back", async () => {
    server({ [REQUEST]: ACCEPTED() });
    await render();
    await sendCode();
    expect(screen.getByText(/Resend in \d:\d\d/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(await screen.findByRole("textbox", { name: "Email address" })).toHaveValue(EMAIL);
  });

  it("cancel leaves without any request", async () => {
    const calls = server({});
    const props = await render();
    await userEvent.click(await screen.findByRole("button", { name: "Back to the invitation" }));
    expect(props.onCancel).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
