import { expect, test, type Page } from "@playwright/test";

import { gymApi, type Gym, type GymApi, type StaffRow } from "./gym-api";
import { axeViolations, overflow } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * The gym's coaches and staff on the production build (SF-94, WG16):
 * `/app/gyms/:gymId/staff` against the test double of the SF-93 contract
 * (./gym-api in console mode over ./onboarding-api). Everything shown is the
 * double's answer for the gym in the path; every action is decided by it.
 */

const LOCATION = {
  id: "loc-1",
  name: "Gdańsk",
  country_code: "PL",
  city: "Gdańsk",
  address_line: "ul. Morska 5",
  entrance_note: null,
  is_primary: true,
};
const COMPLETED = { status: "completed" as const, location: LOCATION };

const row = (id: string, role: Gym["role"], name: string, email?: string): StaffRow => ({
  id,
  role,
  name,
  email,
  status: "active",
});
const VIEWER = "7a1b2c3d-0000-4000-8000-000000000002";
const team = (viewerRole: Gym["role"]): StaffRow[] => [
  ...(viewerRole === "owner"
    ? []
    : [row("6a000000-0000-4000-8000-0000000000a0", "owner", "Ewa P.")]),
  row(VIEWER, viewerRole, "Yauheni B."),
  ...(viewerRole === "manager"
    ? []
    : [row("6a000000-0000-4000-8000-0000000000a1", "manager", "Agnieszka L.")]),
  row("6a000000-0000-4000-8000-0000000000a2", "coach", "Tomasz Z.", "tomasz@example.com"),
  row("6a000000-0000-4000-8000-0000000000a3", "front_desk", "Michał S."),
];

async function start(page: Page, gyms: Partial<Gym>[]) {
  const session = await onboardingApi(page, { tour: "completed" });
  const api = await gymApi(page, { console: true, gyms });
  return { api, session };
}

const idOf = (api: GymApi, name: string) => {
  const gym = api.gyms().find((candidate) => candidate.name === name);
  if (!gym) throw new Error(`no gym ${name}`);
  return gym.id;
};

const roster = (page: Page) => page.getByRole("table", { name: "Active staff" });
const invitations = (page: Page) => page.locator("[data-staff-invitations]");
const writes = (api: GymApi) =>
  api.requests
    .filter((request) => request.method !== "GET" && request.path.includes("/staff"))
    .map((request) => `${request.method} ${request.path.replace(/^\/api\/v1\/gyms\/[^/]+/, "")}`);
const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

async function openStaff(page: Page, gyms: Partial<Gym>[], name = "Ring One Boxing") {
  const started = await start(page, gyms);
  const id = idOf(started.api, name);
  await page.goto(`/en/app/gyms/${id}/staff`);
  await expect(page.getByRole("heading", { level: 1, name: "Coaches & staff" })).toBeVisible();
  await expect(roster(page)).toBeVisible();
  return { ...started, id };
}

