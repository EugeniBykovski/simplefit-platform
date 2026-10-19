/*
 * Legal text from the backend's registry (SF-72, ADR 0022), as plain data:
 * the Markdown subset the registry allows (`#`/`##`/`###` headings,
 * paragraphs, `-` lists), never HTML, links or anything executable. The text
 * is shown exactly as approved; only the `{coach}` and `{version}`
 * placeholders are filled in.
 */
export type LegalBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export function parseLegalText(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    if (list !== null) blocks.push({ kind: "list", items: list });
    paragraph = [];
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (line === "") {
      flush();
    } else if (heading?.[1] && heading[2]) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
    } else if (item?.[1]) {
      if (paragraph.length > 0) flush();
      list = [...(list ?? []), item[1]];
    } else {
      if (list !== null) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Fills `{coach}` and `{version}` (and nothing else) in an approved text. */
export function fillLegalPlaceholders(
  text: string,
  values: { coach?: string; version?: string },
): string {
  return text.replace(/\{(coach|version)\}/g, (match, key: "coach" | "version") =>
    values[key] === undefined ? match : (values[key] as string),
  );
}
