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

// Endpoints only the scheduler calls. Not under /admin: the caller is a cron job holding a shared
// secret, not a signed-in member of staff.
//
// A GET that deletes, because a GET is the only thing Vercel's scheduler issues. Harmless to
// repeat — a second run finds nothing left to take.
const app = new Hono()
  .get("/photo-sweep", async (c) => {
    // An open sweep endpoint could be pointed at the shop's dispute evidence.
    assertCronCaller(c.req.header("authorization"));

    const result = await sweepOrphanedOrderPhotos();
    // Vercel's cron history keeps the status code, not the body. Without this the count is lost.
    console.info(
      `photo-sweep: deleted ${result.deleted} of ${result.scanned} scanned`
    );

    return c.json(success(result));
  })
  // Closes yesterday's forgotten clock-outs so nobody arrives to find they
  // cannot start. Safe to repeat: a second run finds every row already closed.
  .get("/close-open-shifts", async (c) => {
    assertCronCaller(c.req.header("authorization"));

    const result = await closeForgottenShifts();
    console.info(
      `close-open-shifts: closed ${result.closed} at ${result.cutoff.toISOString()}`
    );

    return c.json(success(result));
  });

export default app;