async function invite(page: Page, email: string, role: RegExp) {
  await page.getByRole("button", { name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("radio", { name: role }).check();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  return dialog;
}

test.describe("the owner", () => {
  test("opens the page from the sidebar: only the real owner, no invitations, nothing invented", async ({
    page,
  }) => {
    const { api, id } = await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await page.goto(`/en/app/gyms/${id}`);
    await page.getByRole("complementary").getByRole("link", { name: "Coaches & staff" }).click();
    await page.waitForURL(`**/en/app/gyms/${id}/staff`);
    await expect(roster(page).getByRole("row")).toHaveCount(2); // header + the owner
    await expect(roster(page)).toContainText("Yauheni B.");
    await expect(page.getByText("Only you so far.", { exact: false })).toBeVisible();
    await expect(invitations(page)).toContainText("No invitations yet.");
    await expect(page.locator("main")).not.toContainText(/on shift|last active|PLN|payout/i);
    expect(writes(api)).toEqual([]);
  });

  test("invites a manager: pending, masked; a duplicate creates no second row; resend and cancel", async ({
    page,
  }) => {
    const { api } = await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    let dialog = await invite(page, "natalia@example.com", /Manager/);
    await expect(dialog.getByRole("status")).toContainText(
      "An invitation to n•••@example.com as Manager is pending until",
    );
    await expect(dialog).not.toContainText(/delivered|was sent/i);
    await dialog.getByRole("button", { name: "Done" }).click();
    const item = invitations(page).locator("[data-staff-invitation]");
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute("data-staff-invitation-status", "pending");
    await expect(item).toContainText("n•••@example.com");
    await expect(invitations(page)).not.toContainText("natalia@example.com");

    dialog = await invite(page, "natalia@example.com", /Manager/);
    await expect(dialog.getByRole("status")).toContainText("is pending until");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(item).toHaveCount(1);

    // Resend: the new expiry is the server's.
    await page.getByRole("button", { name: "Resend the invitation to n•••@example.com" }).click();
    await expect(
      page.getByText(/A new invitation to n•••@example.com is pending until/),
    ).toBeVisible();
    await expect(page.getByText("Resend (2 left)")).toBeVisible();

    // Cancel asks first.
    await page.getByRole("button", { name: "Cancel the invitation to n•••@example.com" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Cancel this invitation?" });
    await confirm.getByRole("button", { name: "Keep it" }).click();
    await expect(item).toHaveAttribute("data-staff-invitation-status", "pending");
    await page.getByRole("button", { name: "Cancel the invitation to n•••@example.com" }).click();
    await confirm.getByRole("button", { name: "Cancel invitation" }).click();
    await expect(item).toHaveAttribute("data-staff-invitation-status", "cancelled");
    expect(writes(api)).toEqual([
      "POST /staff-invitations",
      "POST /staff-invitations",
      `POST /staff-invitations/${api.gyms()[0]?.invitations?.[0]?.id}/resend`,
      `POST /staff-invitations/${api.gyms()[0]?.invitations?.[0]?.id}/cancel`,
    ]);
  });

  test("an acceptance (through the backend) adds the member; the checklist completes from the backend", async ({
    page,
  }) => {
    const { api, id } = await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, firstRun: "not_started" },
    ]);
    const dialog = await invite(page, "kuba@example.com", /Coach/);
    await dialog.getByRole("button", { name: "Done" }).click();
    expect(api.acceptInvitation(id, "kuba@example.com", "Kuba N.")).toBeDefined();
    await refocus(page);
    await expect(roster(page)).toContainText("Kuba N.");
    await expect(invitations(page).locator("[data-staff-invitation-status=accepted]")).toHaveCount(
      1,
    );
    await page.goto(`/en/app/gyms/${id}`);
    await expect(page.locator("[data-checklist-key=invite_staff]")).toHaveAttribute(
      "data-checklist-status",
      "completed",
    );
  });

  test("changes a role, removes a member after confirming, and sees them under Ended", async ({
    page,
  }) => {
    const { api } = await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, staff: team("owner") },
    ]);
    await page.getByRole("button", { name: "Show Tomasz Z." }).click();
    await page.getByRole("button", { name: "Change role" }).click();
    const dialog = page.getByRole("dialog", { name: "Change Tomasz Z.’s role" });
    await dialog.getByRole("radio", { name: /Front desk/ }).check();
    await dialog.getByRole("button", { name: "Change role" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Tomasz Z. is now Front desk.")).toBeVisible();
    await expect(
      page.locator('[data-staff-member="6a000000-0000-4000-8000-0000000000a2"]'),
    ).toHaveAttribute("data-staff-role", "front_desk");

    await page.getByRole("button", { name: "Show Michał S." }).click();
    await page.getByRole("button", { name: "Remove from team" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "Remove Michał S. from Ring One Boxing?",
    });
    await expect(confirm).toContainText("not affected");
    await confirm.getByRole("button", { name: "Remove from team" }).click();
    await expect(roster(page)).not.toContainText("Michał S.");
    await page.getByRole("button", { name: "Ended" }).click();
    await expect(page.getByRole("table", { name: "Ended staff" })).toContainText("Michał S.");
    expect(writes(api)).toEqual([
      "PATCH /staff/6a000000-0000-4000-8000-0000000000a2",
      "DELETE /staff/6a000000-0000-4000-8000-0000000000a3",
    ]);
  });

  test("the owner's own row has no action: never removed, never leaves", async ({ page }) => {
    await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED, staff: team("owner") }]);
    await page.getByRole("button", { name: "Show Yauheni B." }).click();
    await expect(page.getByText(/The owner keeps full access/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Remove from team|Leave this gym|Change role/ }),
    ).toHaveCount(0);
  });
});

