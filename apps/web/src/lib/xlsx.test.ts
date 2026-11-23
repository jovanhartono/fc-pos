import { describe, expect, test } from "bun:test";

import { strFromU8, unzipSync } from "fflate";

import { buildXlsx } from "@/lib/xlsx";

const unzip = async (file: Blob) =>
  unzipSync(new Uint8Array(await file.arrayBuffer()));

const readSheet = async (rows: string[][]) => {
  const parts = await unzip(buildXlsx(rows, [14, 14]));
  return strFromU8(parts["xl/worksheets/sheet1.xml"]);
};

describe("buildXlsx", () => {
  test("holds the parts Excel needs to open the file", async () => {
    const file = buildXlsx([["A"]], [10]);
    expect(file.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(Object.keys(await unzip(file)).toSorted()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  test("writes a code that looks like a number as text", async () => {
    expect(await readSheet([["234E5678"]])).toContain(
      '<c r="A1" t="inlineStr"><is><t>234E5678</t></is></c>'
    );
  });

  test("leaves an empty value as a blank cell", async () => {
    const sheet = await readSheet([["GA52Q665", ""]]);
    expect(sheet).toContain('<row r="1"><c r="A1" t="inlineStr">');
    expect(sheet).not.toContain('r="B1"');
  });

  test("escapes characters that would break the file", async () => {
    expect(await readSheet([["A&B<C>"]])).toContain("<t>A&amp;B&lt;C&gt;</t>");
  });
});
