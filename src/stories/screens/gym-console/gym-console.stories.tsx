import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { GymGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { GymChooser } from "@/widgets/gym-chooser";
import { GymDashboard, GymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deContextSwitcher from "../../../../messages/de/contextSwitcher.json";
import deGymConsole from "../../../../messages/de/gymConsole.json";
import deGymOnboarding from "../../../../messages/de/gymOnboarding.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The web gym console (SF-88; D-WEB-GYM-CONSOLE-MVP): the route's own
 * composition (session gate, GYM_WORKSPACE gate, the console of the gym in
 * the path, WG1) and the gym chooser (WGC1, the WCX1 composition) on a
 * deterministic stand-in of the SF-83/SF-84/SF-85 API (`fetch` is replaced
 * per story; nothing reaches a backend). Gym names are Storybook fixtures.
 */

const RING = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const ANNEX = "9b4e2d61-7a3c-4f85-8e1d-6c2a0b5f3d97";
const DRAFT = "c5a1e8f3-4d29-4b7e-a6c0-1f8d3e5b7a22";
const LONG_NAME = "Bokserski Klub Sportowy Wybrzeże Gdańsk–Gdynia–Sopot Akademia";

type Role = "owner" | "manager" | "coach" | "front_desk";

const PERMISSIONS: Record<Role, string[]> = {
  owner: ["view_workspace", "edit_gym", "manage_locations", "complete_setup", "manage_billing"],
  manager: ["view_workspace", "edit_gym", "manage_locations", "invite_staff"],
  coach: ["view_workspace", "view_rosters", "record_check_in"],
  front_desk: ["view_workspace", "record_check_in", "book_for_member"],
};

const location = {
  id: "a8d3c1f0-2b4e-4a6c-9e8d-7f1b3c5d9e20",
  name: "Gdańsk",
  country_code: "PL",
  city: "Gdańsk",
  address_line: "ul. Morska 5",
  entrance_note: "Entrance from the courtyard, 1st floor",
  is_primary: true,
};

const gym = (id: string, name: string, role: Role, setup_status = "completed") => ({
  gym: {
    id,
    name,
    gym_type: "boxing_club",
    setup_status,
    inserted_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
    locations: [location],
    viewer: {
      role,
      staff_membership_id: "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24",
      permissions: PERMISSIONS[role],
    },
  },
});

const setup = (id: string, name: string) => ({
  setup: {
    gym_id: id,
    name,
    gym_type: "boxing_club",
    setup_status: "completed",
    revision: 4,
    missing_requirements: [],
    phone: "+48 58 000 00 00",
    website: "https://ringone.example",
    tagline: "Box every day. Everyone welcome.",
    accent_color: "#e07a5f",
    primary_location: location,
    viewer: gym(id, name, "owner").gym.viewer,
  },
});

const workspace = (
  gym_id: string,
  name: string,
  role: Role,
  status: "completed" | "draft" = "completed",
) => ({
  gym_id,
  name,
  role,
  setup_status: status,
  available_actions: status === "completed" ? ["enter"] : ["continue_setup"],
  selected: false,
});

const entry = (
  workspaces: ReturnType<typeof workspace>[],
  overrides: Record<string, unknown> = {},
) => ({
  entry: {
    destination: "gym_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    capabilities: ["FIGHTER", "GYM_WORKSPACE"],
    gym_id: RING,
    gym_workspaces: workspaces,
    gym_workspace_count: workspaces.length,
    ...overrides,
  },
});

const TWO = [
  workspace(RING, "Ring One Boxing", "owner"),
  workspace(ANNEX, "Annex Club", "manager"),
];

function consoleStory({
  gymId = RING,
  gymAnswer = ok(gym(RING, "Ring One Boxing", "owner")),
  setupAnswer = ok(setup(RING, "Ring One Boxing")),
  workspaces = TWO,
  choice = ok(undefined, 204),
  refresh = ok(SESSION),
  play,
}: {
  gymId?: string;
  gymAnswer?: Answer | Answer[];
  setupAnswer?: Answer | Answer[];
  workspaces?: ReturnType<typeof workspace>[];
  choice?: Answer;
  refresh?: Answer;
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: `/en/app/gyms/${gymId}` } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": refresh,
        "/api/v1/me/entry": ok(entry(workspaces)),
        "/api/v1/me/fighter-profile": ok({ fighter_profile: { display_name: "Alex N." } }),
        [`/api/v1/gyms/${gymId}`]: gymAnswer,
        [`/api/v1/gyms/${gymId}/setup`]: setupAnswer,
        "PUT /api/v1/me/entry/context": choice,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <GymWorkspace gymId={gymId}>
            <GymDashboard />
          </GymWorkspace>
        </GymGate>
      </RequireSession>
    ),
    play,
  };
}

