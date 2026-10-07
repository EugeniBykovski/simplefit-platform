/**
 * Coordination between the tabs of this origin (browser only).
 *
 * Both helpers degrade safely: without Web Locks the task runs at once (only
 * the caller's own in-tab coordination applies), and without
 * BroadcastChannel there is simply no channel.
 */

/** Runs `task` while holding the exclusive Web Lock `name`, shared by every tab of the origin. */
export function withTabLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks === undefined || typeof locks.request !== "function") return task();
  return locks.request(name, { mode: "exclusive" }, task);
}

export type TabChannel = {
  post(message: unknown): void;
  close(): void;
};

/**
 * Opens the BroadcastChannel `name`. `onMessage` receives what the other tabs
 * post (never this tab's own messages) as untrusted data to be validated.
 */
export function openTabChannel(
  name: string,
  onMessage: (message: unknown) => void,
): TabChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  const channel = new BroadcastChannel(name);
  channel.onmessage = (event: MessageEvent<unknown>) => onMessage(event.data);
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}
