import { describe, expect, it } from "bun:test";
import app from "@/app";

app.post("/clock-out", (c) => c.text("ok"));

const post = (headers: Record<string, string>) =>
  app.request("https://pos.fresclean.id/api/clock-out", {
    method: "POST",
    headers,
  });

// A page on another fresclean.id host could post a plain form here, and the
// browser would attach the cashier's sign-in cookie to it.
describe("posting from outside the POS", () => {
  it("refuses a form from another fresclean.id host", async () => {
    const res = await post({
      origin: "https://cdn.fresclean.id",
      "sec-fetch-site": "same-site",
    });
    expect(res.status).toBe(403);
  });

  it("lets the POS itself post with no body", async () => {
    const res = await post({ "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(200);
  });

  it("lets local Vite post to the API on its own port", async () => {
    const res = await post({
      origin: "http://localhost:5173",
      "sec-fetch-site": "same-site",
    });
    expect(res.status).toBe(200);
  });
});
