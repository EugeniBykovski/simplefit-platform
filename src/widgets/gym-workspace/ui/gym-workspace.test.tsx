import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gymQueryKey } from "@/entities/gym";
import type { Gym, GymSetup } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymDashboard } from "./gym-dashboard";
import { GymWorkspace } from "./gym-workspace";

/*
 * The gym console (SF-88) with the network mocked at `fetch`: the console
 * renders a page only with the backend's answer for the gym in the path,
 * and the dashboard shows real gym data only.
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
// The shell (sidebar, session control, switchers) has its own tests.
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

const gym = (overrides: Partial<Gym> = {}): Gym => ({
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
    permissions: ["view_workspace", "edit_gym", "complete_setup", "manage_billing"],
  },
  ...overrides,
});

const setup = (overrides: Partial<GymSetup> = {}): GymSetup => ({
  gym_id: RING,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  revision: 4,
  missing_requirements: [],
  phone: "+48 22 000 00 00",
  website: "https://ringone.example",
  tagline: "Box every day",
  accent_color: "#e07a5f",
  primary_location: {
    id: "a8d3c1f0-2b4e-4a6c-9e8d-7f1b3c5d9e20",
    name: "Gdańsk",
    country_code: "PL",
    city: "Gdańsk",
    address_line: "ul. Morska 5",
    entrance_note: "Courtyard entrance",
    is_primary: true,
  },
  viewer: gym().viewer,
  ...overrides,
});

type Answer = { status: number; body?: unknown } | Error | (() => Promise<Response>);

/** A fake API: each path answers its queued answers in order (the last one repeats). */
function api(routes: Record<string, Answer[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const { pathname } = new URL(url);
      calls.push(pathname);
      const queue = routes[pathname];
      if (!queue) throw new Error(`unexpected ${pathname}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      if (typeof answer === "function") return answer();
      return Promise.resolve(
        answer.body === undefined
          ? new Response(null, { status: answer.status })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}
const notFound = { status: 404, body: { error: { code: "not_found", message: "x", details: {} } } };
const forbidden = {
  status: 403,
  body: { error: { code: "forbidden", message: "x", details: {} } },
};
const failed = { status: 500, body: { error: { code: "internal", message: "x", details: {} } } };

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

describe("GymWorkspace and the WG1 dashboard (SF-88)", () => {
  it("shows the owner the real gym, its saved details and role, and no invented figures", async () => {
    api({
      [`/api/v1/gyms/${RING}`]: [{ status: 200, body: { gym: gym() } }],
      [`/api/v1/gyms/${RING}/setup`]: [{ status: 200, body: { setup: setup() } }],
    });
    await renderConsole();
    const dashboard = await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    const page = dashboard.closest("[data-gym-dashboard]") as HTMLElement;
    expect(page).toHaveAttribute("data-gym-id", RING);
    expect(within(page).getByText("Ring One Boxing")).toBeVisible();
    expect(within(page).getByText("Boxing club · Gdańsk, Poland")).toBeVisible();
    expect(within(page).getByText("Setup complete")).toBeVisible();
    expect(await within(page).findByText("+48 22 000 00 00")).toBeVisible();
    expect(within(page).getByText("https://ringone.example")).toBeVisible();
    expect(within(page).getByText("Box every day")).toBeVisible();
    expect(within(page).getByText("Coral")).toBeVisible();
    expect(within(page).getByText(/ul\. Morska 5/)).toBeVisible();
    expect(within(page).getByText("Owner", { selector: "[data-gym-role]" })).toBeVisible();
    // SF-82 R5: no member, class, revenue or activity figures, not even zeros.
    expect(page).not.toHaveTextContent(/PLN|MRR|revenue|check-ins today|active members|\b0\b/i);
    // Members, classes and check-ins; Coaches & staff has its page (SF-94).
    expect(within(page).getAllByText("Later")).toHaveLength(3);
  });

  it("renders not available, without any gym data, for a gym the backend does not show (404)", async () => {
    const calls = api({ [`/api/v1/gyms/${ANNEX}`]: [notFound] });
    await renderConsole(ANNEX);
    expect(await screen.findByText("This gym isn’t available")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
    expect(screen.getByRole("link", { name: "Your gyms" })).toHaveAttribute("href", "/en/app/gyms");
    expect(calls).toEqual([`/api/v1/gyms/${ANNEX}`]);
  });

  it("renders the role-restriction state for 403 (D-G24)", async () => {
    api({ [`/api/v1/gyms/${RING}`]: [forbidden] });
    await renderConsole();
    expect(await screen.findByText("Your role doesn’t include this")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it("never opens a draft as a console: its owner continues setup", async () => {
    const calls = api({
      [`/api/v1/gyms/${RING}`]: [{ status: 200, body: { gym: gym({ setup_status: "draft" }) } }],
    });
    await renderConsole();
    expect(await screen.findByText("This gym isn’t set up yet")).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute(
      "href",
      "/en/app/onboarding/gym?intent=gym",
    );
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
    expect(calls).not.toContain(`/api/v1/gyms/${RING}/setup`);
  });

  it("offers a retry when the gym cannot be read, then shows it", async () => {
    api({
      [`/api/v1/gyms/${RING}`]: [new TypeError("offline"), { status: 200, body: { gym: gym() } }],
      [`/api/v1/gyms/${RING}/setup`]: [{ status: 200, body: { setup: setup() } }],
    });
    await renderConsole();
    await user.click(await screen.findByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  it("replaces the dashboard when a re-read answers 404 (membership revoked meanwhile)", async () => {
    api({
      [`/api/v1/gyms/${RING}`]: [{ status: 200, body: { gym: gym() } }, notFound],
      [`/api/v1/gyms/${RING}/setup`]: [{ status: 200, body: { setup: setup() } }],
    });
    const { queryClient } = await renderConsole();
    await screen.findByRole("heading", { name: "Dashboard" });
    await queryClient.invalidateQueries({ queryKey: gymQueryKey(RING) });
    expect(await screen.findByText("This gym isn’t available")).toBeVisible();
    expect(screen.queryByText("Ring One Boxing")).toBeNull();
  });

  it("gives other roles the gym and their access, a limited-access notice and no setup read", async () => {
    const calls = api({
      [`/api/v1/gyms/${RING}`]: [
        {
          status: 200,
          body: {
            gym: gym({
              viewer: {
                role: "manager",
                staff_membership_id: "6a1f3c5e-7b9d-4e2a-8c4f-0d2b6e8a1c35",
                permissions: ["view_workspace", "edit_gym"],
              },
            }),
          },
        },
      ],
    });
    await renderConsole();
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    expect(screen.getByText("Manager", { selector: "[data-gym-role]" })).toBeVisible();
    expect(screen.getByText(/The Manager dashboard isn’t available yet/)).toBeVisible();
    expect(screen.queryByText("Gym details")).toBeNull();
    expect(calls).not.toContain(`/api/v1/gyms/${RING}/setup`);
  });

  it("keeps the rest of the dashboard when only the setup read fails, with a retry", async () => {
    api({
      [`/api/v1/gyms/${RING}`]: [{ status: 200, body: { gym: gym() } }],
      [`/api/v1/gyms/${RING}/setup`]: [failed, { status: 200, body: { setup: setup() } }],
    });
    await renderConsole();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load the gym details.");
    expect(screen.getByText("Ring One Boxing")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Box every day")).toBeVisible();
  });

  it("never shows a late answer for the previous gym after a switch", async () => {
    let releaseRing: (response: Response) => void = () => {};
    api({
      [`/api/v1/gyms/${RING}`]: [() => new Promise<Response>((resolve) => (releaseRing = resolve))],
      [`/api/v1/gyms/${ANNEX}`]: [
        {
          status: 200,
          body: {
            gym: gym({ id: ANNEX, name: "Annex Club", viewer: { ...gym().viewer, role: "coach" } }),
          },
        },
      ],
    });
    const view = await renderConsole(RING);
    view.rerender(
      <GymWorkspace gymId={ANNEX}>
        <GymDashboard />
      </GymWorkspace>,
    );
    expect(await screen.findByText("Annex Club")).toBeVisible();
    // The abandoned read is cancelled with its last observer; whenever its
    // answer lands, it can only ever reach its own gym's key.
    releaseRing(jsonResponse({ gym: gym() }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(view.queryClient.getQueryData(gymQueryKey(ANNEX))).toMatchObject({ id: ANNEX });
    expect(screen.queryByText("Ring One Boxing")).toBeNull();
    expect(document.querySelector("[data-gym-dashboard]")).toHaveAttribute("data-gym-id", ANNEX);
  });
});
