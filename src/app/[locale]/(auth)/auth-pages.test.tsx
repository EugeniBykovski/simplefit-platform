import { screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/shared/i18n/messages";
import type { Locale } from "@/shared/i18n/routing";
import { renderWithProviders } from "@/test/render";

import LoginPage from "./login/page";
import SignupAccountPage from "./signup/account/page";
import SignupPage from "./signup/page";

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
    createTranslator({
      locale,
      messages: await loadMessages(locale),
      namespace: namespace as never,
    }),
}));

vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

// The real provider buttons have their own tests; here they only mark their place.
vi.mock("@/features/sign-in-with-google", () => ({
  GoogleSignInButton: () => <button type="button">Google</button>,
}));
vi.mock("@/features/sign-in-with-apple", () => ({
  AppleSignInButton: () => <button type="button">Apple</button>,
}));

type Page = (props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<ReactElement>;

async function renderPage(page: Page, query: Record<string, string> = {}, locale: Locale = "en") {
  const element = await page({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(query),
  });
  return renderWithProviders(element, { locale });
}

const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

describe("WA1 /login", () => {
  it("offers Google, Apple, then the email sign-in code", async () => {
    await renderPage(LoginPage as Page);

    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    const order = ["Google", "Apple", "Email me a sign-in code"].map((name) =>
      screen.getByRole("button", { name }),
    );
    for (const [before, after] of [order.slice(0, 2), order.slice(1, 3)]) {
      expect(
        before!.compareDocumentPosition(after!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
  });

  it("exposes no password, recovery or sponsor sign-in", async () => {
    await renderPage(LoginPage as Page);

    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByText(/password\?|recover|forgot/i)).not.toBeInTheDocument();
    expect(hrefs()).not.toContain("/sponsor/login");
  });

  it("carries a valid returnTo to sign-up and drops an unsafe one", async () => {
    const { unmount } = await renderPage(LoginPage as Page, { returnTo: "/app/messages" });
    expect(hrefs()).toContain("/signup?returnTo=%2Fapp%2Fmessages");
    unmount();

    await renderPage(LoginPage as Page, { returnTo: "//evil.example" });
    expect(hrefs()).toContain("/signup");
    expect(hrefs().some((href) => href?.includes("evil"))).toBe(false);
  });
});

describe("O02w /signup", () => {
  it("offers Google, Apple and email, with the approved static legal line", async () => {
    await renderPage(SignupPage as Page);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Join the boxing community.",
    );
    expect(screen.getByRole("link", { name: "Continue with Email" })).toHaveAttribute(
      "href",
      "/signup/account",
    );
    expect(
      screen.getByText(/By continuing you accept the Terms and Privacy Policy/),
    ).toBeInTheDocument();
  });

  it("describes the roles without letting one be chosen or stored", async () => {
    await renderPage(SignupPage as Page);

    const roles = screen.getByRole("region", { name: "How will you use SimpleFit?" });
    expect(within(roles).getAllByRole("listitem")).toHaveLength(4);
    expect(within(roles).queryAllByRole("link")).toEqual([]);
    expect(within(roles).queryAllByRole("button")).toEqual([]);
    expect(within(roles).queryAllByRole("radio")).toEqual([]);
  });
});

describe("WA3 /signup/account", () => {
  it("asks for the email address only: no name, role, consent or birth date controls", async () => {
    await renderPage(SignupAccountPage as Page);

    expect(
      screen.getByRole("heading", { level: 1, name: "Create your SimpleFit account" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(screen.queryAllByRole("tab")).toEqual([]);
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it.each(["ru", "de", "es-MX"] as const)("is translated in %s", async (locale) => {
    await renderPage(SignupAccountPage as Page, {}, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(
      "Create your SimpleFit account",
    );
  });
});
