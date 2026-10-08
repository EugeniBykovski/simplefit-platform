import { expect, test } from "@playwright/test";

import { fighterApi } from "../production/fighter-api";

/*
 * The WF0 country selector (SF-38) in every engine, on the production build:
 * the list is derived from the engine's own region names, so each engine
 * must offer exactly the 249 officially assigned ISO 3166-1 codes the API
 * accepts, named in the reader's language. Firefox, for one, also names
 * withdrawn codes; the exclusions by code class keep them out.
 */

test.use({ viewport: { width: 1440, height: 980 } });

for (const [locale, label, search, poland, germany] of [
  ["en", "Country", "Search countries", "Poland", "Germany"],
  ["pl", "Kraj", "Szukaj kraju", "Polska", "Niemcy"],
] as const) {
  test(`${locale}: 249 countries, named in ${locale}, chosen by search`, async ({ page }) => {
    const api = await fighterApi(page);
    await page.goto(`/${locale}/app/onboarding/fighter`);
    await page.getByRole("combobox", { name: label, exact: true }).click();
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options).toHaveCount(249);
    // No withdrawn, reserved or user-assigned code is offered.
    await expect(
      page.getByRole("option", { name: /^(Kosovo|Soviet Union|Johnston Atoll)$/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("option", { name: germany, exact: true })).toHaveCount(1);
    await page.getByRole("combobox", { name: search, exact: true }).fill(poland.slice(0, 4));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: label, exact: true })).toHaveText(
      new RegExp(poland),
    );
    // The ISO code, not the label, is what the page would send.
    await page.getByLabel(locale === "en" ? "Name" : "Imię", { exact: true }).fill("Alex K.");
    await page
      .getByRole("button", { name: locale === "en" ? "Save & exit" : "Zapisz i wyjdź" })
      .click();
    await expect.poll(() => api.state()?.country_code).toBe("PL");
  });
}
