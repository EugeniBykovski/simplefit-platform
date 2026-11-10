import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { ControlPlaneOverview } from "./control-plane-overview";

/*
 * AD1 (SF-121) with the network mocked at `fetch`: every number is the backend's,
 * restricted and unavailable values are never shown as zero, a real zero is shown as
 * zero, and the period only changes the "in the last …" lines, labelled with the
 * period the backend answered for.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

type Metric = {
  id: string;
  group: string;
  state: string;
  value: number | null;
  breakdown: { key: string; value: number }[];
  period_counts: { key: string; value: number }[];
};

const count = (key: string, value: number) => ({ key, value });
const available = (
  id: string,
  value: number,
  breakdown: [string, number][] = [],
  period: [string, number][] = [],
  group = "population",
): Metric => ({
  id,
  group,
  state: "available",
  value,
  breakdown: breakdown.map(([k, v]) => count(k, v)),
  period_counts: period.map(([k, v]) => count(k, v)),
});
const closed = (id: string, state: "restricted" | "unavailable", group = "population"): Metric => ({
  id,
  group,
  state,
  value: null,
  breakdown: [],
  period_counts: [],
});

const FULL = (periodKey = "7d", registeredInPeriod = 4): Metric[] => [
  available(
    "accounts",
    1234,
    [
      ["in_progress", 5],
      ["not_started", 7],
    ],
    [["registration_completed", registeredInPeriod]],
  ),
  available("fighter_profiles", 0, [["in_progress", 0]], [["onboarding_completed", 0]]),
  available("coach_profiles", 12, [["in_progress", 1]], [["onboarding_completed", 2]]),
  available("gyms", 3, [["draft", 2]], [["setup_completed", 1]]),
  available(
    "sponsor_organizations",
    2,
    [
      ["suspended", 1],
      ["closed", 0],
    ],
    [["approved", periodKey === "24h" ? 0 : 1]],
  ),
  available("operators", 1),
  available(
    "sponsor_applications_waiting",
    3,
    [
      ["submitted", 2],
      ["under_review", 1],
      ["changes_requested", 0],
      ["approved", 2],
      ["rejected", 0],
      ["withdrawn", 0],
    ],
    [
      ["first_submitted", 3],
      ["approved", 1],
      ["rejected", 0],
    ],
    "reviews",
  ),
  closed("gym_verifications_waiting", "unavailable", "reviews"),
];

const CHECKS = [
  { id: "database", status: "healthy", counts: [], last_event_at: null },
  {
    id: "background_jobs",
    status: "healthy",
    counts: [count("waiting", 0), count("discarded_24h", 0)],
    last_event_at: null,
  },
  { id: "payments_webhooks", status: "unknown", counts: [], last_event_at: null },
  { id: "email_provider", status: "no_telemetry", counts: [], last_event_at: null },
];

const overview = (
  metrics: Metric[],
  health: { state: string; checks: unknown[] } = { state: "available", checks: CHECKS },
  key = "7d",
) => ({
  status: 200,
  body: {
    overview: {
      as_of: "2026-11-10T12:00:01Z",
      period: { key, from: "2026-11-03T12:00:01Z", to: "2026-11-10T12:00:01Z" },
      metrics,
      health,
    },
  },
});

function api(
  answer: (
    period: string,
  ) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>,
) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/api/v1/admin/me") {
        return jsonResponse({ operator: null }, { status: 200 });
      }
      if (parsed.pathname !== "/api/v1/admin/overview")
        throw new Error(`unexpected ${parsed.pathname}`);
      const period = parsed.searchParams.get("period") ?? "";
      calls.push(period);
      const { status, body } = await answer(period);
      return jsonResponse(body, { status });
    }),
  );
  return calls;
}

const user = userEvent.setup();
afterEach(() => vi.unstubAllGlobals());

const stat = (id: string) => document.querySelector<HTMLElement>(`[data-overview-metric="${id}"]`);

describe("AD1 Control Plane overview (SF-121)", () => {
  it("shows the backend's counts, a real zero as zero, and no trend", async () => {
    api(() => overview(FULL()));
    renderWithProviders(<ControlPlaneOverview />);

    expect(await screen.findByRole("heading", { name: "Population" })).toBeVisible();
    expect(stat("accounts")).toHaveTextContent("1,234");
    expect(stat("accounts")).toHaveTextContent("registered · 12 not finished");
    expect(stat("accounts")).toHaveTextContent("4 registered in the last 7 days");
    expect(stat("fighter_profiles")).toHaveTextContent("0");
    expect(stat("gyms")).toHaveTextContent("completed · 2 drafts");
    expect(stat("sponsor_organizations")).toHaveTextContent("active · 1 suspended");
    expect(screen.getByText(/a count, not a trend/)).toBeVisible();
    expect(document.body).not.toHaveTextContent(/%|↑|↓/);
  });

  it("restricted counts are 'No access', never zero; unavailable ones are '—'", async () => {
    api(() =>
      overview(
        FULL().map((metric) =>
          metric.id === "operators" ? closed("operators", "restricted") : metric,
        ),
      ),
    );
    renderWithProviders(<ControlPlaneOverview />);
    await screen.findByRole("heading", { name: "Population" });

    const operators = stat("operators");
    expect(operators).toHaveAttribute("data-state", "restricted");
    expect(operators).toHaveTextContent("No access");
    expect(operators).not.toHaveTextContent("0");

    const gyms = stat("gym_verifications_waiting");
    expect(gyms).toHaveTextContent("—");
    expect(gyms).toHaveTextContent("Not available yet");
  });

  it("a reviewer sees only the review queue and is told why", async () => {
    api(() =>
      overview(
        FULL().map((metric) =>
          metric.group === "population" ? closed(metric.id, "restricted") : metric,
        ),
        { state: "restricted", checks: [] },
      ),
    );
    renderWithProviders(<ControlPlaneOverview />);

    expect(await screen.findByRole("heading", { name: "Waiting for review" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Population" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "System health" })).toBeNull();
    expect(screen.getByText("Other sections need permissions you don’t have.")).toBeVisible();
    expect(stat("sponsor_applications_waiting")).toHaveTextContent("3");
  });

  it("changing the period asks the backend and labels counts with the period it answered for", async () => {
    let release: () => void = () => undefined;
    const calls = api((period) =>
      period === "24h"
        ? new Promise((resolve) => {
            release = () => resolve(overview(FULL("24h", 1), undefined, "24h"));
          })
        : overview(FULL()),
    );
    renderWithProviders(<ControlPlaneOverview />);
    await screen.findByRole("heading", { name: "Population" });
    expect(stat("accounts")).toHaveTextContent("4 registered in the last 7 days");

    await user.click(screen.getByRole("button", { name: "24 hours" }));
    // Until the backend answers, the previous answer stays, still labelled 7 days.
    expect(screen.getByRole("button", { name: "24 hours" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(stat("accounts")).toHaveTextContent("4 registered in the last 7 days");

    release();
    await waitFor(() =>
      expect(stat("accounts")).toHaveTextContent("1 registered in the last 24 hours"),
    );
    expect(calls).toEqual(["7d", "24h"]);
  });

  it("health shows only real signals; a degraded check raises a banner", async () => {
    api(() =>
      overview(FULL(), {
        state: "available",
        checks: CHECKS.map((check) =>
          check.id === "background_jobs"
            ? {
                ...check,
                status: "degraded",
                counts: [count("waiting", 4), count("discarded_24h", 2)],
              }
            : check,
        ),
      }),
    );
    renderWithProviders(<ControlPlaneOverview />);

    const health = await screen.findByRole("region", { name: "System health" });
    expect(within(health).getByText("4 waiting · 2 discarded in 24 h")).toBeVisible();
    expect(within(health).getByText("Unknown")).toBeVisible();
    expect(within(health).getByText("No telemetry")).toBeVisible();
    expect(within(health).getByText("No webhook received")).toBeVisible();
    expect(screen.getByText(/Some background jobs failed in the last 24 hours/)).toBeVisible();
  });

  it("a failed read says nothing changed, shows no number, and retries", async () => {
    let fail = true;
    api(() =>
      fail
        ? { status: 500, body: { error: { code: "internal_error", message: "x", details: {} } } }
        : overview(FULL()),
    );
    renderWithProviders(<ControlPlaneOverview />);

    expect(await screen.findByRole("heading", { name: "We couldn’t load this" })).toBeVisible();
    expect(stat("accounts")).toBeNull();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Population" })).toBeVisible();
  });

  it("an operator with none of the overview's permissions is told so, not shown zeros", async () => {
    api(() => ({ status: 403, body: { error: { code: "forbidden", message: "x", details: {} } } }));
    renderWithProviders(<ControlPlaneOverview />);
    expect(
      await screen.findByRole("heading", { name: "The overview needs permissions you don’t have" }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\b0\b/);
  });

  it("announces loading accessibly", async () => {
    api(() => new Promise(() => undefined));
    await renderWithProviders(<ControlPlaneOverview />);
    expect(await screen.findByRole("status", { name: "Loading overview" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