function chooserStory({
  workspaces,
  count,
  capabilities = ["GYM_WORKSPACE"],
  pages = [],
  play,
}: {
  workspaces: ReturnType<typeof workspace>[];
  count?: number;
  capabilities?: string[];
  pages?: Answer[];
  play?: StoryObj["play"];
}): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/en/app/gyms" } } },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(
          entry(workspaces, {
            destination: "gym_selection",
            gym_id: null,
            capabilities,
            fighter_profile: capabilities.includes("FIGHTER") ? "completed" : "not_started",
            gym_workspace_count: count ?? workspaces.length,
          }),
        ),
        "/api/v1/me/gyms": pages.length > 0 ? pages : ok({ gyms: [], next_cursor: null }),
        "PUT /api/v1/me/entry/context": ok(undefined, 204),
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <GymChooser />
      </RequireSession>
    ),
    play,
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

/** German copy of the console over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{
        ...messages,
        contextSwitcher: deContextSwitcher,
        gymConsole: deGymConsole,
        gymOnboarding: deGymOnboarding,
        shells: deShells,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Gym Console/Console and chooser",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const dashboard = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("heading", { level: 1, name: "Dashboard" }, { timeout: 5000 });
/** The switcher menu renders in a portal, outside the story's canvas. */
const openSwitcher = async (canvasElement: HTMLElement, name: RegExp) => {
  const triggers = await within(canvasElement).findAllByRole("button", { name }, { timeout: 5000 });
  const first = triggers[0];
  if (!first) throw new Error("no switcher");
  await userEvent.click(first);
  return within(document.body).findByRole("menu");
};

/* ── WG1 ────────────────────────────────────────────────────────────── */

export const OwnerDashboard = consoleStory({
  play: async ({ canvasElement }) => {
    await dashboard(canvasElement);
    await expect(
      await within(canvasElement).findByText("Box every day. Everyone welcome."),
    ).toBeVisible();
  },
});
OwnerDashboard.name = "WG1 · owner · one completed gym (real data)";

export const OwnerLight = { ...consoleStory(), globals: { theme: "Light" } };
OwnerLight.name = "WG1 · owner · light theme";

export const LongName = consoleStory({
  gymAnswer: ok(gym(RING, LONG_NAME, "owner")),
  setupAnswer: ok(setup(RING, LONG_NAME)),
  workspaces: [workspace(RING, LONG_NAME, "owner"), workspace(ANNEX, "Annex Club", "manager")],
});
LongName.name = "WG1 · very long gym name";

export const Manager = consoleStory({
  gymId: ANNEX,
  gymAnswer: ok(gym(ANNEX, "Annex Club", "manager")),
  play: async ({ canvasElement }) => {
    await dashboard(canvasElement);
    await expect(
      within(canvasElement).getByText(/The Manager dashboard isn’t available yet/),
    ).toBeVisible();
  },
});
Manager.name = "WG1 · manager · limited access";

export const Coach = consoleStory({
  gymId: ANNEX,
  gymAnswer: ok(gym(ANNEX, "Annex Club", "coach")),
  workspaces: [workspace(ANNEX, "Annex Club", "coach")],
});
Coach.name = "WG1 · coach staff · limited access";

export const FrontDesk = consoleStory({
  gymId: ANNEX,
  gymAnswer: ok(gym(ANNEX, "Annex Club", "front_desk")),
  workspaces: [workspace(ANNEX, "Annex Club", "front_desk")],
});
FrontDesk.name = "WG1 · front desk · limited access";

