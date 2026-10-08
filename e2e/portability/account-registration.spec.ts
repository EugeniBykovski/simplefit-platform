import { expect, test } from "@playwright/test";

import { onboardingApi } from "../production/onboarding-api";

/*
 * WA5 account registration (SF-46) in every engine, on the production build:
 * the date of birth is each engine's own date input, so each must hand the
 * page the calendar date as `YYYY-MM-DD`, unshifted, in a far-east and a
 * far-west time zone; the consents are real checkboxes in each; completion
 * continues to the resolver's destination.
 */

test.use({ viewport: { width: 1440, height: 980 } });

for (const timezoneId of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });

    test(`the date of birth is sent as entered; the consents are ticked; completion continues`, async ({
      page,
    }) => {
      const api = await onboardingApi(page, { accountComplete: false });
      await page.goto("/en/app/onboarding/account?intent=fighter");
      await page.getByLabel("Full name").fill("Alex Kowalski");
      await page.getByLabel("Date of birth").fill("2000-01-01");
      await expect(page.getByLabel("Date of birth")).toHaveValue("2000-01-01");
      await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
      await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
      expect(api.account()).toMatchObject({
        date_of_birth: "2000-01-01",
        registration: { status: "complete" },
        consents: { terms: { current: true }, privacy: { current: true } },
      });
    });
  });
}
