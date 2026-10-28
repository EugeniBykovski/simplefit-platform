import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Gym,
  GymFirstRun,
  GymSetup,
  GymViewerPermissionsItem,
} from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymDashboard } from "./gym-dashboard";
import { GymWorkspace } from "./gym-workspace";

/*
 * GRW1 / GRW2, the owner's first run on the gym console (SF-91), against a
 * fake SF-90 API at `fetch`: the state and the checklist come only from
 * `GET /api/v1/gyms/{gym_id}/first-run`, and only the backend's answer to an
 * explicit start / complete / dismiss moves the page.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/gyms",
}));
vi.mock("@/widgets/workspace-shell", () => ({
  WorkspaceShell: ({ children, params }: { children: ReactNode; params: { gymId: string } }) => (
    <div data-shell-gym={params.gymId}>{children}</div>
  ),
}));
vi.mock(import("@/features/session-gate"), async (importOriginal) => ({
  ...(await importOriginal()),
  ContextSwitcher: () => null,
}));

const RING = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const ANNEX = "9b4e2d61-7a3c-4f85-8e1d-6c2a0b5f3d97";

const OWNER: GymViewerPermissionsItem[] = [
  "view_workspace",
  "edit_gym",
  "complete_setup",
  "manage_first_run",
];

const gym = (overrides: Partial<Gym> = {}, permissions = OWNER): Gym => ({
  id: RING,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  inserted_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  locations: [
    {
      id: "a8d3c1f0-2b4e-4a6c-9e8d-7f1b3c5d9e20",
      name: "Gdańsk",
      country_code: "PL",
      city: "Gdańsk",
      address_line: "ul. Morska 5",
      entrance_note: null,
      is_primary: true,
    },
  ],
  viewer: {
    role: "owner",
    staff_membership_id: "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24",
    permissions,
  },
  ...overrides,
});

const setup = (): GymSetup => ({
  gym_id: RING,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  revision: 4,
  missing_requirements: [],
  phone: null,
  website: null,
  tagline: null,
  accent_color: null,
  primary_location: null,
  viewer: {
    role: "owner",
    staff_membership_id: "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24",
    permissions: OWNER,
  },
});

const CHECKLIST: GymFirstRun["checklist"] = [
  { key: "create_gym", status: "completed" },
  { key: "add_class", status: "coming_later" },
  { key: "invite_staff", status: "coming_later" },
  { key: "invite_members", status: "coming_later" },
  { key: "first_check_in", status: "coming_later" },
];

const firstRun = (overrides: Partial<GymFirstRun> = {}): { first_run: GymFirstRun } => ({
  first_run: {
    gym_id: RING,
    status: "not_started",
    started_at: null,
    completed_at: null,
    dismissed_at: null,
    checklist: CHECKLIST,
    ...overrides,
  },
});

const STARTED = "2026-10-26T08:00:00Z";
const ok = (body: unknown) => ({ status: 200, body });
const conflict = (kept: string) => ({
  status: 409,
  body: { error: { code: "conflict", message: "x", details: { first_run: kept } } },
});
const notFound = { status: 404, body: { error: { code: "not_found", message: "x", details: {} } } };
const forbidden = {
  status: 403,
  body: { error: { code: "forbidden", message: "x", details: {} } },
};
const failed = { status: 500, body: { error: { code: "internal", message: "x", details: {} } } };

type Answer = { status: number; body?: unknown } | Error;

/** A fake API: each `METHOD path` answers its queued answers in order (the last one repeats). */
function api(routes: Record<string, Answer[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
      calls.push(key);
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected ${key}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(
        answer.body === undefined
          ? new Response(null, { status: answer.status })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}

const base = (id = RING) => ({
  [`GET /api/v1/gyms/${id}`]: [ok({ gym: gym({ id }) })],
  [`GET /api/v1/gyms/${id}/setup`]: [ok({ setup: setup() })],
});

async function renderConsole(gymId = RING) {
  return renderWithProviders(
    <GymWorkspace gymId={gymId}>
      <GymDashboard />
    </GymWorkspace>,
  );
}

const user = userEvent.setup();
beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

const page = () =>
  screen.getByRole("heading", { level: 1 }).closest("[data-gym-dashboard]") as HTMLElement;

describe("GRW1 · the owner's first run on the console (SF-91)", () => {
  it("offers the introduction and renders exactly the backend's checklist, without counts", async () => {
    const calls = api({ ...base(), [`GET /api/v1/gyms/${RING}/first-run`]: [ok(firstRun())] });
    await renderConsole();
    expect(
      await screen.findByRole("heading", { name: "Welcome to your gym console" }),
    ).toBeVisible();
    expect(page()).toHaveAttribute("data-first-run", "offer");

    const checklist = screen.getByRole("region", { name: "Your gym is ready" });
    const rows = checklist.querySelectorAll("[data-checklist-key]");
    expect([...rows].map((row) => row.getAttribute("data-checklist-key"))).toEqual([
      "create_gym",
      "add_class",
      "invite_staff",
      "invite_members",
      "first_check_in",
    ]);
    expect(checklist.querySelector("[data-checklist-key=create_gym]")).toHaveAttribute(
      "data-checklist-status",
      "completed",
    );
    expect(within(checklist).getAllByText("Coming later")).toHaveLength(4);
    // Coming-later items link nowhere and nothing counts progress.
    expect(within(checklist).queryAllByRole("link")).toHaveLength(0);
    expect(within(checklist).queryAllByRole("button")).toHaveLength(0);
    expect(checklist).not.toHaveTextContent(/\d+\s*(\/|of)\s*\d+|%/);
    // Reading writes nothing.
    expect(calls.filter((call) => call.startsWith("POST"))).toEqual([]);
  });

  it("renders only the items the API sends, in its order", async () => {
    api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [
        ok(
          firstRun({
            checklist: [
              { key: "invite_staff", status: "available" },
              { key: "create_gym", status: "completed" },
            ],
          }),
        ),
      ],
    });
    await renderConsole();
    const checklist = await screen.findByRole("region", { name: "Your gym is ready" });
    const keys = [...checklist.querySelectorAll("[data-checklist-key]")].map((row) =>
      row.getAttribute("data-checklist-key"),
    );
    expect(keys).toEqual(["invite_staff", "create_gym"]);
    expect(within(checklist).getByText("Available")).toBeVisible();
    expect(within(checklist).getByText("Send your first staff invitation")).toBeVisible();
  });

  it("offers to resume an introduction started on another device", async () => {
    api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [
        ok(firstRun({ status: "in_progress", started_at: STARTED })),
      ],
    });
    await renderConsole();
    expect(await screen.findByRole("heading", { name: "Pick up the introduction" })).toBeVisible();
    expect(screen.getByText(/You started it on .*Oct.*26/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume tour" })).toBeEnabled();
  });

  it.each(["completed", "dismissed"] as const)(
    "never reopens a %s introduction: the plain WG1 dashboard shows",
    async (status) => {
      const calls = api({
        ...base(),
        [`GET /api/v1/gyms/${RING}/first-run`]: [ok(firstRun({ status }))],
      });
      await renderConsole();
      await waitFor(() => expect(page()).toHaveAttribute("data-first-run", "off"));
      expect(screen.queryByRole("button", { name: /Start the tour|Resume tour/ })).toBeNull();
      expect(screen.queryByRole("region", { name: "Your gym is ready" })).toBeNull();
      expect(await screen.findByRole("region", { name: "Gym details" })).toBeVisible();
      expect(calls.filter((call) => call.startsWith("POST"))).toEqual([]);
    },
  );

  it("never asks for the first run without the owner permission (manager, coach, front desk)", async () => {
    const calls = api({
      [`GET /api/v1/gyms/${RING}`]: [
        ok({
          gym: gym({
            viewer: {
              role: "manager",
              staff_membership_id: "m",
              permissions: ["view_workspace", "edit_gym"],
            },
          }),
        }),
      ],
    });
    await renderConsole();
    expect(await screen.findByText(/The Manager dashboard isn’t available yet/)).toBeVisible();
    expect(page()).toHaveAttribute("data-first-run", "off");
    expect(calls.some((call) => call.includes("/first-run"))).toBe(false);
  });

  it("keeps the console working when the first run cannot be read, then retries", async () => {
    api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [failed, ok(firstRun())],
    });
    await renderConsole();
    expect(
      await screen.findByText("We couldn’t load your introduction and checklist."),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Your gym" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Welcome to your gym console" }),
    ).toBeVisible();
  });

  it("treats a 403 as no first run (WG1)", async () => {
    api({ ...base(), [`GET /api/v1/gyms/${RING}/first-run`]: [forbidden] });
    await renderConsole();
    await waitFor(() => expect(page()).toHaveAttribute("data-first-run", "off"));
  });

  it("re-reads the gym on a 404 (access revoked meanwhile): the console shows not available", async () => {
    api({
      [`GET /api/v1/gyms/${RING}`]: [ok({ gym: gym() }), notFound],
      [`GET /api/v1/gyms/${RING}/setup`]: [ok({ setup: setup() })],
      [`GET /api/v1/gyms/${RING}/first-run`]: [notFound],
    });
    await renderConsole();
    expect(await screen.findByText("This gym isn’t available")).toBeVisible();
    expect(screen.queryByText("Ring One Boxing")).toBeNull();
  });

  it("shows only the answer for the gym in the path (gym A never inside gym B)", async () => {
    api({
      ...base(ANNEX),
      [`GET /api/v1/gyms/${ANNEX}/first-run`]: [ok(firstRun({ gym_id: RING }))],
    });
    await renderConsole(ANNEX);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Your gym is ready" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start the tour" })).toBeNull();
  });
});

