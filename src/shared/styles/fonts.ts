import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";

/*
 * Brand typefaces (all SIL OFL), self-hosted by next/font at build time.
 * Latin-ext and Cyrillic cover every supported locale (pl, de, uk, ru, ...).
 *   Unbounded       numbers, timers, headlines   (font-display, type-display/h1/h2)
 *   Manrope         interface and body copy      (font-sans, default)
 *   JetBrains Mono  labels, metadata, kickers    (font-mono, type-label)
 */
const unbounded = Unbounded({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-unbounded",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/** CSS variables for all brand fonts; put on <html>. */
export const fontVariables = `${unbounded.variable} ${manrope.variable} ${jetbrainsMono.variable}`;
