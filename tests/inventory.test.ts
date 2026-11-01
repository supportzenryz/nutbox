// Integration tests against a real PostgreSQL database (nutbox_test).
import { beforeAll, describe, expect, it, afterAll } from "vitest";
import { Client } from "pg";

const BASE = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/nutbox_test";
process.env.DATABASE_URL = BASE;
process.env.DB_POOL_MAX = "40";

type Mods = {
  db: typeof import("../src/db");
  s: typeof import("../src/db/schema");
  orders: typeof import("../src/lib/orders");
  inv: typeof import("../src/lib/inventory");
  orm: typeof import("drizzle-orm");
};
let m: Mods;
let userId = "";
let locationId = "";
let itemId = "";
let v1kg = "";
let v10kg = "";
let combo = "";
let itemB = "";

const addr = { name: "Test", phone: "9000000000", line1: "1 Test Rd", city: "Chennai", stateCode: "33", pincode: "600001" };

async function retailOrder(items: { v: string; q: number }[]) {
  return m.orders.placeOrder({
    channel: "RETAIL",
    user: { id: userId, email: "t@example.com", name: "T" },
    company: null,
    priceList: null,
    items,
    address: addr,
    paymentMethod: "COD",
  });
}

async function level(id = itemId) {
  const [l] = await m.db.db.select().from(m.s.inventoryLevels).where(m.orm.eq(m.s.inventoryLevels.itemId, id));
  return l;
}

