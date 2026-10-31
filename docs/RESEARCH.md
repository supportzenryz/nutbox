# Nutbox — Research Report

*Compiled 31 Oct 2026. Four research tracks: Indian dry-fruit storefront teardown, Shopify admin & B2B reverse-engineering, open-source commerce data models (Medusa v2, Saleor, Bagisto), and Indian compliance/payments/shipping. Items marked **[VERIFY]** should be confirmed with a CA or lawyer before launch.*

> **About morluto/rea.** The repo referenced in the brief is **REA – "Reverse Engineer Anything"**, an MCP server + CLI that inspects binaries, Electron apps and website JS bundles (Ghidra, Frida, JADX…). It is a *method*, not an admin template. We applied the same approach to the public surface of competitor stores (Shopify's public `products.json` / `search/suggest.json` endpoints, page structure) and to the source code of open-source commerce engines, then built our own implementation. No third-party code was copied.

---

## 1. Executive summary

1. **Every D2C dry-fruit brand we checked runs retail on Shopify** (Happilo, Nutraj, Farmley, Nourish You) and **runs wholesale on a separate system** (Nutraj → wholesale.nutraj.com, likely Rupyz SaaS; Happilo → a quote form; Udaan/Jumbotail → custom). Nobody shares one live inventory between retail and B2B. **That is Nutbox's wedge.**
2. **The right inventory model for loose nuts is a gram-denominated stock pool per product-grade**, with each sellable pack consuming `packSizeGrams`. 300 kg of W240 cashews then sells as 250 g pouches *and* 25 kg wholesale bags with zero stranded stock. (Medusa's `required_quantity` link proves the pattern.)
3. **GST 2.0 (22 Sep 2025) moved all dry-fruit headings to 5%** — 0801, 0802, 0804, 0806, 0813, 2008. Rates still live in a table, not code.
4. **Shopify leaves India-specific work to apps** (split CGST/SGST lines, GST invoices, GSTIN capture, COD rules). Nutbox builds these in.
5. **New since mid-2026:** Legal Metrology Rule 6(10A) requires a searchable **country-of-origin filter** for imported packaged goods sold online (from 1 Jul 2026). Our storefront has it.

---

## 2. Competitor teardown (Indian dry-fruit e-commerce)

### 2.1 Catalog structure
| Brand | Categories | How grade is shown | Weights / packs |
|---|---|---|---|
| Happilo | Gifting, Combos, Nuts, Dry Fruits, Seeds, Makhana, Trail Mixes, Bulk Order | Origin/size words in title (Jumbo, Californian, Kashmiri, Afghani, Mamra) | 55 g → 1.5 kg; jars ("1000 g + 200 g free") |
| Nutraj | Nuts, Dried fruits, Dates, Seeds, Berries, Mixes, Spices, Gifting, "Anmol Jumbo" premium | In title: W180/W240/W320, California/Mamra/Sonora | 100 g–1 kg, multipacks ("500 g × 2"), tins, gift boxes |
| Farmley | Date bites, Makhana, Dry fruits & mixes, Seeds & berries, Combos | Title | 200 g–1 kg |
| Dry Fruit House | Nuts, Dates, Berries, Seeds, Gift boxes | Title | — |

**Takeaway:** *product = variety + grade + origin + processing* (raw / roasted & salted); *variant = weight × pack count*. **No competitor offers a grade filter** — an easy differentiator.

### 2.2 Retail price benchmarks (₹/kg, derived from listed sale prices, Oct 2026)
| Product | Observed ₹/kg |
|---|---|
| Cashew W320 | 1,128–1,335 |
| Cashew W240 | ~1,476 |
| Cashew W180 | ~2,018 |
| Almond California | 1,128–1,549 |
| Almond Mamra | ~6,778 |
| Pistachio roasted & salted | 1,232–1,764 |
| Walnut kernels | 1,538–2,104 |
| Raisins (round / black) | 730–1,025 |
| Dates (Kimia / Medjool) | 670 / 2,646 |
| Figs (anjeer) | ~1,558 |
| Seeds (pumpkin/chia) | ~995 |

**Wholesale reference (IndiaMART):** W240 cashew ₹830–910/kg in 10 kg tins; California almond ~₹690–700/kg in 25 kg sacks → **retail ≈ 1.5–1.8× wholesale**. Smaller packs carry a 15–30% per-kg premium over 1 kg. Seed data in Nutbox uses these ratios.

### 2.3 Storefront features observed
- Free-shipping thresholds ₹499 (Happilo) to ₹1,499 (Nutraj).
- COD shown on PDP (Nutraj). Pincode "Check delivery" button.
- Spend-based coupons (Farmley: SAVER8 above ₹899, SAVER10 above ₹1,500, DIWALI15 above ₹3,499).
- Reward points (Nutraj, Nourish You). Reviews everywhere.
- **Price per 100 g, nutrition per 100 g, shelf life, FSSAI licence, country of origin on PDP** (Nutraj) — these are also legal requirements (§5).
- Combos and Diwali gift boxes in budget tiers; "Pack of 10" gift-box variant used as lightweight corporate gifting.
- **No working subscriptions anywhere** — open opportunity.

### 2.4 Wholesale / B2B practices
- **Buyers:** HORECA, bakeries, sweet shops, caterers, kirana, corporate pantries, distributors.
- **Packs:** 1–10 kg vacuum / nitrogen-flushed; 10 kg tins; 25 kg bags.
- **Onboarding:** Udaan — mobile + business name + pincode, "upload GSTIN or shop licence for instant KYC". Happilo — quote form, no GSTIN.
- **Ordering:** RFQ / "Get best price" / WhatsApp dominates. Price slabs, MOQs and credit terms are almost never published.
- **Credit:** Udaan & Jumbotail offer credit via lending partners.

Sources: happilo.com (collections/all, pages/bulk-order, policies/shipping-policy), nutraj.com (products.json, search/suggest.json, wholesale blog), farmley.com, nourishyou.in, udaan.com, jumbotail.com, m.indiamart.com/impcat/cashew-w240.html, m.indiamart.com/impcat/california-almond.html, zoutons.com (Amazon price/kg Sep 2026), bigbasket.com/pb/rostaa.

---

## 3. Shopify, reverse-engineered (admin, inventory, B2B)

### 3.1 Admin information architecture
Left nav: Home · Orders (Drafts, Abandoned) · Products (Collections, **Inventory**, Purchase orders, Transfers) · Customers (**Companies**) · Content · Analytics · Marketing · Discounts · Markets · Settings. Global search, alerts feed, staff roles.

### 3.2 Inventory model
`Product → ProductVariant → InventoryItem → InventoryLevel (per Location)`. Quantity states: **available, committed, on_hand**, plus unavailable buckets (reserved, damaged, safety_stock, quality_control) and incoming.
- Order placed → available → committed
- Fulfilled → committed ↓, on_hand ↓
- Cancelled (restock on by default) → back to available
- Every change writes an **adjustment group** (delta, reason, reference document, actor, quantity after).

### 3.3 Order lifecycle
Separate fields: **order status** (open/archived/cancelled), **payment status** (pending/authorized/paid/partially paid/refunded/voided…), **fulfillment status** (unfulfilled/partial/fulfilled). COD and payment-terms orders stay *Pending* until marked paid. Timeline per order. Draft orders for phone/wholesale sales.

### 3.4 Shopify B2B
- **Company → Company Location → Contacts** (contacts are normal customers).
- **Catalog = Price list + Publication**, assigned to a company location. Price list = % adjustment on base price and/or fixed per-variant prices.
- **Quantity rules** per variant: min / max / increment. **Volume price breaks** (up to 10).
- **Payment terms:** Net 7/15/30/45/60/90, due on fulfillment.
- **Submit orders as drafts for review** → merchant approves → invoice → order. This is the RFQ flow.
- **Shared inventory:** catalogs only change price/visibility; B2B and retail commit from the *same* inventory levels.

### 3.5 India gaps in Shopify
Combined GST rate only (no CGST/SGST lines), **no GST-compliant invoices** (apps required), Shopify Payments unavailable (Razorpay/PayU/Cashfree), COD is a manual method.

Sources: help.shopify.com/en/manual/products/inventory/managing-inventory-quantities/inventory-states, shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps/manage-quantities-states, help.shopify.com/en/manual/orders/order-status, help.shopify.com/en/manual/b2b (catalogs, quantity-pricing, payment-terms, draft-orders), help.shopify.com/manual/taxes/india-gst.

---

## 4. Open-source engines (Medusa v2, Saleor, Bagisto)

| Concern | Medusa v2 | Saleor | Bagisto |
|---|---|---|---|
| Stock row | `InventoryLevel` per (item, location): stocked / reserved / incoming | `Stock` per (warehouse, variant): quantity / allocated | `product_inventories` per source |
| Variant ↔ stock | **link with `required_quantity`** (kits) | 1:1 | 1:1 |
| Reservation | `ReservationItem` per line item; created at order | `Allocation` at order; optional TTL `Reservation` at checkout | per-channel bucket (weak) |
| Concurrency | app-level lock module + transaction | **`SELECT … FOR UPDATE ORDER BY pk`** + atomic `F()` updates | none in schema |
| Channel pricing | `PriceSet` → `Price` (min/max qty tiers) + `PriceRule` + `PriceList` (customer group) | per-channel listing price | customer-group price with qty |
| Shared stock | sales channel ↔ stock location M:N | channel ↔ warehouse M:N | inventory sources |

### 4.1 Inventory options for dry fruits
- **(a) Stock per pack variant** — wrong for loose stock: you must pre-split 300 kg across 250 g/1 kg/25 kg, causing false stock-outs.
- **(b) Gram pool per product-grade** — perfect sharing across channels; variants consume `requiredQty` grams.
- **(c) Hybrid** — bulk gram pools + pre-packed finished goods (UNIT items) linked by repack jobs.

**Chosen:** (b) now, schema-ready for (c). A variant links to one or more inventory items with a `requiredQty` (grams for bulk, 1 for packed units) — so pre-packed pouches and gift-box combos are a data change, not a schema change.

### 4.2 Concurrency pattern
Lock the affected `InventoryLevel` rows **in sorted id order** (`SELECT … FOR UPDATE`), check `onHand − reserved ≥ need`, update, write reservation + ledger rows — all in one transaction. A database `CHECK (reserved <= on_hand)` is the last line of defence.

Sources: github.com/medusajs/medusa (packages/modules/inventory, packages/modules/pricing, core-flows/cart/steps/reserve-inventory.ts), docs.medusajs.com/resources/commerce-modules/inventory/inventory-kit, github.com/saleor/saleor (warehouse/models.py, management.py, lock_objects.py), github.com/bagisto/bagisto (Product migrations).

---

## 5. Indian compliance, payments & shipping

### 5.1 GST (post GST 2.0, effective 22 Sep 2025)
| HSN | Products | Rate now (was) |
|---|---|---|
| 0801 | Cashew, desiccated coconut, Brazil nuts | 5% |
| 0802 | Almonds, pistachios, walnuts, hazelnuts, macadamia, pine nuts | 5% (12%) |
| 0804 | Dates, figs | 5% (12%) |
| 0806 | Raisins | 5% |
| 0813 | Apricots, prunes, **mixes / trail mix** | 5% (12%) |
| 2008 | Roasted / salted / flavoured nuts | 5% (12%) |
| 1206/1207 | Seeds (pumpkin, sunflower, melon, sesame) | 5% |

- Intra-state → **CGST + SGST** (split evenly); inter-state → **IGST**.
- **Place of supply for B2C = delivery address** (IGST s.10(1)(ca), Circular 209/3/2024). We key tax on the *ship-to* state.
- **B2C:** MRP is tax-inclusive → taxable value = price ÷ (1 + rate).
- **B2B invoice (Rule 46):** supplier & buyer GSTIN, invoice no. (≤16 chars, unique per FY), place of supply, HSN (4-digit ≤ ₹5 cr AATO, else 6), taxable value, tax breakup.
- **E-invoicing:** mandatory for B2B above ₹5 cr AATO; IRP reporting within 30 days for AATO ≥ ₹10 cr. Data model kept IRN-ready.
- **E-way bill:** consignments > ₹50,000 moving inter-state — mainly wholesale orders. Admin flags these.
- **TCS:** not applicable to a single-brand own website (Nutbox is the supplier, not an e-commerce operator).
- **Gift hampers** mixing chocolates (18%) are a mixed supply taxed at the highest rate — keep hampers dry-fruit-only or tax at 18%. **Makhana HSN [VERIFY]**.

### 5.2 FSSAI & Legal Metrology
- FSSAI **Central Licence for e-commerce** (FoSCoS) + licence per warehouse **[VERIFY]**. From 1 Apr 2026: registration up to ₹1.5 cr; licences no longer need renewal.
- **Listing must show:** product name, ingredients, nutrition per 100 g, allergens ("contains tree nuts"), veg logo, FSSAI logo + 14-digit licence no., manufacturer/packer, net quantity, **country of origin**, best-before.
- **Shelf life at delivery:** ≥30% or ≥45 days (FSSAI advisory, 3 Dec 2024) → **FEFO lot picking**.
- **Legal Metrology Rule 6(10):** MRP incl. taxes, **unit sale price (₹/kg)**, net qty, consumer-care contact. **Rule 6(10A) (from 1 Jul 2026): searchable/sortable country-of-origin filter.** Packs > 25 kg / institutional packs are exempt from MRP.

### 5.3 GSTIN validation
Regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` + **Luhn mod-36 checksum** + state-code table (01–38, 97, 99). No free official verification API — use Cashfree/Masters India/ClearTax at approval time (stubbed).

### 5.4 Payments
- **Razorpay:** server creates order (amount in paise) → checkout → verify `HMAC_SHA256(secret, order_id|payment_id)` using the **server-stored** order id → webhook with `X-Razorpay-Signature`, processed idempotently.
- **COD:** no RBI rule; cap ₹5–10k, disclose any fee upfront (COD fees probed as a dark pattern in Oct 2025).
- **B2B:** NEFT/RTGS (virtual accounts for reconciliation), payment links, Net 7/15/30 with credit limits.

### 5.5 Shipping
Shiprocket (auth → serviceability → adhoc order → AWB → label → tracking) or Delhivery pincode API. Billed on max(actual, L×B×H/5000) in **500 g slabs** by zone. Food-grade nitrogen-flushed pouches, no metal pins (FSSAI advisory 2026).

### 5.6 DPDP
Act + Rules notified 13 Nov 2025; core duties from 13 May 2027. Plain-language notice, unticked marketing consent, grievance contact, breach reporting, deletion when purpose served, no card data stored.

Sources: CBIC Notification 9/2025-CT(Rate); gstcouncil.gov.in FAQ (Sep 2025) and Circular 209/3/2024; MahaGST advisory 293; fssai.gov.in press release 13 Mar 2026 and advisory 3 Dec 2024; ssrana.in (LMPC amendment GSR 128(E)); razorpay.com/docs/payments/server-integration/nodejs; support.shiprocket.in API guide; cashfree.com Verify GSTIN API docs.

---

## 6. Feature decisions for the Nutbox MVP

| Area | In MVP | Later |
|---|---|---|
| Catalog | Product (variety, grade, origin, processing, HSN, GST rate, FSSAI facts), weight variants, multipacks, combos | Commercial cuts (sliced/slivered/powder), subscriptions |
| Inventory | Shared gram pool, lots + expiry (FEFO), receive / adjust / wastage, reservations, immutable ledger, low-stock & near-expiry alerts | Multi-warehouse routing, repack jobs, purchase orders |
| Retail store | Grade + origin + category filters, ₹/100 g, PDP compliance block, cart, coupons, COD (capped) + Razorpay, free-shipping threshold, GST invoice | Reviews, loyalty, pincode API, WhatsApp cart recovery |
| Wholesale portal | Signup with GSTIN checksum, admin approval, tier price lists with volume breaks, MOQ & increments, tax-exclusive pricing, **submit as quote (RFQ)**, Net terms + credit limit | Company multi-location, GSTIN API verification, virtual accounts |
| Admin | Dashboard, orders (both channels), quotes, fulfil / ship / cancel, products, inventory, wholesale accounts, price lists, coupons, GST report (CSV), settings, staff roles | Shiprocket integration, e-invoice/e-way bill APIs |
