import type { BrowserContext, Request } from "@playwright/test";

/*
 * A test double of the signed-in onboarding APIs at the network edge of the
 * production build (SF-38, SF-46): the session, SF-44 account registration,
 * the SF-25 FighterProfile and the SF-45 entry resolver. It applies the
 * contracts' rules (openapi/simplefit.api.json):
 *
 * - Account registration: a PATCH saves any subset; the first save that
 *   persists something creates the registration (`in_progress`); full name
 *   1–200 characters, `null` clears it before completion; a date of birth is
 *   a real date (`invalid_format`), not in the future (`out_of_range`), at
 *   least 16 years ago by the server's calendar date
 *   (`too_young`) and `immutable` once complete; `accept_terms` /
 *   `accept_privacy` only as `true` (`must_be_accepted`), recorded at the
 *   configured current version; product news subscribes and withdraws.
 *   Completion lists every missing requirement as `required` and is
 *   permanent: a later document version change does not reopen it.
 * - FighterProfile: a PATCH merges any subset (`null` clears) and creates the
 *   profile on the first save; usernames follow the published pattern and are
 *   unique ignoring case; a weight with more than one decimal is
 *   `invalid_format`, never rounded; completion lists every missing
 *   requirement, needs completed account registration
 *   (`account_registration: required`) and keeps the first `completed_at`.
 * - Entry resolution follows SF-45's order: account registration first, then
 *   the explicit intent's journey, then the role state (Fighter), otherwise
 *   role selection.
 * - First-run experiences (SF-40, ADR 0018): the Fighter web tour is
 *   `unavailable` until Fighter onboarding is complete, then `pending`; the
 *   first outcome recorded (`completed` / `dismissed`) is final, an
 *   unavailable tour answers `409 conflict` and an unknown one `404`.
 *
 * - Sign-in for a signed-out start (SF-36): email registration (WA3 / WA4,
 *   the code `482910`), Google and Apple (any provider token).
 *
 * Attached to a page, or to a browser context so that its tabs share one
 * backend. Nothing here is used outside the tests.
 */

type Profile = Record<string, unknown> & { onboarding: Onboarding };
type Onboarding = {
  status: "not_started" | "in_progress" | "completed";
  completed_at: string | null;
  missing_requirements: string[];
};

const REQUIRED = ["display_name", "username", "country_code", "city", "experience_level", "stance"];
const EMPTY: Record<string, unknown> = {
  display_name: null,
  username: null,
  country_code: null,
  city: null,
  experience_level: null,
  stance: null,
  amateur_bout_count: null,
  goals: [],
  weight_class: null,
  current_weight_kg: null,
  height_cm: null,
  next_fight_on: null,
  next_fight_name: null,
};
const TOKENS = {
  access_token: "sfa_fixture",
  access_token_expires_at: "2099-01-01T00:00:00Z",
  refresh_token_transport: "cookie",
  token_type: "Bearer",
};
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_]{1,28}[A-Za-z0-9]$/;
const ENUMS: Record<string, string[]> = {
  experience_level: [
    "new_to_boxing",
    "recreational",
    "amateur",
    "competitive_amateur",
    "professional",
  ],
  stance: ["orthodox", "southpaw", "switch"],
  weight_class: [
    "minus_63_5",
    "minus_67",
    "minus_71",
    "minus_75",
    "minus_80",
    "minus_86",
    "plus_86",
    "not_sure",
  ],
};
const NOW = "2026-10-08T12:00:00Z";

type Consent = { version: string; at: string } | null;
export type AccountFixture = {
  full_name?: string | null;
  date_of_birth?: string | null;
  /** The accepted version, or `null` when never accepted. */
  terms?: string | null;
  privacy?: string | null;
  product_news?: boolean;
  completed?: boolean;
};

