// The web forms both format-as-you-type and re-validate on submit, so both
// need the parser the server stores with, not a second one that could drift
// and accept a number the API then rejects.
import {
  type CountryCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";

export const DEFAULT_PHONE_COUNTRY: CountryCode = "ID";

export function isValidPhoneNumber(
  value: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY
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
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY
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
