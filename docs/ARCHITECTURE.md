# Nutbox — Architecture

*Engineering plan, reviewed in the gstack `/plan-eng-review` style: scope challenge → architecture → data model → failure modes → test plan.*

## 0. Scope challenge

**Problem:** one business, one physical stock of loose nuts, two ways to sell it — retail packs to consumers (GST-inclusive MRP, prepaid/COD) and bulk bags to businesses (GST-exclusive tier prices, MOQs, quotes, credit terms). Competitors run these on two systems and reconcile by hand.

**Essential complexity:** shared gram-denominated stock, concurrency-safe reservations, GST split by place of supply, FEFO lots for food shelf-life rules.
**Accidental complexity we refuse:** microservices, a separate B2B app, a generic rules engine, multi-currency, multi-warehouse routing (schema-ready only).

**Innovation tokens spent (max 3):** (1) gram-pool inventory with variant components. That's it. Everything else is boring: Next.js App Router, server actions, Drizzle ORM, PostgreSQL.

## 1. System overview

```
                  ┌──────────────────────── Next.js 15 (one deployable) ────────────────────────┐
 Shopper ───────▶ │  Retail store  /  /shop  /p/[slug]  /cart  /checkout  /account             │
 Business buyer ─▶ │  Wholesale     /wholesale (quick-order)  /wholesale/cart  /wholesale/checkout│
 Staff ─────────▶ │  Admin         /admin/*  (dashboard, orders, products, inventory, B2B, GST)  │
                  │                                                                             │
                  │  middleware.ts ── JWT session (jose) ── role gates: ADMIN/STAFF, approved B2B│
                  │                                                                             │
                  │  lib/ (domain, pure + transactional)                                        │
                  │   pricing.ts   retail price | wholesale tier → unit price                   │
                  │   tax.ts       GST: inclusive/exclusive, CGST+SGST vs IGST, rounding         │
                  │   inventory.ts reserve / release / fulfil (FEFO) / receive / adjust / return│
                  │   orders.ts    place order, quote → order, ship, cancel, mark paid           │
                  │   gstin.ts     format + mod-36 checksum + state codes                        │
                  │   razorpay.ts  order create + HMAC verify (demo mode without keys)           │
                  └───────────────────────────────┬─────────────────────────────────────────────┘
                                                  │ Drizzle ORM (SELECT … FOR UPDATE)
                                          ┌───────▼────────┐
                                          │  PostgreSQL 16 │  CHECK (reserved <= on_hand), ledger
                                          └────────────────┘
```

## 2. The shared inventory model

```
 Product "Cashew W240"                      InventoryItem "CASHEW-W240-BULK"  (uom = GRAM)
   ├─ Variant 250 g pouch   ──requires 250 g──┐        │
   ├─ Variant 500 g pouch   ──requires 500 g──┤        ├─ InventoryLevel @ Main WH: onHand 300,000 g · reserved 12,500 g
   ├─ Variant 1 kg pouch    ──requires 1000 g─┤        │
   ├─ Variant 10 kg tin  (B2B) ─ 10,000 g ────┤        └─ Lots (FEFO): L-2610-01 exp 2027-04 · 120 kg
   └─ Variant 25 kg bag  (B2B) ─ 25,000 g ────┘                         L-2610-07 exp 2027-05 · 180 kg

 Combo "Diwali Box"  ──requires 250 g almond + 250 g cashew + 200 g raisin  (3 components)
```

`available(variant) = min over components ⌊(onHand − reserved) / requiredQty⌋`

### Quantity lifecycle (Shopify semantics: available → committed → shipped)
```
                place order / approve quote            ship (invoice issued)
  available ──────────────────────────────▶ reserved ─────────────────────────▶ onHand ↓ (FEFO lots ↓)
      ▲                                         │
      └──────────── cancel (release) ◀──────────┘
  receive stock (new lot)  → onHand ↑            adjust / wastage → onHand ± (lot-level)
  return to origin (RTO)   → onHand ↑ back into the exact lots that were shipped
```
Quotes reserve nothing until approved — they're priced drafts, as in Shopify B2B "submit for review".

Every change writes an immutable `StockMovement` row: `deltaOnHand`, `deltaReserved`, `onHandAfter`, `reservedAfter`, reason, lot, reference (order id), actor.

### Concurrency
```
BEGIN
  SELECT id,"onHand",reserved FROM "InventoryLevel"
   WHERE "itemId" = ANY($items) AND "locationId" = $loc
   ORDER BY id FOR UPDATE;            -- sorted lock order ⇒ no deadlocks (Saleor pattern)
  -- check onHand - reserved >= need for every item, else ROLLBACK with OutOfStock(names)
  UPDATE … SET reserved = reserved + need;
  INSERT Reservation, StockMovement …
COMMIT
```
Database guard (migration SQL): `CHECK ("onHand" >= 0 AND reserved >= 0 AND reserved <= "onHand")`, `CHECK ("qtyOnHand" >= 0)` on lots.

## 3. Pricing

