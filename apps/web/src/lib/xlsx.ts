import { strToU8, zipSync } from "fflate";

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const PKG_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const OOXML_TYPE = "application/vnd.openxmlformats-officedocument";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

// Every cell is written as text, so Excel never turns a code like 234E5678
// into a number. Up to 26 columns (A–Z).
export const buildXlsx = (rows: string[][], widths: number[]): Blob => {
  const cols = widths
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
    )
    .join("");
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) =>
          value === ""
            ? ""
            : `<c r="${String.fromCodePoint(65 + c)}${r + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
        )
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  const zip = zipSync({
    "[Content_Types].xml": strToU8(
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="${OOXML_TYPE}.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${OOXML_TYPE}.spreadsheetml.worksheet+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `${HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${DOC_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${DOC_REL_NS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
    ),
    "xl/workbook.xml": strToU8(
      `${HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_REL_NS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `${HEAD}<worksheet xmlns="${MAIN_NS}"><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`
    ),
  });
  return new Blob([zip as Uint8Array<ArrayBuffer>], {
    type: `${OOXML_TYPE}.spreadsheetml.sheet`,
  });
};
