import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isInvitationToken,
  pendingCoachInvitation,
  resetPendingCoachInvitationForTests,
} from "./pending-coach-invitation";

/*
 * The tab-scoped token of the E08 link (SF-60): read from the fragment once,
 * removed from the URL, bound to the first signed-in viewer and dropped at
 * any later session boundary, on expiry or on a final outcome.
 */

const TOKEN = `sfi_${"A".repeat(43)}`;
const KEY = "simplefit.coach-invitation";
const stored = () => window.sessionStorage.getItem(KEY);
const owner = () => (JSON.parse(stored() ?? "null") as { owner: string | null } | null)?.owner;

function open(hash: string) {
  window.history.replaceState(null, "", `/en/invite/coach${hash}`);
  pendingCoachInvitation.captureFromLocation();
}

beforeEach(() => resetPendingCoachInvitationForTests());
afterEach(() => vi.useRealTimers());

describe("pending coach invitation", () => {
  it("keeps a well-formed token from the fragment and removes the fragment from the URL", () => {
    open(`#token=${TOKEN}`);
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("sfi_");
    expect(stored()).toContain(TOKEN);
    expect(owner()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("never keeps a malformed or altered token, and still clears the fragment", () => {
    for (const value of ["sfi_short", `${TOKEN}x`, `xfi_${"A".repeat(43)}`, ""]) {
      resetPendingCoachInvitationForTests();
      open(`#token=${encodeURIComponent(value)}`);
      expect(stored()).toBeNull();
      expect(window.location.hash).toBe("");
    }
    expect(isInvitationToken(TOKEN)).toBe(true);
  });

  it("binds to the first signed-in viewer and drops it for anyone else", () => {
    open(`#token=${TOKEN}`);
    // A restore that finds no session crosses a boundary: an unbound token stays.
    pendingCoachInvitation.crossBoundary();
    pendingCoachInvitation.settle(null);
    expect(stored()).toContain(TOKEN);

    pendingCoachInvitation.settle("user-a");
    expect(owner()).toBe("user-a");
    pendingCoachInvitation.settle("user-b");
    expect(stored()).toBeNull();
  });

  it("drops a bound token at the next session boundary (sign-out, expiry, another account)", () => {
    open(`#token=${TOKEN}`);
    pendingCoachInvitation.settle("user-a");
    pendingCoachInvitation.crossBoundary();
    expect(stored()).toBeNull();
  });

  it("expires after an hour in the tab", () => {
    vi.useFakeTimers({ now: new Date("2026-10-16T10:00:00Z") });
    open(`#token=${TOKEN}`);
    vi.setSystemTime(new Date("2026-10-16T11:00:01Z"));
    pendingCoachInvitation.settle(null);
    expect(stored()).toBeNull();
  });
});
