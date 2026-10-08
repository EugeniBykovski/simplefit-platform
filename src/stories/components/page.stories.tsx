import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Container } from "@/shared/ui/container";
import { PageContent } from "@/shared/ui/page";

/*
 * PageContent (SF-42): how a page sits in its frame's `main`. The frame here
 * is a stand-in of SiteFrame's `main` (a column filling the space between a
 * 76 px header and a 190 px footer); "Public Website/Shell" shows it in the
 * real frame.
 */
const meta = {
  title: "Components/Page Content",
  component: PageContent,
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta<typeof PageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ align, rows }: { align: "center" | "top" | "full-bleed"; rows: number }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="h-19 flex-none border-b" />
      <main className="flex flex-1 flex-col bg-surface">
        <PageContent align={align} className="border-y border-dashed border-highlight">
          <Container className="flex flex-col gap-4 py-14">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="h-16 rounded-xl bg-surface-elevated" />
            ))}
          </Container>
        </PageContent>
      </main>
      <div className="h-47.5 flex-none border-t bg-surface-sunken" />
    </div>
  );
}

/** Short: centred in `main`, equal space above and below. */
export const Center: Story = { render: () => <Frame align="center" rows={3} /> };

/** Taller than `main`: no centring, the composition flows from the top and pushes the footer down. */
export const CenterOverflowing: Story = { render: () => <Frame align="center" rows={14} /> };

/** A designed page composition at the top of `main`. */
export const Top: Story = { render: () => <Frame align="top" rows={3} /> };

/** Fills `main` in both directions. */
export const FullBleed: Story = { render: () => <Frame align="full-bleed" rows={3} /> };
