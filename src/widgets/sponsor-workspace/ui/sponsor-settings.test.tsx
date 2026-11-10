import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SponsorOrganizationResponse } from "@/shared/api/generated/model";
import { localeRegistry, type Locale } from "@/shared/i18n/routing";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { SponsorApplicationView } from "./sponsor-application-page";
import { SponsorOverviewView } from "./sponsor-overview";
import { settingsSection, type SettingsSection } from "../model/settings";
import { SponsorSettingsView } from "./sponsor-settings";

/*
 * SF-118: the partner portal's settings (SPX9 MVP), application page and
 * overview with the network mocked at `fetch` (component tests, not a
 * backend). Everything shown is the API's answer; nothing is editable,
 * because no organization write exists.
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
}));

const ORG = "4c2e8a1d-6b3f-4e7a-9c5d-2f1b8e3a7d60";

const access = (
  role: "owner" | "manager" | "member" = "owner",
  status: "active" | "suspended" = "active",
): SponsorOrganizationResponse => ({
  organization: {
    sponsor_id: ORG,
    display_name: "Haymaker Drinks",
    legal_name: "Haymaker Drinks Sp. z o.o.",
    country_code: "PL",
    website: "https://haymaker.example",
    status,
    revision: 1,
    created_at: "2026-11-09T10:00:00Z",
  },
  membership: {
    membership_id: "1a3c5e7f-2b4d-4f6a-8c0e-9d1b3f5a7c2e",
    role,
    permissions:
      role === "member"
        ? ["view_organization", "view_members"]
        : ["view_organization", "view_members", "view_contacts"],
    joined_at: "2026-11-09T10:00:00Z",
  },
});

type Answer = { status: number; body?: unknown };

function api(routes: Record<string, Answer[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const { pathname, search } = new URL(url);
      calls.push(pathname + search);
      const queue = routes[pathname];
      if (!queue) throw new Error(`unexpected ${pathname}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(
        answer.body === undefined
          ? new Response(null, { status: answer.status })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}
const error = (status: number, code: string) => ({
  status,
  body: { error: { code, message: "x", details: {} } },
});

const member = (id: string, name: string | null, role: string, viewer = false) => ({
  membership_id: id,
  short_name: name,
  role,
  status: "active",
  joined_at: "2026-11-09T10:00:00Z",
  is_viewer: viewer,
});

function renderSettings(
  section: SettingsSection,
  role: "owner" | "manager" | "member" = "owner",
  status: "active" | "suspended" = "active",
  locale: Locale = "en",
) {
  return renderWithProviders(
    <SponsorSettingsView access={access(role, status)} section={section} />,
    { locale },
  );
}

const user = userEvent.setup();
afterEach(() => vi.unstubAllGlobals());

describe("SPX9 settings (SF-118)", () => {
  it("reads the section from the URL, defaulting to the organization", () => {
    expect(settingsSection("members")).toBe("members");
    expect(settingsSection(["members", "contact"])).toBe("organization");
    expect(settingsSection("notifications")).toBe("organization");
    expect(settingsSection(undefined)).toBe("organization");
  });

  it("shows the real company profile read-only, with no field, input or save control", async () => {
    api({});
    await renderSettings("organization");
    const section = screen.getByRole("region", { name: "Company profile" });
    expect(within(section).getByText("Haymaker Drinks Sp. z o.o.")).toBeVisible();
    expect(within(section).getByText("Poland")).toBeVisible();
    expect(within(section).getByRole("link", { name: "https://haymaker.example" })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow",
    );
    expect(
      within(section).getByText("These details can’t be edited in SimpleFit yet."),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    // The section links name this organization and mark the current one.
    expect(screen.getByRole("link", { name: "Organization" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute(
      "href",
      `/en/sponsor/${ORG}/settings?section=members`,
    );
  });

  it("shows the business contacts to an owner", async () => {
    const calls = api({
      [`/api/v1/sponsor-organizations/${ORG}/contacts`]: [
        {
          status: 200,
          body: {
            contacts: [
              {
                contact_id: "c1",
                kind: "primary",
                full_name: "Ada Nowak",
                job_title: null,
                email: "ada@haymaker.example",
                phone: null,
              },
            ],
          },
        },
      ],
    });
    await renderSettings("contact");
    expect(await screen.findByText("Ada Nowak")).toBeVisible();
    expect(screen.getByText("ada@haymaker.example")).toBeVisible();
    expect(screen.getAllByText("Not provided")).toHaveLength(2);
    expect(calls).toEqual([`/api/v1/sponsor-organizations/${ORG}/contacts`]);
  });

  it("never asks for contacts without view_contacts, and says who can see them", async () => {
    const calls = api({});
    await renderSettings("contact", "member");
    expect(
      screen.getByText(
        "Business contacts are visible to an owner or manager of this organization.",
      ),
    ).toBeVisible();
    expect(calls).toEqual([]);
  });

  it("treats a 403 from the backend as the restricted state, whatever the projection said", async () => {
    api({ [`/api/v1/sponsor-organizations/${ORG}/contacts`]: [error(403, "forbidden")] });
    await renderSettings("contact", "manager");
    expect(
      await screen.findByText(
        "Business contacts are visible to an owner or manager of this organization.",
      ),
    ).toBeVisible();
  });

  it("lists members page by page, marks the viewer, and offers no member actions", async () => {
    const calls = api({
      [`/api/v1/sponsor-organizations/${ORG}/members`]: [
        {
          status: 200,
          body: {
            members: [member("m1", "Ada N.", "owner", true), member("m2", null, "member")],
            next_cursor: "next",
          },
        },
        { status: 200, body: { members: [member("m3", "Ola K.", "manager")], next_cursor: null } },
      ],
    });
    await renderSettings("members");
    expect(await screen.findByText("Ada N.")).toBeVisible();
    expect(screen.getByText("Owner · you")).toBeVisible();
    expect(screen.getByText("SimpleFit member")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show more members" }));
    expect(await screen.findByText("Ola K.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show more members" })).toBeNull();
    expect(screen.queryByRole("button", { name: /invite|change|remove|transfer/i })).toBeNull();
    expect(calls[1]).toContain("cursor=next");
  });

  it("says the account isn't the organization's; account settings are marked Soon, not linked", async () => {
    api({});
    await renderSettings("account");
    expect(
      screen.getByText(/belong to your SimpleFit account, not to this organization/),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /Account settings/ })).toBeNull();
    expect(screen.getByText("Account settings").closest("[aria-disabled]")).toHaveTextContent(
      "Soon",
    );
  });

  it("shows the suspended notice above every section", async () => {
    api({});
    await renderSettings("organization", "owner", "suspended");
    expect(screen.getByText("This organization is suspended.")).toBeVisible();
    expect(screen.getAllByText("Suspended").length).toBeGreaterThan(0);
  });

  it.each(Object.keys(localeRegistry) as Locale[])(
    "renders in %s with every key translated",
    async (locale) => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      api({});
      const view = await renderSettings("organization", "owner", "active", locale);
      expect(view.container.textContent).not.toMatch(/sponsorPortal\.|settings\.|MISSING/);
      expect(errors).not.toHaveBeenCalledWith(expect.stringContaining("MISSING_MESSAGE"));
      errors.mockRestore();
    },
  );
});

describe("the organization's application (SF-118)", () => {
  const application = (overrides: Record<string, unknown>) => ({
    application: {
      status: "approved",
      sponsor_id: ORG,
      submitted_at: "2026-11-01T10:00:00Z",
      answers: {
        budget_band: null,
        company_name: "Haymaker Drinks",
        contact_email: "ada@haymaker.example",
        contact_full_name: "Ada Nowak",
        contact_phone: null,
        contact_position: null,
        country_code: "PL",
        goals: null,
        industry: null,
        interests: [],
        market_cities: [],
        market_countries: [],
        market_scope: null,
        website: null,
      },
      ...overrides,
    },
  });

  it("shows the applicant's own approved answers, read-only", async () => {
    api({ "/api/v1/me/sponsor-application": [{ status: 200, body: application({}) }] });
    await renderWithProviders(<SponsorApplicationView access={access()} />);
    expect(await screen.findByText("Reviewed by SimpleFit")).toBeVisible();
    expect(screen.getByText("Approved")).toBeVisible();
    expect(screen.getByText(/Submitted on/)).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("tells any other member that only the applicant can see it", async () => {
    api({ "/api/v1/me/sponsor-application": [error(404, "not_found")] });
    await renderWithProviders(<SponsorApplicationView access={access("member")} />);
    expect(await screen.findByText("Only the person who applied can see it")).toBeVisible();
  });

  it("never shows the viewer's application for another organization", async () => {
    api({
      "/api/v1/me/sponsor-application": [
        { status: 200, body: application({ sponsor_id: "7e1d3b5f-9a2c-4d8e-b6f0-3a5c7e9b1d24" }) },
      ],
    });
    await renderWithProviders(<SponsorApplicationView access={access()} />);
    expect(await screen.findByText("Only the person who applied can see it")).toBeVisible();
    expect(screen.queryByText("Ada Nowak")).toBeNull();
  });
});

describe("the overview's truthful modules (SF-118)", () => {
  it("states the membership's real permissions and lists FUTURE modules as neither links nor buttons", async () => {
    api({ "/api/v1/me/sponsor-application": [error(404, "not_found")] });
    await renderWithProviders(<SponsorOverviewView access={access("member")} />);
    expect(screen.getByText("Read the organization’s details")).toBeVisible();
    expect(screen.getByText("See its members")).toBeVisible();
    expect(screen.queryByText("See its business contacts")).toBeNull();
    const future = document.querySelector("[data-sponsor-future]");
    if (!(future instanceof HTMLElement)) throw new Error("no FUTURE list");
    expect(within(future).getAllByRole("listitem")).toHaveLength(4);
    expect(within(future).getAllByText("Future")).toHaveLength(4);
    expect(within(future).queryAllByRole("link")).toHaveLength(0);
    expect(within(future).queryAllByRole("button")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\d+(\.\d+)?%|€|\$|reach|impressions/i);
  });
});
