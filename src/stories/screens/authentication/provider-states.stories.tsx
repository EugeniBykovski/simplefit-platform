import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import {
  AppleSignInButton,
  AppleSignInView,
  type AppleSignInFailure,
} from "@/features/sign-in-with-apple";
import {
  GoogleSignInButton,
  GoogleSignInView,
  type GoogleSignInFailure,
} from "@/features/sign-in-with-google";

/*
 * Google (SF-22) and Apple (SF-23) states, rendered by the same presentation
 * components the production buttons render (`GoogleSignInView`,
 * `AppleSignInView`) with the state given directly: no provider script, no
 * credential and no network call is ever involved here. The buttons' unit
 * tests drive the same states through stubbed Google Identity Services and
 * Apple JS.
 *
 * Google's own button is rendered by Google into the slot (an empty slot here,
 * never a replica). A cancelled Google or Apple popup is not a state: the
 * control returns to ready and shows nothing. Every failure is retried by using
 * the control again; a script that failed to load needs a page reload, as its
 * message says.
 */
const meta = {
  title: "Authentication/Provider States",
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="flex max-w-110 flex-col gap-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Without provider configuration (no client ID): each control says it is unavailable here. */
export const NotConfigured: Story = {
  render: () => (
    <>
      <GoogleSignInButton />
      <AppleSignInButton />
    </>
  ),
};

/** Loading: Google's slot keeps its 52 px row (WA1) while the script loads; Apple waits disabled. */
export const Loading: Story = {
  render: () => (
    <>
      <GoogleSignInView className="min-h-13" />
      <AppleSignInView ready={false} className="h-13" />
    </>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Continue with Apple" }),
    ).toBeDisabled();
  },
};

/** Ready, and after a cancelled popup: the controls as they were, no message. */
export const ReadyOrCancelled: Story = {
  name: "Ready / cancelled",
  render: () => (
    <>
      <GoogleSignInView className="min-h-13" />
      <AppleSignInView ready className="h-13" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Continue with Apple" })).toBeEnabled();
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

/** Pending: the token is being exchanged for a SimpleFit session. */
export const Pending: Story = {
  render: () => (
    <>
      <GoogleSignInView exchanging className="min-h-13" />
      <AppleSignInView ready busy className="h-13" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("status")).toHaveLength(2);
    await expect(canvas.getByText("Signing you in…")).toBeVisible();
  },
};

function failures(failure: GoogleSignInFailure & AppleSignInFailure): Story {
  return {
    render: () => (
      <>
        <GoogleSignInView failure={failure} className="min-h-13" />
        <AppleSignInView ready failure={failure} className="h-13" />
      </>
    ),
    play: async ({ canvasElement }) => {
      await expect(within(canvasElement).getAllByRole("alert")).toHaveLength(2);
    },
  };
}

/** The API rejected the provider token (`unauthorized`). */
export const Rejected = failures("rejected");

/** Too many attempts (`rate_limited`). */
export const RateLimited = failures("rateLimited");

/** The provider sign-in is temporarily unavailable (`service_unavailable`). */
export const Unavailable = failures("unavailable");

/** The provider script could not load (blocked or offline): a reload is needed. */
export const ScriptFailed = failures("scriptFailed");

/** Any other failure: try again. */
export const GenericError: Story = { ...failures("generic"), name: "Error" };
