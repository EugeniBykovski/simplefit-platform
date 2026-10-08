import type { Page, Request } from "@playwright/test";

/*
 * A test double of the SF-25 FighterProfile API and of the signed-in session
 * around it, at the network edge of the production build (SF-38). It applies
 * the contract's rules (openapi/simplefit.api.json): a PATCH merges any subset
 * (`null` clears) and creates the profile on the first save; usernames follow
 * the published pattern and are unique ignoring case; a weight with more than
 * one decimal is `invalid_format`, never rounded; completion lists every
 * missing requirement as `required`, needs completed account registration
 * (`account_registration: required`) and keeps the first `completed_at`.
 * Nothing here is used outside the tests.
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

export type FighterApiOptions = {
  /** Saved fields before the test starts (a profile begun on mobile, say). */
  fields?: Record<string, unknown>;
  completed?: boolean;
  /** Account registration (SF-44) is complete. */
  accountComplete?: boolean;
  /** Usernames other fighters hold. */
  taken?: string[];
  /** Answer the next N writes with a network failure. */
  failNextWrites?: number;
  /** The session cannot be refreshed (expired). */
  sessionExpired?: boolean;
};

export type FighterApi = {
  state: () => Profile | undefined;
  requests: { method: string; path: string; body: unknown }[];
  /** Fails the next N profile writes with a network error. */
  failWrites: (count: number) => void;
  /** Ends the session: the refresh and every API call answer 401 from now on. */
  expire: () => void;
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

export async function fighterApi(page: Page, options: FighterApiOptions = {}): Promise<FighterApi> {
  let stored: Record<string, unknown> | undefined =
    options.fields || options.completed ? { ...EMPTY, ...options.fields } : undefined;
  let completedAt: string | null = options.completed ? "2026-10-08T12:00:00Z" : null;
  let failures = options.failNextWrites ?? 0;
  let expired = options.sessionExpired ?? false;
  const requests: FighterApi["requests"] = [];

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

  function patch(body: Record<string, unknown>) {
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

  function complete() {
    const missing = view().onboarding.missing_requirements;
    const codes: Record<string, string[]> = Object.fromEntries(
      missing.map((field) => [field, ["required"]]),
    );
    if (!(options.accountComplete ?? true)) codes.account_registration = ["required"];
    if (Object.keys(codes).length > 0) return validation(codes);
    completedAt ??= "2026-10-08T12:00:00Z";
    return { status: 200, json: { fighter_profile: view() } };
  }

  const entry = () => ({
    entry: {
      account_registration: options.accountComplete === false ? "in_progress" : "complete",
      capabilities: completedAt ? ["FIGHTER"] : [],
      destination: completedAt ? "fighter_home" : "fighter_onboarding",
      fighter_profile: view().onboarding.status,
      intent: null,
      mandatory: !completedAt,
      reason: "fixture",
    },
  });

  await page.route(
    (url) => url.pathname.startsWith("/api/") && url.port !== "3100",
    async (call) => {
      const request: Request = call.request();
      const url = new URL(request.url());
      const body = request.postData()
        ? (request.postDataJSON() as Record<string, unknown>)
        : undefined;
      requests.push({ method: request.method(), path: url.pathname, body });
      const json = (status: number, payload: unknown) => call.fulfill({ status, json: payload });

      if (expired && url.pathname !== "/api/auth/session/refresh") {
        return json(401, {
          error: { code: "unauthorized", message: "", details: {}, request_id: null },
        });
      }
      if (url.pathname === "/api/auth/session/refresh") {
        return expired
          ? json(401, {
              error: { code: "unauthorized", message: "", details: {}, request_id: null },
            })
          : json(200, TOKENS);
      }
      if (url.pathname === "/api/me") {
        return json(200, {
          user: { id: "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5", created_at: "2026-10-06T12:00:00Z" },
        });
      }
      if (url.pathname === "/api/v1/me/entry") return json(200, entry());
      if (url.pathname === "/api/v1/me/fighter-profile" && request.method() === "GET") {
        return json(200, { fighter_profile: view() });
      }
      if (url.pathname.startsWith("/api/v1/me/fighter-profile") && failures > 0) {
        failures -= 1;
        return call.abort("internetdisconnected");
      }
      if (url.pathname === "/api/v1/me/fighter-profile" && request.method() === "PATCH") {
        const result = patch(body ?? {});
        return json(result.status, result.json);
      }
      if (url.pathname === "/api/v1/me/fighter-profile/complete-onboarding") {
        const result = complete();
        return json(result.status, result.json);
      }
      return json(401, {
        error: { code: "unauthorized", message: "", details: {}, request_id: null },
      });
    },
  );

  return {
    state: () => (stored || completedAt ? view() : undefined),
    requests,
    failWrites: (count) => {
      failures = count;
    },
    expire: () => {
      expired = true;
    },
  };
}
