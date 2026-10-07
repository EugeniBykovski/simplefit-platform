import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionModule from "@/entities/session";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { pending } from "../model/pending";
import { SignInEmailForm, RegistrationEmailForm } from "./email-request-form";
import { RegistrationCodeForm } from "./registration-code-step";
import { SignInCodeForm } from "./sign-in-code-step";
import { VerificationLinkResult } from "./verification-link-result";

const completeAuthentication = vi.hoisted(() => vi.fn(async () => "authenticated" as const));
vi.mock("@/entities/session", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  completeAuthentication,
}));

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => router,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const API = "http://api.test";
const EMAIL = "fighter@example.com";
const CODE = "482910";
const REGISTRATION_TOKEN = "sfg_registration-token-under-test";
const LINK_TOKEN = "sfl_link-token-under-test";

const tokens = () =>
  jsonResponse({
    access_token: "sfa_email",
    access_token_expires_at: new Date(Date.now() + 900_000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    refresh_token_transport: "cookie",
    token_type: "Bearer",
  });
const accepted = () =>
  jsonResponse({ expires_in_seconds: 600, resend_after_seconds: 60 }, { status: 202 });
const registrationAccepted = (token = REGISTRATION_TOKEN) =>
  jsonResponse(
    { registration_token: token, expires_in_seconds: 600, resend_after_seconds: 60 },
    { status: 202 },
  );
const apiError = (status: number, code: string, headers: Record<string, string> = {}) =>
  jsonResponse(
    { error: { code, message: "ignored by the client", details: {} } },
    { status, headers },
  );
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

type Call = [string, RequestInit];
const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
  (fetchMock.mock.calls as Call[]).map(([url, init]) => ({
    path: url.replace(API, ""),
    body: init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
    init,
  }));

function stubFetch(...answers: (() => Response | Promise<Response>)[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) fetchMock.mockImplementationOnce(answer);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Markup without React's per-render ids, to compare two renders. */
const normalized = (html: string) => html.replace(/\s(id|for|aria-describedby)="[^"]*"/g, "");

/** Everything a browser keeps that could leak a secret. */
const kept = () =>
  [
    JSON.stringify({ ...localStorage }),
    document.cookie,
    window.location.href,
    document.body.innerHTML,
  ].join("\n");

beforeEach(() => {
  completeAuthentication.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/en/login");
});

describe("email step (WA1 sign-in, WA3 sign-up)", () => {
  async function submit(form: "signIn" | "registration", email: string) {
    const Form = form === "signIn" ? SignInEmailForm : RegistrationEmailForm;
    await renderWithProviders(
      <Form returnTo="/app/messages" submitLabel="Send code" hint="We email a code." />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), email);
    await user.click(screen.getByRole("button", { name: "Send code" }));
  }

  it("B: requests a sign-in code with the normalized address and continues with returnTo", async () => {
    const fetchMock = stubFetch(accepted);

    await submit("signIn", "  Fighter@Example.COM ");

    expect(sent(fetchMock)).toMatchObject([
      { path: "/api/auth/email/sign-in", body: { email: EMAIL } },
    ]);
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/login/code?returnTo=%2Fapp%2Fmessages");
    expect(pending.get("signIn")).toMatchObject({ email: EMAIL });
    expect(window.location.href).not.toContain("example");
  });

  it("A: starts a registration and keeps its token out of the URL", async () => {
    const fetchMock = stubFetch(() => registrationAccepted());

    await submit("registration", EMAIL);

    expect(sent(fetchMock)).toMatchObject([
      { path: "/api/auth/email/registrations", body: { email: EMAIL } },
    ]);
    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/signup/verify?returnTo=%2Fapp%2Fmessages",
    );
    expect(pending.get("registration")).toMatchObject({
      email: EMAIL,
      registrationToken: REGISTRATION_TOKEN,
    });
    expect(kept()).not.toContain(REGISTRATION_TOKEN);
  });

  it.each(["signIn", "registration"] as const)(
    "%s: a decoy answer (unknown or existing address) looks exactly like a real one",
    async (form) => {
      const answer = form === "signIn" ? accepted : () => registrationAccepted();
      stubFetch(answer);
      const { container: real } = { container: document.body };
      await submit(form, EMAIL);
      const realOutcome = { push: router.push.mock.calls, html: normalized(real.innerHTML) };
      document.body.innerHTML = "";
      router.push.mockClear();

      stubFetch(answer);
      await submit(form, "nobody-here@example.com");

      expect(router.push.mock.calls).toEqual(realOutcome.push);
      expect(normalized(document.body.innerHTML.replace("nobody-here", "fighter"))).toBe(
        realOutcome.html,
      );
    },
  );

  it.each([
    ["an address the UX check rejects", "not-an-email", undefined, "Enter a valid email address."],
    [
      "a validation_error",
      EMAIL,
      () => apiError(422, "validation_error"),
      "Enter a valid email address.",
    ],
    [
      "rate limiting",
      EMAIL,
      () => apiError(429, "rate_limited", { "retry-after": "30" }),
      "Too many attempts. Try again shortly.",
    ],
    ["a network failure", EMAIL, offline, "Something went wrong. Try again."],
  ])("shows %s inline and stays on the step", async (_case, email, answer, message) => {
    const fetchMock = stubFetch(...(answer ? [answer] : []));

    await submit("signIn", email);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(router.push).not.toHaveBeenCalled();
    if (!answer) expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("B: sign-in code (WA1b)", () => {
  async function renderStep() {
    await renderWithProviders(
      <SignInCodeForm flow={{ email: EMAIL, resendAt: Date.now() + 60_000 }} />,
    );
    return { user: userEvent.setup(), input: screen.getByLabelText("6-digit code") };
  }

  it("starts in the sent state with an enumeration-safe description and the countdown", async () => {
    await renderStep();

    expect(screen.getByText(/If there’s a SimpleFit account for/)).toBeInTheDocument();
    expect(screen.getByText(/Code sent\. It expires in 10 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/Resend in [01]:\d\d/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("verifies the code with the email address and the cookie transport, then completes the session", async () => {
    const fetchMock = stubFetch(tokens);
    const { user, input } = await renderStep();

    await user.type(input, CODE);

    await waitFor(() => expect(completeAuthentication).toHaveBeenCalledTimes(1));
    const [call] = sent(fetchMock);
    expect(call).toMatchObject({
      path: "/api/auth/email/sign-in/verify",
      body: { email: EMAIL, code: CODE, refresh_token_transport: "cookie" },
      init: { credentials: "include" },
    });
    expect(new Headers(call!.init.headers).get("x-simplefit-csrf")).toBe("1");
    expect(screen.getByText("You’re signed in.")).toBeInTheDocument();
    // Navigation belongs to the guest-only gate.
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows a wrong code and lets the user correct it", async () => {
    stubFetch(() => apiError(422, "code_invalid"));
    const { user, input } = await renderStep();

    await user.type(input, "000000");

    expect(await screen.findByText(/That code isn’t right/)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.type(input, "{Backspace}");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(completeAuthentication).not.toHaveBeenCalled();
  });

  it("offers a new code when the code expired, and requests a NEW sign-in challenge", async () => {
    const fetchMock = stubFetch(() => apiError(422, "code_expired"), accepted);
    const { user, input } = await renderStep();

    await user.type(input, CODE);
    expect(await screen.findByText(/This code has expired/)).toBeInTheDocument();
    expect(input).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Send a new code" }));

    expect(await screen.findByText(/We sent a new code/)).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(sent(fetchMock)[1]).toMatchObject({
      path: "/api/auth/email/sign-in",
      body: { email: EMAIL },
    });
  });

  it("locks the step while rate limited", async () => {
    stubFetch(() => apiError(429, "rate_limited", { "retry-after": "30" }));
    const { user, input } = await renderStep();

    await user.type(input, CODE);

    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    expect(screen.getByText("Resend unavailable for now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(input).toHaveAttribute("readonly");
  });

  it("keeps the code after a network failure and retries the same verification", async () => {
    const fetchMock = stubFetch(offline, tokens);
    const { user, input } = await renderStep();

    await user.type(input, CODE);
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(completeAuthentication).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock).map((call) => call.body)).toEqual([
      { email: EMAIL, code: CODE, refresh_token_transport: "cookie" },
      { email: EMAIL, code: CODE, refresh_token_transport: "cookie" },
    ]);
  });

  it("never keeps the code anywhere", async () => {
    stubFetch(tokens);
    const { user, input } = await renderStep();

    await user.type(input, CODE);
    await waitFor(() => expect(completeAuthentication).toHaveBeenCalled());

    expect(JSON.stringify({ ...sessionStorage })).not.toContain(CODE);
    expect(JSON.stringify({ ...localStorage })).not.toContain(CODE);
    expect(window.location.href).not.toContain(CODE);
  });
});

describe("A: registration code (WA4)", () => {
  async function renderStep() {
    pending.set("registration", {
      email: EMAIL,
      registrationToken: REGISTRATION_TOKEN,
      resendAt: Date.now() + 60_000,
    });
    await renderWithProviders(
      <RegistrationCodeForm
        returnTo="/app/home"
        flow={{
          email: EMAIL,
          registrationToken: REGISTRATION_TOKEN,
          resendAt: Date.now() + 60_000,
        }}
      />,
    );
    return { user: userEvent.setup(), input: screen.getByLabelText("6-digit code") };
  }

  it("verifies with the registration token on this device and completes the session", async () => {
    const fetchMock = stubFetch(tokens);
    const { user, input } = await renderStep();

    await user.type(input, CODE);

    await waitFor(() => expect(completeAuthentication).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock)).toMatchObject([
      {
        path: "/api/auth/email/registrations/verify",
        body: {
          registration_token: REGISTRATION_TOKEN,
          code: CODE,
          refresh_token_transport: "cookie",
        },
      },
    ]);
    expect(screen.getByText("Email verified on this device.")).toBeInTheDocument();
  });

  it("verified elsewhere: requests a NEW email_sign_in challenge and never reuses the registration token", async () => {
    const fetchMock = stubFetch(() => apiError(409, "verified_elsewhere"), accepted);
    const { user, input } = await renderStep();

    await user.type(input, CODE);
    expect(
      await screen.findByText(/This email was verified from another device/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in with a code" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fapp%2Fhome",
    );
    await user.click(screen.getByRole("button", { name: "Send a new code" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledExactlyOnceWith("/login/code?returnTo=%2Fapp%2Fhome"),
    );
    const handOff = sent(fetchMock)[1]!;
    expect(handOff).toMatchObject({ path: "/api/auth/email/sign-in", body: { email: EMAIL } });
    expect(JSON.stringify(handOff.body)).not.toContain(REGISTRATION_TOKEN);
    expect(pending.get("registration")).toBeUndefined();
    expect(pending.get("signIn")).toMatchObject({ email: EMAIL });
    expect(completeAuthentication).not.toHaveBeenCalled();
  });

  it("notices a link verification on another device when the tab becomes visible again", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ status: "verified_elsewhere" }));
    await renderStep();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(
      await screen.findByText(/This email was verified from another device/),
    ).toBeInTheDocument();
    expect(sent(fetchMock)).toMatchObject([
      {
        path: "/api/auth/email/registrations/status",
        body: { registration_token: REGISTRATION_TOKEN },
      },
    ]);
  });

  it("a resend replaces the registration token used for the next verification", async () => {
    const fetchMock = stubFetch(
      () => apiError(422, "code_expired"),
      () => registrationAccepted("sfg_second"),
      tokens,
    );
    const { user, input } = await renderStep();

    await user.type(input, CODE);
    await user.click(await screen.findByRole("button", { name: "Send a new code" }));
    await screen.findByText(/We sent a new code/);
    await user.type(input, "111222");

    await waitFor(() => expect(completeAuthentication).toHaveBeenCalled());
    expect(sent(fetchMock)[2]).toMatchObject({
      body: { registration_token: "sfg_second", code: "111222" },
    });
  });
});

describe("E01 verification link (WA4b)", () => {
  it.each([
    ["verified", "Email verified"],
    ["already_verified", "Email already verified"],
  ])(
    "strips the token from the URL, verifies the address (%s) and never signs in",
    async (status, title) => {
      window.history.replaceState(null, "", `/en/verify-email#token=${LINK_TOKEN}`);
      const fetchMock = stubFetch(() => jsonResponse({ status }));

      await renderWithProviders(<VerificationLinkResult />);

      expect(window.location.hash).toBe("");
      expect(window.location.href).not.toContain(LINK_TOKEN);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(sent(fetchMock)).toMatchObject([
        { path: "/api/auth/email/verification-links/verify", body: { token: LINK_TOKEN } },
      ]);
      expect(sent(fetchMock)[0]!.init.credentials).toBeUndefined();
      expect(completeAuthentication).not.toHaveBeenCalled();
      expect(screen.getAllByText(/doesn’t sign you in/).length).toBeGreaterThan(0);
      expect(kept()).not.toContain(LINK_TOKEN);
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(LINK_TOKEN);
    },
  );

  it("reports an expired link", async () => {
    window.history.replaceState(null, "", `/en/verify-email#token=${LINK_TOKEN}`);
    stubFetch(() => apiError(422, "code_expired"));

    await renderWithProviders(<VerificationLinkResult />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "This link has expired" }),
    ).toBeInTheDocument();
  });

  it("treats a link without a token as expired without calling the API", async () => {
    window.history.replaceState(null, "", "/en/verify-email");
    const fetchMock = stubFetch();

    await renderWithProviders(<VerificationLinkResult />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "This link has expired" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a network failure with the token kept in memory only", async () => {
    window.history.replaceState(null, "", `/en/verify-email#token=${LINK_TOKEN}`);
    const fetchMock = stubFetch(offline, () => jsonResponse({ status: "verified" }));

    await renderWithProviders(<VerificationLinkResult />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Email verified" }),
    ).toBeInTheDocument();
    expect(sent(fetchMock).map((call) => call.body)).toEqual([
      { token: LINK_TOKEN },
      { token: LINK_TOKEN },
    ]);
  });
});
