import { beforeEach, describe, expect, it } from "vitest";

import {
  isStaffInvitationToken,
  pendingStaffInvitation,
  resetPendingStaffInvitationForTests,
} from "./pending-staff-invitation";

const KEY = "simplefit.staff-invitation";
const TOKEN = `sfs_${"a".repeat(43)}`;
const COACH = `sfi_${"b".repeat(43)}`;

/** The one-time token's life in a tab; the shared factory also runs under the coach tests. */
describe("pendingStaffInvitation (SF-133)", () => {
  beforeEach(() => {
    resetPendingStaffInvitationForTests();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", `/en/invite/staff#token=${TOKEN}`);
  });

  it("accepts only the staff token's shape", () => {
    expect(isStaffInvitationToken(TOKEN)).toBe(true);
    expect(isStaffInvitationToken(COACH)).toBe(false);
    expect(isStaffInvitationToken(`sfs_${"a".repeat(42)}`)).toBe(false);
    expect(isStaffInvitationToken(`${TOKEN}#x`)).toBe(false);
  });

  it("takes the fragment off the URL into this tab only", () => {
    pendingStaffInvitation.captureFromLocation();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(sessionStorage.getItem(KEY)).toContain(TOKEN);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).not.toContain(TOKEN);
  });

  it("a coach token in the fragment is not kept here, and the fragment still goes", () => {
    window.history.replaceState(null, "", `/en/invite/staff#token=${COACH}`);
    pendingStaffInvitation.captureFromLocation();
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("binds to the first viewer, is dropped for another viewer and at a boundary", () => {
    pendingStaffInvitation.captureFromLocation();
    // Signed out: a boundary keeps it, signing in is why it is here.
    pendingStaffInvitation.crossBoundary();
    expect(sessionStorage.getItem(KEY)).toContain(TOKEN);
    pendingStaffInvitation.settle("viewer-1");
    pendingStaffInvitation.settle("viewer-2");
    expect(sessionStorage.getItem(KEY)).toBeNull();

    resetPendingStaffInvitationForTests();
    window.history.replaceState(null, "", `/en/invite/staff#token=${TOKEN}`);
    pendingStaffInvitation.captureFromLocation();
    pendingStaffInvitation.settle("viewer-1");
    pendingStaffInvitation.crossBoundary();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("expires after an hour in the tab", () => {
    pendingStaffInvitation.captureFromLocation();
    const value = JSON.parse(sessionStorage.getItem(KEY)!) as Record<string, unknown>;
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...value, capturedAt: Date.now() - 61 * 60 * 1000 }),
    );
    pendingStaffInvitation.settle(null);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
