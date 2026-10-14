import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EntryResponseEntry } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { ContextSelection } from "./context-selection";

/*
 * WCX1 Choose where to continue (SF-54) on the SF-51 entry, with the network
 * mocked at `fetch`.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  signOut: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => navigation,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const entry = (overrides: Partial<EntryResponseEntry>): EntryResponseEntry => ({
  destination: "context_selection",
  reason: "context_choice_required",
  mandatory: false,
  intent: null,
  context: null,
  account_registration: "complete",
  fighter_profile: "completed",
  coach_profile: "completed",
  capabilities: ["FIGHTER", "COACH"],
  ...overrides,
});
const E11 = entry({
  reason: "multiple_roles_in_progress",
  fighter_profile: "in_progress",
  coach_profile: "in_progress",
  capabilities: [],
});

function api(initial: EntryResponseEntry, afterChoice?: EntryResponseEntry) {
  let current = initial;
  const writes: unknown[] = [];
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname, search } = new URL(url);
      if (pathname === "/api/v1/me/entry") {
        reads.push(search);
        const intent = new URLSearchParams(search).get("intent");
        if (intent === "coach")
          return Promise.resolve(
            jsonResponse({ entry: { ...current, destination: "coach_onboarding", intent } }),
          );
        return Promise.resolve(jsonResponse({ entry: current }));
      }
      if (pathname === "/api/v1/me/entry/context") {
        writes.push(JSON.parse(String(init.body)));
        if (afterChoice) current = afterChoice;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (pathname === "/api/v1/me/coach-profile")
        return Promise.resolve(jsonResponse({ coach_profile: { display_name: "Alex Novak" } }));
      if (pathname === "/api/v1/me/fighter-profile")
        return Promise.resolve(jsonResponse({ fighter_profile: { display_name: "Alex N." } }));
      throw new Error(`unexpected ${pathname}`);
    }),
  );
  return { writes, reads };
}

beforeEach(() => {
  navigation.replace.mockClear();
  navigation.push.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("ContextSelection (WCX1)", () => {
  it("opens a completed context by recording the choice, then following the entry", async () => {
    const calls = api(entry({}), entry({ destination: "coach_home", context: "coach" }));
    await renderWithProviders(<ContextSelection />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Where do you want to go?" }),
    ).toBeVisible();
    expect(await screen.findByText("Alex Novak · Coach dashboard")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Coach.*Open/ }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/app/coach"));
    expect(calls.writes).toEqual([{ context: "coach" }]);
  });

  it("E11: continues an unfinished journey with its intent and records nothing", async () => {
    const calls = api(E11);
    await renderWithProviders(<ContextSelection />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Which setup do you want to continue?",
      }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Continue coach setup/ }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/app/onboarding/coach?intent=coach"),
    );
    expect(calls.writes).toEqual([]);
    expect(calls.reads.at(-1)).toBe("?intent=coach");
  });

  it("leaves for the entry's destination when it no longer answers context_selection", async () => {
    api(entry({ destination: "fighter_home", context: "fighter" }));
    await renderWithProviders(<ContextSelection />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app/home"));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});
