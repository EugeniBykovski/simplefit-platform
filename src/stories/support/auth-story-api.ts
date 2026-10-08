/*
 * Deterministic API adapter for the Authentication stories (SF-24): answers
 * the generated client's requests from a fixed table, so stories render the
 * production components in every state without a backend, a network or a
 * live auth provider. Installed per story in `beforeEach`; restored after.
 */
type Answer = { status: number; body?: unknown; headers?: Record<string, string> } | "pending";

export const VIEWER = {
  id: "8a6e0804-2bd0-4672-b79d-d97027f9071b",
  created_at: "2026-10-01T10:00:00Z",
};

export const SESSION = {
  access_token: "sfa_storybook",
  access_token_expires_at: "2099-01-01T00:00:00Z",
  refresh_token_expires_at: "2099-01-01T00:00:00Z",
  refresh_token_transport: "cookie",
  token_type: "Bearer",
};

export const ok = (body: unknown, status = 200): Answer => ({ status, body });
export const apiError = (
  status: number,
  code: string,
  headers?: Record<string, string>,
): Answer => ({
  status,
  body: { error: { code, message: "storybook", details: {} } },
  headers,
});

/** Installs `routes` (path → answer) as `fetch`; `"pending"` never settles. Returns the cleanup. */
export function installApi(routes: Record<string, Answer>) {
  const original = window.fetch;
  window.fetch = async (input) => {
    const path = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    ).pathname;
    const answer = routes[path] ?? apiError(404, "not_found");
    if (answer === "pending") return new Promise<Response>(() => undefined);
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json", ...answer.headers },
    });
  };
  return () => {
    window.fetch = original;
  };
}

/** Seeds this tab's pending email flow, as the email step leaves it. */
export function seedPending(kind: "signIn" | "registration") {
  const resendAt = Date.now() + 59_000;
  if (kind === "signIn") {
    sessionStorage.setItem(
      "simplefit.auth.email-sign-in",
      JSON.stringify({ email: "yauheni@example.com", resendAt }),
    );
  } else {
    sessionStorage.setItem(
      "simplefit.auth.email-registration",
      JSON.stringify({
        email: "yauheni@example.com",
        registrationToken: "sfg_storybook",
        resendAt,
      }),
    );
  }
  return () => sessionStorage.clear();
}
