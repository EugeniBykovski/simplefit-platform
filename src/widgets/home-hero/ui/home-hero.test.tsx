import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/render";

import { HomeHero } from "./home-hero";

vi.mock(import("next/navigation"), async (importOriginal) => ({
  ...(await importOriginal()),
  usePathname: () => "/",
}));

describe("HomeHero", () => {
  it.each([
    ["en", "The operating system and professional network for boxing.", "Open the app"],
    ["pl", "System operacyjny i profesjonalna sieć dla boksu.", "Otwórz aplikację"],
    ["ru", "Операционная система и профессиональная сеть для бокса.", "Открыть приложение"],
    ["de", "Das Betriebssystem und professionelle Netzwerk für den Boxsport.", "Zur App"],
    ["uk", "Операційна система та професійна мережа для боксу.", "Відкрити застосунок"],
    ["es", "El sistema operativo y la red profesional del boxeo.", "Abrir la aplicación"],
    ["es-MX", "El sistema operativo y la red profesional del boxeo.", "Abrir la aplicación"],
    [
      "fr",
      "Le système d’exploitation et le réseau professionnel de la boxe.",
      "Ouvrir l’application",
    ],
  ] as const)(
    "renders the %s foundation copy with locale-aware links",
    async (locale, tagline, cta) => {
      await renderWithProviders(<HomeHero />, { locale });

      expect(
        screen.getByRole("heading", { level: 1, name: "SimpleFit Boxing" }),
      ).toBeInTheDocument();
      expect(screen.getByText(tagline)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: cta })).toHaveAttribute("href", `/${locale}/app`);
    },
  );
});
