/**
 * SPX9's MVP sections this client can show from real data (SF-118), as the
 * settings page's `?section=` query state. Plain module: the server page reads
 * the section from the URL before the client renders it.
 */
export const SETTINGS_SECTIONS = [
  "organization",
  "contact",
  "members",
  "application",
  "account",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The `?section=` of the URL, or the first section for anything else. */
export function settingsSection(value: string | string[] | undefined): SettingsSection {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? "organization";
}
