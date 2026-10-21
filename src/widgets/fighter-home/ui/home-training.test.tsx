import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { myTrainingSessionsRootKey } from "@/entities/training-session";
import { jsonResponse, renderWithProviders, testQueryClient } from "@/test/render";

import { FighterHome } from "./fighter-home";
import { HomeTraining } from "./home-training";

/*
 * The Home's Training card (SF-68) on the SF-63 projections, with the
 * network mocked at `fetch`: the next session is the backend's first
 * upcoming one, the preview is its newest completed ones, nothing is
 * counted, a failed read is never an empty schedule, each projection fails
 * on its own, and nothing here ever writes the first-run record.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => "/app/home",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "ses-1",
  relationship_id: "rel-1",
  coach: { display_name: "Julia Nowak", brand_name: "North Gym" },
  coach_display_name_at_end: null,
  title: "Technical boxing",
  training_type: "technical",
  starts_at: "2026-10-21T16:00:00Z",
  time_zone: "Europe/Warsaw",
  duration_minutes: 60,
  notes: null,
  status: "planned",
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  inserted_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...overrides,
});
const page = (training_sessions: unknown[], next_cursor: string | null = null) =>
  jsonResponse({ training_sessions, next_cursor });
const failure = (status: number, code: string) =>
  jsonResponse({ error: { code, message: "", details: {}, request_id: "r" } }, { status });

type Reply = () => Response;
function stub({ upcoming, completed }: { upcoming: Reply; completed: Reply }) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const method = init.method ?? "GET";
      calls.push(`${method} ${url.pathname}${url.search}`);
      if (url.pathname === "/api/v1/me/training-sessions") {
        return Promise.resolve(
          url.searchParams.get("view") === "upcoming" ? upcoming() : completed(),
        );
      }
      if (url.pathname === "/api/v1/me/fighter-profile")
        return Promise.resolve(
          jsonResponse({
            fighter_profile: {
              display_name: "Alex K.",
              onboarding: {
                status: "completed",
                completed_at: "2026-10-08T12:00:00Z",
                missing_requirements: [],
              },
            },
          }),
        );
      if (url.pathname === "/api/v1/me/first-run")
        return Promise.resolve(
          jsonResponse({
            experiences: [
              { experience: "fighter_web_tour", status: "dismissed", recorded_at: null },
            ],
          }),
        );
      return Promise.reject(new Error(`unexpected ${method} ${url.pathname}`));
    }),
  );
  return calls;
}

const card = () => screen.getByRole("region", { name: "Training" });

describe("HomeTraining (SF-68)", () => {
  it("shows the backend's first upcoming session and the newest completed ones, with no counts", async () => {
    const calls = stub({
      upcoming: () =>
        page(
          [
            session(),
            session({ id: "ses-2", title: "Later pads", starts_at: "2026-10-25T16:00:00Z" }),
          ],
          "more",
        ),
      completed: () =>
        page([
          session({ id: "c1", title: "Roadwork", training_type: "roadwork", status: "completed" }),
          session({
            id: "c2",
            title: "Pads",
            status: "completed",
            coach: null,
            coach_display_name_at_end: "Tomasz M.",
          }),
          session({ id: "c3", title: "S&C", status: "completed" }),
          session({ id: "c4", title: "Fourth", status: "completed" }),
        ]),
    });
    await renderWithProviders(<HomeTraining />);

    const next = await screen.findByRole("link", { name: /Technical boxing/ });
    expect(next).toHaveAttribute("href", "/app/training/ses-1");
    expect(next).toHaveTextContent("06:00 PM");
    expect(next).toHaveTextContent("Wed, Oct 21 · Europe/Warsaw");
    expect(next).toHaveTextContent("Technical · Julia Nowak · North Gym · 60 min");
    expect(screen.queryByText("Later pads")).toBeNull();

    const recent = await screen.findByRole("list", { name: "Latest completed" });
    const items = within(recent).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent("Former coach · Tomasz M.");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "/app/training/c1");
    expect(screen.queryByText("Fourth")).toBeNull();
    expect(screen.getByRole("link", { name: "All training →" })).toHaveAttribute(
      "href",
      "/app/training",
    );
    // Nothing is counted from a partial page.
    expect(card().textContent).not.toMatch(/\d+ (sessions|upcoming|completed)/i);
    expect(calls).toEqual(
      expect.arrayContaining([
        "GET /api/v1/me/training-sessions?view=upcoming&limit=50",
        "GET /api/v1/me/training-sessions?view=history&status=completed&limit=50",
      ]),
    );
    expect(calls.filter((call) => !call.startsWith("GET"))).toEqual([]);
  });

  it("says when nothing is scheduled or completed, never a sample session", async () => {
    stub({ upcoming: () => page([]), completed: () => page([]) });
    await renderWithProviders(<HomeTraining />);
    expect(await screen.findByText("No training scheduled yet")).toBeVisible();
    expect(await screen.findByText("No completed sessions yet.")).toBeVisible();
    expect(within(card()).queryByRole("link", { name: /PM|AM/ })).toBeNull();
  });

  it("keeps the completed preview when upcoming fails, and retries upcoming alone", async () => {
    let attempt = 0;
    stub({
      upcoming: () => (++attempt === 1 ? failure(503, "internal_error") : page([session()])),
      completed: () => page([session({ id: "c1", title: "Roadwork", status: "completed" })]),
    });
    const user = userEvent.setup();
    await renderWithProviders(<HomeTraining />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load your training.");
    expect(screen.queryByText("No training scheduled yet")).toBeNull();
    expect(await screen.findByRole("link", { name: /Roadwork/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Technical boxing/ })).toBeVisible();
  });

  it("keeps the next session when the completed preview fails", async () => {
    stub({ upcoming: () => page([session()]), completed: () => failure(500, "internal_error") });
    await renderWithProviders(<HomeTraining />);
    expect(await screen.findByRole("link", { name: /Technical boxing/ })).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t load your completed sessions.",
    );
    expect(screen.queryByText("No completed sessions yet.")).toBeNull();
  });

  it("not available (404) is one state, never an empty schedule", async () => {
    stub({ upcoming: () => failure(404, "not_found"), completed: () => failure(404, "not_found") });
    await renderWithProviders(<HomeTraining />);
    expect(await screen.findByText("Training isn’t available")).toBeVisible();
    expect(screen.queryByText("No training scheduled yet")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("follows the backend after a change elsewhere (a completion invalidates the shared lists)", async () => {
    let completedNow = false;
    stub({
      upcoming: () => page(completedNow ? [] : [session()]),
      completed: () =>
        page(
          completedNow
            ? [session({ status: "completed", completed_at: "2026-10-21T17:00:00Z" })]
            : [],
        ),
    });
    const queryClient = testQueryClient();
    await renderWithProviders(<HomeTraining />, { queryClient });
    expect(await screen.findByRole("link", { name: /Technical boxing/ })).toHaveAttribute(
      "data-home-next",
      "ses-1",
    );
    completedNow = true;
    await act(() => queryClient.invalidateQueries({ queryKey: myTrainingSessionsRootKey }));
    expect(await screen.findByText("No training scheduled yet")).toBeVisible();
    const recent = await screen.findByRole("list", { name: "Latest completed" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(1);
  });

  it("a training failure leaves the rest of Home and the first-run record alone", async () => {
    const calls = stub({
      upcoming: () => failure(503, "internal_error"),
      completed: () => failure(503, "internal_error"),
    });
    await renderWithProviders(<FighterHome />);
    expect(await screen.findByRole("heading", { level: 1, name: /Alex K\./ })).toBeVisible();
    expect(screen.getByRole("region", { name: "Set up your corner" })).toBeVisible();
    expect(await within(card()).findAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.filter((call) => !call.startsWith("GET"))).toEqual([]);
  });
});