describe("Skip = dismissed (SF-90 D4)", () => {
  it("confirms, records dismissed, says so and completes no checklist item", async () => {
    const calls = api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [ok(firstRun())],
      [`POST /api/v1/gyms/${RING}/first-run/dismiss`]: [
        ok(firstRun({ status: "dismissed", dismissed_at: STARTED })),
      ],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Skip introduction" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Skip the introduction?" });
    expect(calls.filter((call) => call.startsWith("POST"))).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Skip introduction" }));
    expect(await screen.findByText("Introduction skipped.")).toBeVisible();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const checklist = screen.getByRole("region", { name: "Your gym is ready" });
    expect(within(checklist).getAllByText("Coming later")).toHaveLength(4);
    expect(calls).toContain(`POST /api/v1/gyms/${RING}/first-run/dismiss`);
    expect(calls).not.toContain(`POST /api/v1/gyms/${RING}/first-run/complete`);
  });

  it("keeps the dialog open with the error when the dismissal fails, and Keep it changes nothing", async () => {
    const calls = api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [ok(firstRun())],
      [`POST /api/v1/gyms/${RING}/first-run/dismiss`]: [new TypeError("offline")],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Skip introduction" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Skip introduction" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nothing changed");
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "Welcome to your gym console" })).toBeVisible();
    expect(calls.filter((call) => call.endsWith("/dismiss"))).toHaveLength(1);
  });
});

