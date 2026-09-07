import { triggerDownload } from "@/lib/download";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const QUOTE_REQUIRED = /[",\n]/;

export function escapeCsv(value: string | number | null | undefined): string {
	if (value === null || value === undefined) {
		return "";
	}
	const str = String(value);
	const needsFormulaGuard = FORMULA_PREFIX.test(str);
	const needsQuote = QUOTE_REQUIRED.test(str) || needsFormulaGuard;
	if (needsQuote) {
		const escaped = str.replace(/"/g, '""');
		return needsFormulaGuard ? `"'${escaped}"` : `"${escaped}"`;
	}
	return str;
}

export function downloadCsv(filename: string, csv: string): void {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	triggerDownload(url, filename);
	URL.revokeObjectURL(url);
}

export function csvFilename(
	scope: string,
	from: string,
	to: string,
	storeId: number | null | undefined,
): string {
	const store = storeId ? `store-${storeId}` : "all-stores";
	if (from === to) {
		return `fresclean-${scope}-${from}-${store}.csv`;
	}
	return `fresclean-${scope}-${from}_to_${to}-${store}.csv`;
}
