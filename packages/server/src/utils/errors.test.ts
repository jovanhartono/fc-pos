import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { JwtVariables } from "hono/jwt";
import { StatusCodes } from "http-status-codes";
import type { JWTPayload } from "@/types/jwt";
import { errorHandler } from "@/utils/error-handler";
import { mapPostgresError, redactDetail } from "@/utils/errors";

const PHONE = "+628123456789";

describe("mapPostgresError", () => {
  it("tells the counter the customer is already on file without printing the other customer's number", () => {
    // Two branches take the same walk-in on the same day. Postgres reports the
    // clash by quoting the number it found, and that number belongs to whoever
    // registered first — it must not reach the screen of whoever tried second.
    const { message, status } = mapPostgresError({
      code: "23505",
      constraint: "customers_phone_number_unique",
      detail: `Key (phone_number)=(${PHONE}) already exists.`,
    });

    expect(message).toBe("A customer with that phone number already exists");
    expect(message).not.toContain(PHONE);
    expect(status).toBe(StatusCodes.CONFLICT);
  });

  it("says the same thing whether the shop is on the dev or the production database", () => {
    // Dev names the constraint customers_phone_number_key, production names it
    // customers_phone_number_unique — both databases are live.
    const { message } = mapPostgresError({
      code: "23505",
      constraint: "customers_phone_number_key",
    });

    expect(message).toBe("A customer with that phone number already exists");
  });

  it("names the mistake when a refund is written for more than the customer paid", () => {
    const { message, status } = mapPostgresError({
      code: "23514",
      constraint: "refunded_amount_valid_check",
      detail: `Failing row contains (91, ORD-0007, 1, 2, 50000, 80000, Budi Santoso, ${PHONE}).`,
    });

    expect(message).toBe("Refund cannot be more than the amount paid");
    expect(message).not.toContain("Budi Santoso");
    expect(status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("keeps the half-typed order off the screen when a required field was left blank", () => {
    const { message, status } = mapPostgresError({
      code: "23502",
      detail: `Failing row contains (91, ORD-0007, null, Budi Santoso, ${PHONE}).`,
    });

    expect(message).toBe("A required field is missing");
    expect(message).not.toContain("Budi Santoso");
    expect(status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("stays quiet about a database failure nobody has mapped", () => {
    const { message, status } = mapPostgresError({
      code: "40001",
      detail: `Key (phone_number)=(${PHONE}) already exists.`,
    });

    expect(message).toBe("Something went wrong");
    expect(message).not.toContain(PHONE);
    expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });
});

describe("redactDetail", () => {
  it("keeps which column clashed and drops whose number it was", () => {
    expect(redactDetail(`Key (phone_number)=(${PHONE}) already exists.`)).toBe(
      "Key (phone_number)=(…) already exists."
    );
  });

  it("drops the whole customer row Postgres echoes back on a rejected save", () => {
    const redacted = redactDetail(
      `Failing row contains (91, Budi Santoso, ${PHONE}, budi@example.com).`
    );

    expect(redacted).toBe("Failing row contains (…).");
    expect(redacted).not.toContain(PHONE);
    expect(redacted).not.toContain("Budi Santoso");
  });
});

const respondTo = async (thrown: unknown) => {
  const app = new Hono<{ Variables: JwtVariables<JWTPayload> }>().get(
    "/boom",
    () => {
      throw thrown;
    }
  );
  app.onError(errorHandler);

  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const response = await app.request("/boom");
    return { body: await response.text(), logged, status: response.status };
  } finally {
    console.error = original;
  }
};

describe("errorHandler", () => {
  it("does not hand a customer's number back when their record already exists", async () => {
    // The leak this guards: Postgres puts the conflicting value in `detail`, and
    // the dashboard renders whatever message it gets straight into a toast.
    const { body, logged, status } = await respondTo(
      Object.assign(
        new Error("duplicate key value violates unique constraint"),
        {
          code: "23505",
          constraint: "customers_phone_number_unique",
          detail: `Key (phone_number)=(${PHONE}) already exists.`,
        }
      )
    );

    expect(status).toBe(StatusCodes.CONFLICT);
    expect(body).not.toContain(PHONE);
    expect(body).toContain("A customer with that phone number already exists");
    // Redacted, but still says which column clashed — otherwise closing the leak
    // would leave nobody able to diagnose it.
    expect(JSON.stringify(logged)).toContain("phone_number");
    expect(JSON.stringify(logged)).not.toContain(PHONE);
  });

  it("reads a failed lookup as a database error even though the driver throws it bare", async () => {
    // Reads on db.query.* throw the driver error directly instead of wrapping
    // it, so a handler that only inspects `cause` maps none of them.
    const { body, status } = await respondTo(
      Object.assign(new Error("invalid input syntax for type integer"), {
        code: "22P02",
      })
    );

    expect(status).toBe(StatusCodes.BAD_REQUEST);
    expect(body).toContain("That value is not in a valid format");
    expect(body).not.toContain("invalid input syntax");
  });

  it("does not echo the whole submitted row back when the database connection drops mid-save", async () => {
    // Drizzle builds its message from the query and every bound parameter, so
    // this is the shape a thawed container produces on the first write — and on
    // POST /admin/users those parameters include the new password hash.
    const { body, status } = await respondTo(
      new Error(
        'Failed query: insert into "customers" ("name", "phone_number") values ($1, $2)\n' +
          `params: Ibu Ani Wijaya,${PHONE}`
      )
    );

    expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(body).not.toContain(PHONE);
    expect(body).not.toContain("Ibu Ani Wijaya");
    expect(body).not.toContain("insert into");
    expect(body).toContain("Something went wrong");
  });

  it("keeps a rejected order's reason but not the record attached to it", async () => {
    const { body, status } = await respondTo(
      new HTTPException(StatusCodes.CONFLICT, {
        cause: {
          code: "23505",
          detail: `Key (phone_number)=(${PHONE}) already exists.`,
        },
        message: "Order already cancelled",
      })
    );

    expect(status).toBe(StatusCodes.CONFLICT);
    expect(body).toContain("Order already cancelled");
    expect(body).not.toContain(PHONE);
  });
});
