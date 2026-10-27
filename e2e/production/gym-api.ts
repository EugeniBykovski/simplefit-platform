import type { BrowserContext, Request } from "@playwright/test";

/*
 * A test double of the Gym owner registration APIs at the network edge of
 * the production build (SF-86), layered over `onboardingApi` (register it
 * after; anything it does not own falls through). It applies the SF-83 /
 * SF-84 / SF-85 contracts (openapi/simplefit.api.json):
 *
 * - `POST /api/v1/gyms`: a replayed `client_request_id` returns its gym, or
 *   `409 conflict` (`client_request_id: discarded`) once that gym was
 *   discarded; a new key resolves to the creator's open draft (its fields
 *   ignored); otherwise at most `limit` creations (`429 rate_limited` with
 *   `retry-after`), then a draft owned by the viewer (201).
 * - `GET /api/v1/me/gyms`: the viewer's gyms, newest first.
 * - `GET|PATCH /api/v1/gyms/{id}/setup` and
 *   `PUT …/setup/primary-location`: `404` for a gym the viewer does not
 *   staff; every write requires `expected_revision` (`422 required`) and a
 *   stale one answers `409 conflict` (`revision: stale`) and changes
 *   nothing; each accepted write bumps the revision. Name 1–80, the six gym
 *   types, the phone shape, an http(s) website, tagline ≤ 120, the six
 *   accent swatches; the location's country, city and address are required
 *   and its name defaults to the city.
 * - `POST …/complete-setup`: `422 required` for each missing requirement,
 *   then `completed` (repeatable).
 * - `DELETE /api/v1/gyms/{id}`: discards a draft (its keys become
 *   `discarded`).
 * - The entry for `intent=gym` (SF-84): no gyms → `gym_onboarding`; only the
 *   draft → `gym_onboarding` with its id; one completed gym → `gym_home`;
 *   otherwise the remembered gym or `gym_selection`. `PUT /me/entry/context`
 *   with `context: gym` accepts a completed gym only.
 */

const GYM_TYPES = [
  "boxing_gym",
  "boxing_club",
  "amateur_club",
  "professional_team",
  "combat_sports_gym",
  "fitness_boxing_studio",
];
const ACCENTS = ["#aeb95a", "#e3a24f", "#e07a5f", "#7fa7c9", "#edefe7", "#8d9840"];
const PHONE = /^\+?[0-9][0-9 ()-]{4,30}$/;
const NOW = "2026-10-27T09:00:00Z";
const VIEWER_MEMBERSHIP = "7a1b2c3d-0000-4000-8000-000000000002";

export type Gym = {
  id: string;
  name: string;
  gym_type: string;
  phone: string | null;
  website: string | null;
  tagline: string | null;
  accent_color: string | null;
  location: Record<string, unknown> | null;
  revision: number;
  status: "draft" | "completed";
  role: "owner" | "manager" | "coach";
  /** The viewer's membership was removed: the gym is invisible (404). */
  hidden?: boolean;
};

export type GymApiOptions = {
  /** Gyms that exist before the test starts. */
  gyms?: Partial<Gym>[];
  /** Creations allowed before `429` (the rolling per-user limit is 5). */
  limit?: number;
  /** Leave `GET /me/entry` to the double underneath (its own resolution counts). */
  entry?: boolean;
};

export type GymApi = {
  gyms: () => Gym[];
  requests: { method: string; path: string; body: unknown }[];
  /** The next N gym writes fail as a dropped connection, changing nothing. */
  failWrites: (count: number) => void;
  /** The next N gym writes are applied, then their response is lost. */
  loseResponses: (count: number) => void;
  /** Another tab or device changes a gym's setup (bumping its revision). */
  externalUpdate: (id: string, fields: Partial<Gym>) => void;
  /** Another tab or device discards a draft. */
  externalDiscard: (id: string) => void;
  /** The gym chosen through `PUT /me/entry/context`, if any. */
  lastGym: () => string | undefined;
  /** The session ends: every gym call answers 401 (pair with `onboardingApi().expire()`). */
  expire: () => void;
};

const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  json: { error: { code, message: code, details, request_id: null } },
});
const validation = (field_codes: Record<string, string[]>) =>
  error(422, "validation_error", {
    fields: Object.fromEntries(Object.keys(field_codes).map((field) => [field, ["is invalid"]])),
    field_codes,
  });