beforeAll(async () => {
  const admin = new Client({ connectionString: BASE.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS nutbox_test WITH (FORCE)");
  await admin.query("CREATE DATABASE nutbox_test");
  await admin.end();

  m = {
    db: await import("../src/db"),
    s: await import("../src/db/schema"),
    orders: await import("../src/lib/orders"),
    inv: await import("../src/lib/inventory"),
    orm: await import("drizzle-orm"),
  };
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(m.db.db, { migrationsFolder: "./drizzle" });
  const { db } = m.db;
  const s = m.s;
  await db.insert(s.settings).values({
    storeName: "T",
    legalName: "T",
    gstin: "33AAFCN4321H1Z0",
    fssaiLicence: "1",
    addressLine: "x",
    city: "Chennai",
    stateCode: "33",
    pincode: "600001",
    supportEmail: "a@b.c",
    supportPhone: "1",
    codLimitPaise: 100_000_000,
  });
  const [loc] = await db.insert(s.locations).values({ name: "WH", stateCode: "33", isDefault: true }).returning();
  locationId = loc.id;
  const [cat] = await db.insert(s.categories).values({ slug: "c", name: "C" }).returning();
  const nutrition = { energyKcal: 1, protein: 1, carbs: 1, sugar: 1, fat: 1, fibre: 1 };
  const [p] = await db
    .insert(s.products)
    .values({ slug: "p", name: "Cashew", categoryId: cat.id, variety: "Cashew", origin: "India", description: "d", hsnCode: "0801", ingredients: "i", nutrition })
    .returning();
  const [item] = await db.insert(s.inventoryItems).values({ sku: "CASHEW-BULK", name: "Cashew bulk", productId: p.id }).returning();
  const [item2] = await db.insert(s.inventoryItems).values({ sku: "RAISIN-BULK", name: "Raisin bulk" }).returning();
  itemId = item.id;
  itemB = item2.id;
  const [a] = await db.insert(s.variants).values({ productId: p.id, sku: "C-1KG", title: "1 kg", netGrams: 1000, shipGrams: 1040, retailPricePaise: 1000_00 }).returning();
  const [b] = await db
    .insert(s.variants)
    .values({ productId: p.id, sku: "C-10KG", title: "10 kg", netGrams: 10000, shipGrams: 10300, soldRetail: true, retailPricePaise: 9000_00 })
    .returning();
  const [c] = await db.insert(s.variants).values({ productId: p.id, sku: "COMBO", title: "combo", netGrams: 600, shipGrams: 700, retailPricePaise: 900_00 }).returning();
  v1kg = a.id;
  v10kg = b.id;
  combo = c.id;
  await db.insert(s.variantComponents).values([
    { variantId: a.id, inventoryItemId: item.id, requiredQty: 1000 },
    { variantId: b.id, inventoryItemId: item.id, requiredQty: 10000 },
    { variantId: c.id, inventoryItemId: item.id, requiredQty: 300 },
    { variantId: c.id, inventoryItemId: item2.id, requiredQty: 300 },
  ]);
  const [u] = await db.insert(s.users).values({ email: "t@example.com", name: "T", passwordHash: "x" }).returning();
  userId = u.id;

  await db.transaction(async (tx) => {
    // Two lots: the later-received one expires FIRST, so FEFO must pick it before the older one.
    await m.inv.receiveStock(tx, { itemId, qty: 6000, lotNo: "L-LATE-EXP", expiresOn: new Date(Date.now() + 200 * 86400000), actor: "test" });
    await m.inv.receiveStock(tx, { itemId, qty: 6000, lotNo: "L-EARLY-EXP", expiresOn: new Date(Date.now() + 30 * 86400000), actor: "test" });
    await m.inv.receiveStock(tx, { itemId: itemB, qty: 1000, lotNo: "R-1", expiresOn: new Date(Date.now() + 90 * 86400000), actor: "test" });
  });
});

afterAll(async () => {
  await m?.db.pool.end();
});

describe("shared inventory", () => {
  it("never oversells under 30 concurrent checkouts for the last 12 kg", async () => {
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => retailOrder([{ v: v1kg, q: 1 }])));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(12);
    for (const r of results) {
      if (r.status === "rejected") expect(String(r.reason?.message)).toMatch(/Out of stock|Not enough stock|available/);
    }
    const l = await level();
    expect(l.onHand).toBe(12000);
    expect(l.reserved).toBe(12000);
    const avail = await m.inv.variantAvailability(m.db.db, [v1kg, v10kg]);
    expect(avail.get(v1kg)).toBe(0);
    expect(avail.get(v10kg)).toBe(0);
  });

  it("ledger replays to the level", async () => {
    const rows = await m.db.db.select().from(m.s.stockMovements).where(m.orm.eq(m.s.stockMovements.itemId, itemId));
    const l = await level();
    expect(rows.reduce((a, r) => a + r.deltaOnHand, 0)).toBe(l.onHand);
    expect(rows.reduce((a, r) => a + r.deltaReserved, 0)).toBe(l.reserved);
  });

  it("cancelling releases stock, and a second cancel is rejected", async () => {
    const [o] = await m.db.db.select().from(m.s.orders).limit(1);
    await m.orders.cancelOrder(o.id, "test", "customer asked");
    expect((await level()).reserved).toBe(11000);
    await expect(m.orders.cancelOrder(o.id, "test", "again")).rejects.toThrow(/closed/);
    expect((await level()).reserved).toBe(11000);
  });

  it("shipping consumes lots first-expiry-first-out and issues sequential invoices", async () => {
    const open = await m.db.db.select().from(m.s.orders).where(m.orm.eq(m.s.orders.status, "OPEN")).orderBy(m.s.orders.number);
    for (const o of open.slice(0, 7)) await m.orders.shipOrder(o.id, "test", "Courier", "AWB");
    const lotsNow = await m.db.db.select().from(m.s.lots).where(m.orm.eq(m.s.lots.itemId, itemId));
    const early = lotsNow.find((l) => l.lotNo === "L-EARLY-EXP")!;
    const late = lotsNow.find((l) => l.lotNo === "L-LATE-EXP")!;
    expect(early.qtyOnHand).toBe(0); // 6 kg consumed first
    expect(late.qtyOnHand).toBe(5000); // then 1 kg from the later-expiring lot
    const l = await level();
    expect(l.onHand).toBe(5000);
    expect(l.reserved).toBe(4000);
    const shipped = await m.db.db.select().from(m.s.orders).where(m.orm.eq(m.s.orders.fulfillmentStatus, "SHIPPED")).orderBy(m.s.orders.invoicedAt);
    expect(shipped.map((o) => o.invoiceNo!.slice(-5))).toEqual(["00001", "00002", "00003", "00004", "00005", "00006", "00007"]);
    await expect(m.orders.shipOrder(shipped[0].id, "test", "C", "A")).rejects.toThrow(/unfulfilled/);
  });

  it("return-to-origin restocks the exact lots shipped", async () => {
    const [o] = await m.db.db.select().from(m.s.orders).where(m.orm.eq(m.s.orders.fulfillmentStatus, "SHIPPED")).limit(1);
    await m.orders.markReturned(o.id, "test", "RTO — customer unreachable");
    const l = await level();
    expect(l.onHand).toBe(6000);
    const sum = await m.db.db.select().from(m.s.lots).where(m.orm.eq(m.s.lots.itemId, itemId));
    expect(sum.reduce((a, x) => a + x.qtyOnHand, 0)).toBe(6000);
  });

  it("a combo is all-or-nothing across pools", async () => {
    // Raisin pool has 1 kg → 3 combos max (300 g each); cashew has 2 kg free.
    await expect(retailOrder([{ v: combo, q: 4 }])).rejects.toThrow(/Only 3 available/);
    const before = await level(itemB);
    expect(before.reserved).toBe(0);
    await retailOrder([{ v: combo, q: 3 }]);
    expect((await level(itemB)).reserved).toBe(900);
    expect((await level()).reserved).toBe(4000 + 900);
  });

  it("adjustments can't eat into reserved stock", async () => {
    const [lot] = await m.db.db.select().from(m.s.lots).where(m.orm.eq(m.s.lots.lotNo, "L-LATE-EXP"));
    const l = await level();
    const free = l.onHand - l.reserved;
    await expect(
      m.db.db.transaction((tx) => m.inv.adjustLot(tx, { lotId: lot.id, delta: -(free + 1), reason: "WASTAGE", note: "mould", actor: "test" })),
    ).rejects.toThrow(/reserved/);
    await m.db.db.transaction((tx) => m.inv.adjustLot(tx, { lotId: lot.id, delta: -free, reason: "WASTAGE", note: "mould", actor: "test" }));
    expect((await level()).onHand).toBe(l.reserved);
  });

  it("the database CHECK constraint is the last line of defence", async () => {
    await expect(
      m.db.db.update(m.s.inventoryLevels).set({ reserved: 999_999 }).where(m.orm.eq(m.s.inventoryLevels.itemId, itemId)),
    ).rejects.toThrow();
  });
});

