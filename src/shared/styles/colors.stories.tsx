import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";

import spec from "../../../docs/design-tokens.json";

/*
 * Semantic colour roles of the production contract (docs/design-tokens.json).
 * Swatches read the live CSS custom properties from tokens.css, so the values
 * shown are exactly what the active theme renders; nothing is restated here.
 */
const groups: { title: string; tokens: string[]; text?: boolean }[] = [
  {
    title: "Surfaces",
    tokens: ["background", "surface", "surface-subtle", "surface-elevated", "muted"],
  },
  {
    title: "Text",
    tokens: [
      "foreground",
      "muted-foreground",
      "faint-foreground",
      "highlight",
      "accent-foreground",
      "accent-muted-foreground",
    ],
    text: true,
  },
  { title: "Borders and focus", tokens: ["border", "border-strong", "input", "ring"] },
  {
    title: "Action and selection",
    tokens: [
      "primary",
      "primary-muted",
      "secondary",
      "highlight",
      "accent",
      "accent-strong",
      "accent-border",
    ],
  },
  {
    title: "Status",
    tokens: [
      "success",
      "success-subtle",
      "success-border",
      "warning",
      "warning-subtle",
      "warning-border",
      "destructive",
      "destructive-subtle",
      "destructive-border",
      "info",
      "info-subtle",
      "info-border",
    ],
  },
];

const purpose: Record<string, string> = {
  "muted-foreground": "Secondary text",
  "faint-foreground": "Tertiary text, metadata",
  highlight: "Olive text, links, kickers, emphasis fills",
  "primary-muted": "Outline borders, progress mid-steps",
  "accent-border": "Border of olive-tinted surfaces",
  "border-strong": "Strong dividers, handles",
};

function useResolved(token: string) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const read = () =>
      setValue(getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim());
    read();
    // Theme switches toggle a class on <html>.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [token]);
  return value;
}

function Swatch({ token, text }: { token: string; text?: boolean }) {
  const value = useResolved(token);
  const theme = document.documentElement.classList.contains("light") ? "light" : "dark";
  const paletteName = (spec.semantic[theme] as Record<string, string>)[token];
  return (
    <li className="flex items-center gap-3">
      {text ? (
        // Runtime token being documented (documented gallery exception).
        <span className="w-14 text-center type-title" style={{ color: `var(--${token})` }}>
          Aa
        </span>
      ) : (
        <span
          className="block size-14 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: `var(--${token})` }}
        />
      )}
      <span className="flex flex-col">
        <code className="type-body-sm font-bold">{token}</code>
        <span className="type-caption text-muted-foreground">
          {paletteName} · {value}
        </span>
        {purpose[token] ? (
          <span className="type-caption text-faint-foreground">{purpose[token]}</span>
        ) : null}
      </span>
    </li>
  );
}

function Colors() {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 className="type-label text-faint-foreground">{group.title}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.tokens.map((token) => (
              <Swatch key={token} token={token} text={group.text} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: "Foundations/Colors",
  component: Colors,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Colors>;

export default meta;

export const SemanticRoles: StoryObj<typeof meta> = {};
