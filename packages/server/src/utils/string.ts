// Capitalize the first letter of each whitespace-separated word and lowercase
// the rest, so stored names are consistent regardless of how they were typed
// ("budi santoso" / "BUDI SANTOSO" -> "Budi Santoso"). Applied at the customer
// insert boundary — see ADR-0011.
export const toTitleCase = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/(^|\s)\p{L}/gu, (segment) => segment.toUpperCase());