describe("direct UPI payments", () => {
  const upiOrder = () =>
    m.orders.placeOrder({
      channel: "RETAIL",
      user: { id: userId, email: "t@example.com", name: "T" },
      company: null,
      priceList: null,
      items: [{ v: v1kg, q: 1 }],
      address: addr,
      paymentMethod: "UPI",
    });

  it("needs a store UPI ID, holds shipping until staff verify, and refuses a reused reference", async () => {
    const { db } = m.db;
    const { eq } = m.orm;
    await db.transaction((tx) => m.inv.receiveStock(tx, { itemId, qty: 3000, lotNo: "L-UPI", expiresOn: new Date(Date.now() + 100 * 86400000), actor: "test" }));

    await expect(upiOrder()).rejects.toThrow(/UPI payments aren't set up/);
    await db.update(m.s.settings).set({ upiId: "nutbox@okhdfcbank" });
    const a = await upiOrder();
    const b = await upiOrder();

    await expect(m.orders.shipOrder(a.id, "test", "", "")).rejects.toThrow(/record the payment/);
    await expect(m.orders.reportUpiPayment(a.id, "someone-else", "431298765012")).rejects.toThrow(/not found/);
    await m.orders.reportUpiPayment(a.id, userId, "431298765012");
    await expect(m.orders.reportUpiPayment(b.id, userId, "431298765012")).rejects.toThrow(/already been used/);

    // Reporting alone doesn't make it paid.
    let [row] = await db.select().from(m.s.orders).where(eq(m.s.orders.id, a.id));
    expect(row.paymentStatus).toBe("PENDING");
    expect(row.upiRef).toBe("431298765012");

    await m.orders.markPaid(a.id, "staff");
    [row] = await db.select().from(m.s.orders).where(eq(m.s.orders.id, a.id));
    expect(row.paymentStatus).toBe("PAID");
    const events = await db.select().from(m.s.orderEvents).where(eq(m.s.orderEvents.orderId, a.id));
    expect(events.find((e) => e.type === "paid")?.message).toContain("431298765012");
    await expect(m.orders.reportUpiPayment(a.id, userId, "431298765013")).rejects.toThrow(/isn't awaiting payment/);

    await m.orders.shipOrder(a.id, "test", "", "");
    await m.orders.cancelOrder(b.id, "test", "unpaid");
  });
});
