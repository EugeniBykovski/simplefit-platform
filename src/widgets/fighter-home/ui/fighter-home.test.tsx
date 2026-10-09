import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { FighterHome } from "./fighter-home";

vi.mock("@/entities/session", () => ({
  // The real one adds the bearer token and refreshes once on 401 (session.test.ts).
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => "/app/home",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const PROFILE = {
  fighter_profile: {
    display_name: "Alex K.",
    username: "alex_k",
    country_code: "PL",
    city: "Warsaw",
    experience_level: "amateur",
    stance: "orthodox",
    amateur_bout_count: null,
    goals: [],
    weight_class: null,
    current_weight_kg: null,
    height_cm: null,
    next_fight_on: null,
    next_fight_name: null,
    onboarding: {
      status: "completed",
      completed_at: "2026-10-08T12:00:00Z",
      missing_requirements: [],
    },
  },
};
const tour = (status: string, recorded_at: string | null = null) => ({
  experience: "fighter_web_tour",
  status,
  recorded_at,
});

/** The backend: profile, first-run list and the outcome write (`record` answers the PUT). */
function stubApi({
  status = "pending",
  record = (outcome: string) =>
    Promise.resolve(jsonResponse({ experience: tour(outcome, "2026-10-10T09:00:00Z") })),
}: { status?: string; record?: (outcome: string) => Promise<Response> } = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const method = init.method ?? "GET";
      calls.push(`${method} ${path}`);
      if (path === "/api/v1/me/fighter-profile") return Promise.resolve(jsonResponse(PROFILE));
      if (path === "/api/v1/me/first-run") {
        return Promise.resolve(jsonResponse({ experiences: [tour(status)] }));
      }
      if (path === "/api/v1/me/first-run/fighter_web_tour" && method === "PUT") {
        const { outcome } = JSON.parse(String(init.body)) as { outcome: string };
        return record(outcome);
      }
      return Promise.reject(new Error(`unexpected ${method} ${path}`));
    }),
  );
  return { writes: () => calls.filter((call) => !call.startsWith("GET")) };
}

describe("FighterHome", () => {
  it("first run: welcome by name, the truthful checklist and the tour offered", async () => {
    const api = stubApi();
    await renderWithProviders(<FighterHome />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Welcome to SimpleFit, Alex K." }),
    ).toBeInTheDocument();
    const checklist = screen.getByRole("region", { name: "Set up your corner" });
    expect(within(checklist).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(within(checklist).getAllByText("Not available yet")).toHaveLength(6);
    expect(within(checklist).queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Take the tour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take the tour →" })).toBeInTheDocument();
    expect(screen.queryByText("Book a class")).not.toBeInTheDocument();
    expect(api.writes()).toEqual([]);
  });

  it.each(["completed", "dismissed"])(
    "after a %s tour: the greeting; the tour stays as a replay only",
    async (status) => {
      stubApi({ status });
      await renderWithProviders(<FighterHome />);
      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: /^Good (morning|afternoon|evening), Alex K\.$/,
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Take the tour" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Take the tour →" })).not.toBeInTheDocument();
    },
  );

  it("nine steps in order: Next and Back record nothing; Finish records `completed` once", async () => {
    const api = stubApi();
    await renderWithProviders(<FighterHome />);
    await userEvent.click(await screen.findByRole("button", { name: "Take the tour" }));
    const titles = [
      "Start here",
      "Your Live Board",
      "Fight camp, week by week",
      "See your progress",
      "Your people",
      "Coaches, gyms and programs",
      "Your week and your chats",
      "You decide who sees what",
      "One account, every role",
    ];
    for (const [at, title] of titles.entries()) {
      const dialog = await screen.findByRole("dialog", { name: title });
      expect(within(dialog).getByText(`Tour · ${at + 1} of 9`)).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: "Back" }) === null).toBe(at === 0);
      if (at === 2) {
        await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
        await screen.findByRole("dialog", { name: titles[1] });
        await userEvent.click(screen.getByRole("button", { name: "Next" }));
        await screen.findByRole("dialog", { name: title });
      }
      if (at < 8) await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    }
    expect(api.writes()).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    const done = await screen.findByRole("dialog", { name: "You know your way around" });
    // The visible label and the live announcement.
    expect(within(done).getAllByText("Tour complete")).toHaveLength(2);
    expect(api.writes()).toEqual(["PUT /api/v1/me/first-run/fighter_web_tour"]);
    await userEvent.click(within(done).getByRole("button", { name: "Back to my checklist" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Good (morning|afternoon|evening), Alex K\.$/);
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("End tour on any step records `dismissed`; a failed write keeps the step with the error", async () => {
    let fail = true;
    const outcomes: string[] = [];
    stubApi({
      record: (outcome) => {
        outcomes.push(outcome);
        if (fail) {
          fail = false;
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        return Promise.resolve(jsonResponse({ experience: tour(outcome, "2026-10-10T09:00:00Z") }));
      },
    });
    await renderWithProviders(<FighterHome />);
    await userEvent.click(await screen.findByRole("button", { name: "Take the tour →" }));
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: "Your Live Board" });
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't save that");
    expect(screen.getByRole("dialog", { name: "Your Live Board" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "End tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(outcomes).toEqual(["dismissed", "dismissed"]);
  });

  it("a replay after the first run records nothing and starts again at step 1", async () => {
    const api = stubApi({ status: "completed" });
    await renderWithProviders(<FighterHome />);
    await userEvent.click(await screen.findByRole("button", { name: "Take the tour" }));
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "End tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(await screen.findByRole("dialog", { name: "Start here" })).toBeInTheDocument();
    expect(api.writes()).toEqual([]);
  });

  it("arrow keys move between steps", async () => {
    stubApi();
    await renderWithProviders(<FighterHome />);
    await userEvent.click(await screen.findByRole("button", { name: "Take the tour" }));
    await screen.findByRole("dialog", { name: "Start here" });
    await userEvent.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "Your Live Board" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("dialog", { name: "Start here" })).toBeInTheDocument();
  });

  it("an experience the API does not list is never offered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          jsonResponse(
            new URL(url).pathname === "/api/v1/me/first-run" ? { experiences: [] } : PROFILE,
          ),
        ),
      ),
    );
    await renderWithProviders(<FighterHome />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^Good /);
    expect(screen.queryByRole("button", { name: "Take the tour →" })).not.toBeInTheDocument();
  });
});
