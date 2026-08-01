// An all-digits query is a bare id typed straight off a screen or ticket —
// order codes and item codes always carry the "#STORE/" prefix, so digits
// alone can't be a code prefix. Both order search and the queue search use
// this to decide whether to also match order/line ids exactly.
const numericSearchRegex = /^\d+$/;

export function isNumericSearch(search: string): boolean {
  return numericSearchRegex.test(search);
}
