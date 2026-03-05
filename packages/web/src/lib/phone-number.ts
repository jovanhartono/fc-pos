import {
	type CountryCode,
	parsePhoneNumberFromString,
} from "libphonenumber-js";

const DEFAULT_COUNTRY: CountryCode = "ID";

export function isValidPhoneNumber(
	value: string,
	defaultCountry: CountryCode = DEFAULT_COUNTRY,
) {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}

	const parsed = trimmed.startsWith("+")
		? parsePhoneNumberFromString(trimmed)
		: parsePhoneNumberFromString(trimmed, defaultCountry);

	return parsed?.isValid() ?? false;
}

export function normalizePhoneNumber(
	value: string,
	defaultCountry: CountryCode = DEFAULT_COUNTRY,
) {
	const trimmed = value.trim();
	if (!trimmed) {
		return "";
	}

	const parsed = trimmed.startsWith("+")
		? parsePhoneNumberFromString(trimmed)
		: parsePhoneNumberFromString(trimmed, defaultCountry);

	return parsed?.isValid() ? parsed.number : trimmed;
}