test.describe("other roles", () => {
  test("a manager switches coach ⇄ front desk only and never manages the owner or managers", async ({
    page,
  }) => {
    const { api } = await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, role: "manager", staff: team("manager") },
    ]);
    await page.getByRole("button", { name: "Show Ewa P." }).click();
    await expect(page.getByRole("button", { name: "Change role" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove from team" })).toHaveCount(0);

    await page.getByRole("button", { name: "Show Tomasz Z." }).click();
    await page.getByRole("button", { name: "Change role" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio")).toHaveCount(1);
    await expect(dialog.getByRole("radio", { name: /Front desk/ })).toBeVisible();
    await dialog.getByRole("radio", { name: /Front desk/ }).check();
    await dialog.getByRole("button", { name: "Change role" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Invite" }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByRole("radio")).toHaveCount(2);
    await expect(form.getByRole("radio", { name: /Manager|Owner/ })).toHaveCount(0);
    await form.getByRole("button", { name: "Cancel" }).click();
    expect(writes(api)).toEqual(["PATCH /staff/6a000000-0000-4000-8000-0000000000a2"]);
  });

  for (const role of ["coach", "front_desk"] as const) {
    test(`${role}: a read-only roster, no invitations, no administration`, async ({ page }) => {
      const { api } = await openStaff(page, [
        { name: "Ring One Boxing", ...COMPLETED, role, staff: team(role) },
      ]);
      await expect(roster(page)).toContainText("Agnieszka L.");
      await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Ended" })).toHaveCount(0);
      await expect(invitations(page)).toHaveCount(0);
      await page.getByRole("button", { name: "Show Agnieszka L." }).click();
      await expect(page.getByRole("button", { name: /Change role|Remove from team/ })).toHaveCount(
        0,
      );
      expect(api.requests.some((request) => request.path.endsWith("/staff-invitations"))).toBe(
        false,
      );
    });
  }

  test("a member who leaves loses the gym at once", async ({ page }) => {
    await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, role: "coach", staff: team("coach") },
    ]);
    await page.getByRole("button", { name: "Show Yauheni B." }).click();
    await page.getByRole("button", { name: "Leave this gym" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Leave Ring One Boxing?" });
    await confirm.getByRole("button", { name: "Leave gym" }).click();
    await expect(page.getByText("This gym isn’t available")).toBeVisible();
  });
});

test.describe("tenancy, sessions and races", () => {
  test("revoked while viewing: the console says the gym is not available, no staff data stays", async ({
    page,
  }) => {
    // A second gym keeps the console (GYM_WORKSPACE) after this one is gone.
    const { api, id } = await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, staff: team("owner") },
      { name: "Annex Club", ...COMPLETED, role: "coach" },
    ]);
    api.revoke(id);
    await refocus(page);
    await expect(page.getByText("This gym isn’t available")).toBeVisible();
    await expect(page.getByText("Tomasz Z.")).toHaveCount(0);
  });

  test("Gym A and Gym B: separate rosters; an open dialog does not follow a switch", async ({
    page,
  }) => {
    const { api } = await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, staff: team("owner") },
      {
        name: "Annex Club",
        ...COMPLETED,
        role: "manager",
        staff: [
          row("6a000000-0000-4000-8000-0000000000b0", "owner", "Ola Annex"),
          row(VIEWER, "manager", "Yauheni B."),
        ],
      },
    ]);
    await expect(roster(page)).toContainText("Tomasz Z.");
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goto(`/en/app/gyms/${idOf(api, "Annex Club")}/staff`);
    await expect(roster(page)).toContainText("Ola Annex");
    await expect(roster(page)).not.toContainText("Tomasz Z.");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Back: Gym A's own roster again, never B's.
    await page.goBack();
    await expect(roster(page)).toContainText("Tomasz Z.");
    await expect(roster(page)).not.toContainText("Ola Annex");
    await page.reload();
    await expect(roster(page)).toContainText("Tomasz Z.");
  });

  test("a permission lost while a dialog is open: the backend refuses and the page catches up", async ({
    page,
  }) => {
    const { api, id } = await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, role: "manager", staff: team("manager") },
    ]);
    await page.getByRole("button", { name: "Show Tomasz Z." }).click();
    await page.getByRole("button", { name: "Change role" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /Front desk/ }).check();
    api.changeViewerRole(id, "coach");
    await dialog.getByRole("button", { name: "Change role" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Your role doesn’t allow this any more.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change role" })).toHaveCount(0);
  });

  test("session expiry: the console asks for sign-in again", async ({ page }) => {
    const { api, session } = await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    session.expire();
    api.expire();
    await refocus(page);
    await page.waitForURL((url) => url.pathname === "/en/login");
  });

  test("signing out leaves no staff data behind", async ({ page }) => {
    const { id } = await openStaff(page, [
      { name: "Ring One Boxing", ...COMPLETED, staff: team("owner") },
    ]);
    await page.getByRole("complementary").getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/en/login");
    await expect(page.getByText("Tomasz Z.")).toHaveCount(0);
    await page.goto(`/en/app/gyms/${id}/staff`);
    await page.waitForURL((url) => url.pathname === "/en/login");
  });
});

