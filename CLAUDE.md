# Nutbox — notes for AI coding agents

## Project rules
- Money is integer **paise**, weight integer **grams**, GST rate integer **basis points**. Never use floats for money in the DB. SQL aggregates over paise must cast to `float8`/`bigint`, not `int` (int4 overflows at ₹2.1 crore).
- All stock changes go through `src/lib/inventory.ts` (lock levels in sorted order → check → update → write a `stock_movements` row). Never update `inventory_levels` directly.
- Prices, tax and availability are recomputed server-side in `buildCheckout` (`src/lib/orders.ts`). Never trust client-sent prices.
- Every server action re-checks authorization (`requireStaff` / `requireAdmin` / `requireWholesale` / ownership). Middleware is only a first gate.
- Order status changes happen inside a transaction after `lockOrder` (FOR UPDATE).
- Run `npm test && npx tsc --noEmit` before committing. The integration tests need a local Postgres.

## gstack

Use gstack for AI-assisted work on this repo: `/office-hours` to frame a feature, `/plan-eng-review` before building, `/review` and `/cso` before merging, `/qa` against a running instance, `/ship` to open the PR.

Install (once per machine):

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Use the `/browse` skill from gstack for web browsing.