describe("GRW2 · the tour", () => {
  const touring = (extra: Record<string, Answer[]> = {}) =>
    api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [ok(firstRun())],
      [`POST /api/v1/gyms/${RING}/first-run/start`]: [
        ok(firstRun({ status: "in_progress", started_at: STARTED })),
      ],
      ...extra,
    });

  it("starts on the backend, walks the four real steps, finishes and says so", async () => {
    const calls = touring({
      [`POST /api/v1/gyms/${RING}/first-run/complete`]: [
        ok(firstRun({ status: "completed", started_at: STARTED, completed_at: STARTED })),
      ],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Start the tour" }));
    const tour = await screen.findByRole("dialog", { name: "Your opening checklist" });
    expect(within(tour).getByText("Tour · 1 of 4")).toBeVisible();
    expect(calls).toContain(`POST /api/v1/gyms/${RING}/first-run/start`);

    await user.click(within(tour).getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Your gym and your access" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Tools arrive in this menu" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "Your gym and your access" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    const last = await screen.findByRole("dialog", { name: "One account, every role" });
    expect(within(last).getByText(/owner of Ring One Boxing/)).toBeVisible();
    // Moving between steps records nothing.
    expect(calls.filter((call) => call.startsWith("POST"))).toEqual([
      `POST /api/v1/gyms/${RING}/first-run/start`,
    ]);

    await user.click(within(last).getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("dialog", { name: "You know your way around" })).toBeVisible();
    expect(calls).toContain(`POST /api/v1/gyms/${RING}/first-run/complete`);
    await user.click(screen.getByRole("button", { name: "Back to the dashboard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Introduction finished.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("keeps step 4 with Try again when finishing fails, then finishes", async () => {
    touring({
      [`POST /api/v1/gyms/${RING}/first-run/complete`]: [
        new TypeError("offline"),
        ok(firstRun({ status: "completed", started_at: STARTED, completed_at: STARTED })),
      ],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Start the tour" }));
    for (let step = 0; step < 3; step += 1) {
      await user.click(await screen.findByRole("button", { name: "Next" }));
    }
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("dialog", { name: "We couldn’t save that" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("dialog", { name: "You know your way around" })).toBeVisible();
  });

  it("ends the tour only after confirming, as dismissed", async () => {
    const calls = touring({
      [`POST /api/v1/gyms/${RING}/first-run/dismiss`]: [
        ok(firstRun({ status: "dismissed", started_at: STARTED, dismissed_at: STARTED })),
      ],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Start the tour" }));
    await user.click(await screen.findByRole("button", { name: "End tour" }));
    expect(await screen.findByRole("dialog", { name: "End the introduction?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep going" }));
    expect(await screen.findByRole("dialog", { name: "Your opening checklist" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("dialog", { name: "End the introduction?" })).toBeVisible();
    expect(calls.filter((call) => call.endsWith("/dismiss"))).toEqual([]);
    await user.click(screen.getByRole("button", { name: "End introduction" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Introduction skipped.")).toBeVisible();
    expect(calls).toContain(`POST /api/v1/gyms/${RING}/first-run/dismiss`);
  });

  it("does not open the tour when the start fails, and says nothing changed", async () => {
    api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [ok(firstRun())],
      [`POST /api/v1/gyms/${RING}/first-run/start`]: [failed],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Start the tour" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save that. Nothing changed.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the outcome kept on another device when starting conflicts (409)", async () => {
    api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [
        ok(firstRun()),
        ok(firstRun({ status: "completed", started_at: STARTED, completed_at: STARTED })),
      ],
      [`POST /api/v1/gyms/${RING}/first-run/start`]: [conflict("completed")],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Start the tour" }));
    expect(await screen.findByText("Introduction finished.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the tour and shows the kept outcome when finishing conflicts (409)", async () => {
    api({
      ...base(),
      [`GET /api/v1/gyms/${RING}/first-run`]: [
        ok(firstRun()),
        ok(firstRun({ status: "dismissed", started_at: STARTED, dismissed_at: STARTED })),
      ],
      [`POST /api/v1/gyms/${RING}/first-run/start`]: [
        ok(firstRun({ status: "in_progress", started_at: STARTED })),
      ],
      [`POST /api/v1/gyms/${RING}/first-run/complete`]: [conflict("dismissed")],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: "Start the tour" }));
    for (let step = 0; step < 3; step += 1) {
      await user.click(await screen.findByRole("button", { name: "Next" }));
    }
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText("Introduction skipped.")).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });
});
