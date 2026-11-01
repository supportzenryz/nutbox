# Nutbox

Shopify-style commerce for an Indian nuts & dry fruits business: a **retail store**, a **wholesale (B2B) portal** and an **admin**, all selling from **one shared inventory**.

The core idea: loose stock is counted in grams. 300 kg of W240 cashews is one pool, and a 250 g retail pouch, a 25 kg wholesale bag and a gift box all reserve from that same pool. Nothing is pre-split per channel, so nothing is stranded.

- Research behind the design: [`docs/RESEARCH.md`](docs/RESEARCH.md) (competitor teardown, Shopify/Medusa/Saleor reverse-engineering, GST 2.0, FSSAI, Legal Metrology)
- Engineering plan: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## What's in it

| Area | Features |
|---|---|
| **Retail store** | Rate board home, filters by aisle / grade / country of origin (Legal Metrology 6(10A)), pack-size PDP with ₹/kg, MRP, FSSAI + nutrition block, cart, coupons, free-delivery threshold, COD (capped) or Razorpay, GST-inclusive pricing, order tracking, printable tax invoice |
| **Wholesale portal** | GSTIN application (format + mod-36 checksum + state match), admin approval, quick-order sheet with price ladders, MOQ & step rules, tier price lists with volume breaks, GST-exclusive pricing, freight per kg, **request a quote** or order on credit (Net 7/15/30 with credit limit) or bank transfer |
| **Shared inventory** | Gram pools with lots & best-before dates, row-locked reservations (no overselling), FEFO picking at shipment, receive / count / wastage, return-to-origin restocks exact lots, immutable ledger, low-stock & near-expiry alerts, combos drawing from several pools |
| **Admin** | Dashboard (sales by channel, needs-action queue), orders & quotes (negotiate prices, approve, record payment, ship + invoice, deliver, cancel, RTO), products & pack sizes, inventory, wholesale accounts, price lists, discount codes, GSTR-1 report + CSV, settings, staff vs admin roles |
| **GST** | CGST+SGST vs IGST by ship-to state, inclusive back-calculation for B2C, exclusive for B2B, freight as composite supply, Rule 46 invoice with HSN summary, sequential per-FY invoice numbers issued at shipment, e-way bill flag (> ₹50k inter-state) |

## Stack

Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL 16 · Drizzle ORM · Tailwind CSS · jose sessions · Vitest

## Run it locally

```bash
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET
createdb nutbox
npm install
npm run db:migrate
npm run db:seed                 # catalog, stock lots, demo accounts and orders
npm run dev                     # http://localhost:3000
```

Demo accounts (seeded):

| Role | Email | Password |
|---|---|---|
| Admin | admin@nutbox.in | admin123 |
| Staff | packing@nutbox.in | staff123 |
| Retail customer | priya@example.com | customer123 |
| Wholesale buyer (approved, Net 15) | orders@sksweets.in | wholesale123 |
| Wholesale applicant (pending) | purchase@saravanaresidency.in | wholesale123 |

Without Razorpay keys, online payment runs in **demo mode** (a "confirm demo payment" step). It's disabled in production unless `PAYMENTS_DEMO=1`.

## Deploy

Firebase App Hosting (app) + Neon (PostgreSQL) + Cloudflare (DNS/domain). Step-by-step: [`docs/DEPLOY.md`](docs/DEPLOY.md).

- `apphosting.yaml` — App Hosting runtime size and secret wiring
- `.github/workflows/database.yml` — runs migrations on Neon (and the one-time production seed)
- `SEED_MODE=production npm run db:seed` loads catalog + one admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), no stock and no demo accounts; it refuses to run over a database with real orders

## Tests

```bash
npm test          # GST engine, GSTIN, pricing + Postgres integration tests
```

The integration suite creates `nutbox_test` and checks, among other things, that 30 concurrent checkouts for the last 12 kg produce exactly 12 orders, that shipping consumes lots first-expiry-first-out, and that the ledger always replays to the stock level.

## Going live checklist

- [ ] Follow [`docs/DEPLOY.md`](docs/DEPLOY.md)
- [ ] Real GSTIN, FSSAI licence, legal name, address and bank details in **Admin → Settings** (seed values are placeholders)
- [ ] `AUTH_SECRET` (32+ random chars), Razorpay keys and webhook secret → point the webhook at `/api/razorpay/webhook`
- [ ] Verify HSN codes and GST rates with your CA (makhana and gift hampers in particular)
- [ ] Add: login rate-limiting, password reset, order emails/WhatsApp, Shiprocket/Delhivery integration, GSTIN live-verification API, e-invoice (IRN) once AATO > ₹5 cr

## Working on this repo with gstack

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted work — see `CLAUDE.md`.
