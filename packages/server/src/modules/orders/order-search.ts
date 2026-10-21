// All digits is a bare id typed off a screen, since codes start with "#STORE/".
// Ids never start with 0, so "0812…" is a Customer's phone, not Order 812.
const numericSearchRegex = /^[1-9]\d*$/;

// Ids top out here; a longer number is a barcode, and matching it as an id would
// crash the search instead of falling through to the Item code.
const MAX_INT4 = 2_147_483_647;

export function isNumericSearch(search: string): boolean {
  return numericSearchRegex.test(search) && Number(search) <= MAX_INT4;
}
