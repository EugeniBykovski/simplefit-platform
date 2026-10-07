/**
 * Inline text action of the auth and site copy ("Sign in", "Send a new
 * code"): highlight olive, 800, lighter on hover, the focus ring on keyboard
 * focus. For a `Link` or a `button` inside running text.
 */
export const textLinkClass =
  "rounded-xs font-extrabold text-highlight outline-none transition-colors hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";
