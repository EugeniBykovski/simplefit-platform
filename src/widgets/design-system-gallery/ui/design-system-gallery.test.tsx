import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/shared/ui/tooltip";
import { renderWithProviders } from "@/test/render";

import { DesignSystemGallery } from "./design-system-gallery";

vi.mock(import("next/navigation"), async (importOriginal) => ({
  ...(await importOriginal()),
  usePathname: () => "/en/dev/design-system",
}));

describe("DesignSystemGallery", () => {
  it("renders the typography, buttons, badges and states of the design system", async () => {
    await renderWithProviders(
      <TooltipProvider>
        <DesignSystemGallery />
      </TooltipProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Design system" })).toBeInTheDocument();
    for (const section of [
      "Typography",
      "Semantic colours",
      "Spacing",
      "Radius",
      "Buttons",
      "Form controls",
      "Badges",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
    expect(screen.getByText("destructive", { selector: "[data-slot=badge]" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading sessions" })).toBeInTheDocument();
    // Every typography role and button size of the contract is on show.
    for (const role of ["type-metric-xl", "type-label-lg", "type-badge"]) {
      expect(screen.getByText(role)).toBeInTheDocument();
    }
    for (const size of ["sm · 32", "md · 40", "lg · 48", "xl · 54"]) {
      expect(screen.getByRole("button", { name: size })).toBeInTheDocument();
    }
  });
});
