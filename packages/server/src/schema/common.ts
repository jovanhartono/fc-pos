import {
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { z } from "zod";
import { getNumericValue } from "@/utils/helper";

export const varcharSchema = (field: string) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? `${field} is required`
          : `${field} must be a string`,
    })
    .trim()
    .min(1, `${field} cannot be empty`)
    .max(255, `${field} must be at most 255 characters`);

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

export const textSchema = (field: string) =>
  z
    .string()
    .trim()
    .max(1000, `${field} must be at most 1000 characters`)
    .transform((val) => (val.length === 0 ? null : val));

export const isActiveSchema = z.boolean("Active status must be true or false");

export const currencySchema = (field: string) =>
  z
    .string(`${field} is required!`)
    .min(1, `${field} is required!`)
    .transform(getNumericValue)
    .transform(Number)
    .pipe(z.number().nonnegative(`${field} cannot be negative`))
    .pipe(z.coerce.string());

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
