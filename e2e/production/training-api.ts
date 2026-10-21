import type { Page } from "@playwright/test";

/*
 * A stand-in for the SF-62 / SF-63 fighter training endpoints (SF-67), at
 * the network edge, as a small stateful backend whose clock decides what has
 * started. Shared by the production and portability suites.
 */

const FIGHTER = {
  display_name: "Alex N.",
  username: "alex_n",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "orthodox",
};
export const FIGHTER_DONE = {
  fields: FIGHTER,
  completed: true,
  lastContext: "fighter" as const,
  tour: "completed" as const,
};

type Session = Record<string, unknown> & { id: string; status: string; starts_at: string };

const session = (overrides: Record<string, unknown> = {}): Session => ({
  id: "ses-1",
  relationship_id: "rel-1",
  coach: { display_name: "Julia N.", brand_name: "North Gym" },
  coach_display_name_at_end: null,
  title: "Technical boxing",
  training_type: "technical",
  starts_at: "2026-10-21T16:00:00Z",
  time_zone: "Europe/Warsaw",
  duration_minutes: 60,
  notes: "Jab work and footwork.",
  status: "planned",
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  inserted_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...overrides,
});

/** The backend's "now": ses-1 has started, ses-2 has not. */
const NOW = "2026-10-21T17:00:00Z";

export type Options = { profile?: boolean; lose?: boolean };
export type Recorded = { method: string; path: string; body: string | null };

export async function trainingApi(page: Page, { profile = true, lose = false }: Options = {}) {
  const requests: Recorded[] = [];
  let lost = lose;
  const sessions: Session[] = [
    session(),
    session({
      id: "ses-2",
      title: "Pads with coach",
      training_type: "pads",
      starts_at: "2026-10-23T15:30:00Z",
      duration_minutes: 45,
      coach: { display_name: null, brand_name: null },
    }),
    session({
      id: "ses-3",
      title: "Roadwork intervals",
      training_type: "roadwork",
      starts_at: "2026-10-18T08:00:00Z",
      status: "completed",
      completed_at: "2026-10-18T09:05:00Z",
    }),
    session({
      id: "ses-4",
      title: "Sparring rounds",
      training_type: "sparring",
      starts_at: "2026-10-16T16:00:00Z",
      status: "cancelled",
      cancelled_at: "2026-10-15T09:30:00Z",
      cancelled_by: "system",
      cancel_reason: "relationship_ended",
      coach: null,
      coach_display_name_at_end: "Tomasz M.",
    }),
  ];
  await page.route(
    (url) => url.port !== "3100" && url.pathname.startsWith("/api/v1/me/training-sessions"),
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({
        method: request.method(),
        path: `${url.pathname}${url.search}`,
        body: request.postData(),
      });
      const json = (status: number, payload: unknown) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      const failure = (status: number, code: string, details: Record<string, unknown> = {}) =>
        json(status, { error: { code, message: "", details, request_id: null } });
      if (!profile) return failure(404, "not_found");

      const path = url.pathname.replace("/api/v1/me/training-sessions", "");
      if (path === "") {
        const view = url.searchParams.get("view");
        const status = url.searchParams.get("status");
        const list = sessions
          .filter((s) =>
            view === "upcoming"
              ? s.status === "planned" && s.starts_at > NOW
              : s.status !== "planned" || s.starts_at <= NOW,
          )
          .filter((s) => status === null || s.status === status)
          .sort((a, b) =>
            view === "upcoming"
              ? a.starts_at.localeCompare(b.starts_at)
              : b.starts_at.localeCompare(a.starts_at),
          );
        return json(200, { training_sessions: list, next_cursor: null });
      }
      const match = /^\/([^/]+)(\/complete)?$/.exec(path);
      const found = sessions.find((s) => s.id === match?.[1]);
      if (!match || !found) return failure(404, "not_found");
      if (match[2] && request.method() === "POST") {
        if (found.status === "cancelled") return failure(409, "conflict", { status: "cancelled" });
        if (found.starts_at > NOW) return failure(409, "conflict", { starts_at: "not_started" });
        if (found.status === "planned")
          Object.assign(found, { status: "completed", completed_at: "2026-10-21T17:12:00Z" });
        // The first answer is lost on the way back: stored, never seen.
        if (lost) {
          lost = false;
          return route.abort("connectionreset");
        }
      }
      return json(200, { training_session: found });
    },
  );
  return requests;
}
