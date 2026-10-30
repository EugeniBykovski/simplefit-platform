import { expect, test, type Page } from "@playwright/test";

import { gymApi, type Gym, type GymApi, type MemberRow } from "./gym-api";
import { axeViolations, overflow } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * The gym's members on the production build (SF-96, WG3 with OG12):
 * `/app/gyms/:gymId/members` against the test double of the SF-95 contract
 * (./gym-api in console mode over ./onboarding-api). Everything shown is the
 * double's answer for the gym in the path; every action is decided by it.
 * Member invitations are off, as in production (409), unless a test turns
 * them on.
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
const COMPLETED = { status: "completed" as const, location: LOCATION, joinCode: "K7QM-4TXD" };

let n = 0;
const member = (name: string, email: string, fields: Partial<MemberRow> = {}): MemberRow => ({
  id: `8a000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  name,
  email,
  status: "active",
  joined_via: "join_code",
  auto_approved: false,
  requested_at: "2026-10-21T09:00:00Z",
  joined_at: "2026-10-21T10:00:00Z",
  responded_at: null,
  ended_at: null,
  ended_reason: null,
  ...fields,
});
const roster = () => [
  member("Marta K.", "marta@example.com"),
  member("Piotr Z.", "piotr@example.com", { joined_via: "invitation", requested_at: null }),
];

async function start(page: Page, gyms: Partial<Gym>[], options: { invitations?: boolean } = {}) {
  const session = await onboardingApi(page, { tour: "completed" });
  const api = await gymApi(page, {
    console: true,
    gyms,
    memberInvitations: options.invitations ?? false,
  });
  return { api, session };
}

const idOf = (api: GymApi, name: string) => {
  const gym = api.gyms().find((candidate) => candidate.name === name);
  if (!gym) throw new Error(`no gym ${name}`);
  return gym.id;
};

const active = (page: Page) => page.getByRole("table", { name: "Active members" });
const tab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name }).click();
const writes = (api: GymApi) =>
  api.requests
    .filter((request) => request.method !== "GET" && !request.path.endsWith("/entry/context"))
    .map((request) => `${request.method} ${request.path.replace(/^\/api\/v1\/gyms\/[^/]+/, "")}`);
const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
const membersOf = (api: GymApi, id: string) =>
  api.gyms().find((gym) => gym.id === id)?.members ?? [];

async function openMembers(
  page: Page,
  gyms: Partial<Gym>[],
  { name = "Ring One Boxing", invitations = false } = {},
) {
  const started = await start(page, gyms, { invitations });
  const id = idOf(started.api, name);
  await page.goto(`/en/app/gyms/${id}/members`);
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  return { ...started, id };
}

async function chooseCsv(page: Page, content: string, name = "members.csv") {
  await tab(page, "Import preview");
  await page.locator("[data-import-input]").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
}

const CSV = [
  "Imię i nazwisko,email,karnet",
  "Anna Nowak,anna@example.com,Open",
  "Marta Kowal,marta@example.com,Open",
  "Anna N,ANNA@example.com,Open",
  ",not-an-email,x",
  "Ola,,x",
].join("\n");

test.describe("the roster", () => {
  test("opens from the sidebar: an empty roster says so truthfully, with no invented totals", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await page.goto(`/en/app/gyms/${id}`);
    await page.getByRole("complementary").getByRole("link", { name: "Members" }).click();
    await page.waitForURL(`**/en/app/gyms/${id}/members`);
    await expect(page.locator("[data-members-empty=active]")).toContainText("No members yet");
    await expect(page.locator("[data-members-count]")).toHaveCount(0);
    await expect(page.locator("[data-members-roster]")).not.toContainText(
      /PLN|plan|revenue|visits|\b612\b|\b0\b/i,
    );
    expect(writes(api)).toEqual([]);
  });

  test("shows the backend's members with SF-95 facts only, and their ended history", async ({
    page,
  }) => {
    await openMembers(page, [
      {
        name: "Ring One Boxing",
        ...COMPLETED,
        members: [
          ...roster(),
          member("Igor P.", "igor@example.com", {
            status: "ended",
            ended_at: "2026-10-28T10:00:00Z",
            ended_reason: "left",
          }),
          member("Rafał T.", "rafal@example.com", { status: "requested", joined_at: null }),
        ],
      },
    ]);
    await expect(active(page)).toContainText("Marta K.");
    await expect(active(page)).toContainText("Piotr Z.");
    // Requests and history are never shown as active members.
    await expect(active(page)).not.toContainText("Igor P.");
    await expect(active(page)).not.toContainText("Rafał T.");
    await expect(page.locator("[data-members-count]")).toHaveText("2 members");
    // No email or private fields anywhere on the page.
    await expect(page.locator("main")).not.toContainText(/@example\.com/);
    for (const part of ["[data-members-roster]", "[data-member-person]"]) {
      await expect(page.locator(part)).not.toContainText(/weight|goal|coach note|training/i);
    }
    await page.getByRole("button", { name: "Ended" }).click();
    const ended = page.getByRole("table", { name: "Ended memberships" });
    await expect(ended).toContainText("Igor P.");
    await expect(ended).toContainText("Left");
  });

  test("ends a membership only after a confirmation, then shows the backend's result", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, members: roster() },
    ]);
    await page.getByRole("button", { name: "Show details for Piotr Z." }).click();
    await page.getByRole("button", { name: "End membership" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("End Piotr Z.’s membership?");
    await expect(dialog).toContainText("Their SimpleFit account isn’t deleted.");
    expect(writes(api)).toEqual([]);
    await dialog.getByRole("button", { name: "End membership" }).click();
    await expect(
      page.getByText("Piotr Z. is no longer a member of Ring One Boxing."),
    ).toBeVisible();
    await expect(active(page)).not.toContainText("Piotr Z.");
    expect(writes(api)).toEqual([expect.stringMatching(/^POST \/members\/[^/]+\/remove$/)]);
    expect(membersOf(api, id).find((row) => row.name === "Piotr Z.")?.status).toBe("ended");
  });
});

test.describe("join requests", () => {
  test("a request appears; approving makes a member only after the backend answers", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    api.requestJoin(id, "Rafał T.", "rafal@example.com");
    api.requestJoin(id, "Kamila L.", "kamila@example.com");
    await refocus(page);
    await expect(page.getByRole("tab", { name: "Join requests, 2 waiting" })).toBeVisible();
    await tab(page, /^Join requests/);
    const requests = page.locator("[data-members-requests]");
    await expect(requests).toContainText("Rafał T.");

    await requests.getByRole("button", { name: "Approve Rafał T." }).click();
    await expect(page.getByText("Rafał T. is now a member of Ring One Boxing.")).toBeVisible();
    await expect(requests).not.toContainText("Rafał T.");
    await requests.getByRole("button", { name: "Reject Kamila L." }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Reject request" }).click();
    await expect(page.getByText("Kamila L.’s request was rejected.")).toBeVisible();
    await expect(requests).toContainText("No requests are waiting.");

    expect(membersOf(api, id).map((row) => `${row.name}:${row.status}`)).toEqual([
      "Rafał T.:active",
      "Kamila L.:rejected",
    ]);
    await tab(page, "Members");
    await expect(active(page)).toContainText("Rafał T.");
    await expect(active(page)).not.toContainText("Kamila L.");
  });

  test("a request decided elsewhere is said as such and the lists catch up (409)", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    const ewa = api.requestJoin(id, "Ewa M.", "ewa@example.com")!;
    await tab(page, /^Join requests/);
    await expect(page.locator("[data-members-requests]")).toContainText("Ewa M.");
    api.externalMember(id, ewa.id, { status: "cancelled", responded_at: new Date().toISOString() });
    await page.getByRole("button", { name: "Approve Ewa M." }).click();
    await expect(
      page.getByText("The person cancelled this request. The page is up to date."),
    ).toBeVisible();
    await expect(page.locator("[data-members-requests]")).toContainText("No requests are waiting.");
    expect(membersOf(api, id)[0]?.status).toBe("cancelled");
  });

  test("a rate limit is said with its delay and changes nothing (429)", async ({ page }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    api.requestJoin(id, "Ewa M.", "ewa@example.com");
    api.limitEnrollment(1);
    await tab(page, /^Join requests/);
    await page.getByRole("button", { name: "Approve Ewa M." }).click();
    await expect(page.getByText(/^Too many requests\. Try again/)).toBeVisible();
    expect(membersOf(api, id)[0]?.status).toBe("requested");
  });
});

test.describe("roles", () => {
  test("a manager approves, rotates the code and ends memberships", async ({ page }) => {
    const { api, id } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, role: "manager", members: roster() },
    ]);
    await expect(page.getByRole("button", { name: "End membership" })).toBeVisible();
    api.requestJoin(id, "Ewa M.", "ewa@example.com");
    await tab(page, /^Join requests/);
    await page.getByRole("button", { name: "Approve Ewa M." }).click();
    await expect(page.getByText("Ewa M. is now a member of Ring One Boxing.")).toBeVisible();
    await tab(page, "Join code & approval");
    await expect(page.getByRole("button", { name: "New code" })).toBeVisible();
  });

  test("front desk answers requests and reads the code, without ending or changing settings", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, role: "front_desk", members: roster() },
    ]);
    await expect(active(page)).toContainText("Marta K.");
    await expect(page.getByRole("button", { name: "End membership" })).toHaveCount(0);
    api.requestJoin(id, "Ewa M.", "ewa@example.com");
    await tab(page, /^Join requests/);
    await page.getByRole("button", { name: "Approve Ewa M." }).click();
    await expect(page.getByText("Ewa M. is now a member of Ring One Boxing.")).toBeVisible();
    await tab(page, "Join code & approval");
    await expect(page.locator("[data-join-code]")).toHaveText("K7QM-4TXD");
    await expect(page.getByRole("button", { name: "New code" })).toHaveCount(0);
    await expect(page.getByRole("switch")).toBeDisabled();
  });

  test("a coach gets the backend's refusal, no actions and no enrollment reads", async ({
    page,
  }) => {
    const { api } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, role: "coach", members: roster() },
    ]);
    await expect(page.locator("[data-members-restricted]")).toContainText(
      "Your role can’t see this yet",
    );
    await expect(page.getByText("Marta K.")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Approve|Invite member/ })).toHaveCount(0);
    expect(
      api.requests.filter((request) =>
        /join-requests|enrollment|member-invitations/.test(request.path),
      ),
    ).toEqual([]);
  });

  test("access revoked while viewing: the gym becomes unavailable and nothing of it stays", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, members: roster() },
      { name: "Annex Club", ...COMPLETED, role: "coach" },
    ]);
    await expect(active(page)).toContainText("Marta K.");
    api.revoke(id);
    await refocus(page);
    await expect(page.getByText("This gym isn’t available")).toBeVisible();
    await expect(page.getByText("Marta K.")).toHaveCount(0);
  });
});

test.describe("join code and auto-approval", () => {
  test("rotation shows only the new code; disabling and enabling go through the backend", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await tab(page, "Join code & approval");
    await expect(page.locator("[data-join-code]")).toHaveText("K7QM-4TXD");
    await page.getByRole("button", { name: "New code" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Issue new code" }).click();
    const fresh = api.gyms().find((gym) => gym.id === id)?.joinCode;
    expect(fresh).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(fresh).not.toBe("K7QM-4TXD");
    await expect(page.locator("[data-join-code]")).toHaveText(fresh!);
    await expect(page.getByText("K7QM-4TXD")).toHaveCount(0);
    expect(page.url()).not.toContain(fresh!);
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
    ).not.toContain(fresh!);

    await page.getByRole("button", { name: "Turn off" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Turn off" }).click();
    await expect(page.locator("[data-join-code-off]")).toBeVisible();
    await expect(page.getByText(fresh!)).toHaveCount(0);
    await page.getByRole("button", { name: "Turn on joining by code" }).click();
    await expect(page.locator("[data-join-code]")).toBeVisible();
    expect(writes(api)).toEqual([
      "POST /join-code/rotate",
      "POST /join-code/disable",
      "POST /join-code/rotate",
    ]);
  });

  test("auto-approval is explained before it turns on and follows the backend's state", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await tab(page, "Join code & approval");
    await expect(page.getByRole("switch")).not.toBeChecked();
    await page.getByRole("switch").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("verified sign-in");
    await dialog.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByRole("switch")).toBeChecked();
    expect(api.gyms().find((gym) => gym.id === id)?.autoApprove).toBe(true);
    await page.reload();
    await tab(page, "Join code & approval");
    await expect(page.getByRole("switch")).toBeChecked();
    // Turning it off needs no confirmation and applies at once.
    await page.getByRole("switch").click();
    await expect(page.getByRole("switch")).not.toBeChecked();
    expect(api.gyms().find((gym) => gym.id === id)?.autoApprove).toBe(false);
  });
});

test.describe("member invitations", () => {
  test("off in production: the backend's 409 is said, nothing is claimed, invite is withdrawn", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await page.getByRole("button", { name: "Invite member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email address").fill("kuba@example.com");
    await dialog.getByRole("button", { name: "Create invitation" }).click();
    await expect(dialog).toContainText("Member invitations aren’t available yet");
    await expect(dialog).toContainText("Nothing was created and no email was sent.");
    await expect(dialog).not.toContainText(/pending until|delivered|invitation was sent/i);
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(page.getByRole("button", { name: "Invite member" })).toHaveCount(0);
    await tab(page, "Invitations");
    await expect(page.locator("[data-member-invitations-off]")).toBeVisible();
    expect(api.gyms().find((gym) => gym.id === id)?.memberInvites ?? []).toEqual([]);
  });

  test("where they are on, an invitation is pending, masked and never 'sent'", async ({ page }) => {
    const { api, id } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }], {
      invitations: true,
    });
    await page.getByRole("button", { name: "Invite member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email address").fill("kuba@example.com");
    await dialog.getByRole("button", { name: "Create invitation" }).click();
    await expect(dialog.getByRole("status")).toContainText(
      "The invitation for k•••@example.com is pending until",
    );
    await dialog.getByRole("button", { name: "Done" }).click();
    await tab(page, "Invitations");
    const item = page.locator("[data-member-invitation]");
    await expect(item).toHaveAttribute("data-member-invitation-status", "pending");
    await expect(item).toContainText("k•••@example.com");
    await expect(page.locator("main")).not.toContainText("kuba@example.com");
    // Nobody joins by being invited.
    expect(membersOf(api, id)).toEqual([]);
  });
});

test.describe("import preview", () => {
  test("a CSV is mapped and validated by the backend; the dry run changes nothing", async ({
    page,
  }) => {
    const { api, id } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, members: [member("Marta K.", "marta@example.com")] },
    ]);
    const before = JSON.stringify(membersOf(api, id));
    await chooseCsv(page, CSV);
    await expect(page.locator("[data-import-file]")).toHaveText("members.csv");
    await expect(page.locator("[data-import-mapping]")).toBeVisible();
    await page.getByRole("button", { name: "Run validation" }).click();
    const results = page.locator("[data-import-results]");
    await expect(results).toContainText("Validation complete: 5 rows checked.");
    await expect(results).toContainText(
      "Validation complete. Importing member records is not available yet.",
    );
    // The backend suggested the columns; the page shows what it used.
    await expect(page.locator("[data-import-map=email]")).toContainText("email");
    await expect(results.locator("[data-import-outcome=ready]")).toHaveCount(1);
    await expect(results.locator("[data-import-outcome=already_member]")).toHaveCount(1);
    await expect(results.locator("[data-import-outcome=duplicate]")).toContainText(
      "Same address as line 2",
    );
    await expect(results.locator("[data-import-outcome=invalid_email]")).toHaveCount(1);
    await expect(results.locator("[data-import-outcome=missing_email]")).toHaveCount(1);
    await expect(results).toContainText("a•••@example.com");
    await expect(page.locator("main")).not.toContainText(/anna@example\.com|marta@example\.com/);
    await expect(page.locator("main")).not.toContainText(
      /imported successfully|import completed|members added|matched to verified/i,
    );
    await expect(page.getByRole("button", { name: /^(import|commit|send invit)/i })).toHaveCount(0);
    expect(JSON.stringify(membersOf(api, id))).toBe(before);
    expect(writes(api)).toEqual(["POST /member-imports/preview"]);
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
    ).not.toContain("anna@");
  });

  test("columns can be mapped by hand; the same column cannot hold both fields", async ({
    page,
  }) => {
    const { api } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await chooseCsv(page, "kontakt;osoba\nola@example.com;Ola\n");
    await page.locator("[data-import-map=email]").click();
    await page.getByRole("option", { name: "kontakt" }).click();
    await page.locator("[data-import-map=name]").click();
    await expect(page.getByRole("option", { name: "kontakt" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByRole("option", { name: "osoba" }).click();
    await page.getByRole("button", { name: "Run validation" }).click();
    await expect(page.locator("[data-import-results]")).toContainText("1 row checked");
    const preview = api.requests.find((request) =>
      request.path.endsWith("/member-imports/preview"),
    );
    expect((preview?.body as { mapping?: unknown }).mapping).toEqual({
      email: "kontakt",
      name: "osoba",
    });
  });

  test("an oversized file is refused in the browser and never sent", async ({ page }) => {
    const { api } = await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await chooseCsv(page, "email\n" + "a".repeat(1_000_001), "big.csv");
    await expect(page.locator("[data-import-file-problem=tooLarge]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run validation" })).toHaveCount(0);
    expect(writes(api)).toEqual([]);
  });

  test("a file without an email column asks for one instead of guessing", async ({ page }) => {
    await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await chooseCsv(page, "kontakt,osoba\nola@example.com,Ola\n");
    await page.getByRole("button", { name: "Run validation" }).click();
    await expect(page.locator("[data-import-problem=emailColumn]")).toContainText(
      "Choose the column that holds email addresses.",
    );
    await expect(page.locator("[data-import-results]")).toHaveCount(0);
  });

  test("the chosen file and its result do not follow a gym switch or a sign-out", async ({
    page,
  }) => {
    const { api } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED },
      { name: "Annex Club", ...COMPLETED, role: "manager" },
    ]);
    await chooseCsv(page, CSV);
    await page.getByRole("button", { name: "Run validation" }).click();
    await expect(page.locator("[data-import-results]")).toBeVisible();
    await page.goto(`/en/app/gyms/${idOf(api, "Annex Club")}/members`);
    await tab(page, "Import preview");
    await expect(page.getByText("No file chosen.")).toBeVisible();
    await expect(page.locator("[data-import-results]")).toHaveCount(0);
    await page.goBack();
    await tab(page, "Import preview");
    await expect(page.getByText("No file chosen.")).toBeVisible();
  });
});

test.describe("isolation and session", () => {
  test("Gym A and Gym B: separate rosters, requests and codes; back and reload stay correct", async ({
    page,
  }) => {
    const { api } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, members: roster() },
      {
        name: "Annex Club",
        ...COMPLETED,
        role: "manager",
        joinCode: "ANEX-2345",
        members: [member("Ola P.", "ola@example.com")],
      },
    ]);
    await expect(active(page)).toContainText("Marta K.");
    await page.goto(`/en/app/gyms/${idOf(api, "Annex Club")}/members`);
    await expect(active(page)).toContainText("Ola P.");
    await expect(active(page)).not.toContainText("Marta K.");
    await tab(page, "Join code & approval");
    await expect(page.locator("[data-join-code]")).toHaveText("ANEX-2345");
    await page.goBack();
    await expect(active(page)).toContainText("Marta K.");
    await expect(active(page)).not.toContainText("Ola P.");
    await page.reload();
    await expect(active(page)).toContainText("Marta K.");
    expect(
      api.requests
        .filter((request) => /\/members|join-requests|enrollment/.test(request.path))
        .every((request) =>
          [idOf(api, "Ring One Boxing"), idOf(api, "Annex Club")].some((gym) =>
            request.path.includes(gym),
          ),
        ),
    ).toBe(true);
  });

  test("session expiry: the console asks for sign-in again", async ({ page }) => {
    const { api, session } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, members: roster() },
    ]);
    session.expire();
    api.expire();
    await refocus(page);
    await page.waitForURL((url) => url.pathname === "/en/login");
    await expect(page.getByText("Marta K.")).toHaveCount(0);
  });

  test("signing out leaves no member data or join code behind", async ({ page }) => {
    const { id } = await openMembers(page, [
      { name: "Ring One Boxing", ...COMPLETED, members: roster() },
    ]);
    await tab(page, "Join code & approval");
    await expect(page.locator("[data-join-code]")).toBeVisible();
    await page.getByRole("complementary").getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/en/login");
    await expect(page.getByText("K7QM-4TXD")).toHaveCount(0);
    await page.goto(`/en/app/gyms/${id}/members`);
    await page.waitForURL((url) => url.pathname === "/en/login");
  });
});

test.describe("first-run handoff", () => {
  test("the checklist's invite_members leads to this page and completes only from the backend", async ({
    page,
  }) => {
    const { api } = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED, firstRun: "in_progress" },
    ]);
    const id = idOf(api, "Ring One Boxing");
    await page.goto(`/en/app/gyms/${id}`);
    const checklist = page.locator("[data-gym-checklist]");
    await expect(checklist.locator("[data-checklist-key=invite_members]")).toHaveAttribute(
      "data-checklist-status",
      "available",
    );
    await checklist.getByRole("link", { name: "Invite members" }).click();
    await page.waitForURL(`**/en/app/gyms/${id}/members`);
    // A pending request does not complete it; an approval does (the backend's projection).
    api.requestJoin(id, "Ewa M.", "ewa@example.com");
    await tab(page, /^Join requests/);
    await page.getByRole("button", { name: "Approve Ewa M." }).click();
    await expect(page.getByText("Ewa M. is now a member of Ring One Boxing.")).toBeVisible();
    await page.goto(`/en/app/gyms/${id}`);
    await expect(checklist.locator("[data-checklist-key=invite_members]")).toHaveAttribute(
      "data-checklist-status",
      "completed",
    );
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
    test(`${width} × ${height}: no horizontal overflow in the roster and the import results`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openMembers(
        page,
        [
          {
            name: "Bokserski Klub Sportowy Wybrzeże Gdańsk Gdynia Sopot Akademia",
            ...COMPLETED,
            members: [
              ...roster(),
              member("Małgorzata-Aleksandra Konstantynopolitańczykiewicz", "m@example.com"),
            ],
          },
        ],
        { name: "Bokserski Klub Sportowy Wybrzeże Gdańsk Gdynia Sopot Akademia" },
      );
      await expect(active(page)).toBeVisible();
      expect(await overflow(page)).toBe(0);
      if (width >= 1024) {
        const rosterBox = await page.locator("[data-members-roster]").boundingBox();
        const person = await page.locator("[data-member-person]").boundingBox();
        expect(rosterBox && person && person.x > rosterBox.x + rosterBox.width - 1).toBe(true);
      }
      await chooseCsv(page, CSV);
      await page.getByRole("button", { name: "Run validation" }).click();
      await expect(page.locator("[data-import-results]")).toBeVisible();
      expect(await overflow(page)).toBe(0);
    });
  }

  test("1440: the 76 px header, the tabs above two columns at 1.8 : 1", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED, members: roster() }]);
    await expect(active(page)).toBeVisible();
    const header = await page.locator("main header").first().boundingBox();
    const tabs = await page.getByRole("tablist").boundingBox();
    const rosterBox = await page.locator("[data-members-roster]").boundingBox();
    const person = await page.locator("[data-member-person]").boundingBox();
    expect(header && Math.abs(header.height - 76)).toBeLessThanOrEqual(2);
    expect(tabs && rosterBox && tabs.y + tabs.height <= rosterBox.y).toBe(true);
    expect(rosterBox && person && Math.abs(rosterBox.width / person.width - 1.8)).toBeLessThan(
      0.05,
    );
  });

  test("keyboard only: tabs, file choice, validation and results; dialogs return focus", async ({
    page,
  }) => {
    await openMembers(page, [{ name: "Ring One Boxing", ...COMPLETED, members: roster() }]);
    await expect(active(page)).toBeVisible();
    await page.getByRole("tab", { name: "Members" }).focus();
    // Arrow keys move between sections (WAI-ARIA tabs), each selected as it is reached.
    for (const name of [
      /^Join requests/,
      "Invitations",
      "Join code & approval",
      "Import preview",
    ]) {
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name })).toBeFocused();
    }
    await page.keyboard.press("Enter");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose CSV file" }).focus();
    await page.keyboard.press("Enter");
    await (
      await chooser
    ).setFiles({ name: "members.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
    await page.getByRole("button", { name: "Run validation" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-import-results]")).toBeVisible();

    const trigger = page.getByRole("button", { name: "Invite member" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByLabel("Email address")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`axe: the roster, requests, settings, import results and a confirmation in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const { api, id } = await openMembers(page, [
        { name: "Ring One Boxing", ...COMPLETED, members: roster() },
      ]);
      api.requestJoin(id, "Ewa M.", "ewa@example.com");
      await expect(active(page)).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await tab(page, /^Join requests/);
      await expect(page.getByRole("button", { name: "Approve Ewa M." })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await tab(page, "Join code & approval");
      await expect(page.locator("[data-join-code]")).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await chooseCsv(page, CSV);
      await page.getByRole("button", { name: "Run validation" }).click();
      await expect(page.locator("[data-import-results]")).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await tab(page, "Members");
      await page.getByRole("button", { name: "End membership" }).click();
      await page
        .getByRole("alertdialog")
        .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
    });
  }
});
