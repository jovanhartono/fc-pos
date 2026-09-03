import type { ContentfulStatusCode } from "hono/utils/http-status";
import { StatusCodes } from "http-status-codes";

// True when a thrown DB error is a Postgres unique-violation (SQLSTATE 23505).
// The code can sit on the error itself or on `error.cause` depending on the
// driver/wrapper, so both shapes are checked. Used by services that recover
// from a unique race (find-or-create) rather than letting the global onError
// handler map it to a 409.
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { cause } = error as { cause?: unknown };
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return (cause as { code?: string }).code === "23505";
  }
  return "code" in error && (error as { code?: string }).code === "23505";
}

export interface PostgresError {
  code?: string;
  column?: string;
  constraint?: string;
  detail?: string;
}

export interface PostgresFailure {
  message: string;
  status: ContentfulStatusCode;
}

const hasCode = (value: unknown): value is PostgresError =>
  typeof value === "object" && value !== null && "code" in value;

// Reads on `db.query.*` throw the driver error directly while writes arrive
// wrapped, so the code sits on the error itself as often as on its cause.
export function asPostgresError(error: unknown): PostgresError | undefined {
  if (hasCode(error)) {
    return error;
  }
  const cause = (error as { cause?: unknown } | null)?.cause;
  return hasCode(cause) ? cause : undefined;
}

// Dev calls the constraint customers_phone_number_key, production calls it
// customers_phone_number_unique. The same duplicate must read the same at the
// till on either database.
const UNIQUE_SUFFIX = /_(?:key|unique)$/;

const CONSTRAINT_MESSAGES: Partial<Record<string, string>> = {
  customers_email: "A customer with that email already exists",
  customers_phone_number: "A customer with that phone number already exists",
  paid_amount_valid_check: "Payment cannot be more than the order total",
  products_sku: "That SKU is already in use",
  refunded_amount_valid_check: "Refund cannot be more than the amount paid",
  services_code: "That service code is already in use",
  stores_code: "That store code is already in use",
  users_username: "That username is taken",
};

const CODE_FAILURES: Partial<Record<string, PostgresFailure>> = {
  "22P02": {
    message: "That value is not in a valid format",
    status: StatusCodes.BAD_REQUEST,
  },
  "23502": {
    message: "A required field is missing",
    status: StatusCodes.BAD_REQUEST,
  },
  "23503": {
    message: "That record is still linked to another record",
    status: StatusCodes.BAD_REQUEST,
  },
  "23505": {
    message: "That record already exists",
    status: StatusCodes.CONFLICT,
  },
  "23514": {
    message: "That value is not allowed",
    status: StatusCodes.BAD_REQUEST,
  },
};

const UNKNOWN_FAILURE: PostgresFailure = {
  message: "Something went wrong",
  status: StatusCodes.INTERNAL_SERVER_ERROR,
};

export function mapPostgresError({
  code,
  constraint,
}: PostgresError): PostgresFailure {
  const failure = (code ? CODE_FAILURES[code] : undefined) ?? UNKNOWN_FAILURE;
  const named = constraint
    ? CONSTRAINT_MESSAGES[constraint.replace(UNIQUE_SUFFIX, "")]
    : undefined;

  return named ? { message: named, status: failure.status } : failure;
}

// Postgres quotes the data that broke the save — the duplicate phone number, or
// the whole half-typed customer row. Which column clashed is worth keeping in
// the log; whose phone number it was is not.
export const redactDetail = (detail: string): string =>
  detail
    .replaceAll(/[=]\([^)]*\)/g, "=(…)")
    .replaceAll(/contains \([^)]*\)/g, "contains (…)");