let sequence = 0;
const newId = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;

export async function gymApi(
  target: Pick<BrowserContext, "route">,
  options: GymApiOptions = {},
): Promise<GymApi> {
  const gyms: Gym[] = (options.gyms ?? []).map((gym) => ({
    id: newId(),
    name: "Simple Boxing Gym",
    gym_type: "boxing_gym",
    phone: null,
    website: null,
    tagline: null,
    accent_color: null,
    location: null,
    revision: 1,
    status: "draft",
    role: "owner",
    ...gym,
  }));
  const keys = new Map<string, string>();
  const discarded = new Set<string>();
  let created = 0;
  let failures = 0;
  let losses = 0;
  let lastGym: string | undefined;
  let expired = false;
  const requests: GymApi["requests"] = [];

  const visible = () => gyms.filter((gym) => !gym.hidden && !discarded.has(gym.id));
  const find = (id: string) => visible().find((gym) => gym.id === id);
  const missing = (gym: Gym) =>
    gym.status === "completed" ? [] : gym.location === null ? ["primary_location"] : [];
  const viewer = (gym: Gym) => ({
    role: gym.role,
    permissions: gym.role === "owner" ? ["gym.settings.manage"] : [],
    staff_membership_id: VIEWER_MEMBERSHIP,
  });
  const setupView = (gym: Gym) => ({
    setup: {
      gym_id: gym.id,
      name: gym.name,
      gym_type: gym.gym_type,
      phone: gym.phone,
      website: gym.website,
      tagline: gym.tagline,
      accent_color: gym.accent_color,
      primary_location: gym.location,
      revision: gym.revision,
      setup_status: gym.status,
      missing_requirements: missing(gym),
      viewer: viewer(gym),
    },
  });
  const gymView = (gym: Gym) => ({
    gym: {
      id: gym.id,
      name: gym.name,
      gym_type: gym.gym_type,
      setup_status: gym.status,
      locations: gym.location ? [gym.location] : [],
      inserted_at: NOW,
      updated_at: NOW,
      viewer: viewer(gym),
    },
  });

  function create(body: Record<string, unknown>) {
    const key = body.client_request_id;
    if (typeof key !== "string" || key === "")
      return validation({ client_request_id: ["required"] });
    const replay = keys.get(key);
    if (replay !== undefined) {
      if (discarded.has(replay)) return error(409, "conflict", { client_request_id: "discarded" });
      const gym = find(replay);
      if (!gym) return error(409, "conflict", { client_request_id: "reused" });
      return { status: 200, json: gymView(gym) };
    }
    const draft = visible().find((gym) => gym.status === "draft" && gym.role === "owner");
    if (draft) {
      keys.set(key, draft.id);
      return { status: 200, json: gymView(draft) };
    }
    const codes: Record<string, string[]> = {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") codes.name = ["required"];
    else if ([...name].length > 80) codes.name = ["too_long"];
    if (body.gym_type === undefined) codes.gym_type = ["required"];
    else if (!GYM_TYPES.includes(String(body.gym_type))) codes.gym_type = ["invalid_choice"];
    if (Object.keys(codes).length > 0) return validation(codes);
    if (created >= (options.limit ?? 5)) {
      return { ...error(429, "rate_limited"), headers: { "retry-after": "3600" } };
    }
    created += 1;
    const gym: Gym = {
      id: newId(),
      name,
      gym_type: String(body.gym_type),
      phone: null,
      website: null,
      tagline: null,
      accent_color: null,
      location: null,
      revision: 1,
      status: "draft",
      role: "owner",
    };
    gyms.unshift(gym);
    keys.set(key, gym.id);
    return { status: 201, json: gymView(gym) };
  }

  /** The revision check every partial write starts with. */
  function revisionError(gym: Gym, body: Record<string, unknown>) {
    if (body.expected_revision === undefined)
      return validation({ expected_revision: ["required"] });
    if (body.expected_revision !== gym.revision)
      return error(409, "conflict", { revision: "stale" });
    return undefined;
  }

  function update(gym: Gym, body: Record<string, unknown>) {
    const refused = revisionError(gym, body);
    if (refused) return refused;
    const codes: Record<string, string[]> = {};
    const next: Partial<Gym> = {};
    for (const [field, raw] of Object.entries(body)) {
      if (field === "expected_revision") continue;
      const value = typeof raw === "string" ? raw.trim() : raw;
      if (field === "name") {
        if (typeof value !== "string" || value === "") codes.name = ["required"];
        else if ([...value].length > 80) codes.name = ["too_long"];
        else next.name = value;
      } else if (field === "gym_type") {
        if (!GYM_TYPES.includes(String(value))) codes.gym_type = ["invalid_choice"];
        else next.gym_type = String(value);
      } else if (field === "phone") {
        if (value === null || value === "") next.phone = null;
        else if (typeof value !== "string" || !PHONE.test(value)) codes.phone = ["invalid_format"];
        else next.phone = value;
      } else if (field === "website") {
        if (value === null || value === "") next.website = null;
        else if (typeof value !== "string" || !/^https?:\/\/[^\s/@]+\.[^\s/@]+/.test(value))
          codes.website = ["invalid_format"];
        else next.website = value;
      } else if (field === "tagline") {
        if (value === null || value === "") next.tagline = null;
        else if (typeof value !== "string" || [...value].length > 120) codes.tagline = ["too_long"];
        else next.tagline = value;
      } else if (field === "accent_color") {
        if (value === null) next.accent_color = null;
        else if (!ACCENTS.includes(String(value))) codes.accent_color = ["invalid_choice"];
        else next.accent_color = String(value);
      } else {
        codes[field] = ["invalid"];
      }
    }
    if (Object.keys(codes).length > 0) return validation(codes);
    if (Object.keys(next).length > 0) {
      Object.assign(gym, next);
      gym.revision += 1;
    }
    return { status: 200, json: setupView(gym) };
  }

  function setLocation(gym: Gym, body: Record<string, unknown>) {
    const refused = revisionError(gym, body);
    if (refused) return refused;
    const text = (field: string) =>
      typeof body[field] === "string" ? (body[field] as string).trim() : "";
    const codes: Record<string, string[]> = {};
    if (!/^[A-Z]{2}$/.test(text("country_code"))) {
      codes.country_code = text("country_code") === "" ? ["required"] : ["invalid_choice"];
    }
    for (const [field, max] of [
      ["city", 80],
      ["address_line", 200],
    ] as const) {
      if (text(field) === "") codes[field] = ["required"];
      else if ([...text(field)].length > max) codes[field] = ["too_long"];
    }
    if ([...text("entrance_note")].length > 200) codes.entrance_note = ["too_long"];
    if (Object.keys(codes).length > 0) return validation(codes);
    gym.location = {
      id: (gym.location?.id as string | undefined) ?? newId(),
      name: text("name") || text("city"),
      country_code: text("country_code"),
      city: text("city"),
      address_line: text("address_line"),
      entrance_note: text("entrance_note") || null,
      is_primary: true,
    };
    gym.revision += 1;
    return { status: 200, json: setupView(gym) };
  }

  function complete(gym: Gym) {
    if (gym.status === "draft") {
      const required = missing(gym);
      if (required.length > 0) {
        return validation(Object.fromEntries(required.map((field) => [field, ["required"]])));
      }
      gym.status = "completed";
      gym.revision += 1;
    }
    return { status: 200, json: setupView(gym) };
  }

  const entry = (intent: string | null) => {
    const mine = visible();
    const completed = mine.filter((gym) => gym.status === "completed");
    const draft = mine.find((gym) => gym.status === "draft" && gym.role === "owner");
    let destination: string;
    let gymId: string | null = null;
    if (completed.length === 0) {
      destination = "gym_onboarding";
      gymId = draft?.id ?? null;
    } else if (completed.length === 1 && !draft) {
      destination = "gym_home";
      gymId = completed[0]?.id ?? null;
    } else if (!draft && lastGym && completed.some((gym) => gym.id === lastGym)) {
      destination = "gym_home";
      gymId = lastGym;
    } else {
      destination = "gym_selection";
    }
    return {
      entry: {
        account_registration: "complete",
        capabilities: completed.length > 0 ? ["GYM_WORKSPACE"] : [],
        coach_profile: "not_started",
        fighter_profile: "not_started",
        context: null,
        destination,
        gym_id: gymId,
        gym_workspace_count: mine.length,
        gym_workspaces: [],
        intent,
        mandatory: false,
        reason: "fixture",
      },
    };
  };

  await target.route(
    (url) =>
      url.port !== "3100" &&
      (url.pathname.startsWith("/api/v1/gyms") ||
        url.pathname === "/api/v1/me/gyms" ||
        url.pathname === "/api/v1/me/entry" ||
        url.pathname === "/api/v1/me/entry/context"),
    async (call) => {
      const request: Request = call.request();
      const url = new URL(request.url());
      const method = request.method();
      const body = request.postData() ? (request.postDataJSON() as Record<string, unknown>) : {};
      const json = (result: {
        status: number;
        json?: unknown;
        headers?: Record<string, string>;
      }) =>
        result.json === undefined
          ? call.fulfill({ status: result.status })
          : call.fulfill({ status: result.status, json: result.json, headers: result.headers });

      if (expired) return json(error(401, "unauthorized"));
      if (url.pathname === "/api/v1/me/entry") {
        const intent = url.searchParams.get("intent");
        if (
          options.entry !== false &&
          (intent === "gym" || (intent === null && lastGym !== undefined))
        ) {
          requests.push({ method, path: url.pathname, body: url.search });
          return json({ status: 200, json: entry(intent) });
        }
        return call.fallback();
      }
      if (url.pathname === "/api/v1/me/entry/context") {
        if (body.context !== "gym") return call.fallback();
        requests.push({ method, path: url.pathname, body });
        const gym = typeof body.gym_id === "string" ? find(body.gym_id) : undefined;
        if (!gym) return json(error(404, "not_found"));
        if (gym.status !== "completed")
          return json(error(409, "conflict", { setup_status: "draft" }));
        lastGym = gym.id;
        return json({ status: 204 });
      }

      requests.push({ method, path: url.pathname, body: method === "GET" ? undefined : body });
      const write = method !== "GET";
      if (write && failures > 0) {
        failures -= 1;
        return call.abort("internetdisconnected");
      }

      let result: { status: number; json?: unknown; headers?: Record<string, string> };
      if (url.pathname === "/api/v1/me/gyms" && !write) {
        result = {
          status: 200,
          json: {
            gyms: visible().map((gym) => ({
              id: gym.id,
              name: gym.name,
              gym_type: gym.gym_type,
              setup_status: gym.status,
              inserted_at: NOW,
              updated_at: NOW,
              viewer: viewer(gym),
            })),
            next_cursor: null,
          },
        };
      } else if (url.pathname === "/api/v1/gyms" && method === "POST") {
        result = create(body);
      } else {
        const match = /^\/api\/v1\/gyms\/([^/]+)(\/.*)?$/.exec(url.pathname);
        const gym = match ? find(match[1] ?? "") : undefined;
        const rest = match?.[2] ?? "";
        if (!gym) result = error(404, "not_found");
        else if (rest === "/setup" && method === "GET")
          result = { status: 200, json: setupView(gym) };
        else if (gym.role !== "owner" && write) result = error(403, "forbidden");
        else if (rest === "/setup" && method === "PATCH") result = update(gym, body);
        else if (rest === "/setup/primary-location" && method === "PUT")
          result = setLocation(gym, body);
        else if (rest === "/complete-setup" && method === "POST") result = complete(gym);
        else if (rest === "" && method === "DELETE") {
          if (gym.status === "completed")
            result = error(409, "conflict", { setup_status: "completed" });
          else {
            discarded.add(gym.id);
            result = { status: 204 };
          }
        } else result = error(404, "not_found");
      }

      if (write && losses > 0 && result.status < 300) {
        losses -= 1;
        return call.abort("timedout");
      }
      return json(result);
    },
  );

  return {
    gyms: () => visible(),
    requests,
    failWrites: (count) => {
      failures = count;
    },
    loseResponses: (count) => {
      losses = count;
    },
    externalUpdate: (id, fields) => {
      const gym = gyms.find((candidate) => candidate.id === id);
      if (!gym) return;
      Object.assign(gym, fields);
      gym.revision += 1;
    },
    externalDiscard: (id) => {
      discarded.add(id);
    },
    lastGym: () => lastGym,
    expire: () => {
      expired = true;
    },
  };
}
