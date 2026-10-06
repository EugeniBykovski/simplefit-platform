import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";

import LoginPage from "./login/page";
import SignupPage from "./signup/page";

const t = Object.assign((key: string) => key, { rich: (key: string) => key });
vi.mock("next-intl/server", () => ({
  getTranslations: async () => t,
  setRequestLocale: vi.fn(),
}));

const params = Promise.resolve({ locale: "en" });

/** The provider buttons a page renders, in order (WA1 and O02w: Google, then Apple). */
async function providers(page: (props: never) => Promise<ReactNode>) {
  const element = (await page({ params } as never)) as ReactElement<{ children: ReactNode }>;
  return Children.toArray(element.props.children)
    .filter(isValidElement)
    .map((child) => child.type);
}

describe("auth pages", () => {
  it.each([
    ["/login (WA1)", LoginPage],
    ["/signup (O02w)", SignupPage],
  ])("%s offers Google then Apple", async (_name, page) => {
    await expect(providers(page as never)).resolves.toEqual([
      GoogleSignInButton,
      AppleSignInButton,
    ]);
  });
});
