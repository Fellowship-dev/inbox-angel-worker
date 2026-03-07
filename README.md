# inbox-angel-worker

Cloudflare Workers backend for [InboxAngel](https://github.com/Fellowship-dev/inbox-angel).
Handles inbound email parsing, DMARC aggregate report processing, DNS provisioning, and the API surface consumed by the frontend.

## Relationship to inbox-angel

```
inbox-angel          → marketing site, /check UI, customer dashboard (Next.js, Vercel)
inbox-angel-worker   → this repo: all backend logic (Cloudflare Workers, D1)
```

The frontend calls this worker's API. No business logic lives in the frontend.

---

## Two Core Flows

### 1. Free Check (the hook)

User sends one email → Worker receives it → analyzes headers → sends back a report.

```
User sends email to check@reports.inboxangel.com
  └── Cloudflare Email Worker receives it
        ├── Reads authentication results from headers:
        │   ├── SPF (pass/fail/softfail + which server sent it)
        │   ├── DKIM (pass/fail + signing domain)
        │   └── DMARC (pass/fail + policy in effect)
        ├── Looks up sender's domain DNS records live
        └── Calls outbound email (Workers Email or Resend) → sends report to sender
```

No account required. This is the free sample that converts to paid.

### 2. Paid Monitoring (the product)

Customer configures their DMARC record to report back to InboxAngel. Receiving mail servers worldwide send XML aggregate reports to InboxAngel. Worker parses them, stores in D1, surfaces in dashboard.

```
Customer DNS:
  _dmarc.company.com  TXT  "v=DMARC1; p=none; rua=mailto:abc123@reports.inboxangel.com"

Receiving mail servers → send XML aggregate reports → Cloudflare Email Worker
  └── Worker parses XML
        ├── Extracts: sending IPs, pass/fail rates, policy disposition
        ├── Isolates to customer (by subdomain prefix: abc123)
        └── Stores in D1

Customer dashboard (inbox-angel frontend) → fetches from Worker API → shows trends
```

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Compute | Cloudflare Workers | Edge runtime, zero cold start |
| Inbound email | Cloudflare Email Workers | Receives *.reports.inboxangel.com |
| Outbound email | Cloudflare Workers Email (send_email binding) | For free check reports + alerts |
| Storage | Cloudflare D1 | SQLite at the edge, multi-tenant with customer isolation |
| DNS provisioning | Cloudflare DNS API | Provisions per-customer authorization records |
| Auth | Cloudflare Access | Protects the Worker API for authenticated dashboard calls |
| Frontend | inbox-angel (separate repo) | Calls this Worker's API |

### Why D1 over Turso

D1 is native to Workers — no extra latency, no external dependency, free tier covers early scale.
Turso is the upgrade path if we hit D1's limits (10GB storage, 50M reads/day).

### Cloudflare Access

Cloudflare Access sits in front of the Worker and handles auth via identity providers (Google, GitHub, etc) — no session management code needed in the Worker itself.
For customer-facing routes (dashboard API), Access issues a JWT that the Worker validates.
For the free check (unauthenticated), the route is public.

---

## DNS Provisioning

Each paid customer gets a unique subdomain prefix (e.g. `abc123`). When a customer is provisioned, the DNS API creates:

1. **Email routing address**: `abc123@reports.inboxangel.com` → handled by Email Worker
2. **Third-party reporting authorization record** (RFC 7489 §7.1):
   `company.com._report._dmarc.inboxangel.com TXT "v=DMARC1"`
   Without this, receiving mail servers reject the external RUA address and no reports arrive.

This record must be provisioned *per customer domain*, not once globally.

---

## Multi-Tenancy

All D1 tables include a `customer_id` column. Every Worker query is scoped to the authenticated customer's ID extracted from the Cloudflare Access JWT. No customer can query another's data.

---

## Local Development

```bash
npm install
wrangler dev
```

Requires `wrangler` and a Cloudflare account with D1 and Email Workers enabled.

---

## Related

- [inbox-angel](https://github.com/Fellowship-dev/inbox-angel) — frontend (Next.js, Vercel)
- [RFC 7489](https://datatracker.ietf.org/doc/html/rfc7489) — DMARC specification
- [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
