// Shared inventory engine.
//
// One InventoryLevel row per (item, location) is the single pool both channels draw from.
// Every mutation: lock the affected level rows in sorted id order (FOR UPDATE — no deadlocks),
// check, update, write an immutable StockMovement. A DB CHECK (reserved <= on_hand) backs it up.
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Executor, Tx } from "@/db";
import {
  inventoryItems,
  inventoryLevels,
  locations,
  lots,
  orderLines,
  reservations,
  stockMovements,
  variantComponents,
  type MovementReason,
} from "@/db/schema";

export class OutOfStockError extends Error {
  constructor(public shortages: { itemId: string; name: string; neededQty: number; availableQty: number }[]) {
    super(
      "Not enough stock: " +
        shortages.map((s) => `${s.name} (need ${fmtQty(s.neededQty)}, ${fmtQty(s.availableQty)} available)`).join("; "),
    );
    this.name = "OutOfStockError";
  }
}

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

export function fmtQty(grams: number) {
  if (Math.abs(grams) >= 1000) return `${(grams / 1000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;
  return `${grams} g`;
}

export async function defaultLocationId(ex: Executor): Promise<string> {
  const [loc] = await ex.select({ id: locations.id }).from(locations).where(eq(locations.isDefault, true)).limit(1);
  if (!loc) throw new InventoryError("No default stock location configured.");
  return loc.id;
}

type LockedLevel = { id: string; itemId: string; onHand: number; reserved: number; name: string };

/** Lock (and lazily create) level rows for the items, in deterministic order. */
async function lockLevels(tx: Tx, itemIds: string[], locationId: string): Promise<Map<string, LockedLevel>> {
  const ids = [...new Set(itemIds)].sort();
  if (!ids.length) return new Map();
  await tx
    .insert(inventoryLevels)
    .values(ids.map((itemId) => ({ itemId, locationId })))
    .onConflictDoNothing();
  const rows = await tx
    .select({ id: inventoryLevels.id, itemId: inventoryLevels.itemId, onHand: inventoryLevels.onHand, reserved: inventoryLevels.reserved })
    .from(inventoryLevels)
    .where(and(inArray(inventoryLevels.itemId, ids), eq(inventoryLevels.locationId, locationId)))
    .orderBy(asc(inventoryLevels.id))
    .for("update");
  const names = await tx.select({ id: inventoryItems.id, name: inventoryItems.name }).from(inventoryItems).where(inArray(inventoryItems.id, ids));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return new Map(rows.map((r) => [r.itemId, { ...r, name: nameOf.get(r.itemId) ?? r.itemId }]));
}

async function applyLevel(
  tx: Tx,
  level: LockedLevel,
  locationId: string,
  m: {
    reason: MovementReason;
    deltaOnHand?: number;
    deltaReserved?: number;
    lotId?: string | null;
    refType?: string;
    refId?: string;
    note?: string;
    actor?: string;
  },
) {
  const dOn = m.deltaOnHand ?? 0;
  const dRes = m.deltaReserved ?? 0;
  level.onHand += dOn;
  level.reserved += dRes;
  if (level.onHand < 0 || level.reserved < 0 || level.reserved > level.onHand)
    throw new InventoryError(`Stock for ${level.name} would become inconsistent (on hand ${level.onHand}, reserved ${level.reserved}).`);
  await tx
    .update(inventoryLevels)
    .set({ onHand: level.onHand, reserved: level.reserved, updatedAt: new Date() })
    .where(eq(inventoryLevels.id, level.id));
  await tx.insert(stockMovements).values({
    itemId: level.itemId,
    locationId,
    lotId: m.lotId ?? null,
    reason: m.reason,
    deltaOnHand: dOn,
    deltaReserved: dRes,
    onHandAfter: level.onHand,
    reservedAfter: level.reserved,
    refType: m.refType,
    refId: m.refId,
    note: m.note,
    actor: m.actor,
  });
}

export type ComponentRow = { variantId: string; itemId: string; requiredQty: number };

export async function componentsFor(ex: Executor, variantIds: string[]): Promise<Map<string, ComponentRow[]>> {
  const map = new Map<string, ComponentRow[]>();
  if (!variantIds.length) return map;
  const rows = await ex
    .select({ variantId: variantComponents.variantId, itemId: variantComponents.inventoryItemId, requiredQty: variantComponents.requiredQty })
    .from(variantComponents)
    .where(inArray(variantComponents.variantId, [...new Set(variantIds)]));
  for (const r of rows) map.set(r.variantId, [...(map.get(r.variantId) ?? []), r]);
  return map;
}

/** Sellable units per variant = min over components of ⌊available / requiredQty⌋. Untracked variants → Infinity. */
export async function variantAvailability(ex: Executor, variantIds: string[]): Promise<Map<string, number>> {
  const comps = await componentsFor(ex, variantIds);
  const itemIds = [...new Set([...comps.values()].flat().map((c) => c.itemId))];
  const levels = itemIds.length
    ? await ex
        .select({ itemId: inventoryLevels.itemId, avail: sql<number>`sum(${inventoryLevels.onHand} - ${inventoryLevels.reserved})::int` })
        .from(inventoryLevels)
        .where(inArray(inventoryLevels.itemId, itemIds))
        .groupBy(inventoryLevels.itemId)
    : [];
  const availOf = new Map(levels.map((l) => [l.itemId, l.avail]));
  const out = new Map<string, number>();
  for (const v of variantIds) {
    const cs = comps.get(v);
    if (!cs?.length) {
      out.set(v, Number.POSITIVE_INFINITY);
      continue;
    }
    out.set(v, Math.min(...cs.map((c) => Math.floor((availOf.get(c.itemId) ?? 0) / c.requiredQty))));
  }
  return out;
}

/** Reserve stock for every line of an order. Throws OutOfStockError and changes nothing if any item is short. */
export async function reserveOrder(tx: Tx, orderId: string, actor = "system") {
  const lines = await tx.select({ id: orderLines.id, variantId: orderLines.variantId, qty: orderLines.qty }).from(orderLines).where(eq(orderLines.orderId, orderId));
  const comps = await componentsFor(tx, lines.map((l) => l.variantId));
  const locationId = await defaultLocationId(tx);

  const perLine: { lineId: string; itemId: string; qty: number }[] = [];
  const need = new Map<string, number>();
  for (const l of lines) {
    for (const c of comps.get(l.variantId) ?? []) {
      const q = c.requiredQty * l.qty;
      perLine.push({ lineId: l.id, itemId: c.itemId, qty: q });
      need.set(c.itemId, (need.get(c.itemId) ?? 0) + q);
    }
  }
  const levels = await lockLevels(tx, [...need.keys()], locationId);
  const shortages = [...need.entries()]
    .map(([itemId, q]) => {
      const lv = levels.get(itemId)!;
      return { itemId, name: lv.name, neededQty: q, availableQty: lv.onHand - lv.reserved };
    })
    .filter((s) => s.availableQty < s.neededQty);
  if (shortages.length) throw new OutOfStockError(shortages);

  for (const [itemId, q] of need) {
    await applyLevel(tx, levels.get(itemId)!, locationId, { reason: "RESERVE", deltaReserved: q, refType: "ORDER", refId: orderId, actor });
  }
  if (perLine.length) await tx.insert(reservations).values(perLine.map((p) => ({ orderId, orderLineId: p.lineId, itemId: p.itemId, locationId, qty: p.qty })));
}

async function reservationsByItem(tx: Tx, orderId: string) {
  const res = await tx.select().from(reservations).where(eq(reservations.orderId, orderId));
  const byItem = new Map<string, { qty: number; locationId: string }>();
  for (const r of res) {
    const cur = byItem.get(r.itemId);
    byItem.set(r.itemId, { qty: (cur?.qty ?? 0) + r.qty, locationId: r.locationId });
  }
  return byItem;
}

/** Release an order's reservations back to available (cancel / decline). Idempotent. */
export async function releaseOrder(tx: Tx, orderId: string, actor = "system", note?: string) {
  const byItem = await reservationsByItem(tx, orderId);
  if (!byItem.size) return;
  const locationId = [...byItem.values()][0].locationId;
  const levels = await lockLevels(tx, [...byItem.keys()], locationId);
  for (const [itemId, r] of byItem) {
    await applyLevel(tx, levels.get(itemId)!, locationId, { reason: "RELEASE", deltaReserved: -r.qty, refType: "ORDER", refId: orderId, note, actor });
  }
  await tx.delete(reservations).where(eq(reservations.orderId, orderId));
}

/** Ship: consume reserved stock, picking lots first-expiry-first-out. */
export async function consumeOrder(tx: Tx, orderId: string, actor = "system") {
  const byItem = await reservationsByItem(tx, orderId);
  if (!byItem.size) return;
  const locationId = [...byItem.values()][0].locationId;
  const levels = await lockLevels(tx, [...byItem.keys()], locationId);
  for (const [itemId, r] of [...byItem.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const level = levels.get(itemId)!;
    let left = r.qty;
    const fefo = await tx
      .select()
      .from(lots)
      .where(and(eq(lots.itemId, itemId), eq(lots.locationId, locationId), gt(lots.qtyOnHand, 0)))
      .orderBy(asc(lots.expiresOn), asc(lots.receivedAt), asc(lots.id))
      .for("update");
    for (const lot of fefo) {
      if (left <= 0) break;
      const take = Math.min(left, lot.qtyOnHand);
      await tx.update(lots).set({ qtyOnHand: lot.qtyOnHand - take }).where(eq(lots.id, lot.id));
      await applyLevel(tx, level, locationId, { reason: "SALE", deltaOnHand: -take, deltaReserved: -take, lotId: lot.id, refType: "ORDER", refId: orderId, actor });
      left -= take;
    }
    if (left > 0) {
      // Stock that predates lot tracking: ship it, but leave an un-lotted ledger row for audit.
      await applyLevel(tx, level, locationId, {
        reason: "SALE",
        deltaOnHand: -left,
        deltaReserved: -left,
        refType: "ORDER",
        refId: orderId,
        note: "No lot available — shipped un-lotted stock",
        actor,
      });
    }
  }
  await tx.delete(reservations).where(eq(reservations.orderId, orderId));
}

/** Return-to-origin: put shipped stock back into the exact lots it left from. */
export async function restockOrder(tx: Tx, orderId: string, actor = "system") {
  const sales = await tx
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.refType, "ORDER"), eq(stockMovements.refId, orderId), eq(stockMovements.reason, "SALE")));
  if (!sales.length) return;
  const locationId = sales[0].locationId;
  const levels = await lockLevels(tx, sales.map((s) => s.itemId), locationId);
  for (const s of sales) {
    const qty = -s.deltaOnHand;
    if (s.lotId) await tx.update(lots).set({ qtyOnHand: sql`${lots.qtyOnHand} + ${qty}` }).where(eq(lots.id, s.lotId));
    await applyLevel(tx, levels.get(s.itemId)!, locationId, { reason: "RETURN", deltaOnHand: qty, lotId: s.lotId, refType: "ORDER", refId: orderId, actor });
  }
}

/** Goods receipt: a new lot with an expiry date. */
export async function receiveStock(
  tx: Tx,
  a: { itemId: string; qty: number; lotNo: string; expiresOn: Date; supplier?: string; costPaisePerKg?: number; actor: string },
) {
  if (!Number.isInteger(a.qty) || a.qty <= 0) throw new InventoryError("Received quantity must be a positive whole number.");
  if (a.expiresOn.getTime() <= Date.now()) throw new InventoryError("Expiry date must be in the future.");
  const locationId = await defaultLocationId(tx);
  const levels = await lockLevels(tx, [a.itemId], locationId);
  const existing = await tx.select({ id: lots.id }).from(lots).where(and(eq(lots.itemId, a.itemId), eq(lots.locationId, locationId), eq(lots.lotNo, a.lotNo)));
  if (existing.length) throw new InventoryError(`Lot ${a.lotNo} already exists for this item.`);
  const [lot] = await tx
    .insert(lots)
    .values({ itemId: a.itemId, locationId, lotNo: a.lotNo, expiresOn: a.expiresOn, supplier: a.supplier, costPaisePerKg: a.costPaisePerKg, qtyOnHand: a.qty })
    .returning();
  await applyLevel(tx, levels.get(a.itemId)!, locationId, { reason: "RECEIPT", deltaOnHand: a.qty, lotId: lot.id, refType: "LOT", refId: lot.id, note: a.supplier ? `From ${a.supplier}` : undefined, actor: a.actor });
  return lot;
}

/** Stock count correction or wastage against a specific lot. Can't eat into reserved stock. */
export async function adjustLot(tx: Tx, a: { lotId: string; delta: number; reason: "ADJUSTMENT" | "WASTAGE"; note: string; actor: string }) {
  if (!Number.isInteger(a.delta) || a.delta === 0) throw new InventoryError("Adjustment must be a non-zero whole number.");
  if (a.reason === "WASTAGE" && a.delta > 0) throw new InventoryError("Wastage can only reduce stock.");
  const [lot] = await tx.select().from(lots).where(eq(lots.id, a.lotId)).for("update");
  if (!lot) throw new InventoryError("Lot not found.");
  const levels = await lockLevels(tx, [lot.itemId], lot.locationId);
  const level = levels.get(lot.itemId)!;
  if (lot.qtyOnHand + a.delta < 0) throw new InventoryError(`Lot ${lot.lotNo} only has ${fmtQty(lot.qtyOnHand)}.`);
  if (level.onHand + a.delta < level.reserved)
    throw new InventoryError(`That would leave less than the ${fmtQty(level.reserved)} already reserved for open orders.`);
  await tx.update(lots).set({ qtyOnHand: lot.qtyOnHand + a.delta }).where(eq(lots.id, lot.id));
  await applyLevel(tx, level, lot.locationId, { reason: a.reason, deltaOnHand: a.delta, lotId: lot.id, refType: "LOT", refId: lot.id, note: a.note, actor: a.actor });
}
