import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";
import type * as Navigation from "@/shared/i18n/navigation";
import { renderWithProviders } from "@/test/render";

import { ErrorState } from "./error-state";
import { FailureView } from "./failure-view";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/shared/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof Navigation>()),
  usePathname: () => "/sponsor/campaigns",
  useRouter: () => ({ replace: navigation.replace }),
}));

describe("failure states", () => {
  it("never renders the error's message, stack or request details", async () => {
    const error = Object.assign(new Error("db password=hunter2 sfr_secret"), {
      digest: "1234",
      stack: "at secret (internal.ts:1)",
    });
    const { container } = await renderWithProviders(
      <FailureView error={error} onRetry={() => {}} />,
    );
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    for (const leak of ["hunter2", "sfr_secret", "1234", "internal.ts", "req-1"]) {
      expect(container.textContent).not.toContain(leak);
    }
  });

  it("retries retryable states", async () => {
    const retry = vi.fn();
    await renderWithProviders(<ErrorState kind="offline" onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("leads home from a forbidden state instead of retrying", async () => {
    await renderWithProviders(
      <FailureView
        error={new ApiError(403, "forbidden", "internal", {}, "req-1")}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "You don’t have access" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute("href", "/en");
  });

  it("sends a 401 back to the area's sign-in with returnTo instead of a screen", async () => {
    const { container } = await renderWithProviders(
      <FailureView error={new ApiError(401, "unauthorized", "internal", {}, "req-1")} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(navigation.replace).toHaveBeenCalledWith(
      `/sponsor/login?returnTo=${encodeURIComponent("/sponsor/campaigns")}`,
    );
  });
});
