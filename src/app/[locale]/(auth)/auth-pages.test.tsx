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

  it("role cards carry the explicit journey as an ephemeral intent, never a role", async () => {
    await renderPage(SignupPage as Page, { returnTo: "/app/messages" });

    const roles = screen.getByRole("region", { name: "How will you use SimpleFit?" });
    const links = within(roles).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/signup/account?returnTo=%2Fapp%2Fmessages&intent=fighter",
      "/signup/account?returnTo=%2Fapp%2Fmessages&intent=coach",
      "/signup/account?returnTo=%2Fapp%2Fmessages&intent=gym",
      "/partners/apply",
    ]);
    expect(links.every((link) => !link.getAttribute("href")?.includes("role"))).toBe(true);
    expect(within(roles).queryAllByRole("radio")).toEqual([]);
  });

  it("without an intent, email and sign-in carry none: generic sign-up never means Fighter", async () => {
    await renderPage(SignupPage as Page);
    expect(screen.getByRole("link", { name: "Continue with Email" })).toHaveAttribute(
      "href",
      "/signup/account",
    );
    expect(hrefs().filter((href) => href?.includes("intent="))).toEqual([
      "/signup/account?intent=fighter",
      "/signup/account?intent=coach",
      "/signup/account?intent=gym",
    ]);
  });

  it("keeps an allowed intent from the URL across a refresh and drops any other", async () => {
    const { unmount } = await renderPage(SignupPage as Page, { intent: "fighter" });
    expect(screen.getByRole("link", { name: "Continue with Email" })).toHaveAttribute(
      "href",
      "/signup/account?intent=fighter",
    );
    expect(hrefs()).toContain("/login?intent=fighter");
    unmount();

    await renderPage(SignupPage as Page, { intent: "admin" });
    expect(screen.getByRole("link", { name: "Continue with Email" })).toHaveAttribute(
      "href",
      "/signup/account",
    );
    expect(hrefs().some((href) => href?.includes("admin"))).toBe(false);
  });
});

describe("WA3 /signup/account", () => {
  it("submits the email only: role, name and consents are rendered disabled and never checked", async () => {
    await renderPage(SignupAccountPage as Page);

    expect(
      screen.getByRole("heading", { level: 1, name: "Create your SimpleFit account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeEnabled();
    expect(screen.getByLabelText("Full name")).toBeDisabled();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
      expect(checkbox).not.toBeChecked();
    }
    const roles = screen.getByRole("radiogroup", { name: "Signing up as" });
    expect(roles).toHaveAttribute("aria-disabled", "true");
    // Without an intent nothing is selected: no role is implied.
    expect(
      within(roles)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-checked")),
    ).toEqual(["false", "false", "false"]);
    // No invented explanatory copy (WA3 draws none).
    expect(
      screen.queryByText("Role, name and consents are set after you verify your email."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("shows the journey chosen on O02w, as presentation only", async () => {
    await renderPage(SignupAccountPage as Page, { intent: "coach" });
    const roles = screen.getByRole("radiogroup", { name: "Signing up as" });
    expect(within(roles).getByRole("radio", { name: "Coach" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(roles).toHaveAttribute("aria-disabled", "true");
    expect(hrefs()).toContain("/login?intent=coach");
  });

  it.each(["ru", "de", "es-MX"] as const)("is translated in %s", async (locale) => {
    await renderPage(SignupAccountPage as Page, {}, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(
      "Create your SimpleFit account",
    );
  });
});
