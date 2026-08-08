import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { BadRequestException } from "@/http-exceptions";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// confirmOrderServiceEstimate is the moment a Repair quote becomes real money:
// inspection is done, the workshop names the final, and the line stops holding
// the Order's payment. These tests pin what must land atomically — the final
// price, the confirmation stamp, the who-settled-what log row, the order total
// — and every state that must refuse a confirmation.

type AnyObj = Record<string, unknown>;

interface FakeLine {
  estimate_confirmed_at: Date | null;
  estimated_price: string | null;
  id: number;
  price: string | null;
  status: string;
}

const state = {
  line: undefined as FakeLine | undefined,
  // Simulates losing the race: the line moved between read and write.
  casWins: true,
  serviceWrites: [] as AnyObj[],
  serviceWriteGuard: "",
  orderWrites: [] as AnyObj[],
  logRows: [] as AnyObj[],
};

// The service touches exactly three tables; route writes by shape — the
// service-line CAS chains into .returning(), the order-total write is awaited
// bare, and the only insert is the price log.
const TX = {
  update: (_table: unknown) => ({
    set: (set: AnyObj) => ({
      where: (condition: SQL) => {
        const isServiceWrite = "estimate_confirmed_at" in set;
        if (isServiceWrite) {
          state.serviceWrites.push(set);
          state.serviceWriteGuard = new PgDialect().sqlToQuery(condition).sql;
        } else {
          state.orderWrites.push(set);
        }
        return Object.assign(Promise.resolve([]), {
          returning: () =>
            Promise.resolve(
              state.casWins && state.line
                ? [
                    {
                      id: state.line.id,
                      price: set.price,
                      estimated_price: state.line.estimated_price,
                      estimate_confirmed_at: set.estimate_confirmed_at,
                    },
                  ]
                : []
            ),
        });
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (rows: AnyObj) => {
      state.logRows.push(rows);
      return Promise.resolve();
    },
  }),
};

mock.module("@/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => cb(TX),
  },
}));

// The repository is doubled, not the prepared statement under it — real
// repositories bind their prepared queries to whatever "@/db" existed at
// import time, which in a shared test process is another file's double.
const actualOrderRepository = {
  ...(await import("@/modules/orders/order.repository")),
};

mock.module("@/modules/orders/order.repository", () => ({
  ...actualOrderRepository,
  getOrderServiceOrThrow: (_orderId: number, _serviceId: number) => {
    if (!state.line) {
      throw new BadRequestException("Order service not found for this order");
    }
    return Promise.resolve(state.line);
  },
}));

const { confirmOrderServiceEstimate } = await import(
  "@/modules/orders/order-estimate.service"
);

afterAll(() => {
  mock.module("@/modules/orders/order.repository", () => actualOrderRepository);
});

const WORKER = { id: 7, role: "worker" } as unknown as JWTPayload;

const makeLine = (over: Partial<FakeLine> = {}): FakeLine => ({
  id: 21,
  price: "200000",
  estimated_price: "200000",
  estimate_confirmed_at: null,
  status: "processing",
  ...over,
});

const confirm = (price: number, user: JWTPayload = WORKER) =>
  confirmOrderServiceEstimate({
    orderId: 10,
    serviceId: 21,
    body: { price },
    user,
  });

beforeEach(() => {
  state.line = makeLine();
  state.casWins = true;
  state.serviceWrites = [];
  state.serviceWriteGuard = "";
  state.orderWrites = [];
  state.logRows = [];
});

describe("confirmOrderServiceEstimate", () => {
  it("settles the final, stamps confirmation, and logs who closed the gap", async () => {
    // Bag estimated at 200k; teardown shows a full re-panel — 250k. Any staff
    // may key the final (ADR-0018: not behind the money gate); the price log
    // is the oversight that makes estimate-vs-final-by-user reportable.
    const result = await confirm(250_000);

    expect(result.price).toBe("250000");
    expect(result.estimated_price).toBe("200000");
    expect(result.estimate_confirmed_at).toBeInstanceOf(Date);
    expect(state.logRows).toEqual([
      {
        order_service_id: 21,
        changed_by: 7,
        from_price: "200000",
        to_price: "250000",
      },
    ]);
  });

  it("moves the order total onto the settled number", async () => {
    // The receipt total printed at drop-off was a claim on 200k of repair;
    // once the final is 250k the amount due at the counter must be recomputed
    // from real numbers, not the intake guess.
    await confirm(250_000);

    expect(state.orderWrites).toHaveLength(1);
    expect(state.orderWrites[0]?.updated_by).toBe(7);
  });

  it("keeps the intake number: confirming down to 80k never erases the 200k quote", async () => {
    // ADR-0018 rejected overwrite-on-confirm because it destroys the only
    // evidence of estimate accuracy. estimated_price must ride through.
    const result = await confirm(80_000);

    expect(result.estimated_price).toBe("200000");
    expect(result.price).toBe("80000");
  });

  it("rejects a firm line — there is no estimate to settle", async () => {
    // A firm 300k is the shop's commitment; if inspection disagrees the shop
    // absorbs it. Re-keying it through this door would be a hidden top-up.
    state.line = makeLine({ estimated_price: null });

    const error = await captureRejection(confirm(250_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("This line is not an Estimate");
    expect(state.serviceWrites).toHaveLength(0);
  });

  it("rejects a second confirmation — the number settled once", async () => {
    state.line = makeLine({
      estimate_confirmed_at: new Date("2026-08-02T04:00:00Z"),
    });

    const error = await captureRejection(confirm(300_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Estimate has already been confirmed"
    );
    expect(state.serviceWrites).toHaveLength(0);
  });

  it("rejects confirming a cancelled line — its money already left the order", async () => {
    // Customer heard the quote and walked; the line took the unpaid off-ramp
    // (ADR-0008). Settling a number nobody owes would corrupt the total.
    state.line = makeLine({ status: "cancelled" });

    const error = await captureRejection(confirm(250_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Cannot confirm an Estimate on a cancelled line"
    );
  });

  it("rejects a zero final — 0 means deliberately free, which is a Rework, not a settlement", async () => {
    const error = await captureRejection(confirm(0));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "Final price must be greater than zero"
    );
    expect(state.serviceWrites).toHaveLength(0);
  });

  it("loses the race cleanly when a colleague confirmed first", async () => {
    // Two staff settle the same bag from two phones. The second write finds
    // the confirmation stamp already set and must not double-log or shift the
    // order total twice.
    state.casWins = false;

    const error = await captureRejection(confirm(250_000));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      "This line changed while you were pricing it — it was already confirmed, or cancelled. Refresh and try again."
    );
    expect(state.logRows).toHaveLength(0);
    expect(state.orderWrites).toHaveLength(0);
  });

  it("will not settle a line the counter cancelled while the price was being typed", async () => {
    // The customer hears 250k and declines, so the counter cancels the line —
    // after the workshop already opened the pricing screen. Checking the
    // status only on the way in would let that final land on a line nobody
    // owes and push the amount due back up, so the write itself has to
    // re-check it.
    await confirm(250_000);

    expect(state.serviceWriteGuard).toContain('"status" <>');
    expect(state.serviceWriteGuard).toContain(
      '"estimate_confirmed_at" is null'
    );
  });
});
