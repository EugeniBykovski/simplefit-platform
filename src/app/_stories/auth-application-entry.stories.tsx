import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ApiError } from "@/shared/api/http/api-error";
import { FailureView, LaunchScreen } from "@/widgets/system-states";

/*
 * What application entry shows around authentication (SF-24, SF-45): the
 * launch screen while the session is restored (refresh, then GET /api/me)
 * and the entry resolved (GET /api/v1/me/entry), and the retryable failure
 * state while either cannot complete (network or server failure: never a
 * sign-out). The redirect to the resolved destination has no screen of its
 * own.
 */
export default {
  title: "Authentication/Application Entry",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export const Restoring: StoryObj = { render: () => <LaunchScreen /> };

export const UnavailableOffline: StoryObj = {
  name: "Unavailable · offline",
  render: () => (
    <div className="flex min-h-dvh flex-col">
      <FailureView error={new TypeError("Failed to fetch")} onRetry={() => undefined} />
    </div>
  ),
};

export const UnavailableServer: StoryObj = {
  name: "Unavailable · server",
  render: () => (
    <div className="flex min-h-dvh flex-col">
      <FailureView
        error={new ApiError(503, "service_unavailable", "storybook", {}, null)}
        onRetry={() => undefined}
      />
    </div>
  ),
};
