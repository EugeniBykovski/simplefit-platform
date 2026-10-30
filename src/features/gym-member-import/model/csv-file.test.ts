import { describe, expect, it } from "vitest";

import { CSV_LIMITS, headerOf, readCsvFile } from "./csv-file";

/*
 * The browser's checks before a member list goes to the backend (SF-96):
 * usability only, never row parsing or classification.
 */

const file = (content: BlobPart, name = "members.csv", type = "text/csv") =>
  new File([content], name, { type });

describe("readCsvFile", () => {
  it("reads UTF-8 text and only its header row", async () => {
    const read = await readCsvFile(file('Imię i nazwisko;"E-mail";Karnet\nAnna;a@x.pl;Open\n'));
    expect(read).toEqual({
      ok: true,
      text: 'Imię i nazwisko;"E-mail";Karnet\nAnna;a@x.pl;Open\n',
      header: ["Imię i nazwisko", "E-mail", "Karnet"],
    });
  });

  it("refuses what the backend would refuse before sending anything", async () => {
    expect(await readCsvFile(file("", "empty.csv"))).toEqual({ ok: false, problem: "empty" });
    expect(await readCsvFile(file("   \n\n"))).toEqual({ ok: false, problem: "empty" });
    expect(await readCsvFile(file("email\n", "list.xlsx", "application/vnd.ms-excel"))).toEqual({
      ok: false,
      problem: "type",
    });
    expect(await readCsvFile(file("email\n" + "a".repeat(CSV_LIMITS.maxBytes)))).toEqual({
      ok: false,
      problem: "tooLarge",
    });
    expect(await readCsvFile(file(new Uint8Array([0x65, 0x6d, 0xff, 0xfe, 0x0a])))).toEqual({
      ok: false,
      problem: "encoding",
    });
    const wide = Array.from({ length: CSV_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`).join(",");
    expect(await readCsvFile(file(`${wide}\n`))).toEqual({ ok: false, problem: "columns" });
    expect(await readCsvFile(file("email,,name\n"))).toEqual({ ok: false, problem: "header" });
    expect(await readCsvFile(file("Email,email\n"))).toEqual({ ok: false, problem: "header" });
  });
});

describe("headerOf", () => {
  it("picks the delimiter the backend picks and honours quotes", () => {
    expect(headerOf("a,b;c\n")).toEqual(["a", "b;c"]);
    expect(headerOf("a;b;c,d\n")).toEqual(["a", "b", "c,d"]);
    expect(headerOf("name\temail\n")).toEqual(["name", "email"]);
    expect(headerOf('"full, name",email\r\nx,y')).toEqual(["full, name", "email"]);
    expect(headerOf('"say ""hi""",b\n')).toEqual(['say "hi"', "b"]);
  });
});
