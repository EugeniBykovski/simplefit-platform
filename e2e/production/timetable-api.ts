import type { BrowserContext, Route } from "@playwright/test";

import { resolveWallTime } from "../../src/shared/lib/time-zone";
import type { GymApi } from "./gym-api";

/*
 * A test double of the SF-97 timetable contract for the production specs
 * (SF-98), layered over ./gym-api in console mode: it answers the venue,
 * class-template, class-series and class-occurrence routes of the gyms that
 * double knows, and leaves every other route to it. What it models:
 *
 * - access: an unknown, hidden or revoked gym is `404`; reads need any staff
 *   role; writes need `manage_timetable` (owner, manager) except a coach
 *   cancelling a class they teach (`403` otherwise);
 * - creates are idempotent on `client_request_id` (`201`, then `200` with
 *   the same record);
 * - every change carries `expected_revision` (`409 revision: stale`);
 * - one-time instants must carry the venue zone's own offset at that instant
 *   (`422 starts_at invalid_format`), as the backend checks;
 * - venue and instructor overlaps are `409 schedule: venue_unavailable |
 *   instructor_unavailable` (half-open intervals: adjacent classes are fine);
 * - a series is materialized here with the browser's zone data: a date whose
 *   wall time is skipped or repeated is listed in `skipped_dates`, never moved;
 * - lists of classes are windowed (`from`, `to` ≤ 31 days) and paged.
 * It is a double: the real rules are verified against the backend in
 * e2e/real-api/gym-timetable.spec.ts.
 */

const DAY = 86_400_000;

type Venue = {
  venue_id: string;
  gym_id: string;
  gym_location_id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  time_zone: string;
  status: "active" | "inactive";
  revision: number;
  created_at: string;
  updated_at: string;
};
type Template = {
  template_id: string;
  gym_id: string;
  title: string;
  description: string | null;
  default_duration_minutes: number;
  default_capacity: number;
  default_venue_id: string | null;
  default_instructor: { staff_membership_id: string; name: string | null } | null;
  status: "active" | "archived";
  revision: number;
  created_at: string;
  updated_at: string;
};
type Occurrence = {
  occurrence_id: string;
  gym_id: string;
  template_id: string;
  series_id: string | null;
  series_local_date: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  local_starts_at: string;
  local_ends_at: string;
  time_zone: string;
  utc_offset_minutes: number;
  duration_minutes: number;
  capacity: number;
  venue: { venue_id: string; name: string };
  instructor: { staff_membership_id: string; name: string | null } | null;
  needs_instructor: boolean;
  rescheduled: boolean;
  status: "scheduled" | "cancelled";
  cancel_reason: "cancelled" | "series_changed" | "series_cancelled" | null;
  cancelled_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};
type Series = {
  series_id: string;
  gym_id: string;
  template_id: string;
  title: string;
  weekdays: number[];
  local_start_time: string;
  starts_on: string;
  ends_on: string;
  time_zone: string;
  duration_minutes: number;
  capacity: number;
  venue: { venue_id: string; name: string };
  instructor: { staff_membership_id: string; name: string | null } | null;
  status: "active" | "cancelled";
  revision: number;
  created_at: string;
  updated_at: string;
  skipped: { local_date: string; reason: string }[];
};

export type TimetableSeed = {
  venues?: Partial<Venue>[];
  templates?: Partial<Template>[];
  occurrences?: {
    day: string;
    time: string;
    minutes?: number;
    title?: string;
    venue?: number;
    instructor?: string | null;
    status?: Occurrence["status"];
  }[];
};

export type TimetableApi = {
  venues: (gymId: string) => Venue[];
  templates: (gymId: string) => Template[];
  occurrences: (gymId: string) => Occurrence[];
  series: (gymId: string) => Series[];
  requests: { method: string; path: string; body: Record<string, unknown> | undefined }[];
  /** Another administrator changes a class (its revision moves on). */
  externalChange: (occurrenceId: string, fields: Partial<Occurrence>) => void;
  /** The next N creates are applied, then their response is lost. */
  loseResponses: (count: number) => void;
  /** Holds the next class lists of a gym until the returned function releases them. */
  holdLists: (gymId: string) => () => void;
};