export type OnboardingApiOptions = {
  /** Saved FighterProfile fields before the test starts (a profile begun on mobile, say). */
  fields?: Record<string, unknown>;
  completed?: boolean;
  /**
   * Account registration (SF-44) is complete (the default: a complete account
   * with every requirement). `false` starts with no registration at all.
   */
  accountComplete?: boolean;
  /** An explicit starting registration (overrides `accountComplete`). */
  account?: AccountFixture;
  /** The document versions in force (default `terms-v1`, `privacy-v1`). */
  currentVersions?: { terms: string; privacy: string };
  /** Usernames other fighters hold. */
  taken?: string[];
  /** Answer the next N writes with a network failure. */
  failNextWrites?: number;
  /** The session cannot be refreshed (expired). */
  sessionExpired?: boolean;
  /**
   * A signed-out visitor: no session until email registration verifies
   * (implies a new account, with no registration).
   */
  signedOut?: boolean;
  /** The Fighter web tour's recorded outcome before the test starts. */
  tour?: "completed" | "dismissed";
};

export type OnboardingApi = {
  state: () => Profile | undefined;
  account: () => Record<string, unknown>;
  requests: { method: string; path: string; query: string; body: unknown }[];
  /** Fails the next N profile writes with a network error. */
  failWrites: (count: number) => void;
  /** Ends the session: the refresh and every API call answer 401 from now on. */
  expire: () => void;
  /** Another client saves FighterProfile `fields` without this page knowing. */
  externalUpdate: (fields: Record<string, unknown>) => void;
  /** Another tab or client completes Fighter onboarding through the API. */
  completeExternally: () => void;
  /** Another tab or client saves account registration fields. */
  externalAccountUpdate: (fields: AccountFixture) => void;
  /** A new Terms / Privacy version comes into force. */
  rollConsentVersions: (versions: { terms: string; privacy: string }) => void;
  /** The entry resolver fails for the next N requests. */
  failEntry: (count: number) => void;
  /** The Fighter web tour's recorded outcome (`undefined` while none is). */
  tour: () => string | undefined;
  /** Fails the next N first-run reads and writes with a network error. */
  failFirstRun: (count: number) => void;
  /** Another tab or client records the tour's outcome through the API. */
  recordTourExternally: (outcome: "completed" | "dismissed") => void;
};

const validation = (field_codes: Record<string, string[]>) => ({
  status: 422,
  json: {
    error: {
      code: "validation_error",
      message: "Validation failed",
      details: {
        fields: Object.fromEntries(
          Object.keys(field_codes).map((field) => [field, ["is invalid"]]),
        ),
        field_codes,
      },
      request_id: null,
    },
  },
});

const isCalendarDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const today = () => new Date().toISOString().slice(0, 10);

