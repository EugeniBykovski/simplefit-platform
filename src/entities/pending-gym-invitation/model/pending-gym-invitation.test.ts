import { beforeEach, describe, expect, it } from "vitest";

import {
  isGymInvitationToken,
  pendingGymInvitation,
  resetPendingGymInvitationForTests,
} from "./pending-gym-invitation";

const KEY = "simplefit.gym-invitation";
const TOKEN = `sgm_${"a".repeat(43)}`;
const STAFF = `sfs_${"b".repeat(43)}`;

/** The one-time token's life in a tab (SF-134); the factory also runs under the coach and staff tests. */
describe("pendingGymInvitation (SF-134)", () => {
  beforeEach(() => {
    resetPendingGymInvitationForTests();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", `/en/invite/gym#token=${TOKEN}`);
  });

  it("accepts only the member token's shape", () => {
    expect(isGymInvitationToken(TOKEN)).toBe(true);
    expect(isGymInvitationToken(STAFF)).toBe(false);
    expect(isGymInvitationToken(`sgm_${"a".repeat(42)}`)).toBe(false);
  });

  it("takes the fragment off the URL into this tab only", () => {
    pendingGymInvitation.captureFromLocation();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(sessionStorage.getItem(KEY)).toContain(TOKEN);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).not.toContain(TOKEN);
  });

  it("another domain's token is not kept, and the fragment still goes", () => {
    window.history.replaceState(null, "", `/en/invite/gym#token=${STAFF}`);
    pendingGymInvitation.captureFromLocation();
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("binds to the first viewer, is dropped for another viewer and at a boundary", () => {
    pendingGymInvitation.captureFromLocation();
    pendingGymInvitation.crossBoundary();
    expect(sessionStorage.getItem(KEY)).toContain(TOKEN);
    pendingGymInvitation.settle("viewer-1");
    pendingGymInvitation.settle("viewer-2");
    expect(sessionStorage.getItem(KEY)).toBeNull();

    resetPendingGymInvitationForTests();
    window.history.replaceState(null, "", `/en/invite/gym#token=${TOKEN}`);
    pendingGymInvitation.captureFromLocation();
    pendingGymInvitation.settle("viewer-1");
    pendingGymInvitation.crossBoundary();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("expires after an hour in the tab", () => {
    pendingGymInvitation.captureFromLocation();
    const value = JSON.parse(sessionStorage.getItem(KEY)!) as Record<string, unknown>;
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...value, capturedAt: Date.now() - 61 * 60 * 1000 }),
    );
    pendingGymInvitation.settle(null);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