let sequence = 0;
const id = (kind: number) =>
  `7${kind}000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  json: { error: { code, message: code, details, request_id: null } },
});
const validation = (field_codes: Record<string, string[]>) =>
  error(422, "validation_error", {
    fields: Object.fromEntries(Object.keys(field_codes).map((field) => [field, ["is invalid"]])),
    field_codes,
  });
const NOW = () => new Date().toISOString();
const pad = (value: number) => String(value).padStart(2, "0");

/** The wall time (`YYYY-MM-DDTHH:MM:SS`) of `instant` shifted by `offset` minutes. */
const wallOf = (instant: number, offset: number) => {
  const wall = new Date(instant + offset * 60_000);
  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:00`
  );
};
const offsetOf = (zone: string, instant: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(instant / 60_000) * 60_000) / 60_000);
};

export async function timetableApi(
  target: Pick<BrowserContext, "route">,
  gymApi: GymApi,
  seeds: Record<string, TimetableSeed> = {},
): Promise<TimetableApi> {
  const venues: Venue[] = [];
  const templates: Template[] = [];
  const occurrences: Occurrence[] = [];
  const series: Series[] = [];
  const keys = new Map<string, unknown>();
  const requests: TimetableApi["requests"] = [];
  let lose = 0;
  const holds = new Map<string, Promise<void>>();

  const staffName = (gymId: string, membership: string) =>
    gymApi
      .gyms()
      .find((gym) => gym.id === gymId)
      ?.staff?.find((row) => row.id === membership)?.name ?? null;
  const instructorOf = (gymId: string, membership: string | null | undefined) =>
    membership ? { staff_membership_id: membership, name: staffName(gymId, membership) } : null;
  const eligible = (gymId: string, membership: string) =>
    gymApi
      .gyms()
      .find((gym) => gym.id === gymId)
      ?.staff?.some(
        (row) => row.id === membership && row.status === "active" && row.role !== "front_desk",
      ) ?? false;

  function place(
    gymId: string,
    fields: {
      template: Template;
      venue: Venue;
      start: number;
      offset: number;
      minutes: number;
      capacity: number;
      instructor: string | null;
      series?: { id: string; date: string };
      status?: Occurrence["status"];
    },
  ): Occurrence {
    const end = fields.start + fields.minutes * 60_000;
    return {
      occurrence_id: id(4),
      gym_id: gymId,
      template_id: fields.template.template_id,
      series_id: fields.series?.id ?? null,
      series_local_date: fields.series?.date ?? null,
      title: fields.template.title,
      starts_at: new Date(fields.start).toISOString(),
      ends_at: new Date(end).toISOString(),
      local_starts_at: wallOf(fields.start, fields.offset),
      local_ends_at: wallOf(end, offsetOf(fields.venue.time_zone, end)),
      time_zone: fields.venue.time_zone,
      utc_offset_minutes: fields.offset,
      duration_minutes: fields.minutes,
      capacity: fields.capacity,
      venue: { venue_id: fields.venue.venue_id, name: fields.venue.name },
      instructor: instructorOf(gymId, fields.instructor),
      needs_instructor: false,
      rescheduled: false,
      status: fields.status ?? "scheduled",
      cancel_reason: fields.status === "cancelled" ? "cancelled" : null,
      cancelled_at: fields.status === "cancelled" ? NOW() : null,
      revision: 1,
      created_at: NOW(),
      updated_at: NOW(),
    };
  }

  /** The class in the way of `candidate`, if any (same venue or instructor, overlapping). */
  function clash(candidate: Occurrence, ignore: Set<string> = new Set()) {
    const start = Date.parse(candidate.starts_at);
    const end = Date.parse(candidate.ends_at);
    for (const other of occurrences) {
      if (other.status !== "scheduled" || ignore.has(other.occurrence_id)) continue;
      if (other.occurrence_id === candidate.occurrence_id) continue;
      const overlap = Date.parse(other.starts_at) < end && start < Date.parse(other.ends_at);
      if (!overlap) continue;
      if (other.gym_id === candidate.gym_id && other.venue.venue_id === candidate.venue.venue_id)
        return "venue_unavailable";
      if (
        candidate.instructor &&
        other.instructor?.staff_membership_id === candidate.instructor.staff_membership_id
      )
        return "instructor_unavailable";
    }
    return null;
  }

  for (const [gymName, seed] of Object.entries(seeds)) {
    const gym = gymApi.gyms().find((candidate) => candidate.name === gymName);
    if (!gym) throw new Error(`no gym ${gymName}`);
    const location = (gym.location as { id?: string } | null)?.id ?? "loc-1";
    for (const fields of seed.venues ?? []) {
      venues.push({
        venue_id: id(1),
        gym_id: gym.id,
        gym_location_id: location,
        name: "Ring 2",
        description: null,
        capacity: 20,
        time_zone: "Europe/Warsaw",
        status: "active",
        revision: 1,
        created_at: NOW(),
        updated_at: NOW(),
        ...fields,
      });
    }
    const own = venues.filter((venue) => venue.gym_id === gym.id);
    for (const fields of seed.templates ?? []) {
      templates.push({
        template_id: id(2),
        gym_id: gym.id,
        title: "Technical boxing",
        description: null,
        default_duration_minutes: 90,
        default_capacity: 16,
        default_venue_id: own[0]?.venue_id ?? null,
        default_instructor: null,
        status: "active",
        revision: 1,
        created_at: NOW(),
        updated_at: NOW(),
        ...fields,
      });
    }
    for (const entry of seed.occurrences ?? []) {
      const venue = own[entry.venue ?? 0]!;
      const template = templates.find((item) => item.gym_id === gym.id)!;
      const resolved = resolveWallTime(entry.day, entry.time, venue.time_zone);
      if (resolved.kind !== "exact") throw new Error("seed a plain wall time");
      occurrences.push(
        place(gym.id, {
          template: { ...template, title: entry.title ?? template.title },
          venue,
          start: resolved.at.instant.getTime(),
          offset: resolved.at.offsetMinutes,
          minutes: entry.minutes ?? template.default_duration_minutes,
          capacity: template.default_capacity,
          instructor: entry.instructor ?? null,
          status: entry.status,
        }),
      );
    }
  }

  const seriesView = (item: Series, detail: boolean) => {
    const { skipped, ...rest } = item;
    const rows = occurrences.filter((row) => row.series_id === item.series_id);
    return detail
      ? {
          ...rest,
          skipped_dates: skipped,
          scheduled_count: rows.filter((row) => row.status === "scheduled").length,
          cancelled_count: rows.filter((row) => row.status === "cancelled").length,
        }
      : rest;
  };

  /** The rows of a weekly rule, with the dates it skips. */
  function materialize(item: Series, template: Template, venue: Venue) {
    const rows: Occurrence[] = [];
    const skipped: Series["skipped"] = [];
    for (
      let day = Date.parse(`${item.starts_on}T00:00:00Z`);
      day <= Date.parse(`${item.ends_on}T00:00:00Z`);
      day += DAY
    ) {
      const weekday = new Date(day).getUTCDay() || 7;
      if (!item.weekdays.includes(weekday)) continue;
      const date = new Date(day).toISOString().slice(0, 10);
      const resolved = resolveWallTime(date, item.local_start_time.slice(0, 5), venue.time_zone);
      if (resolved.kind !== "exact") {
        skipped.push({
          local_date: date,
          reason: resolved.kind === "gap" ? "nonexistent_local_time" : "ambiguous_local_time",
        });
        continue;
      }
      rows.push(
        place(item.gym_id, {
          template,
          venue,
          start: resolved.at.instant.getTime(),
          offset: resolved.at.offsetMinutes,
          minutes: item.duration_minutes,
          capacity: item.capacity,
          instructor: item.instructor?.staff_membership_id ?? null,
          series: { id: item.series_id, date },
        }),
      );
    }
    return { rows, skipped };
  }

  async function handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const match =
      /^\/api\/v1\/gyms\/([^/]+)\/(venues|class-templates|class-series|class-occurrences)(?:\/([^/]+))?(?:\/([a-z]+))?$/.exec(
        url.pathname,
      );
    if (!match) return route.fallback();
    const [, gymId, kind, recordId, action] = match as unknown as [
      string,
      string,
      string,
      string | undefined,
      string | undefined,
    ];
    const method = request.method();
    const body = request.postData()
      ? (JSON.parse(request.postData()!) as Record<string, unknown>)
      : undefined;
    requests.push({ method, path: url.pathname, body });
    const reply = (status: number, json: unknown) => route.fulfill({ status, json });
    const fail = ({ status, json }: { status: number; json: unknown }) => reply(status, json);

    const gym = gymApi.gyms().find((candidate) => candidate.id === gymId);
    if (!gym || gym.hidden || gym.status !== "completed") return fail(error(404, "not_found"));
    const manage = gym.role === "owner" || gym.role === "manager";
    const viewerRow = "7a1b2c3d-0000-4000-8000-000000000002";

    if (method === "GET") {
      if (kind === "class-occurrences" && !recordId) {
        const hold = holds.get(gymId);
        if (hold) await hold;
        const from = Date.parse(url.searchParams.get("from") ?? "");
        const to = Date.parse(url.searchParams.get("to") ?? "");
        if (Number.isNaN(from) || Number.isNaN(to) || to <= from || to - from > 31 * DAY)
          return fail(validation({ to: ["out_of_range"] }));
        const status = url.searchParams.get("status");
        const venue = url.searchParams.get("venue_id");
        const instructor = url.searchParams.get("instructor_staff_membership_id");
        const rows = occurrences
          .filter((row) => row.gym_id === gymId)
          .filter((row) => Date.parse(row.starts_at) >= from && Date.parse(row.starts_at) < to)
          .filter((row) => !status || row.status === status)
          .filter((row) => !venue || row.venue.venue_id === venue)
          .filter((row) => !instructor || row.instructor?.staff_membership_id === instructor)
          .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
        const limit = Number(url.searchParams.get("limit") ?? 50);
        const offset = Number(url.searchParams.get("cursor") ?? 0);
        const page = rows.slice(offset, offset + limit);
        return reply(200, {
          occurrences: page,
          next_cursor: offset + limit < rows.length ? String(offset + limit) : null,
        });
      }
      if (kind === "class-occurrences") {
        const row = occurrences.find(
          (item) => item.occurrence_id === recordId && item.gym_id === gymId,
        );
        return row ? reply(200, { occurrence: row }) : fail(error(404, "not_found"));
      }
      if (kind === "venues") {
        const status = url.searchParams.get("status") ?? "active";
        return recordId
          ? reply(200, { venue: venues.find((item) => item.venue_id === recordId) })
          : reply(200, {
              venues: venues.filter((item) => item.gym_id === gymId && item.status === status),
            });
      }
      if (kind === "class-templates") {
        const status = url.searchParams.get("status") ?? "active";
        return recordId
          ? reply(200, { template: templates.find((item) => item.template_id === recordId) })
          : reply(200, {
              templates: templates.filter(
                (item) => item.gym_id === gymId && item.status === status,
              ),
            });
      }
      const status = url.searchParams.get("status") ?? "active";
      if (recordId) {
        const item = series.find((row) => row.series_id === recordId && row.gym_id === gymId);
        return item
          ? reply(200, { series: seriesView(item, true) })
          : fail(error(404, "not_found"));
      }
      return reply(200, {
        series: series
          .filter((item) => item.gym_id === gymId && item.status === status)
          .map((item) => seriesView(item, false)),
      });
    }

    // Writes.
    const coachCancel = gym.role === "coach" && kind === "class-occurrences" && action === "cancel";
    if (!manage && !coachCancel) return fail(error(403, "forbidden"));
    const key =
      typeof body?.client_request_id === "string" ? `${gymId}:${body.client_request_id}` : null;
    if (method === "POST" && !recordId && key && keys.has(key)) return reply(200, keys.get(key));

    const created = async (status: number, json: unknown) => {
      if (key) keys.set(key, json);
      if (lose > 0) {
        lose -= 1;
        return route.abort("connectionreset");
      }
      return reply(status, json);
    };
    const stale = (revision: number) =>
      body?.expected_revision !== revision
        ? error(409, "conflict", { revision: "stale", current_revision: revision })
        : null;

    if (kind === "venues") {
      if (!recordId) {
        const venue: Venue = {
          venue_id: id(1),
          gym_id: gymId,
          gym_location_id: String(body?.gym_location_id),
          name: String(body?.name),
          description: (body?.description as string) ?? null,
          capacity: (body?.capacity as number) ?? null,
          time_zone: String(body?.time_zone),
          status: "active",
          revision: 1,
          created_at: NOW(),
          updated_at: NOW(),
        };
        venues.push(venue);
        return created(201, { venue });
      }
      const venue = venues.find((item) => item.venue_id === recordId && item.gym_id === gymId);
      if (!venue) return fail(error(404, "not_found"));
      const refusal = stale(venue.revision);
      if (refusal) return fail(refusal);
      if (action === "deactivate") {
        const upcoming = occurrences.filter(
          (row) => row.venue.venue_id === venue.venue_id && row.status === "scheduled",
        ).length;
        if (upcoming > 0)
          return fail(
            error(409, "conflict", { venue: "has_upcoming_classes", upcoming_classes: upcoming }),
          );
        Object.assign(venue, { status: "inactive", revision: venue.revision + 1 });
      } else {
        const { expected_revision: _, ...changes } = body ?? {};
        Object.assign(venue, changes, { revision: venue.revision + 1, updated_at: NOW() });
      }
      return reply(200, { venue });
    }

    if (kind === "class-templates") {
      if (!recordId) {
        const template: Template = {
          template_id: id(2),
          gym_id: gymId,
          title: String(body?.title),
          description: (body?.description as string) ?? null,
          default_duration_minutes: Number(body?.default_duration_minutes),
          default_capacity: Number(body?.default_capacity),
          default_venue_id: (body?.default_venue_id as string) ?? null,
          default_instructor: instructorOf(
            gymId,
            body?.default_instructor_staff_membership_id as string,
          ),
          status: "active",
          revision: 1,
          created_at: NOW(),
          updated_at: NOW(),
        };
        templates.push(template);
        return created(201, { template });
      }
      const template = templates.find(
        (item) => item.template_id === recordId && item.gym_id === gymId,
      );
      if (!template) return fail(error(404, "not_found"));
      const refusal = stale(template.revision);
      if (refusal) return fail(refusal);
      if (action === "archive") Object.assign(template, { status: "archived" });
      else {
        const {
          expected_revision: _,
          default_instructor_staff_membership_id: instructor,
          ...changes
        } = body ?? {};
        Object.assign(template, changes);
        if (instructor !== undefined)
          template.default_instructor = instructorOf(gymId, instructor as string | null);
      }
      template.revision += 1;
      return reply(200, { template });
    }

    if (kind === "class-occurrences") {
      if (!recordId) {
        const template = templates.find((item) => item.template_id === body?.template_id);
        const venue = venues.find(
          (item) => item.venue_id === (body?.venue_id ?? template?.default_venue_id),
        );
        if (!template || template.gym_id !== gymId)
          return fail(validation({ template_id: ["invalid_choice"] }));
        if (!venue || venue.gym_id !== gymId)
          return fail(validation({ venue_id: ["invalid_choice"] }));
        const instructor = (body?.instructor_staff_membership_id as string | null) ?? null;
        if (instructor && !eligible(gymId, instructor))
          return fail(validation({ instructor_staff_membership_id: ["invalid_choice"] }));
        const raw = String(body?.starts_at ?? "");
        const offsetMatch = /([+-])(\d{2}):(\d{2})$/.exec(raw);
        const start = Date.parse(raw);
        if (!offsetMatch || Number.isNaN(start))
          return fail(validation({ starts_at: ["invalid_type"] }));
        const sent =
          (offsetMatch[1] === "-" ? -1 : 1) *
          (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
        if (sent !== offsetOf(venue.time_zone, start))
          return fail(validation({ starts_at: ["invalid_format"] }));
        if (start <= Date.now()) return fail(validation({ starts_at: ["out_of_range"] }));
        const capacity = Number(body?.capacity ?? template.default_capacity);
        if (venue.capacity !== null && capacity > venue.capacity)
          return fail(validation({ capacity: ["out_of_range"] }));
        const row = place(gymId, {
          template,
          venue,
          start,
          offset: sent,
          minutes: Number(body?.duration_minutes ?? template.default_duration_minutes),
          capacity,
          instructor,
        });
        const problem = clash(row);
        if (problem) return fail(error(409, "conflict", { schedule: problem }));
        occurrences.push(row);
        return created(201, { occurrence: row });
      }
      const row = occurrences.find(
        (item) => item.occurrence_id === recordId && item.gym_id === gymId,
      );
      if (!row) return fail(error(404, "not_found"));
      if (gym.role === "coach" && row.instructor?.staff_membership_id !== viewerRow)
        return fail(error(403, "forbidden"));
      const refusal = stale(row.revision);
      if (refusal) return fail(refusal);
      if (row.status === "cancelled")
        return fail(error(409, "conflict", { class_occurrence: "cancelled" }));
      if (action === "cancel") {
        Object.assign(row, {
          status: "cancelled",
          cancel_reason: "cancelled",
          cancelled_at: NOW(),
          revision: row.revision + 1,
        });
        return reply(200, { occurrence: row });
      }
      const next = { ...row };
      const venue = venues.find(
        (item) => item.venue_id === (body?.venue_id ?? row.venue.venue_id),
      )!;
      const start = body?.starts_at
        ? Date.parse(String(body.starts_at))
        : Date.parse(row.starts_at);
      if (body?.starts_at) {
        const offsetMatch = /([+-])(\d{2}):(\d{2})$/.exec(String(body.starts_at))!;
        const sent =
          (offsetMatch[1] === "-" ? -1 : 1) *
          (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
        if (sent !== offsetOf(venue.time_zone, start))
          return fail(validation({ starts_at: ["invalid_format"] }));
      }
      const minutes = Number(body?.duration_minutes ?? row.duration_minutes);
      const offset = offsetOf(venue.time_zone, start);
      Object.assign(next, {
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(start + minutes * 60_000).toISOString(),
        local_starts_at: wallOf(start, offset),
        local_ends_at: wallOf(
          start + minutes * 60_000,
          offsetOf(venue.time_zone, start + minutes * 60_000),
        ),
        utc_offset_minutes: offset,
        duration_minutes: minutes,
        capacity: Number(body?.capacity ?? row.capacity),
        venue: { venue_id: venue.venue_id, name: venue.name },
        instructor:
          body && "instructor_staff_membership_id" in body
            ? instructorOf(gymId, body.instructor_staff_membership_id as string | null)
            : row.instructor,
        needs_instructor: false,
        rescheduled: row.series_id !== null || row.rescheduled,
        revision: row.revision + 1,
        updated_at: NOW(),
      });
      const problem = clash(next);
      if (problem) return fail(error(409, "conflict", { schedule: problem }));
      Object.assign(row, next);
      return reply(200, { occurrence: row });
    }

    // class-series
    if (!recordId) {
      const template = templates.find((item) => item.template_id === body?.template_id)!;
      const venue = venues.find(
        (item) => item.venue_id === (body?.venue_id ?? template.default_venue_id),
      )!;
      const item: Series = {
        series_id: id(3),
        gym_id: gymId,
        template_id: template.template_id,
        title: template.title,
        weekdays: body?.weekdays as number[],
        local_start_time: String(body?.local_start_time),
        starts_on: String(body?.starts_on),
        ends_on: String(body?.ends_on),
        time_zone: venue.time_zone,
        duration_minutes: Number(body?.duration_minutes ?? template.default_duration_minutes),
        capacity: Number(body?.capacity ?? template.default_capacity),
        venue: { venue_id: venue.venue_id, name: venue.name },
        instructor: instructorOf(gymId, body?.instructor_staff_membership_id as string | null),
        status: "active",
        revision: 1,
        created_at: NOW(),
        updated_at: NOW(),
        skipped: [],
      };
      const { rows, skipped } = materialize(item, template, venue);
      if (rows.length === 0) return fail(validation({ weekdays: ["too_short"] }));
      const taken = rows.filter((row) => clash(row) === "venue_unavailable");
      if (taken.length > 0)
        return fail(
          error(409, "conflict", {
            schedule: "venue_unavailable",
            local_dates: taken.map((row) => row.series_local_date),
          }),
        );
      item.skipped = skipped;
      series.push(item);
      occurrences.push(...rows);
      return created(201, { series: seriesView(item, true) });
    }
    const item = series.find((row) => row.series_id === recordId && row.gym_id === gymId);
    if (!item) return fail(error(404, "not_found"));
    if (action === "generate")
      return reply(200, { created_count: 0, series: seriesView(item, true) });
    const refusal = stale(item.revision);
    if (refusal) return fail(refusal);
    if (item.status === "cancelled")
      return fail(error(409, "conflict", { class_series: "cancelled" }));
    if (action === "cancel") {
      item.status = "cancelled";
      item.revision += 1;
      for (const row of occurrences) {
        if (
          row.series_id === item.series_id &&
          row.status === "scheduled" &&
          Date.parse(row.starts_at) > Date.now()
        )
          Object.assign(row, {
            status: "cancelled",
            cancel_reason: "series_cancelled",
            cancelled_at: NOW(),
          });
      }
      return reply(200, { series: seriesView(item, true) });
    }
    return reply(200, { series: seriesView(item, true) });
  }

  await target.route(
    /\/api\/v1\/gyms\/[^/]+\/(venues|class-templates|class-series|class-occurrences)/,
    handle,
  );

  return {
    venues: (gymId) => venues.filter((item) => item.gym_id === gymId),
    templates: (gymId) => templates.filter((item) => item.gym_id === gymId),
    occurrences: (gymId) => occurrences.filter((item) => item.gym_id === gymId),
    series: (gymId) => series.filter((item) => item.gym_id === gymId),
    requests,
    externalChange: (occurrenceId, fields) => {
      const row = occurrences.find((item) => item.occurrence_id === occurrenceId);
      if (row) Object.assign(row, fields, { revision: row.revision + 1 });
    },
    loseResponses: (count) => {
      lose = count;
    },
    holdLists: (gymId) => {
      let release = () => undefined as void;
      holds.set(
        gymId,
        new Promise<void>((resolve) => {
          release = () => {
            holds.delete(gymId);
            resolve();
          };
        }),
      );
      return () => release();
    },
  };
}
