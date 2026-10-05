import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/render";

import { LocaleSwitcher } from "./locale-switcher";

const replace = vi.hoisted(() => vi.fn());
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ replace }),
}));

describe("LocaleSwitcher", () => {
  it("names the current language and lists every locale in its own language", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LocaleSwitcher />, { locale: "pl" });

    const trigger = screen.getByRole("button", { name: "Zmień język: Polski" });
    await user.click(trigger);

    const options = screen.getAllByRole("menuitemradio");
    expect(options.map((option) => option.textContent)).toEqual([
      "English",
      "Русский",
      "Polski",
      "Deutsch",
      "Українська",
      "Español",
      "Español (México)",
      "Français",
    ]);
    expect(screen.getByRole("menuitemradio", { name: "Polski" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Русский" })).toHaveAttribute("lang", "ru");
  });

  it("switches to Mexican Spanish as a locale distinct from Spanish", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    await renderWithProviders(<LocaleSwitcher />, { locale: "es" });

    await user.click(screen.getByRole("button", { name: "Cambiar idioma: Español" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Español (México)" }));

    expect(replace).toHaveBeenCalledWith("/app", { locale: "es-MX" });
  });

  it("switches locale while staying on the current route", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    await renderWithProviders(<LocaleSwitcher />, { locale: "en" });

    await user.click(screen.getByRole("button", { name: "Change language: English" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Русский" }));

    expect(replace).toHaveBeenCalledWith("/app", { locale: "ru" });
  });

  it("is operable with the keyboard", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    await renderWithProviders(<LocaleSwitcher />, { locale: "en" });

    await user.tab();
    expect(screen.getByRole("button", { name: "Change language: English" })).toHaveFocus();
    await user.keyboard("{Enter}");
    // Opening with Enter focuses the first item (English); ArrowDown moves to Русский.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(replace).toHaveBeenCalledWith("/app", { locale: "ru" });
  });

  it("does nothing when the current locale is chosen again", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    await renderWithProviders(<LocaleSwitcher />, { locale: "en" });

    await user.click(screen.getByRole("button", { name: "Change language: English" }));
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(replace).not.toHaveBeenCalled();
  });
});
