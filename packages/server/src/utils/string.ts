// "BUDI SANTOSO" and "budi santoso" are stored as "Budi Santoso" when a
// Customer is saved (ADR-0011).
export const toTitleCase = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/(^|\s)\p{L}/gu, (segment) => segment.toUpperCase());
