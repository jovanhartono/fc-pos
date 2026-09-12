// An all-digits query is a bare id typed straight off a screen or ticket —
// order codes and item codes always carry the "#STORE/" prefix, so digits
// alone can't be a code prefix. Both order search and the queue search use
// this to decide whether to also match order/line ids exactly.
const numericSearchRegex = /^\d+$/;

// Postgres' int4 columns (order and line ids) top out here; a longer
// all-digit string is a barcode, not an id, and casting it would 500 instead
// of falling through to the item-code lookup.
const MAX_INT4 = 2_147_483_647;

export function isNumericSearch(search: string): boolean {
  return numericSearchRegex.test(search) && Number(search) <= MAX_INT4;
}
