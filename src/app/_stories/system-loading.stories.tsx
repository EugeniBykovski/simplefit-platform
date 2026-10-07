import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { WorkspaceShell } from "@/widgets/workspace-shell";
import { ApplicationSkeleton, LaunchScreen } from "@/widgets/system-states";

/*
 * SF-34 system states, rendered with the production components exactly as
 * the boundaries compose them (RequireSession's pending state; a sidebar
 * shell's loading.tsx). Compare at Desktop · 1440 against Claude Design
 * LoadingWebLaunch.dc.html (LD3) and LoadingWeb.dc.html (LD4). No artificial
 * delay: a story simply renders the state.
 */
const desktop = { viewport: { value: "desktop", isRotated: false } };

export const Launch: StoryObj = {
  name: "Launch",
  render: () => <LaunchScreen />,
  parameters: { layout: "fullscreen" },
  globals: desktop,
};

export const ApplicationSkeletonInShell: StoryObj = {
  name: "Application Skeleton",
  render: () => (
    <WorkspaceShell shell="web.app.fighter">
      <ApplicationSkeleton />
    </WorkspaceShell>
  ),
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/app/home" } },
  },
  globals: desktop,
};

export default {
  title: "System/Loading",
} satisfies Meta;
