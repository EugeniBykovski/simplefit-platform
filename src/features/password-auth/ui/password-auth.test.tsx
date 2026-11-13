import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionModule from "@/entities/session";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { PasswordResetForm } from "./password-reset-form";
import { PasswordSignInForm } from "./password-sign-in-form";

/*
 * SF-157 with the network mocked at `fetch`: the forms send what the API needs,
 * branch on codes only, and never keep or show a password anywhere else.
 */

const completeAuthentication = vi.hoisted(() => vi.fn(async () => "authenticated" as const));
vi.mock("@/entities/session", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  completeAuthentication,
}));

const API = "http://api.test";
const EMAIL = "founder@example.com";
const PASSWORD = "correct horse battery staple";

const tokens = () =>
  jsonResponse({
    access_token: "sfa_password",
    access_token_expires_at: new Date(Date.now() + 900_000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    refresh_token_transport: "cookie",
    token_type: "Bearer",
  });
const apiError = (
  status: number,
  code: string,
  details: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) => jsonResponse({ error: { code, message: "ignored", details } }, { status, headers });
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

type Call = [string, RequestInit];
function stubFetch(...answers: (() => Response | Promise<Response>)[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) fetchMock.mockImplementationOnce(answer);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
  (fetchMock.mock.calls as Call[]).map(([url, init]) => ({
    path: url.replace(API, ""),
    body: init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
    init,
  }));

beforeEach(() => {
  completeAuthentication.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

async function signIn(password = PASSWORD) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), EMAIL);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("PasswordSignInForm (SF-157)", () => {
  it("signs in with the cookie transport and hands the tokens to the shared pipeline", async () => {
    const fetchMock = stubFetch(tokens);
    await renderWithProviders(<PasswordSignInForm />);
    await signIn();

    const [call] = sent(fetchMock);
    expect(call?.path).toBe("/api/auth/password/sign-in");
    expect(call?.body).toEqual({
      email: EMAIL,
      password: PASSWORD,
      refresh_token_transport: "cookie",
    });
    expect(call?.init.credentials).toBe("include");
    expect(new Headers(call?.init.headers).get("x-simplefit-csrf")).toBe("1");
    expect(completeAuthentication).toHaveBeenCalledTimes(1);
    // Nothing about the password is kept by the browser.
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(PASSWORD);
    expect(window.location.href).not.toContain(PASSWORD);
  });

  it("one answer for a wrong password or an unknown address; the password field is cleared", async () => {
    stubFetch(() => apiError(422, "invalid_credentials"));
    await renderWithProviders(<PasswordSignInForm />);
    await signIn();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email address and password don’t match. Check both and try again.",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(completeAuthentication).not.toHaveBeenCalled();
  });

  it("throttled: says so and disables the button until the retry-after passes", async () => {
    stubFetch(() => apiError(429, "rate_limited", {}, { "retry-after": "60" }));
    await renderWithProviders(<PasswordSignInForm />);
    await signIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("a suspended account and a network failure are their own states", async () => {
    stubFetch(() => apiError(403, "account_suspended"), offline);
    await renderWithProviders(<PasswordSignInForm />);
    const user = await signIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("This account is suspended");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t reach SimpleFit.");
  });

  it("asks for both fields before calling the API", async () => {
    const fetchMock = stubFetch(tokens);
    await renderWithProviders(<PasswordSignInForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your email address and password.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the show/hide toggle is a labelled, pressed-state button", async () => {
    await renderWithProviders(<PasswordSignInForm />);
    const user = userEvent.setup();
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "current-password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("PasswordResetForm (SF-157)", () => {
  const accepted = () =>
    jsonResponse({ expires_in_seconds: 600, resend_after_seconds: 60 }, { status: 202 });

  async function toCodeStep(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByText(/we’ve emailed it a 6-digit code/)).toBeVisible();
  }

  it("requests a code, then sets the password with it; signs nobody in", async () => {
    const fetchMock = stubFetch(accepted, () => new Response(null, { status: 204 }));
    await renderWithProviders(
      <PasswordResetForm signInLink={<span data-testid="sign-in-link">Sign in</span>} />,
    );
    const user = userEvent.setup();
    await toCodeStep(user);
    await user.type(screen.getByLabelText("Code from the email"), "604218");
    await user.type(screen.getByLabelText("New password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Set password" }));

    expect(await screen.findByText(/Your password is set/)).toBeVisible();
    expect(screen.getByTestId("sign-in-link")).toBeVisible();
    expect(sent(fetchMock).map((call) => [call.path, call.body])).toEqual([
      ["/api/auth/password/reset", { email: EMAIL }],
      ["/api/auth/password/reset/confirm", { email: EMAIL, code: "604218", password: PASSWORD }],
    ]);
    expect(completeAuthentication).not.toHaveBeenCalled();
  });

  it("checks the length before sending; a wrong or expired code is said as such", async () => {
    const fetchMock = stubFetch(
      accepted,
      () => apiError(422, "code_invalid"),
      () => apiError(422, "code_expired"),
    );
    await renderWithProviders(<PasswordResetForm signInLink={null} />);
    const user = userEvent.setup();
    await toCodeStep(user);
    await user.type(screen.getByLabelText("Code from the email"), "111111");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 12 to 128 characters");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code isn’t right.");

    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This code has expired");
  });

  it("the backend's password rule is shown as the password problem", async () => {
    stubFetch(accepted, () =>
      apiError(422, "validation_error", {
        fields: { password: ["must not be your email address"] },
      }),
    );
    await renderWithProviders(<PasswordResetForm signInLink={null} />);
    const user = userEvent.setup();
    await toCodeStep(user);
    await user.type(screen.getByLabelText("Code from the email"), "604218");
    await user.type(screen.getByLabelText("New password"), "founder@example.com!!");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("and not your email address");
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true");
  });
});
