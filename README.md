# inbox-angel-worker

Cloudflare Workers backend for [InboxAngel](https://github.com/Fellowship-dev/inbox-angel).
Handles inbound email parsing, DMARC aggregate report processing, DNS provisioning, and the API surface consumed by the frontend.

## Philosophy

Run it yourself or use our hosted service. Either way, your data lives in a database you control and can export at any time. Open source, no lock-in.

---

## Self-hosting

### Step 1 — Deploy

**Option A — one click:**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Fellowship-dev/inbox-angel-worker)

The button provisions the D1 database, runs migrations, prompts for all required secrets (see `.dev.vars.example`), and deploys the Worker in one flow.

**Option B — CLI:**

```bash
npm install && npm install --prefix dashboard
npm run deploy
```

`npm run deploy` runs migrations, builds the dashboard, and deploys the Worker. Set secrets first:

```bash
wrangler secret put API_KEY              # your chosen dashboard password
wrangler secret put CLOUDFLARE_API_TOKEN # Cloudflare token: DNS:Edit + Email Routing Rules:Edit
wrangler secret put REPORTS_DOMAIN       # e.g. reports.yourdomain.com
wrangler secret put FROM_EMAIL           # e.g. noreply@reports.yourdomain.com
wrangler secret put CUSTOMER_DOMAIN      # your domain (e.g. yourdomain.com)
wrangler secret put CUSTOMER_EMAIL       # your email address
wrangler secret put CUSTOMER_NAME        # display name
```

Also update `account_id`, `CLOUDFLARE_ZONE_ID`, and the `routes` pattern in `wrangler.jsonc` with your own values.

---

### Step 2 — Add your first domain

Open your worker URL, enter the `API_KEY` you set above, and add your domain.

On first domain add, the Worker automatically:
- Enables Email Routing on your Cloudflare zone
- Adds MX records for `REPORTS_DOMAIN`
- Sets the catch-all rule: `*@REPORTS_DOMAIN` → this Worker

---

### Step 3 — Update your DMARC record

After adding the domain, the dashboard shows your `rua` address. Append it to your existing DMARC record — don't replace it:

```
_dmarc.yourdomain.com TXT "v=DMARC1; p=none; rua=mailto:<existing>,mailto:rua@reports.yourdomain.com"
```

Reports from receiving mail servers worldwide will start arriving within 24 hours.

---

## Two Core Flows

### 1. Free Check (the hook)

User sends one email → Worker receives it → analyzes headers → result appears in dashboard.

```
User sends email to {token}@reports.yourdomain.com
  └── Cloudflare Email Worker receives it
        ├── Reads authentication results from headers:
        │   ├── SPF (pass/fail/softfail + which server sent it)
        │   ├── DKIM (pass/fail + signing domain)
        │   └── DMARC (pass/fail + policy in effect)
        └── Stores result → dashboard polls and displays report
```

No account required. Generate a check address from the Email check page.

### 2. Domain Monitoring (the product)

Customer configures their DMARC record to report back to InboxAngel. Receiving mail servers worldwide send XML aggregate reports. Worker parses, stores in D1, surfaces in dashboard.

```
Customer DNS:
  _dmarc.company.com  TXT  "v=DMARC1; p=none; rua=mailto:abc123@reports.yourdomain.com"

Receiving mail servers → send XML aggregate reports → Cloudflare Email Worker
  └── Worker parses XML
        ├── Extracts: sending IPs, pass/fail rates, policy disposition
        └── Stores in D1 → dashboard shows trends
```

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Compute | Cloudflare Workers | Edge runtime, zero cold start |
| Inbound email | Cloudflare Email Workers | Receives `*.reports.yourdomain.com` |
| Storage | Cloudflare D1 | SQLite at the edge |
| DNS provisioning | Cloudflare DNS API | Provisions per-customer authorization records |
| Auth | API key (self-hosted) / Auth0 (SaaS) | Pluggable via env vars |
| Frontend | Embedded SPA | Built from `dashboard/`, served as static assets |

---

## Local Development

```bash
npm install
npm install --prefix dashboard
npm run dev:dashboard   # Vite dev server on :5173
wrangler dev            # Worker on :8787
```

---

## DNS Provisioning

Each monitored domain gets a third-party reporting authorization record (RFC 7489 §7.1):

```
company.com._report._dmarc.reports.yourdomain.com  TXT  "v=DMARC1"
```

Without this, receiving mail servers silently reject the external RUA address. The worker provisions it automatically via the Cloudflare DNS API when you add a domain. If your domain is on external DNS, the dashboard shows the record value to add manually.

---

## Related

- [inbox-angel](https://github.com/Fellowship-dev/inbox-angel) — marketing site (Next.js, Vercel)
- [RFC 7489](https://datatracker.ietf.org/doc/html/rfc7489) — DMARC specification
- [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
