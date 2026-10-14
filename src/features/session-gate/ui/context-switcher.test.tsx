import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/entities/session";
import type { EntryResponseEntry } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { ContextSwitcher } from "./context-switcher";
import { CoachGate, FighterGate } from "./workspace-gate";

/*
 * The Fighter / Coach context switcher (SF-54) inside a real workspace gate,
 * with the network mocked at `fetch`: what it offers comes from the entry,
 * a completed context is recorded with the backend before navigating, and
 * an unfinished journey is entered with its intent only.
 */

const VIEWER = { id: "8a6e0804-2bd0-4672-b79d-d97027f9071b", created_at: "2026-10-01T10:00:00Z" };
const session = vi.hoisted(() => ({ current: { status: "loading" } as Session }));
vi.mock("@/entities/session", () => ({
  useSession: () => session.current,
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), pathname: "/app/coach" }));
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const entry = (overrides: Partial<EntryResponseEntry>): EntryResponseEntry => ({
  destination: "coach_home",
  reason: "last_context",
  mandatory: false,
  intent: null,
  context: "coach",
  account_registration: "complete",
  fighter_profile: "not_started",
  coach_profile: "completed",
  capabilities: ["COACH"],
  ...overrides,
});
const BOTH = entry({ fighter_profile: "completed", capabilities: ["FIGHTER", "COACH"] });
const profile = (display_name: string) => ({ display_name });

type Answer = { status?: number; body?: unknown } | Error;

/**
 * A fake API: the entry (by intent), the profiles, and the context choice,
 * which answers `choice` (204 by default) and then makes the entry return
 * `afterChoice`.
 */
function api({
  initial,
  afterChoice,
  choice = [{ status: 204 }],
}: {
  initial: EntryResponseEntry;
  afterChoice?: EntryResponseEntry;
  choice?: Answer[];
}) {
  let current = initial;
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    const { pathname, search } = new URL(url);
    const method = init.method ?? "GET";
    calls.push({
      method,
      path: pathname + search,
      body: init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
    });
    if (pathname === "/api/v1/me/entry") {
      const intent = new URLSearchParams(search).get("intent");
      const answer =
        intent === "fighter"
          ? { ...current, destination: "fighter_onboarding" as const, intent }
          : current;
      return Promise.resolve(jsonResponse({ entry: answer }));
    }
    if (pathname === "/api/v1/me/entry/context") {
      const answer = choice.shift() ?? { status: 204 };
      if (answer instanceof Error) return Promise.reject(answer);
      if (answer.status === 204 && afterChoice) current = afterChoice;
      return Promise.resolve(new Response(null, { status: answer.status ?? 204 }));
    }
    if (pathname === "/api/v1/me/coach-profile")
      return Promise.resolve(jsonResponse({ coach_profile: profile("Alex Novak") }));
    if (pathname === "/api/v1/me/fighter-profile")
      return Promise.resolve(jsonResponse({ fighter_profile: profile("Alex N.") }));
    throw new Error(`unexpected ${method} ${pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    writes: () => calls.filter((call) => call.method !== "GET"),
    entryReads: () =>
      calls.filter((call) => call.path.startsWith("/api/v1/me/entry") && call.method === "GET"),
  };
}

const user = userEvent.setup();

async function renderCoach() {
  await renderWithProviders(
    <CoachGate pending={<p>pending</p>} failure={<p>failure</p>}>
      <ContextSwitcher context="coach" />
    </CoachGate>,
  );
  const trigger = await screen.findByRole("button", { name: /Alex Novak, Coach\. Switch profile/ });
  await user.click(trigger);
  return screen.findByRole("menu");
}

beforeEach(() => {
  session.current = { status: "authenticated", viewer: VIEWER };
  navigation.push.mockClear();
  navigation.replace.mockClear();
  navigation.pathname = "/app/coach";
});
afterEach(() => vi.unstubAllGlobals());

describe("ContextSwitcher (SF-54)", () => {
  it("lists both completed contexts with the current one checked, and nothing to set up", async () => {
    api({ initial: BOTH });
    const menu = await renderCoach();
    expect(within(menu).getByRole("menuitemradio", { name: /Coach/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(menu).getByRole("menuitemradio", { name: /Fighter/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(within(menu).queryByText(/Set up|Continue/)).toBeNull();
  });

  it("records the Fighter context with the backend, then follows the entry to Fighter home", async () => {
    const calls = api({
      initial: BOTH,
      afterChoice: { ...BOTH, destination: "fighter_home", context: "fighter" },
    });
    const menu = await renderCoach();
    await user.click(within(menu).getByRole("menuitemradio", { name: /Fighter/ }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/app/home"));
    expect(calls.writes()).toEqual([
      { method: "PUT", path: "/api/v1/me/entry/context", body: { context: "fighter" } },
    ]);
  });

  it("does nothing when the current context is chosen", async () => {
    const calls = api({ initial: BOTH });
    const menu = await renderCoach();
    await user.click(within(menu).getByRole("menuitemradio", { name: /Coach/ }));
    expect(calls.writes()).toEqual([]);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("keeps the user here with a retry when the choice fails, and never navigates", async () => {
    const calls = api({
      initial: BOTH,
      afterChoice: { ...BOTH, destination: "fighter_home", context: "fighter" },
      choice: [new TypeError("offline"), { status: 204 }],
    });
    const menu = await renderCoach();
    await user.click(within(menu).getByRole("menuitemradio", { name: /Fighter/ }));
    expect(await within(menu).findByRole("alert")).toHaveTextContent("We couldn’t switch.");
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(within(menu).getByRole("menuitemradio", { name: /Fighter/ }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/app/home"));
    expect(calls.writes()).toHaveLength(2);
  });

  it("continues an unfinished Fighter journey with its intent, recording nothing", async () => {
    const calls = api({ initial: entry({ fighter_profile: "in_progress" }) });
    const menu = await renderCoach();
    expect(within(menu).queryByRole("menuitemradio", { name: /^Fighter/ })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: /Continue fighter setup/ }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith(
        "/app/onboarding/fighter?intent=fighter",
      ),
    );
    expect(calls.writes()).toEqual([]);
    expect(calls.entryReads().at(-1)?.path).toBe("/api/v1/me/entry?intent=fighter");
  });

  it("offers to set up a fighter profile for a Coach who never started one", async () => {
    api({ initial: entry({}) });
    const menu = await renderCoach();
    expect(within(menu).getByRole("menuitem", { name: /Set up a fighter profile/ })).toBeVisible();
  });

  it("is the same switcher in the Fighter shell, with Fighter current", async () => {
    navigation.pathname = "/app/home";
    api({ initial: { ...BOTH, destination: "fighter_home", context: "fighter" } });
    await renderWithProviders(
      <FighterGate pending={<p>pending</p>} failure={<p>failure</p>}>
        <ContextSwitcher context="fighter" />
      </FighterGate>,
    );
    await user.click(await screen.findByRole("button", { name: /Alex N\., Fighter/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitemradio", { name: /Fighter/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