| Channel | Price stored | Tax treatment | Quantity rules |
|---|---|---|---|
| Retail | `Variant.retailPricePaise` (sale), `mrpPaise` | **inclusive** (back-calc ÷ 1.05) | 1…10 per line |
| Wholesale | `Variant.wholesaleBasePaise` + company **PriceList** (% adjustment + volume `PriceBreak`s) | **exclusive** (GST added) | `wholesaleMinQty`, `wholesaleStep` |

Wholesale resolution (Shopify catalog semantics): best `PriceBreak` with `minQty ≤ qty` in the company's price list → else base × (1 + adjustment%). Fixed breaks beat the % adjustment.

## 4. GST

- Place of supply = **ship-to state**. Same as warehouse state (Settings) → CGST + SGST (tax split, odd paisa to SGST); else IGST.
- Computed **per line**, then summed; shipping/freight is a composite supply taxed at the principal (max line) rate.
- Coupon discounts are allocated pro-rata to lines **before** tax (largest-remainder so paise reconcile exactly).
- **Invoice number is issued at shipment** (time of supply for goods), format `NB/2627/00001` (≤16 chars), sequential per financial year via an atomic counter row.
- Orders ≥ ₹50,000 to another state are flagged "E-way bill required" in admin.

## 5. Order state machine

```
 status:       QUOTE ──approve──▶ OPEN ──archive──▶ ARCHIVED
                 │                 │
                 └──decline──▶ CANCELLED ◀──cancel (if unshipped)──┘
 payment:      PENDING ─▶ PAID ─▶ REFUNDED        (COD / net terms / bank stay PENDING until marked)
 fulfillment:  UNFULFILLED ─ship─▶ SHIPPED ─▶ DELIVERED
                                       └──return (RTO)──▶ RETURNED (restock to original lots)
```
Transitions are guarded with `updateMany({ where: { id, status: <expected> } })` so double-clicks and concurrent staff can't double-apply.

## 6. Data model (Drizzle, abridged — src/db/schema.ts)

`User` (role CUSTOMER | STAFF | ADMIN, optional `companyId`) · `Company` (GSTIN, state, status PENDING/APPROVED/REJECTED/SUSPENDED, `priceListId`, payment terms, credit limit) · `Address` · `Category` · `Product` (variety, grade, origin, processing, HSN, GST bps, FSSAI facts) · `Variant` (pack size, channel flags, prices, MOQ/step) · `VariantComponent` (variant ↔ inventory item, `requiredQty`) · `InventoryItem` (GRAM | UNIT) · `Location` · `InventoryLevel` · `Lot` · `Reservation` · `StockMovement` · `PriceList` · `PriceBreak` · `Order` · `OrderLine` (price/tax snapshot) · `OrderEvent` (timeline) · `Coupon` · `Setting` (singleton) · `InvoiceCounter`.

Money is integer **paise**; weights integer **grams**; GST rates integer **basis points** (500 = 5%).

## 7. Security (gstack `/cso` pass)

- Sessions: HS256 JWT in `httpOnly`, `sameSite=lax`, `secure` (prod) cookie; `AUTH_SECRET` required in production. Passwords bcrypt (cost 10).
- Authorization enforced **server-side in every action/page** (`requireAdmin`, `requireApprovedWholesale`, owner check on orders/invoices), middleware is only a first gate.
- All inputs validated with zod; Drizzle parameterises every query; raw SQL fragments use tagged templates only.
- Prices, tax and stock are **always recomputed on the server** at checkout — cart cookies carry only `{variantId, qty}`.
- Razorpay: verify HMAC against the **server-stored** order id with `timingSafeEqual`; demo payment path disabled when `NODE_ENV=production` unless `PAYMENTS_DEMO=1`.
- No card data stored. Marketing consent unticked by default (DPDP).

## 8. Failure modes

| Failure | Handling |
|---|---|
| Two buyers race for the last 25 kg | Row locks + check; loser gets "Only X kg left" and nothing is reserved |
| Payment fails after reservation | Order stays PENDING/OPEN; admin cancel releases stock; (later: TTL job) |
| Staff double-clicks "Ship" | Guarded status transition; second click is a no-op |
| Lots don't cover a shipment (legacy stock) | Remainder shipped un-lotted, ledger row records `lotId = null` — visible in audit |
| GST rate changes | Rate lives on Product; order lines snapshot rate at purchase |
| Wholesale buyer exceeds credit | Net-terms checkout rejected with outstanding & limit shown |

## 9. Test plan

```
 lib/tax.ts         inclusive back-calc · exclusive add-on · CGST/SGST split odd paise · discount allocation sums
 lib/gstin.ts       valid checksum · bad checksum · bad state code · lowercase input
 lib/pricing.ts     % adjustment · volume break beats adjustment · MOQ/step validation
 lib/inventory.ts   (Postgres) 30 concurrent orders on 10 kg ⇒ never oversold, ledger sums to level
                    fulfil consumes FEFO lots · cancel releases · RTO restocks original lots
 e2e (browser)      retail checkout COD · wholesale quote → admin approve → ship → invoice · same stock pool
```
