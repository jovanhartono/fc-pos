import type { Context } from "hono";
import { StatusCodes } from "http-status-codes";
import { failure } from "@/utils/http";

export const getNumericValue = (formattedValue: string): string => {
  return formattedValue.replaceAll(/[^\d]/g, "");
};

export function notFoundOrFirst<T>(
  rows: T[],
  c: Context,
  notFoundMessage = "Record does not exist"
) {
  if (rows.length === 0) {
    return c.json(failure(notFoundMessage), StatusCodes.NOT_FOUND);
  }
  return rows[0];
}
