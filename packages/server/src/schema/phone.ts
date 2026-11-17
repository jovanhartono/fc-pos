// The web forms both format-as-you-type and re-validate on submit, so both
// need the parser the server stores with, not a second one that could drift
// and accept a number the API then rejects.
import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

export const DEFAULT_PHONE_COUNTRY: CountryCode = "ID";

export const isValidPhoneNumber = (
  value: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY
) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const parsed = trimmed.startsWith("+")
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, defaultCountry);

  return parsed?.isValid() ?? false;
};

// A cashier types the start of a number the way it is said, 0812 or 0812-34,
// while stored numbers read +62812…. Search boxes match on this instead, so the
// first few digits are enough to find the customer.
const PHONE_SEPARATORS = /[\s-]/gu;
const LOCAL_PHONE_DIGITS = /^0\d+$/u;

export const toStoredPhonePrefix = (
  value: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY
) => {
  const digits = value.replaceAll(PHONE_SEPARATORS, "");
  return LOCAL_PHONE_DIGITS.test(digits)
    ? `+${getCountryCallingCode(defaultCountry)}${digits.slice(1)}`
    : value;
};

export const normalizePhoneNumber = (
  value: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY
) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = trimmed.startsWith("+")
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, defaultCountry);

  return parsed?.isValid() ? parsed.number : trimmed;
};
