import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SponsorOrganizationResponse } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { SponsorOverviewView } from "./sponsor-overview";

/*
 * SRW1 and SRW2 (SF-119) on the overview, with the network mocked at `fetch`
 * (component tests, not a backend): the welcome shows only what the backend says,
 * only explicit ends are sent, and only the backend's answer moves the flow.
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

const A = "4c2e8a1d-6b3f-4e7a-9c5d-2f1b8e3a7d60";
const B = "7e1d3b5f-9a2c-4d8e-b6f0-3a5c7e9b1d24";

const access = (
  id = A,
  role: "owner" | "member" = "owner",
  status: "active" | "suspended" = "active",
): SponsorOrganizationResponse => ({
  organization: {
    sponsor_id: id,
    display_name: id === A ? "Haymaker Drinks" : "Northside Agency",
    legal_name: "Legal Sp. z o.o.",
    country_code: "PL",
    website: null,
    status,
    revision: 1,
    created_at: "2026-11-09T10:00:00Z",
  },
  membership: {
    membership_id: "1a3c5e7f-2b4d-4f6a-8c0e-9d1b3f5a7c2e",
    role,
    permissions:
      role === "owner"
        ? ["view_organization", "view_members", "view_contacts"]
        : ["view_organization", "view_members"],
    joined_at: "2026-11-09T10:00:00Z",
  },
});

const state = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    first_run: {
      sponsor_id: id,
      status,
      started_at: status === "not_started" ? null : "2026-11-10T10:00:00Z",
      completed_at: status === "completed" ? "2026-11-10T10:05:00Z" : null,
      dismissed_at: status === "dismissed" ? "2026-11-10T10:05:00Z" : null,
      ...extra,
    },
  },
});
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: "x", details } },
});

type Answer = { status: number; body?: unknown };

/** A fake API by "METHOD path": each answers its queue in order (the last repeats). */
function api(routes: Record<string, Answer[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
      calls.push(key);
      const queue =
        routes[key] ??
        (key.endsWith("/me/sponsor-application") ? [error(404, "not_found")] : undefined);
      if (!queue) throw new Error(`unexpected ${key}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const run = (id: string, action = "") =>
  `${action ? "POST" : "GET"} /api/v1/sponsor-organizations/${id}/first-run${action ? `/${action}` : ""}`;

const user = userEvent.setup();
afterEach(() => vi.unstubAllGlobals());

async function dialog() {
  return screen.findByRole("dialog");
}

describe("SRW1 welcome and SRW2 tour (SF-119)", () => {
  it("welcomes a member who hasn't started, tours six real steps, finishes, and never reopens", async () => {
    const calls = api({
      [run(A)]: [state(A, "not_started")],
      [run(A, "start")]: [state(A, "in_progress")],
      [run(A, "complete")]: [state(A, "completed")],
    });
    await renderWithProviders(<SponsorOverviewView access={access()} />);
    const welcome = await screen.findByRole("region", { name: "Welcome to your workspace" });
    expect(
      within(welcome).getByRole("link", { name: "Check your organization’s details" }),
    ).toHaveAttribute("href", `/en/sponsor/${A}/settings?section=organization`);
    // Nothing is sent by showing the welcome.
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([]);

    await user.click(within(welcome).getByRole("button", { name: "Take the tour" }));
    const tour = await dialog();
    expect(within(tour).getByText("Tour · 1 of 6")).toBeVisible();
    const titles = [
      "Start here",
      "Overview",
      "Application",
      "Organization",
      "Members",
      "What isn’t here yet",
    ];
    for (const [at, title] of titles.entries()) {
      expect(within(tour).getByRole("heading", { name: title })).toBeVisible();
      if (at < titles.length - 1)
        await user.click(within(tour).getByRole("button", { name: "Next" }));
    }
    // Owner: the Organization step names the business contact (view_contacts).
    expect(calls).toEqual([run(A), "GET /api/v1/me/sponsor-application", run(A, "start")]);
    await user.click(within(tour).getByRole("button", { name: "Finish" }));
    expect(
      await within(tour).findByRole("heading", { name: "You know your way around" }),
    ).toBeVisible();
    expect(calls).toContain(run(A, "complete"));
    await user.click(within(tour).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Tour finished")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Welcome to your workspace" })).toBeNull();
    // Back and Next recorded nothing; one start, one completion.
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([
      run(A, "start"),
      run(A, "complete"),
    ]);
  });

  it("names the business contact on the Organization step only for owners and managers", async () => {
    api({ [run(A)]: [state(A, "in_progress")], [run(A, "start")]: [state(A, "in_progress")] });
    await renderWithProviders(<SponsorOverviewView access={access(A, "member")} />);
    await user.click(await screen.findByRole("button", { name: "Continue the tour" }));
    const tour = await dialog();
    for (let i = 0; i < 3; i += 1)
      await user.click(within(tour).getByRole("button", { name: "Next" }));
    expect(within(tour).getByText("Your company profile. It’s read-only for now.")).toBeVisible();
    expect(within(tour).queryByText(/business contact/)).toBeNull();
  });

  it("shows nothing for a completed or dismissed introduction, nor in a suspended organization", async () => {
    api({ [run(A)]: [state(A, "completed")], [run(B)]: [state(B, "unavailable")] });
    const view = await renderWithProviders(<SponsorOverviewView access={access()} />);
    await waitFor(() => expect(screen.getByText("Haymaker Drinks")).toBeVisible());
    expect(screen.queryByRole("region", { name: "Welcome to your workspace" })).toBeNull();
    view.rerender(<SponsorOverviewView key={B} access={access(B, "owner", "suspended")} />);
    expect(await screen.findByText("This organization is suspended.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
  });

  it("dismisses from the welcome: kept by the backend, said once", async () => {
    const calls = api({
      [run(A)]: [state(A, "not_started")],
      [run(A, "dismiss")]: [state(A, "dismissed")],
    });
    await renderWithProviders(<SponsorOverviewView access={access()} />);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("Introduction dismissed")).toBeVisible();
    expect(calls).toContain(run(A, "dismiss"));
  });

  it("keeps the welcome with an error when the backend didn't keep the dismissal", async () => {
    api({
      [run(A)]: [state(A, "not_started")],
      [run(A, "dismiss")]: [error(503, "service_unavailable")],
    });
    await renderWithProviders(<SponsorOverviewView access={access()} />);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save that.");
    expect(screen.getByRole("region", { name: "Welcome to your workspace" })).toBeVisible();
    expect(screen.queryByText("Introduction dismissed")).toBeNull();
  });

  it("never claims a finish the backend didn't keep; Try again is the same request", async () => {
    const calls = api({
      [run(A)]: [state(A, "in_progress")],
      [run(A, "start")]: [state(A, "in_progress")],
      [run(A, "complete")]: [error(503, "service_unavailable"), state(A, "completed")],
    });
    await renderWithProviders(<SponsorOverviewView access={access()} />);
    await user.click(await screen.findByRole("button", { name: "Continue the tour" }));
    const tour = await dialog();
    for (let i = 0; i < 5; i += 1)
      await user.click(within(tour).getByRole("button", { name: "Next" }));
    await user.click(within(tour).getByRole("button", { name: "Finish" }));
    expect(
      await within(tour).findByRole("heading", { name: "We couldn’t finish the tour" }),
    ).toBeVisible();
    expect(within(tour).queryByRole("heading", { name: "You know your way around" })).toBeNull();
    await user.click(within(tour).getByRole("button", { name: "Try again" }));
    expect(
      await within(tour).findByRole("heading", { name: "You know your way around" }),
    ).toBeVisible();
    expect(calls.filter((c) => c === run(A, "complete"))).toHaveLength(2);
  });

  it("End tour and Escape ask first; Keep going returns to the step; End tour dismisses", async () => {
    const calls = api({
      [run(A)]: [state(A, "not_started")],
      [run(A, "start")]: [state(A, "in_progress")],
      [run(A, "dismiss")]: [state(A, "dismissed")],
    });
    await renderWithProviders(<SponsorOverviewView access={access()} />);
    await user.click(await screen.findByRole("button", { name: "Take the tour" }));
    const tour = await dialog();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(within(tour).getByRole("heading", { name: "Application" })).toBeVisible();
    await user.keyboard("{ArrowLeft}");
    expect(within(tour).getByRole("heading", { name: "Overview" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(within(tour).getByRole("heading", { name: "End the tour?" })).toBeVisible();
    await user.click(within(tour).getByRole("button", { name: "Keep going" }));
    expect(within(tour).getByRole("heading", { name: "Overview" })).toBeVisible();
    expect(calls).not.toContain(run(A, "dismiss"));
    await user.click(within(tour).getByRole("button", { name: "End tour" }));
    await user.click(within(tour).getByRole("button", { name: "End tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toContain(run(A, "dismiss"));
    expect(await screen.findByText("Introduction dismissed")).toBeVisible();
  });

  it("closes the tour and shows the kept outcome when another tab ended it the other way (409)", async () => {
    api({
      [run(A)]: [state(A, "in_progress"), state(A, "dismissed")],
      [run(A, "start")]: [state(A, "in_progress")],
      [run(A, "complete")]: [error(409, "conflict", { first_run: "dismissed" })],
    });
    await renderWithProviders(<SponsorOverviewView access={access()} />);
    await user.click(await screen.findByRole("button", { name: "Continue the tour" }));
    const tour = await dialog();
    for (let i = 0; i < 5; i += 1)
      await user.click(within(tour).getByRole("button", { name: "Next" }));
    await user.click(within(tour).getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Introduction dismissed")).toBeVisible();
  });

  it("an unreadable first run leaves the overview usable, with a retry", async () => {
    api({ [run(A)]: [error(503, "service_unavailable"), state(A, "not_started")] });
    await renderWithProviders(<SponsorOverviewView access={access()} />);
    expect(await screen.findByText(/couldn’t check your introduction/)).toBeVisible();
    expect(screen.getByText("Haymaker Drinks")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Welcome to your workspace" })).toBeVisible();
  });

  it("switching organization mid-tour closes it and reads the other organization's own state", async () => {
    const calls = api({
      [run(A)]: [state(A, "not_started")],
      [run(A, "start")]: [state(A, "in_progress")],
      [run(B)]: [state(B, "completed")],
    });
    const view = await renderWithProviders(<SponsorOverviewView key={A} access={access(A)} />);
    await user.click(await screen.findByRole("button", { name: "Take the tour" }));
    await dialog();
    view.rerender(<SponsorOverviewView key={B} access={access(B)} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Northside Agency")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Welcome to your workspace" })).toBeNull();
    expect(calls).toContain(run(B));
    // Nothing was ever recorded against B.
    expect(calls.filter((c) => c.startsWith("POST") && c.includes(B))).toEqual([]);
  });
});
