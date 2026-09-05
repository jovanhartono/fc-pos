import {
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { z } from "zod";

// Indonesian prices are written 1.500 for fifteen hundred: the dot is a
// thousands separator, never a decimal point, and the counter has no sen.
const parseIndonesianCurrency = (formattedValue: string): number =>
  Number(formattedValue.replaceAll(/[^\d]/g, ""));

export const varcharSchema = (field: string, maxLength = 255) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? `${field} is required`
          : `${field} must be a string`,
    })
    .trim()
    .min(1, `${field} cannot be empty`)
    .max(maxLength, `${field} must be at most ${maxLength} characters`);

export const optionalVarcharSchema = (field: string, maxLength = 255) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? `${field} must be a string`
          : `${field} must be a string`,
    })
    .trim()
    .max(maxLength, `${field} must be at most ${maxLength} characters`)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

export const textSchema = (field: string, maxLength = 1000) =>
  z
    .string()
    .trim()
    .max(maxLength, `${field} must be at most ${maxLength} characters`)
    .transform((val) => (val.length === 0 ? null : val));

export const isActiveSchema = z.boolean("Active status must be true or false");

export const currencySchema = (field: string) =>
  z
    .string(`${field} is required!`)
    .min(1, `${field} is required!`)
    .refine((value) => !value.includes("-"), `${field} cannot be negative`)
    .transform(parseIndonesianCurrency);

// The same discount desk runs at drop-off (POST /orders, paid now) and at
// pickup (PATCH /orders/:id/payment) — ADR-0018 resolves discounts at
// whichever of the two is the payment moment. One definition per field keeps
// the two contracts from drifting: both reject a double-ticked campaign and a
// twice-scanned voucher slip instead of quietly deduping one side.
export const campaignIdsSchema = z
  .array(z.number().int().positive())
  .default([])
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Duplicate campaign IDs are not allowed"
  );

// Bearer voucher codes. Normalized to uppercase per element so the whole
// downstream (service claim, repo lookup) receives already-canonical codes.
export const voucherCodesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(32)
      .transform((code) => code.toUpperCase())
  )
  .default([])
  .refine(
    (codes) => new Set(codes).size === codes.length,
    "Duplicate voucher codes are not allowed"
  );

const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const dateStringSchema = (field: string) =>
  z
    .string()
    .regex(DATE_YYYY_MM_DD_REGEX, `${field} must use YYYY-MM-DD format`);

export const phoneSchema = z
  .string("Phone number is required!")
  .min(1, "Phone number is required!")
  .transform((val) => parsePhoneNumberFromString(val)?.number ?? val)
  .pipe(
    z.string().refine(isValidPhoneNumber, { error: "Invalid phone number" })
  );
