import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sponsorOrganizationQueryKey } from "@/entities/sponsor-organization";
import type { SponsorIdentity } from "@/features/session-gate";
import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import type { SponsorOrganizationResponse } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { SponsorOverview } from "./sponsor-overview";
import { SponsorWorkspace } from "./sponsor-workspace";

/*
 * The partner portal (SF-117, D-SA26) with the network mocked at `fetch`
 * (component tests, not a backend): a page renders only with the backend's
 * answer for the organization in the path, and the overview shows real data
 * only.
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
  usePathname: () => "/sponsor",
}));
// The shell (sidebar, session control, switchers) has its own tests.
vi.mock("@/widgets/workspace-shell", () => ({
  WorkspaceShell: ({
    children,
    params,
    identity,
  }: {
    children: ReactNode;
    params: { sponsorId: string };
    identity?: ReactNode;
  }) => (
    <div data-shell-sponsor={params.sponsorId}>
      {identity}
      {children}
    </div>
  ),
}));
vi.mock(import("@/features/session-gate"), async (importOriginal) => ({
  ...(await importOriginal()),
  ContextSwitcher: (props: object) => {
    const sponsor = "sponsor" in props ? (props.sponsor as SponsorIdentity) : undefined;
    return <p data-identity>{sponsor ? `${sponsor.name}:${sponsor.status}` : "none"}</p>;
  },
}));

const HAYMAKER = "4c2e8a1d-6b3f-4e7a-9c5d-2f1b8e3a7d60";
const AGENCY = "7e1d3b5f-9a2c-4d8e-b6f0-3a5c7e9b1d24";

const access = (
  overrides: { id?: string; name?: string; status?: "active" | "suspended" } = {},
  role: "owner" | "manager" | "member" = "owner",
): SponsorOrganizationResponse => ({
  organization: {
    sponsor_id: overrides.id ?? HAYMAKER,
    display_name: overrides.name ?? "Haymaker Drinks",
    legal_name: "Haymaker Drinks Sp. z o.o.",
    country_code: "PL",
    website: null,
    status: overrides.status ?? "active",
    revision: 1,
    created_at: "2026-11-09T10:00:00Z",
  },
  membership: {
    membership_id: "1a3c5e7f-2b4d-4f6a-8c0e-9d1b3f5a7c2e",
    role,
    permissions: ["view_organization", "view_members"],
    joined_at: "2026-11-09T10:00:00Z",
  },
});

type Answer = { status: number; body?: unknown } | (() => Promise<Response>);

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
const failed = { status: 500, body: { error: { code: "internal", message: "x", details: {} } } };
const noApplication = { "/api/v1/me/sponsor-application": [notFound] };

async function renderPortal(sponsorId = HAYMAKER) {
  return renderWithProviders(
    <SponsorWorkspace sponsorId={sponsorId}>
      <SponsorOverview />
    </SponsorWorkspace>,
  );
}

const user = userEvent.setup();
afterEach(() => vi.unstubAllGlobals());

describe("SponsorWorkspace and the SPX4 overview (SF-117)", () => {
  it("shows the real organization and role, and says what doesn't exist instead of numbers", async () => {
    api({
      [`/api/v1/sponsor-organizations/${HAYMAKER}`]: [{ status: 200, body: access() }],
      ...noApplication,
    });
    await renderPortal();
    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.getByText("Haymaker Drinks")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("Your role: Owner")).toBeVisible();
    expect(screen.getByText("Not available yet")).toBeVisible();
    expect(screen.queryByText(/\d+%|€|reach/i)).toBeNull();
    expect(
      screen.getByText("Haymaker Drinks:active", { selector: "[data-identity]" }),
    ).toBeVisible();
    // No application of this viewer's created it: no application card.
    expect(screen.queryByText("Reviewed by SimpleFit")).toBeNull();
  });

  it("shows the approved application only when it is the viewer's own and created this organization", async () => {
    api({
      [`/api/v1/sponsor-organizations/${HAYMAKER}`]: [{ status: 200, body: access() }],
      "/api/v1/me/sponsor-application": [
        { status: 200, body: { application: { status: "approved", sponsor_id: HAYMAKER } } },
      ],
    });
    await renderPortal();
    expect(await screen.findByText("Reviewed by SimpleFit")).toBeVisible();
    expect(screen.getByRole("link", { name: "View application" })).toHaveAttribute(
      "href",
      `/en/sponsor/${HAYMAKER}/application`,
    );
  });

  it("never shows another organization's application", async () => {
    api({
      [`/api/v1/sponsor-organizations/${AGENCY}`]: [
        { status: 200, body: access({ id: AGENCY, name: "Agency" }, "member") },
      ],
      "/api/v1/me/sponsor-application": [
        { status: 200, body: { application: { status: "approved", sponsor_id: HAYMAKER } } },
      ],
    });
    await renderPortal(AGENCY);
    expect(await screen.findByText("Your role: Member")).toBeVisible();
    expect(screen.queryByText("Reviewed by SimpleFit")).toBeNull();
  });

  it("renders a suspended organization read-only, with the notice and its status", async () => {
    api({
      [`/api/v1/sponsor-organizations/${HAYMAKER}`]: [
        { status: 200, body: access({ status: "suspended" }) },
      ],
      ...noApplication,
    });
    await renderPortal();
    expect(await screen.findByText("This organization is suspended.")).toBeVisible();
    expect(screen.getByText("Suspended")).toBeVisible();
    expect(
      screen.getByText("Haymaker Drinks:suspended", { selector: "[data-identity]" }),
    ).toBeVisible();
  });

  it("renders not available, without any organization data, for 404 (unknown, foreign or revoked)", async () => {
    api({ [`/api/v1/sponsor-organizations/${HAYMAKER}`]: [notFound] });
    await renderPortal();
    expect(await screen.findByText("We can’t find that page")).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to SimpleFit" })).toHaveAttribute(
      "href",
      "/en/app",
    );
    expect(screen.queryByText("Haymaker Drinks")).toBeNull();
    // No identity block names an organization the viewer may not see.
    expect(document.querySelector("[data-identity]")).toBeNull();
  });

  it("replaces the page and resolves the entry again when a re-read answers 404 (revoked meanwhile)", async () => {
    api({
      [`/api/v1/sponsor-organizations/${HAYMAKER}`]: [{ status: 200, body: access() }, notFound],
      ...noApplication,
    });
    const { queryClient } = await renderPortal();
    await screen.findByText("Haymaker Drinks");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await queryClient.invalidateQueries({ queryKey: sponsorOrganizationQueryKey(HAYMAKER) });
    expect(await screen.findByText("We can’t find that page")).toBeVisible();
    expect(screen.queryByText("Haymaker Drinks")).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getResolveMyEntryQueryKey() });
  });

  it("offers a retry when the organization can't be read, then shows it", async () => {
    api({
      [`/api/v1/sponsor-organizations/${HAYMAKER}`]: [failed, { status: 200, body: access() }],
      ...noApplication,
    });
    await renderPortal();
    await user.click(await screen.findByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Haymaker Drinks")).toBeVisible();
  });

  it("never shows a late answer for the previous organization after a switch", async () => {
    let releaseHaymaker: (response: Response) => void = () => {};
    api({
      [`/api/v1/sponsor-organizations/${HAYMAKER}`]: [
        () => new Promise<Response>((resolve) => (releaseHaymaker = resolve)),
      ],
      [`/api/v1/sponsor-organizations/${AGENCY}`]: [
        { status: 200, body: access({ id: AGENCY, name: "Agency" }, "member") },
      ],
      ...noApplication,
    });
    const view = await renderPortal(HAYMAKER);
    view.rerender(
      <SponsorWorkspace sponsorId={AGENCY}>
        <SponsorOverview />
      </SponsorWorkspace>,
    );
    expect(await screen.findByText("Agency")).toBeVisible();
    releaseHaymaker(jsonResponse(access()));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(view.queryClient.getQueryData(sponsorOrganizationQueryKey(AGENCY))).toMatchObject({
      organization: { sponsor_id: AGENCY },
    });
    expect(screen.queryByText("Haymaker Drinks")).toBeNull();
    expect(document.querySelector("[data-sponsor-overview]")).toHaveAttribute(
      "data-sponsor-id",
      AGENCY,
    );
  });
});
