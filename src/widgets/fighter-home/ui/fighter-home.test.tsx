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

  it.each(["completed", "dismissed"])("after a %s tour: the greeting, no tour", async (status) => {
    stubApi({ status });
    await renderWithProviders(<FighterHome />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening), Alex K\.$/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Take the tour/ })).not.toBeInTheDocument();
  });

  it("Done records `completed`, closes the tour and focuses the heading", async () => {
    const api = stubApi();
    await renderWithProviders(<FighterHome />);
    await userEvent.click(await screen.findByRole("button", { name: "Take the tour" }));
    const dialog = await screen.findByRole("dialog", { name: "Your Live Board lives here" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Good (morning|afternoon|evening), Alex K\.$/);
    await waitFor(() => expect(heading).toHaveFocus());
    expect(api.writes()).toEqual(["PUT /api/v1/me/first-run/fighter_web_tour"]);
  });

  it("Escape ends the tour (`dismissed`); a failed write keeps it open with the error", async () => {
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
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't save that");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "End tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(outcomes).toEqual(["dismissed", "dismissed"]);
  });

  it("another tab's earlier outcome wins: the kept answer closes the tour", async () => {
    stubApi({
      record: () =>
        Promise.resolve(jsonResponse({ experience: tour("dismissed", "2026-10-10T08:00:00Z") })),
    });
    await renderWithProviders(<FighterHome />);
    await userEvent.click(await screen.findByRole("button", { name: "Take the tour" }));
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Take the tour/ })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /Take the tour/ })).not.toBeInTheDocument();
  });
});
