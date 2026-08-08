import { Hono } from "hono";
import { UnauthorizedException } from "@/http-exceptions";
import { sweepOrphanedOrderPhotos } from "@/modules/orders/order-photo-sweep.service";
import { success } from "@/utils/http";

// Endpoints only the scheduler calls. Not under /admin: the caller is a cron job holding a shared
// secret, not a signed-in member of staff.
//
// A GET that deletes, because a GET is the only thing Vercel's scheduler issues. Harmless to
// repeat — a second run finds nothing left to take.
const app = new Hono().get("/photo-sweep", async (c) => {
  const secret = process.env.CRON_SECRET;
  // No secret configured means nobody can run this, deliberately: an open sweep endpoint could
  // be pointed at the shop's dispute evidence.
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) {
    throw new UnauthorizedException();
  }

  const result = await sweepOrphanedOrderPhotos();
  // Vercel's cron history keeps the status code, not the body. Without this the count is lost.
  console.info(
    `photo-sweep: deleted ${result.deleted} of ${result.scanned} scanned`
  );

  return c.json(success(result));
});

export default app;
