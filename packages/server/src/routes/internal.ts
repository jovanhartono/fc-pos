import { Hono } from "hono";
import { UnauthorizedException } from "@/http-exceptions";
import { sweepOrphanedOrderPhotos } from "@/modules/orders/order-photo-sweep.service";
import { closeForgottenShifts } from "@/modules/shifts/shift.service";
import { success } from "@/utils/http";

function assertCronCaller(authorization?: string) {
  const secret = process.env.CRON_SECRET;
  // No secret configured means nobody can run these, deliberately.
  if (!secret || authorization !== `Bearer ${secret}`) {
    throw new UnauthorizedException();
  }
}

// Called by Vercel's scheduler with a shared secret, not by signed-in staff, so not under /admin.
// A GET that deletes because a GET is all the scheduler sends; a repeat finds nothing to take.
const app = new Hono()
  .get("/photo-sweep", async (c) => {
    // An open sweep endpoint could be pointed at the shop's dispute evidence.
    assertCronCaller(c.req.header("authorization"));

    const result = await sweepOrphanedOrderPhotos();
    // Vercel's cron history keeps the status code, not the body. Without this the count is lost.
    console.info(
      `photo-sweep: deleted ${result.deleted} of ${result.scanned} scanned (${process.env.VERCEL_REGION})`
    );

    return c.json(success(result));
  })
  // Auto-closes yesterday's open Shifts so nobody arrives to find they
  // cannot start. Safe to repeat: a second run finds every row already closed.
  .get("/close-open-shifts", async (c) => {
    assertCronCaller(c.req.header("authorization"));

    const result = await closeForgottenShifts();
    console.info(
      `close-open-shifts: closed ${result.closed} at ${result.cutoff.toISOString()} (${process.env.VERCEL_REGION})`
    );

    return c.json(success(result));
  });

export default app;
