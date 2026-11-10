import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { AdminWorkspace } from "./admin-workspace";

/*
 * The Control Plane shell (SF-120) with the network mocked at `fetch`: the nav
 * follows the backend's permissions, the operator block shows the key check, and
 * the overview forwards to ARW1 only while the backend still offers it.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const navigation = vi.hoisted(() => ({ pathname: "/admin", replace: vi.fn() }));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace }),
  usePathname: () => navigation.pathname,
}));
// The shell (sidebar, session control, switchers) has its own tests.
vi.mock("@/widgets/workspace-shell", () => ({
  WorkspaceShell: ({
    children,
    identity,
    visibleItems,
  }: {
    children: ReactNode;
    identity?: ReactNode;
    visibleItems?: readonly string[];
  }) => (
    <div data-testid="shell" data-items={visibleItems?.join(",")}>
      {identity}
      {children}
    </div>
  ),
}));

const operator = (permissions: string[], checked = true) => ({
  status: 200,
  body: {
    operator: {
      id: "o",
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: checked
        ? {
            verified_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 29.5 * 60_000).toISOString(),
            fresh_seconds_remaining: 270,
          }
        : null,
      enrollment_expires_at: null,
      activated_at: null,
    },
  },
});
const firstRun = (status: string) => ({
  status: 200,
  body: { experiences: [{ experience: "control_plane_web_tour", status, recorded_at: null }] },
});

function api(routes: Record<string, { status: number; body?: unknown }[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
      calls.push(key);
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected ${key}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(
        answer.status === 204
          ? new Response(null, { status: 204 })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}

const ME = "GET /api/v1/admin/me";
const RUN = "GET /api/v1/me/first-run";

const user = userEvent.setup();
afterEach(() => {
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
  navigation.pathname = "/admin";
});

describe("AdminWorkspace (SF-120)", () => {
  it("shows the granted nav items and the operator's key check", async () => {
    api({ [ME]: [operator(["audit.read", "operators.read"])], [RUN]: [firstRun("completed")] });
    renderWithProviders(
      <AdminWorkspace>
        <p>overview</p>
      </AdminWorkspace>,
    );
    expect(await screen.findByTestId("shell")).toHaveAttribute(
      "data-items",
      "overview,audit,staff",
    );
    expect(screen.getByText("Key checked · 30 min left")).toBeVisible();
    expect(screen.getByText("2 permissions · each granted separately")).toBeVisible();
    expect(screen.getByText("overview")).toBeVisible();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("forwards the overview to ARW1 while the backend offers it", async () => {
    api({ [ME]: [operator([])], [RUN]: [firstRun("pending")] });
    renderWithProviders(
      <AdminWorkspace>
        <p>overview</p>
      </AdminWorkspace>,
    );
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/admin/welcome"));
  });

  it("nothing renders behind the gate without a key check", async () => {
    api({ [ME]: [operator(["audit.read"], false)] });
    renderWithProviders(
      <AdminWorkspace>
        <p>overview</p>
      </AdminWorkspace>,
    );
    expect(await screen.findByRole("heading", { name: "Use your security key" })).toBeVisible();
    expect(screen.queryByTestId("shell")).toBeNull();
    expect(screen.queryByText("overview")).toBeNull();
  });

  it("Exit control plane ends the key check on the backend and closes the Control Plane", async () => {
    const calls = api({
      [ME]: [operator(["audit.read"]), operator(["audit.read"], false)],
      [RUN]: [firstRun("completed")],
      "DELETE /api/v1/admin/step-up": [{ status: 204 }],
    });
    renderWithProviders(
      <AdminWorkspace>
        <p>overview</p>
      </AdminWorkspace>,
    );
    await user.click(await screen.findByRole("button", { name: "Exit control plane" }));
    expect(await screen.findByRole("heading", { name: "Use your security key" })).toBeVisible();
    expect(calls).toContain("DELETE /api/v1/admin/step-up");
    expect(screen.queryByText("overview")).toBeNull();
  });

  it("a revoked operator (404 on the next read) loses the Control Plane", async () => {
    api({
      [ME]: [
        operator(["audit.read"]),
        { status: 404, body: { error: { code: "not_found", message: "x", details: {} } } },
      ],
      [RUN]: [firstRun("completed")],
    });
    const { queryClient } = await renderWithProviders(
      <AdminWorkspace>
        <p>overview</p>
      </AdminWorkspace>,
    );
    expect(await screen.findByText("overview")).toBeVisible();
    await queryClient.refetchQueries();
    expect(await screen.findByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    expect(screen.queryByText("overview")).toBeNull();
  });
});
