# TODO

## Architecture-deepening follow-ups (extracted 2026-06-10, source: docs/architecture-deepening.md)

- [ ] **`push:prod` before next prod deploy** — product-refund schema guards
  (`order_refund_items_line_xor_check` CHECK + `order_refund_items_product_uidx`
  partial unique index) exist only in dev. They are the only concurrency guards
  for product refunds. (§8)
- [ ] **Integration-test DB strategy** — deferred 3× (§1/§4/§5). Status machine
  transitions, pickup transaction, refund caps, campaign loader are DB-touching
  and have no integration coverage.
- [ ] **Web cancel-button gate check** — server now allows cashier/worker to
  cancel unpaid Orders (ADR-0004). Verify whether the UI renders the cancel
  action for those roles; document the alignment either way. (§3)
- [ ] **`adminMiddleware` rename** — JWT-only despite the name. Rename when
  middleware work next touches it. (§3)
- [ ] **Product refund reason/note on order detail** — products relation doesn't
  load `refundItems`; add when someone asks why a product was refunded. (§8)
- [ ] **Products-only unpaid Order can't cancel** — `cancelOrder` throws
  "No cancellable services". Known ADR-0007 gap; fix when such orders appear
  in practice. (§8)

## AWS / CDN follow-ups

- [ ] **Custom domain for CloudFront** — `cdn.fresclean.com`
  - Request ACM cert in `us-east-1` (CloudFront requirement, not `ap-southeast-3`)
  - Validate cert via DNS (CNAME at registrar)
  - Attach cert + alternate domain name to distribution `d3jemt9o5eygkv`
  - Add DNS CNAME: `cdn.fresclean.com` → `d3jemt9o5eygkv.cloudfront.net`
  - Swap `CDN_BASE_URL` in `packages/server/.env` to `https://cdn.fresclean.com`
  - ~20 min total

- [ ] **Billing budget alert** — protect against surprise charges
  - Console → Billing → Budgets → Create budget
  - Monthly cost budget, $10 USD threshold
  - Email alert at 80% actual + 100% forecasted

- [ ] **Enable MFA on AWS root account** — security baseline
  - IAM → Security credentials → Assign MFA device
  - Use authenticator app (1Password, Authy, etc.)

- [ ] **Prod environment separation** — decide strategy
  - Option A: separate bucket + distribution per env (cleanest)
  - Option B: single bucket with `dev/` / `prod/` key prefixes (cheaper, simpler)
  - Recommendation: Option A for prod isolation