test.describe("failures", () => {
  test("a dropped invitation claims nothing; a conflict and a limit are said", async ({ page }) => {
    const { api } = await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    api.failWrites(1);
    let dialog = await invite(page, "kuba@example.com", /Coach/);
    await expect(dialog.getByRole("alert")).toContainText("We couldn’t confirm whether it worked.");
    await expect(dialog.getByText(/is pending until/)).toHaveCount(0);

    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(dialog.getByRole("status")).toContainText("is pending until");
    await dialog.getByRole("button", { name: "Done" }).click();

    dialog = await invite(page, "kuba@example.com", /Manager/);
    await expect(dialog.getByRole("alert")).toContainText(
      "already has a pending invitation for another role",
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();

    api.limitInvites(1);
    dialog = await invite(page, "ola@example.com", /Coach/);
    await expect(dialog.getByRole("alert")).toContainText("Too many requests. Try again later.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(invitations(page).locator("[data-staff-invitation]")).toHaveCount(1);
  });

  test("inviting an active member is refused", async ({ page }) => {
    await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED, staff: team("owner") }]);
    const dialog = await invite(page, "tomasz@example.com", /Coach/);
    await expect(dialog.getByRole("alert")).toContainText("This person already works at this gym.");
  });
});

test.describe("geometry and accessibility", () => {
  for (const [width, height] of [
    [1920, 1080],
    [1728, 1117],
    [1512, 982],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [375, 812],
  ] as const) {
    test(`${width} × ${height}: no horizontal overflow, long names wrap`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openStaff(
        page,
        [
          {
            name: "Bokserski Klub Sportowy Wybrzeże Gdańsk Gdynia Sopot Akademia",
            ...COMPLETED,
            staff: [
              ...team("owner"),
              row(
                "6a000000-0000-4000-8000-0000000000a9",
                "coach",
                "Małgorzata-Aleksandra Konstantynopolitańczykiewicz",
              ),
            ],
          },
        ],
        "Bokserski Klub Sportowy Wybrzeże Gdańsk Gdynia Sopot Akademia",
      );
      expect(await overflow(page)).toBe(0);
      if (width >= 1024) {
        const roster = await page.locator("[data-staff-roster]").boundingBox();
        const person = await page.locator("[data-staff-person]").boundingBox();
        expect(roster && person && person.x > roster.x + roster.width - 1).toBe(true);
      }
    });
  }

  test("1440: the header, two columns and the WG16 order", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED, staff: team("owner") }]);
    const header = await page.locator("main header").first().boundingBox();
    const stats = await page.locator("[data-staff-stats]").boundingBox();
    const rosterBox = await page.locator("[data-staff-roster]").boundingBox();
    const person = await page.locator("[data-staff-person]").boundingBox();
    expect(header && Math.abs(header.height - 76)).toBeLessThanOrEqual(2);
    expect(stats && rosterBox && stats.y < rosterBox.y).toBe(true);
    // Columns 1.8fr : 1fr with a 16 px gap inside the 32 px gutters.
    expect(rosterBox && person && Math.abs(rosterBox.width / person.width - 1.8)).toBeLessThan(
      0.05,
    );
  });

  test("keyboard only: open, choose, cancel; focus returns to the trigger", async ({ page }) => {
    await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED, staff: team("owner") }]);
    const trigger = page.getByRole("button", { name: "Invite" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Email")).toBeFocused();
    await page.keyboard.type("kuba@example.com");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`axe: the page, the invite dialog and a confirmation in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openStaff(page, [{ name: "Ring One Boxing", ...COMPLETED, staff: team("owner") }]);
      await expect(invitations(page)).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "Invite" }).click();
      await page
        .getByRole("dialog")
        .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Show Michał S." }).click();
      await page.getByRole("button", { name: "Remove from team" }).click();
      await page
        .getByRole("alertdialog")
        .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
    });
  }
});
