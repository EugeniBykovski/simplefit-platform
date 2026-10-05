import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "@/test/render";

import { ThemeSwitcher } from "./theme-switcher";

const renderSwitcher = (locale: "en" | "pl" = "en") =>
  renderWithProviders(
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["light", "dark"]}
      enableSystem
      storageKey="simplefit-theme"
    >
      <ThemeSwitcher />
    </ThemeProvider>,
    { locale },
  );

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ThemeSwitcher", () => {
  it("is dark by default", async () => {
    await renderSwitcher();
    expect(await screen.findByRole("button", { name: "Change theme: Dark" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("switches to light, applies it to <html> and remembers it", async () => {
    const user = userEvent.setup();
    await renderSwitcher();

    await user.click(await screen.findByRole("button", { name: "Change theme: Dark" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));

    expect(document.documentElement).toHaveClass("light");
    expect(localStorage.getItem("simplefit-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Change theme: Light" })).toBeInTheDocument();
  });

  it("offers dark, light and system, translated", async () => {
    const user = userEvent.setup();
    await renderSwitcher("pl");

    await user.click(await screen.findByRole("button", { name: "Zmień motyw: Ciemny" }));
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "Ciemny",
      "Jasny",
      "Systemowy",
    ]);
  });
});
