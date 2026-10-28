import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EntryGymWorkspace,
  EntryResponseEntry,
  GymSummary,
} from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymChooser } from "./gym-chooser";

/*
 * The web gym chooser (SF-88) with the network mocked at `fetch`: it lists
 * the backend's gym workspaces only, opens a completed gym by recording the
 * choice, continues the user's draft, and pages gyms beyond the entry's 25.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  signOut: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => navigation,
  usePathname: () => "/app/gyms",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workspace = (
  n: number,
  name: string,
  overrides: Partial<EntryGymWorkspace> = {},
): EntryGymWorkspace => ({
  gym_id: id(n),
  name,
  role: "owner",
  setup_status: "completed",
  available_actions: ["enter"],
  selected: false,
  ...overrides,
});
const summary = (n: number, name: string, setup_status: "draft" | "completed"): GymSummary => ({
  id: id(n),
  name,
  gym_type: "boxing_gym",
  setup_status,
  inserted_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  viewer: { role: "front_desk", staff_membership_id: id(900 + n), permissions: [] },
});
const entry = (overrides: Partial<EntryResponseEntry>): EntryResponseEntry => ({
  destination: "gym_selection",
  reason: "gym_choice_required",
  mandatory: false,
  intent: null,
  context: null,
  account_registration: "complete",
  fighter_profile: "not_started",
  coach_profile: "not_started",
  capabilities: ["GYM_WORKSPACE"],
  gym_id: null,
  gym_workspaces: [],
  gym_workspace_count: 0,
  ...overrides,
});

function api(
  answer: EntryResponseEntry,
  pages: { gyms: GymSummary[]; next_cursor: string | null }[] = [],
) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname, search } = new URL(url);
      const method = init.method ?? "GET";
      calls.push({
        method,
        path: pathname + search,
        body: init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
      });
      if (pathname === "/api/v1/me/entry") return Promise.resolve(jsonResponse({ entry: answer }));
      if (pathname === "/api/v1/me/entry/context")
        return Promise.resolve(new Response(null, { status: 204 }));
      if (pathname === "/api/v1/me/gyms") {
        const cursor = new URLSearchParams(search).get("cursor");
        return Promise.resolve(jsonResponse(pages[cursor === null ? 0 : Number(cursor)]));
      }
      throw new Error(`unexpected ${method} ${pathname}`);
    }),
  );
  return calls;
}

const user = userEvent.setup();
beforeEach(() => {
  navigation.replace.mockClear();
  navigation.push.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("GymChooser (SF-88)", () => {
  it("offers gym registration to a user with no gym, creating nothing", async () => {
    const calls = api(entry({ capabilities: [], destination: "role_selection" }));
    await renderWithProviders(<GymChooser />);
    expect(
      await screen.findByRole("heading", { name: "You don’t work at a gym yet" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Register your gym" })).toHaveAttribute(
      "href",
      "/en/app/onboarding/gym?intent=gym",
    );
    expect(screen.queryAllByRole("button", { name: /Open/ })).toHaveLength(0);
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("opens the only gym directly: nothing to choose", async () => {
    api(entry({ gym_workspaces: [workspace(1, "Ring One")], gym_workspace_count: 1 }));
    await renderWithProviders(<GymChooser />);
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(`/app/gyms/${id(1)}`),
    );
  });

  it("lists completed gyms apart from the draft, opens a gym by recording the choice", async () => {
    const calls = api(
      entry({
        gym_workspaces: [
          workspace(3, "Draft Hall", {
            setup_status: "draft",
            available_actions: ["continue_setup"],
          }),
          workspace(1, "Ring One"),
          workspace(2, "Annex Club", { role: "manager" }),
        ],
        gym_workspace_count: 3,
      }),
    );
    await renderWithProviders(<GymChooser />);
    const gyms = await screen.findByRole("region", { name: "Gyms" });
    expect(within(gyms).getAllByRole("button")).toHaveLength(2);
    expect(within(gyms).getByRole("button", { name: /Annex Club.*Manager/ })).toBeVisible();
    const setup = screen.getByRole("region", { name: "Setup in progress" });
    expect(within(setup).getByRole("button", { name: /Draft Hall.*Continue/ })).toBeVisible();

    await user.click(within(gyms).getByRole("button", { name: /Annex Club/ }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith(`/app/gyms/${id(2)}`),
    );
    expect(calls.filter((call) => call.method !== "GET")).toEqual([
      { method: "PUT", path: "/api/v1/me/entry/context", body: { context: "gym", gym_id: id(2) } },
    ]);
  });

  it("continues the draft in Gym setup", async () => {
    api(
      entry({
        gym_workspaces: [
          workspace(3, "Draft Hall", {
            setup_status: "draft",
            available_actions: ["continue_setup"],
          }),
          workspace(1, "Ring One"),
        ],
        gym_workspace_count: 2,
      }),
    );
    await renderWithProviders(<GymChooser />);
    await user.click(await screen.findByRole("button", { name: /Draft Hall/ }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/app/onboarding/gym?intent=gym"),
    );
  });

  it("pages the gyms beyond the entry's 25 with listMyGyms, without an invented cap", async () => {
    const listed = Array.from({ length: 25 }, (_, i) => workspace(i + 1, `Gym ${i + 1}`));
    const calls = api(entry({ gym_workspaces: listed, gym_workspace_count: 27 }), [
      {
        gyms: [summary(1, "Gym 1", "completed"), summary(26, "Gym 26", "completed")],
        next_cursor: "1",
      },
      { gyms: [summary(27, "Gym 27", "completed")], next_cursor: null },
    ]);
    await renderWithProviders(<GymChooser />);
    const gyms = await screen.findByRole("region", { name: "Gyms" });
    expect(await within(gyms).findByRole("button", { name: /Gym 26.*Front desk/ })).toBeVisible();
    // Gym 1 is listed once, from the entry.
    expect(within(gyms).getAllByRole("button", { name: /^Gym 1\s?Owner/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Show more gyms (27 in total)" }));
    expect(await within(gyms).findByRole("button", { name: /Gym 27/ })).toBeVisible();
    expect(within(gyms).getAllByRole("button", { name: /Open/ })).toHaveLength(27);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(
      calls.filter((call) => call.path.startsWith("/api/v1/me/gyms")).map((c) => c.path),
    ).toEqual(["/api/v1/me/gyms?limit=50", "/api/v1/me/gyms?limit=50&cursor=1"]);
  });

  it("keeps the account's completed profiles reachable", async () => {
    api(
      entry({
        capabilities: ["FIGHTER", "GYM_WORKSPACE"],
        fighter_profile: "completed",
        gym_workspaces: [workspace(1, "Ring One"), workspace(2, "Annex Club")],
        gym_workspace_count: 2,
      }),
    );
    await renderWithProviders(<GymChooser />);
    const profiles = await screen.findByRole("region", { name: "Your profiles" });
    expect(within(profiles).getByRole("button", { name: /Fighter/ })).toBeVisible();
  });
});
