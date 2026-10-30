/**
 * What the browser checks about a chosen member list before the backend
 * reads it (SF-95 `previewGymMemberImport` limits): usability only. The
 * backend alone parses, validates and classifies the rows; this never reads
 * past the header and never decides what a row is.
 */

/** The backend's limits (`SimpleFit.Gyms.Csv`): 1 MB, 1,000 rows, 30 columns, 500 bytes a field. */
export const CSV_LIMITS = { maxBytes: 1_000_000, maxRows: 1_000, maxColumns: 30, maxField: 500 };

export type FileProblem = "type" | "empty" | "tooLarge" | "encoding" | "columns" | "header";

export type ReadFile =
  { ok: true; text: string; header: string[] } | { ok: false; problem: FileProblem };

const TEXT_TYPES = new Set(["text/csv", "text/plain", "text/tab-separated-values", ""]);
const EXTENSIONS = /\.(csv|tsv|txt)$/i;

/** `accept` for the file input: CSV and its plain-text relatives. */
export const CSV_ACCEPT = ".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values";

/**
 * Reads a chosen file as UTF-8 text and its header row. The text stays with
 * the caller only for the preview it asked for; nothing here keeps it.
 */
export async function readCsvFile(file: File): Promise<ReadFile> {
  if (!EXTENSIONS.test(file.name) && !TEXT_TYPES.has(file.type)) return fail("type");
  if (file.size === 0) return fail("empty");
  if (file.size > CSV_LIMITS.maxBytes) return fail("tooLarge");

  let text: string;
  try {
    // `fatal`: a file that is not UTF-8 is refused here, as the backend would.
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return fail("encoding");
  }
  if (text.trim() === "") return fail("empty");

  const header = headerOf(text);
  if (header.length > CSV_LIMITS.maxColumns) return fail("columns");
  // Every column needs a distinct, non-blank name to be chosen (the backend refuses others too).
  const names = header.map((name) => name.toLowerCase());
  if (names.some((name) => name === "") || new Set(names).size !== names.length) {
    return fail("header");
  }
  return { ok: true, text, header };
}

const fail = (problem: FileProblem): ReadFile => ({ ok: false, problem });

/**
 * The header row's column names, for the mapping controls only: the first
 * non-blank record, split by the delimiter most frequent on the file's
 * first line (`,`, `;` or tab, as the backend picks it), honouring quotes,
 * trimmed.
 */
export function headerOf(text: string): string[] {
  const start = text.search(/\S/);
  if (start < 0) return [];
  const body = text.slice(start);
  const delimiter = delimiterOf(text);
  const names: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      names.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") break;
    else field += char;
  }
  names.push(field.trim());
  return names;
}

function delimiterOf(text: string): string {
  const line = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const counts = new Map([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ",";
  for (const [char, count] of counts) if (count > (counts.get(best) ?? 0)) best = char;
  return best;
}
