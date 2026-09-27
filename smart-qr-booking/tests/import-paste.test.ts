// Pure tests (no database) for the import page: rows pasted from Excel / Google Sheets
// arrive tab-separated, and dates come in whatever display format the sheet uses.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, importDate } from "../src/lib/admin-ops";

describe("parseCsv: rows pasted from a spreadsheet", () => {
  test("a tab-separated line splits on tabs, so commas stay inside the cell", () => {
    assert.deepEqual(parseCsv("101\tMeera Pillai\t+91 98470 11111\t12/10/2026\t14/10/2026\t2\t1,800"), [
      ["101", "Meera Pillai", "+91 98470 11111", "12/10/2026", "14/10/2026", "2", "1,800"],
    ]);
  });

  test("tab-separated cells are trimmed", () => {
    assert.deepEqual(parseCsv(" 101 \t Meera Pillai \t9847011111 "), [["101", "Meera Pillai", "9847011111"]]);
  });

  test("header row, CRLF line ends and blank / tab-only lines", () => {
    const pasted = "Room\tGuest name\tPhone\r\n\r\n101\tMeera\t9847011111\r\n\t\t\r\n203\tKumar\t9847022222\r\n";
    assert.deepEqual(parseCsv(pasted), [
      ["Room", "Guest name", "Phone"], // importBookings skips a first row with no digits in phone / check-in (a header)
      [""], // blank and tab-only lines come back all-empty, which importBookings skips
      ["101", "Meera", "9847011111"],
      ["", "", ""],
      ["203", "Kumar", "9847022222"],
      [""],
    ]);
  });

  test("comma lines keep the CSV quoting rules", () => {
    assert.deepEqual(parseCsv('101,"Pillai, Meera",9847011111\n102,"say ""hi""", x '), [
      ["101", "Pillai, Meera", "9847011111"],
      ["102", 'say "hi"', "x"],
    ]);
  });

  test("tab lines and comma lines can be mixed", () => {
    assert.deepEqual(parseCsv("101\tA, B\n102,C"), [
      ["101", "A, B"],
      ["102", "C"],
    ]);
  });
});

describe("importDate: spreadsheet date formats (day first, 4-digit year)", () => {
  for (const v of ["12/10/2026", "12-10-2026", "2026-10-12", "12-Oct-2026", "12 Oct 2026", "2026/10/12", " 12 october 2026 "]) {
    test(`"${v}" -> 2026-10-12`, () => assert.equal(importDate(v), "2026-10-12"));
  }

  for (const v of ["12/10/26", "12-Oct-26", "12 Oct 26", "12/10/1999", "12/10/2126", "31/02/2026", "", "soon"]) {
    test(`"${v}" is rejected`, () => assert.equal(importDate(v), null));
  }
});
