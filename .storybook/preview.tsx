import type { Preview } from "@storybook/nextjs-vite";
import { withThemeByClassName } from "@storybook/addon-themes";

import { fontVariables } from "@/shared/styles/fonts";
import { Toaster } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";

// The application's global stylesheet: Tailwind, tokens.css and theme.css.
import "../src/app/globals.css";

// The same brand fonts the root layout puts on <html> (next/font, self-hosted).
document.documentElement.classList.add(...fontVariables.split(" "));

/*
 * QA viewports for the web. They are inspection tools, not canonical
 * responsive designs: Claude Design draws only 390 pt mobile and 1440 px web
 * frames (docs/design-handoff.md §11).
 */
const viewports = {
  phone: { name: "Phone web · 390", styles: { width: "390px", height: "844px" } },
  narrow: { name: "Narrow web · 320", styles: { width: "320px", height: "640px" } },
  tablet: { name: "Tablet · 768", styles: { width: "768px", height: "1024px" } },
  desktop: { name: "Desktop · 1440", styles: { width: "1440px", height: "900px" } },
};

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    viewport: { options: viewports },
    // Supplemental accessibility checks (axe). The primitives' own tests and
    // the token contrast tests stay authoritative.
    // `region` is off: an isolated story is not a page, so landmark checks
    // belong to the application, not the component workshop.
    a11y: { test: "error", config: { rules: [{ id: "region", enabled: false }] } },
    // The page background is the theme's own `background` token.
    backgrounds: { disable: true },
    options: {
      storySort: {
        order: [
          "Foundations",
          ["Colors", "Typography", "Spacing", "Radius", "Icons"],
          "Components",
        ],
      },
    },
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
        <Toaster />
      </TooltipProvider>
    ),
    // Same class model as production (next-themes sets `dark`/`light` on
    // <html>); dark is the canonical Claude Design reference.
    withThemeByClassName({
      themes: { Dark: "dark", Light: "light" },
      defaultTheme: "Dark",
      parentSelector: "html",
    }),
  ],
  tags: ["autodocs"],
};

export default preview;
