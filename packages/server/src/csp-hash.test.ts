import { expect, it } from "bun:test";

// The dark-mode script in the web app's index.html runs only if vercel.json's
// CSP names its exact hash; an edit to one without the other opens dark phones
// on white.
it("pins the web app's inline script hash in the CSP", async () => {
  const repo = new URL("../../../", import.meta.url);
  const html = await Bun.file(new URL("apps/web/index.html", repo)).text();
  const vercel = await Bun.file(new URL("vercel.json", repo)).text();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? ""
  );

  expect(scripts).toHaveLength(1);
  const hash = new Bun.CryptoHasher("sha256")
    .update(scripts[0] ?? "")
    .digest("base64");
  expect(vercel).toContain(`'sha256-${hash}'`);
});
