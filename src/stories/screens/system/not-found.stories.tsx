import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SiteHeader } from "@/widgets/site-header";
import { NotFoundState, type RefereePhase } from "@/widgets/system-states";

/*
 * ER2 · web 404 with the production components, composed as
 * app/[locale]/not-found.tsx composes them. Each story freezes one referee
 * phase so it can be compared with NotFoundWeb.dc.html at Desktop · 1440;
 * production runs the live count.
 */
function NotFoundPage({ phase }: { phase: RefereePhase }) {
  return (
    <div className="flex min-h-dvh flex-col bg-system-glow [--glow-x:74%] [--glow-y:46%]">
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <NotFoundState initialPhase={phase} frozen />
      </main>
    </div>
  );
}

const meta = {
  title: "System/Errors/Not Found",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/app/sessions/8812" } },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Count: Story = { render: () => <NotFoundPage phase="count" /> };
export const Knockout: Story = { name: "KO", render: () => <NotFoundPage phase="ko" /> };
export const Saved: Story = { render: () => <NotFoundPage phase="saved" /> };