export async function onboardingApi(
  target: Pick<BrowserContext, "route">,
  options: OnboardingApiOptions = {},
): Promise<OnboardingApi> {
  // ── FighterProfile (SF-25) ──
  let stored: Record<string, unknown> | undefined =
    options.fields || options.completed ? { ...EMPTY, ...options.fields } : undefined;
  let completedAt: string | null = options.completed ? NOW : null;

  // ── Account registration (SF-44) ──
  let versions = options.currentVersions ?? { terms: "terms-v1", privacy: "privacy-v1" };
  const complete =
    options.account?.completed ??
    (options.account || options.signedOut ? false : (options.accountComplete ?? true));
  const seed: AccountFixture =
    options.account ??
    (complete
      ? {
          full_name: "Alex Kowalski",
          date_of_birth: "2000-05-17",
          terms: versions.terms,
          privacy: versions.privacy,
        }
      : {});
  const acc = {
    full_name: seed.full_name ?? null,
    date_of_birth: seed.date_of_birth ?? null,
    terms: (seed.terms ? { version: seed.terms, at: NOW } : null) as Consent,
    privacy: (seed.privacy ? { version: seed.privacy, at: NOW } : null) as Consent,
    news: {
      subscribed: seed.product_news ?? false,
      at: seed.product_news === undefined ? null : NOW,
    },
    persisted: Object.values(seed).some((value) => value !== undefined && value !== null),
    completedAt: complete ? NOW : (null as string | null),
  };

  // ── First-run experiences (SF-40) ──
  let tourOutcome: { outcome: string; at: string } | undefined = options.tour
    ? { outcome: options.tour, at: NOW }
    : undefined;
  let firstRunFailures = 0;
  const tourView = () => ({
    experience: "fighter_web_tour",
    status: tourOutcome?.outcome ?? (completedAt ? "pending" : "unavailable"),
    recorded_at: tourOutcome?.at ?? null,
  });

  let failures = options.failNextWrites ?? 0;
  let entryFailures = 0;
  let expired = (options.sessionExpired ?? false) || (options.signedOut ?? false);
  const requests: OnboardingApi["requests"] = [];

  const view = (): Profile => {
    const fields = { ...EMPTY, ...stored };
    const missing = REQUIRED.filter((field) => fields[field] === null || fields[field] === "");
    return {
      ...fields,
      onboarding: {
        status: completedAt ? "completed" : stored ? "in_progress" : "not_started",
        completed_at: completedAt,
        missing_requirements: missing,
      },
    };
  };

  const legal = (kind: "terms" | "privacy") => {
    const consent = acc[kind];
    return {
      accepted: consent !== null,
      accepted_version: consent?.version ?? null,
      accepted_at: consent?.at ?? null,
      current_version: versions[kind],
      current: consent?.version === versions[kind],
    };
  };
  const accountMissing = () =>
    [
      acc.full_name ? undefined : "full_name",
      acc.date_of_birth ? undefined : "date_of_birth",
      legal("terms").current ? undefined : "terms",
      legal("privacy").current ? undefined : "privacy",
    ].filter((item): item is string => item !== undefined);
  const accountView = () => ({
    registration: {
      status: acc.completedAt ? "complete" : acc.persisted ? "in_progress" : "not_started",
      completed_at: acc.completedAt,
      missing_requirements: acc.completedAt ? [] : accountMissing(),
    },
    full_name: acc.full_name,
    date_of_birth: acc.date_of_birth,
    consents: { terms: legal("terms"), privacy: legal("privacy") },
    product_news: { subscribed: acc.news.subscribed, updated_at: acc.news.at },
  });

  function patchAccount(body: Record<string, unknown>) {
    const codes: Record<string, string[]> = {};
    const apply: (() => void)[] = [];
    for (const [field, value] of Object.entries(body)) {
      if (field === "full_name") {
        if (value === null) {
          if (acc.completedAt) codes[field] = ["required"];
          else apply.push(() => (acc.full_name = null));
        } else if (typeof value !== "string" || value.trim() === "") codes[field] = ["required"];
        else if (value.trim().length > 200) codes[field] = ["too_long"];
        else apply.push(() => (acc.full_name = value.trim()));
      } else if (field === "date_of_birth") {
        if (acc.completedAt) codes[field] = ["immutable"];
        else if (!isCalendarDate(value)) codes[field] = ["invalid_format"];
        else if (value > today()) codes[field] = ["out_of_range"];
        else {
          const sixteenth = `${Number(value.slice(0, 4)) + 16}${value.slice(4)}`;
          if (sixteenth > today()) codes[field] = ["too_young"];
          else apply.push(() => (acc.date_of_birth = value));
        }
      } else if (field === "accept_terms" || field === "accept_privacy") {
        const kind = field === "accept_terms" ? "terms" : "privacy";
        if (value !== true) codes[field] = ["must_be_accepted"];
        else apply.push(() => (acc[kind] = { version: versions[kind], at: NOW }));
      } else if (field === "product_news") {
        if (typeof value !== "boolean") codes[field] = ["invalid_type"];
        else apply.push(() => (acc.news = { subscribed: value, at: NOW }));
      } else {
        codes[field] = ["invalid"];
      }
    }
    if (Object.keys(codes).length > 0) return validation(codes);
    for (const change of apply) change();
    if (apply.length > 0) acc.persisted = true;
    return { status: 200, json: { account_profile: accountView() } };
  }

  function completeAccount() {
    if (!acc.completedAt) {
      const missing = accountMissing();
      if (missing.length > 0) {
        return validation(Object.fromEntries(missing.map((item) => [item, ["required"]])));
      }
      acc.completedAt = NOW;
      acc.persisted = true;
    }
    return { status: 200, json: { account_profile: accountView() } };
  }

  function patchFighter(body: Record<string, unknown>) {
    const codes: Record<string, string[]> = {};
    const next: Record<string, unknown> = {};
    for (const [field, raw] of Object.entries(body)) {
      const value = typeof raw === "string" ? raw.trim() : raw;
      if (value === null || value === "") {
        if (completedAt && REQUIRED.includes(field)) codes[field] = ["required"];
        else next[field] = null;
        continue;
      }
      if (field === "username") {
        if (typeof value !== "string" || !USERNAME.test(value)) codes[field] = ["invalid_format"];
        else if ((options.taken ?? []).some((name) => name.toLowerCase() === value.toLowerCase())) {
          codes[field] = ["already_exists"];
        } else next[field] = value.toLowerCase();
      } else if (field === "country_code") {
        if (typeof value === "string" && /^[A-Za-z]{2}$/.test(value))
          next[field] = value.toUpperCase();
        else codes[field] = ["invalid_choice"];
      } else if (field === "current_weight_kg") {
        if (typeof value !== "number" || value <= 0 || value >= 1000)
          codes[field] = ["out_of_range"];
        else if (Math.round(value * 10) !== value * 10) codes[field] = ["invalid_format"];
        else next[field] = value;
      } else if (field === "amateur_bout_count" || field === "height_cm") {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
          codes[field] = ["out_of_range"];
        else next[field] = value;
      } else if (field in ENUMS) {
        if (typeof value === "string" && ENUMS[field]?.includes(value)) next[field] = value;
        else codes[field] = ["invalid_choice"];
      } else {
        next[field] = value;
      }
    }
    if (Object.keys(codes).length > 0) return validation(codes);
    stored = { ...EMPTY, ...stored, ...next };
    return { status: 200, json: { fighter_profile: view() } };
  }

  function completeFighter() {
    const missing = view().onboarding.missing_requirements;
    const codes: Record<string, string[]> = Object.fromEntries(
      missing.map((field) => [field, ["required"]]),
    );
    if (!acc.completedAt) codes.account_registration = ["required"];
    if (Object.keys(codes).length > 0) return validation(codes);
    completedAt ??= NOW;
    return { status: 200, json: { fighter_profile: view() } };
  }

  // SF-45's order: account registration, the explicit intent, the role state, role selection.
  const entry = (intent: string | null) => {
    const fighter = view().onboarding.status;
    const journeys: Record<string, string> = {
      fighter: fighter === "completed" ? "fighter_home" : "fighter_onboarding",
      coach: "coach_onboarding",
      gym: "gym_onboarding",
      sponsor: "sponsor_application",
    };
    const destination = !acc.completedAt
      ? "account_registration"
      : intent !== null && journeys[intent]
        ? journeys[intent]
        : fighter === "completed"
          ? "fighter_home"
          : fighter === "in_progress"
            ? "fighter_onboarding"
            : "role_selection";
    return {
      entry: {
        account_registration: accountView().registration.status,
        capabilities: completedAt ? ["FIGHTER"] : [],
        destination,
        fighter_profile: fighter,
        intent,
        mandatory: destination === "account_registration" || destination === "fighter_onboarding",
        reason: "fixture",
      },
    };
  };

  await target.route(
    (url) => url.pathname.startsWith("/api/") && url.port !== "3100",
    async (call) => {
      const request: Request = call.request();
      const url = new URL(request.url());
      const body = request.postData()
        ? (request.postDataJSON() as Record<string, unknown>)
        : undefined;
      requests.push({ method: request.method(), path: url.pathname, query: url.search, body });
      const json = (status: number, payload: unknown) => call.fulfill({ status, json: payload });
      const unauthorized = () =>
        json(401, { error: { code: "unauthorized", message: "", details: {}, request_id: null } });

      if (url.pathname === "/api/auth/email/registrations") {
        return json(202, {
          registration_token: "sfg_fixture",
          expires_in_seconds: 600,
          resend_after_seconds: 60,
        });
      }
      if (url.pathname === "/api/auth/email/registrations/verify") {
        if ((body as { code?: string } | undefined)?.code !== "482910") {
          return json(422, {
            error: { code: "code_invalid", message: "", details: {}, request_id: null },
          });
        }
        expired = false;
        return json(200, TOKENS);
      }
      // Google and Apple (SF-36): the provider's token signs the visitor in.
      if (url.pathname === "/api/auth/google" || url.pathname === "/api/auth/apple") {
        expired = false;
        return json(200, { ...TOKENS, account: "created" });
      }
      if (expired && url.pathname !== "/api/auth/session/refresh") return unauthorized();
      if (url.pathname === "/api/auth/session/refresh") {
        return expired ? unauthorized() : json(200, TOKENS);
      }
      if (url.pathname === "/api/me") {
        return json(200, {
          user: { id: "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5", created_at: "2026-10-06T12:00:00Z" },
        });
      }
      if (url.pathname === "/api/v1/me/entry") {
        if (entryFailures > 0) {
          entryFailures -= 1;
          return json(503, {
            error: { code: "service_unavailable", message: "", details: {}, request_id: null },
          });
        }
        return json(200, entry(url.searchParams.get("intent")));
      }
      const write = request.method() !== "GET";
      if (
        write &&
        failures > 0 &&
        (url.pathname.startsWith("/api/v1/me/fighter-profile") ||
          url.pathname.startsWith("/api/v1/me/account-profile"))
      ) {
        failures -= 1;
        return call.abort("internetdisconnected");
      }
      if (url.pathname === "/api/v1/me/account-profile") {
        if (!write) return json(200, { account_profile: accountView() });
        const result = patchAccount(body ?? {});
        return json(result.status, result.json);
      }
      if (url.pathname === "/api/v1/me/account-profile/complete-registration") {
        const result = completeAccount();
        return json(result.status, result.json);
      }
      if (url.pathname === "/api/v1/me/fighter-profile") {
        if (!write) return json(200, { fighter_profile: view() });
        const result = patchFighter(body ?? {});
        return json(result.status, result.json);
      }
      if (url.pathname === "/api/v1/me/fighter-profile/complete-onboarding") {
        const result = completeFighter();
        return json(result.status, result.json);
      }
      if (url.pathname.startsWith("/api/v1/me/first-run")) {
        if (firstRunFailures > 0) {
          firstRunFailures -= 1;
          return call.abort("internetdisconnected");
        }
        if (url.pathname === "/api/v1/me/first-run" && !write) {
          return json(200, { experiences: [tourView()] });
        }
        if (
          url.pathname === "/api/v1/me/first-run/fighter_web_tour" &&
          request.method() === "PUT"
        ) {
          const outcome = (body as { outcome?: unknown } | undefined)?.outcome;
          if (outcome === undefined) return json(422, validation({ outcome: ["required"] }).json);
          if (outcome !== "completed" && outcome !== "dismissed") {
            return json(422, validation({ outcome: ["invalid_choice"] }).json);
          }
          if (!completedAt) {
            return json(409, {
              error: { code: "conflict", message: "", details: {}, request_id: null },
            });
          }
          tourOutcome ??= { outcome, at: new Date().toISOString() };
          return json(200, { experience: tourView() });
        }
        return json(404, {
          error: { code: "not_found", message: "", details: {}, request_id: null },
        });
      }
      return unauthorized();
    },
  );

  return {
    state: () => (stored || completedAt ? view() : undefined),
    account: () => accountView(),
    requests,
    failWrites: (count) => {
      failures = count;
    },
    expire: () => {
      expired = true;
    },
    externalUpdate: (fields) => {
      stored = { ...EMPTY, ...stored, ...fields };
    },
    completeExternally: () => {
      completedAt ??= NOW;
    },
    externalAccountUpdate: (fields) => {
      if (fields.full_name !== undefined) acc.full_name = fields.full_name;
      if (fields.date_of_birth !== undefined) acc.date_of_birth = fields.date_of_birth;
      if (fields.terms) acc.terms = { version: fields.terms, at: NOW };
      if (fields.privacy) acc.privacy = { version: fields.privacy, at: NOW };
      if (fields.product_news !== undefined)
        acc.news = { subscribed: fields.product_news, at: NOW };
      if (fields.completed) acc.completedAt ??= NOW;
      acc.persisted = true;
    },
    rollConsentVersions: (next) => {
      versions = next;
    },
    failEntry: (count) => {
      entryFailures = count;
    },
    tour: () => tourOutcome?.outcome,
    failFirstRun: (count) => {
      firstRunFailures = count;
    },
    recordTourExternally: (outcome) => {
      tourOutcome ??= { outcome, at: NOW };
    },
  };
}

/** The Fighter-onboarding specs' name for the same double (SF-38). */
export const fighterApi = onboardingApi;