export const NotAvailable = consoleStory({
  gymId: DRAFT,
  gymAnswer: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("This gym isn’t available", {}, { timeout: 5000 }),
    ).toBeVisible();
  },
});
NotAvailable.name = "404 · foreign, unknown or revoked gym";

export const Restricted = consoleStory({ gymAnswer: apiError(403, "forbidden") });
Restricted.name = "403 · role-restricted (D-G24)";

export const Draft = consoleStory({
  gymAnswer: ok(gym(RING, "Ring One Boxing", "owner", "draft")),
});
Draft.name = "Draft gym · continue setup";

export const Loading = consoleStory({ gymAnswer: "pending" });
Loading.name = "Loading";

export const Offline = consoleStory({
  gymAnswer: "offline",
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", { name: /Try again/ }, { timeout: 5000 });
  },
});
Offline.name = "Offline (recoverable)";

export const Retry = consoleStory({
  gymAnswer: [apiError(503, "service_unavailable"), ok(gym(RING, "Ring One Boxing", "owner"))],
  play: async ({ canvasElement }) => {
    const retry = await within(canvasElement).findByRole(
      "button",
      { name: /Try again/ },
      { timeout: 5000 },
    );
    await userEvent.click(retry);
    await dashboard(canvasElement);
  },
});
Retry.name = "Backend failure · retry recovers";

export const DetailsFailed = consoleStory({ setupAnswer: apiError(503, "service_unavailable") });
DetailsFailed.name = "Partial failure · gym details";

export const SessionExpired = consoleStory({
  gymAnswer: apiError(401, "unauthorized"),
  refresh: apiError(401, "unauthorized"),
});
SessionExpired.name = "Session expired";

export const SwitcherOpen = consoleStory({
  play: async ({ canvasElement }) => {
    await dashboard(canvasElement);
    const menu = await openSwitcher(canvasElement, /Ring One Boxing, Owner/);
    await expect(
      within(menu).getByRole("menuitemradio", { name: /Ring One Boxing/ }),
    ).toHaveAttribute("aria-checked", "true");
  },
});
SwitcherOpen.name = "Switcher · several gyms";

export const Switching = consoleStory({
  choice: "pending",
  play: async ({ canvasElement }) => {
    await dashboard(canvasElement);
    const menu = await openSwitcher(canvasElement, /Ring One Boxing, Owner/);
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: /Annex Club/ }));
    await expect(await within(menu).findByRole("status", { name: "Opening…" })).toBeVisible();
  },
});
Switching.name = "Switcher · switching gym";

export const GermanOwner = {
  ...consoleStory({ gymAnswer: ok(gym(RING, LONG_NAME, "owner")) }),
  decorators: [
    (Story: () => ReactNode) => (
      <German>
        <Story />
      </German>
    ),
  ],
};
GermanOwner.name = "German · long copy";

/* ── WGC1 chooser ───────────────────────────────────────────────────── */

export const ChooserSeveral = chooserStory({
  workspaces: TWO,
  capabilities: ["FIGHTER", "GYM_WORKSPACE"],
});
ChooserSeveral.name = "Chooser · several gyms and a profile";

export const ChooserWithDraft = chooserStory({
  workspaces: [workspace(DRAFT, "Draft Hall", "owner", "draft"), ...TWO],
});
ChooserWithDraft.name = "Chooser · completed gyms and a draft";

export const ChooserNone = chooserStory({ workspaces: [], capabilities: [] });
ChooserNone.name = "Chooser · no gym";

export const ChooserMany = chooserStory({
  workspaces: Array.from({ length: 25 }, (_, i) =>
    workspace(
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      `Gym ${i + 1}`,
      "coach",
    ),
  ),
  count: 26,
  pages: [
    ok({
      gyms: [
        {
          id: "00000000-0000-4000-8000-000000000026",
          name: "Gym 26",
          gym_type: "boxing_gym",
          setup_status: "completed",
          inserted_at: "2026-10-27T10:00:00Z",
          updated_at: "2026-10-27T10:00:00Z",
          viewer: { role: "coach", staff_membership_id: ANNEX, permissions: [] },
        },
      ],
      next_cursor: null,
    }),
  ],
});
ChooserMany.name = "Chooser · more than the entry lists (paged)";
