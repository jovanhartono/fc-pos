import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { JwtVariables } from "hono/jwt";
import { StatusCodes } from "http-status-codes";
import type { JWTPayload } from "@/types/jwt";
import { failure } from "@/utils/http";
import {
  asPostgresError,
  mapPostgresError,
  redactDetail,
} from "@/utils/pg-error";

export const errorHandler: ErrorHandler<{
  Variables: JwtVariables<JWTPayload>;
}> = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json(failure(err.message), err.status);
  }

  const request = {
    method: c.req.method,
    path: c.req.path,
    userId: c.get("jwtPayload")?.id,
  };

  const dbError = asPostgresError(err);
  if (dbError) {
    console.error("database error", {
      ...request,
      code: dbError.code,
      column: dbError.column,
      constraint: dbError.constraint,
      detail: dbError.detail ? redactDetail(dbError.detail) : undefined,
    });

    const { message, status } = mapPostgresError(dbError);
    return c.json(failure(message), status);
  }

  // Drizzle builds its message from the failed query and every bound parameter,
  // so a dropped connection during a customer save would otherwise hand the
  // whole submitted row — or a new user's password hash — back to the browser.
  console.error("unhandled error", request, err);
  return c.json(
    failure("Something went wrong"),
    StatusCodes.INTERNAL_SERVER_ERROR
  );
};
