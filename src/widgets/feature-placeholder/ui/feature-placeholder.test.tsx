import { screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/shared/i18n/messages";
import type { Locale } from "@/shared/i18n/routing";
import { renderWithProviders } from "@/test/render";

import { placeholderRoute } from "./placeholder-route";

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
    createTranslator({
      locale,
      messages: await loadMessages(locale),
      namespace: namespace as never,
    }),
}));

async function renderRoute(id: Parameters<typeof placeholderRoute>[0], locale: Locale = "en") {
  const route = placeholderRoute(id);
  const element = (await route.Page({ params: Promise.resolve({ locale }) })) as ReactElement;
  // FeaturePlaceholder is an async Server Component: resolve it like the server does.
  const placeholder = element.type as (props: object) => Promise<ReactElement>;
  await renderWithProviders(await placeholder(element.props as object), { locale });
  return route;
}

describe("canonical feature placeholder", () => {
  it("names the route, says it is planned and shows its canonical path", async () => {
    await renderRoute("web.app.coach.fighters._fighter-id");

    expect(screen.getByRole("heading", { level: 1, name: "Fighter 360" })).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("/app/coach/fighters/:fighterId")).toBeInTheDocument();
    expect(
      document.querySelector('[data-feature-placeholder="web.app.coach.fighters._fighter-id"]'),
    ).not.toBeNull();
  });

  it("offers nothing that looks functional", async () => {
    await renderRoute("web.app.gym.members");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
  });

  it.each([
    ["ru", "Расписание"],
    ["pl", "Grafik zajęć"],
    ["de", "Stundenplan"],
    ["es-MX", "Horario"],
  ] as const)("is translated in %s", async (locale, title) => {
    await renderRoute("web.app.gym.timetable", locale);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("gives the page a localized, non-indexed title", async () => {
    const metadata = await placeholderRoute("web.admin.audit").generateMetadata({
      params: Promise.resolve({ locale: "fr" }),
    });
    expect(metadata).toEqual({ title: "Journal d’audit", robots: { index: false } });
  });
});
