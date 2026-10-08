import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BellIcon, CheckIcon, ChevronRightIcon, PlusIcon, TimerIcon, XIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";

/*
 * Production icon conventions (docs/design-handoff.md §8.2): Lucide is the
 * only interface icon set, chosen by meaning. Icons are decorative
 * (`aria-hidden`); the accessible name comes from text or the control's label.
 * Colour comes from semantic text tokens, never from the icon.
 */
function Icons() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="type-label text-faint-foreground">Sizes (stroke 2)</h2>
        <div className="flex items-end gap-6 text-foreground">
          <TimerIcon aria-hidden className="size-4" />
          <TimerIcon aria-hidden className="size-4.5" />
          <TimerIcon aria-hidden className="size-5" />
          <TimerIcon aria-hidden className="size-6" />
        </div>
        <p className="type-caption text-muted-foreground">
          16 inside buttons and menus · 18 in rows and fields · 20–24 standalone
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="type-label text-faint-foreground">Colour follows the text role</h2>
        <div className="flex gap-6">
          <BellIcon aria-hidden className="size-5 text-foreground" />
          <BellIcon aria-hidden className="size-5 text-muted-foreground" />
          <BellIcon aria-hidden className="size-5 text-faint-foreground" />
          <BellIcon aria-hidden className="size-5 text-highlight" />
          <BellIcon aria-hidden className="size-5 text-warning" />
          <BellIcon aria-hidden className="size-5 text-destructive" />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="type-label text-faint-foreground">Accessible composition</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <PlusIcon aria-hidden /> Add session
          </Button>
          <Button variant="quiet" size="icon" aria-label="Close">
            <XIcon aria-hidden />
          </Button>
          <span className="inline-flex items-center gap-1.5 type-body-sm">
            <CheckIcon aria-hidden className="size-4 text-highlight" /> Defense
          </span>
          <span className="inline-flex items-center gap-1 type-body-sm text-highlight">
            Details <ChevronRightIcon aria-hidden className="size-4" />
          </span>
        </div>
        <p className="type-caption text-muted-foreground">
          Text glyphs in artboards (✓ ✕ →) become Lucide Check, X and ArrowRight/ChevronRight.
        </p>
      </section>
    </div>
  );
}

const meta = {
  title: "Foundations/Icons",
  component: Icons,
} satisfies Meta<typeof Icons>;

export default meta;

export const LucideConventions: StoryObj<typeof meta> = {};
