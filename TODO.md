# TODO

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
