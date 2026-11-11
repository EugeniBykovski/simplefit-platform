import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { OperationsPage } from "./operations-page";

/*
 * AD17 (SF-126) with the network mocked at `fetch`: every status is the backend's,
 * unknown and no telemetry never read as healthy, a failed refresh keeps the last
 * answer marked as stale, the job list needs its own permission and shows no
 * arguments, and nothing offers a retry.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const permissions = vi.hoisted(() => ({ current: [] as string[] }));
vi.mock("@/entities/operator", () => ({
  useOperator: () => ({ data: { permissions: permissions.current } }),
  grants: (operator: { permissions: string[] }, permission: string) =>
    operator.permissions.includes(permission),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
}));

const NOW = "2026-11-11T12:00:00Z";
const counts = (all: Record<string, number> = {}) => ({
  available: 0,
  scheduled: 0,
  executing: 0,
  retryable: 0,
  completed: 0,
  discarded: 0,
  cancelled: 0,
  ...all,
});
const health = (overrides: Record<string, unknown> = {}) => ({
  health: {
    observed_at: NOW,
    checks: [
      { id: "api", status: "healthy", observed_at: NOW, counts: [], last_event_at: null },
      {
        id: "database",
        status: "healthy",
        observed_at: NOW,
        counts: [{ key: "query_ms", value: 2 }],
        last_event_at: null,
      },
      {
        id: "background_jobs",
        status: "degraded",
        observed_at: NOW,
        counts: [
          { key: "waiting", value: 3 },
          { key: "executing", value: 0 },
          { key: "failed_24h", value: 1 },
        ],
        last_event_at: null,
      },
      { id: "email", status: "unknown", observed_at: NOW, counts: [], last_event_at: null },
      {
        id: "payments_webhooks",
        status: "unknown",
        observed_at: NOW,
        counts: [],
        last_event_at: null,
      },
      { id: "storage", status: "no_telemetry", observed_at: null, counts: [], last_event_at: null },
      {
        id: "error_monitoring",
        status: "no_telemetry",
        observed_at: null,
        counts: [],
        last_event_at: null,
      },
    ],
    queues: [
      { name: "default", limit: 10, counts: counts({ available: 3, discarded: 1 }) },
      { name: "mailers", limit: 5, counts: counts() },
    ],
    migrations: { applied: 43, latest_version: "20261205090000" },
    release: { release: "simplefit-api@0.1.0", environment: "dev", source: "default" },
    ...overrides,
  },
});
const job = {
  id: 41,
  queue: "mailers",
  worker: "SimpleFit.Email.DeliveryWorker",
  state: "discarded",
  attempt: 5,
  max_attempts: 5,
  inserted_at: NOW,
  scheduled_at: NOW,
  attempted_at: NOW,
  completed_at: null,
  discarded_at: NOW,
  cancelled_at: null,
  failure: "Oban.PerformError",
  errors: 5,
  retry: "not_supported",
};

type Answer = { status: number; body?: unknown } | "offline";

function api(routes: Record<string, Answer[]>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const url = new URL(input);
      calls.push(url);
      const queue = routes[url.pathname];
      if (!queue) throw new Error(`unexpected ${url.pathname}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer === "offline") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const HEALTH = "/api/v1/admin/operations/health";
const JOBS = "/api/v1/admin/operations/jobs";
const user = userEvent.setup();

afterEach(() => {
  vi.unstubAllGlobals();
  permissions.current = [];
});

describe("AD17 system health (SF-126)", () => {
  it("shows each measured status in words; unknown and no telemetry are never healthy", async () => {
    permissions.current = ["system.health.read"];
    api({ [HEALTH]: [{ status: 200, body: health() }] });
    await renderWithProviders(<OperationsPage />);

    const table = await screen.findByRole("table", { name: /Service health/ });
    const row = (id: string) => table.querySelector(`[data-check="${id}"]`) as HTMLElement;
    expect(within(row("database")).getByText("Healthy")).toBeInTheDocument();
    expect(within(row("database")).getByText("Query from the app · 2 ms")).toBeInTheDocument();
    expect(within(row("background_jobs")).getByText("Degraded")).toBeInTheDocument();
    expect(within(row("email")).getByText("Unknown")).toBeInTheDocument();
    expect(within(row("storage")).getByText("No telemetry")).toBeInTheDocument();
    expect(within(row("storage")).getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is an uptime percentage/)).toBeInTheDocument();
    expect(screen.getByText("(none set: the app version stands in)")).toBeInTheDocument();
    expect(screen.getByText(/43 applied/)).toBeInTheDocument();
    // No job list without job access, and no action anywhere.
    expect(screen.queryByRole("region", { name: "Background jobs" })).not.toBeInTheDocument();
    expect(screen.getByText("The job list needs job access.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("a failed refresh keeps the last answer, marked as not current", async () => {
    permissions.current = ["system.health.read"];
    api({ [HEALTH]: [{ status: 200, body: health() }, "offline"] });
    await renderWithProviders(<OperationsPage />);
    await screen.findByRole("table", { name: /Service health/ });

    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(
      await screen.findByText(/This is the answer from .*, not the current state/),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-operations-state]")).toHaveAttribute(
      "data-operations-state",
      "stale",
    );
  });

  it("unreachable: says so and shows no status at all", async () => {
    permissions.current = ["system.health.read"];
    api({ [HEALTH]: ["offline"] });
    await renderWithProviders(<OperationsPage />);
    expect(await screen.findByText("We can’t reach the health checks.")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("no permission at all: the restricted state", async () => {
    permissions.current = [];
    api({
      [HEALTH]: [
        { status: 403, body: { error: { code: "forbidden", message: "x", details: {} } } },
      ],
    });
    await renderWithProviders(<OperationsPage />);
    expect(await screen.findByText("You don’t have access to this section")).toBeInTheDocument();
  });

  it("jobs: discarded first, filters on the server, metadata only, no retry", async () => {
    permissions.current = ["system.health.read", "system.jobs.read"];
    const calls = api({
      [HEALTH]: [{ status: 200, body: health() }],
      [JOBS]: [{ status: 200, body: { jobs: [job], next_cursor: null } }],
      [`${JOBS}/41`]: [{ status: 200, body: { job } }],
    });
    await renderWithProviders(<OperationsPage />);

    const jobs = await screen.findByRole("table", { name: /Background jobs, newest first/ });
    expect(calls.find((url) => url.pathname === JOBS)!.searchParams.get("state")).toBe("discarded");
    expect(within(jobs).getByText("Email.DeliveryWorker")).toBeInTheDocument();
    expect(within(jobs).getByText("Oban.PerformError")).toBeInTheDocument();
    expect(within(jobs).getByText("5 of 5")).toBeInTheDocument();

    await user.click(within(jobs).getByRole("button", { name: "#41" }));
    expect(await screen.findByText(/no worker has an approved retry policy/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Worker" }));
    await user.click(await screen.findByRole("option", { name: "Email.DeliveryWorker" }));
    await waitFor(() =>
      expect(calls.at(-1)!.searchParams.get("worker")).toBe("SimpleFit.Email.DeliveryWorker"),
    );
  });
});
