const TABS = ["accounts", "fighters", "coaches"] as const;

/** AD7's tab from the URL, only if it's one of the explorer's tabs (SF-123). Server-safe. */
export function parseTab(value: unknown): (typeof TABS)[number] | null {
  return TABS.find((tab) => tab === value) ?? null;
}
