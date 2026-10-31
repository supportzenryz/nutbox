// Seed: catalog priced from Oct-2026 market research, shared stock pools with lots, demo accounts and orders.
import "./env";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { gstinChecksum } from "../lib/gstin";
import { db, pool } from "./index";
import * as t from "./schema";

const withCs = (body: string) => body + gstinChecksum(body);
const STORE_GSTIN = withCs("33AAFCN4321H1Z");

type N = t.Nutrition;
const NUT = {
  cashew: { energyKcal: 553, protein: 18.2, carbs: 30.2, sugar: 5.9, fat: 43.9, fibre: 3.3 },
  almond: { energyKcal: 579, protein: 21.2, carbs: 21.6, sugar: 4.4, fat: 49.9, fibre: 12.5 },
  pistachio: { energyKcal: 562, protein: 20.2, carbs: 27.2, sugar: 7.7, fat: 45.3, fibre: 10.6 },
  walnut: { energyKcal: 654, protein: 15.2, carbs: 13.7, sugar: 2.6, fat: 65.2, fibre: 6.7 },
  raisin: { energyKcal: 299, protein: 3.1, carbs: 79.2, sugar: 59.2, fat: 0.5, fibre: 3.7 },
  date: { energyKcal: 282, protein: 2.5, carbs: 75, sugar: 63.4, fat: 0.4, fibre: 8 },
  fig: { energyKcal: 249, protein: 3.3, carbs: 63.9, sugar: 47.9, fat: 0.9, fibre: 9.8 },
  apricot: { energyKcal: 241, protein: 3.4, carbs: 62.6, sugar: 53.4, fat: 0.5, fibre: 7.3 },
  pumpkin: { energyKcal: 559, protein: 30.2, carbs: 10.7, sugar: 1.4, fat: 49, fibre: 6 },
  cranberry: { energyKcal: 308, protein: 0.2, carbs: 82.4, sugar: 65, fat: 1.1, fibre: 5.3 },
  mix: { energyKcal: 512, protein: 14.8, carbs: 41, sugar: 22, fat: 33.6, fibre: 6.2 },
} satisfies Record<string, N>;

const FACILITY = "Packed in a facility that also handles tree nuts, peanuts and sesame.";

type Spec = {
  slug: string;
  name: string;
  cat: string;
  variety: string;
  grade?: string;
  origin: string;
  processing?: string;
  hsn: string;
  desc: string;
  ingredients: string;
  allergens?: string;
  nutrition: N;
  shelf: number;
  tone: string;
  featured?: boolean;
  retailPerKg: number; // ₹ for a 1 kg pack
  wholesalePerKg: number; // ₹ excl. GST
  retailPacks: number[]; // grams
  wholesalePacks: { g: number; type: string; min: number; step: number }[];
  stock: { lot: string; kg: number; expDays: number; supplier: string; costPerKg: number }[];
  lowKg?: number;
};

const STD_WH = [
  { g: 5000, type: "Vacuum pack", min: 2, step: 1 },
  { g: 10000, type: "Tin", min: 1, step: 1 },
  { g: 25000, type: "Bag", min: 1, step: 1 },
];
const SMALL_WH = [
  { g: 1000, type: "Bulk pouch", min: 5, step: 5 },
  { g: 5000, type: "Vacuum pack", min: 1, step: 1 },
];

const SPECS: Spec[] = [
  {
    slug: "cashew-w240",
    name: "Cashew W240",
    cat: "nuts",
    variety: "Cashew",
    grade: "W240",
    origin: "India",
    hsn: "0801",
    desc: "Whole white cashews, 240 kernels to the pound. The everyday premium size for snacking, kaju katli and gravies. Sourced from Kerala and Goa processors.",
    ingredients: "Cashew kernels (100%)",
    nutrition: NUT.cashew,
    shelf: 270,
    tone: "#D9BE8F",
    featured: true,
    retailPerKg: 1399,
    wholesalePerKg: 880,
    retailPacks: [250, 500, 1000],
    wholesalePacks: STD_WH,
    stock: [
      { lot: "CW240-2609-A", kg: 140, expDays: 190, supplier: "Mangalore Kernel Co.", costPerKg: 790 },
      { lot: "CW240-2610-B", kg: 180, expDays: 240, supplier: "Kollam Cashew Exports", costPerKg: 805 },
    ],
  },
  {
    slug: "cashew-w320",
    name: "Cashew W320",
    cat: "nuts",
    variety: "Cashew",
    grade: "W320",
    origin: "India",
    hsn: "0801",
    desc: "The most-traded cashew grade: 320 whole kernels per pound. Ideal for sweets, curries and bulk snacking at a sharper price.",
    ingredients: "Cashew kernels (100%)",
    nutrition: NUT.cashew,
    shelf: 270,
    tone: "#E2CBA0",
    retailPerKg: 1249,
    wholesalePerKg: 790,
    retailPacks: [250, 500, 1000],
    wholesalePacks: STD_WH,
    stock: [{ lot: "CW320-2610-A", kg: 260, expDays: 230, supplier: "Kollam Cashew Exports", costPerKg: 720 }],
  },
  {
    slug: "cashew-w180",
    name: "Cashew W180 King Size",
    cat: "nuts",
    variety: "Cashew",
    grade: "W180",
    origin: "India",
    hsn: "0801",
    desc: "The largest whole cashew grade — 180 kernels per pound. For gifting boxes and when presentation matters.",
    ingredients: "Cashew kernels (100%)",
    nutrition: NUT.cashew,
    shelf: 270,
    tone: "#CDAE7A",
    retailPerKg: 1899,
    wholesalePerKg: 1150,
    retailPacks: [250, 500, 1000],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "CW180-2610-A", kg: 48, expDays: 220, supplier: "Mangalore Kernel Co.", costPerKg: 1060 }],
  },
  {
    slug: "almond-california",
    name: "California Almonds",
    cat: "nuts",
    variety: "Almond",
    grade: "Nonpareil 23/25",
    origin: "USA",
    hsn: "0802",
    desc: "Nonpareil almonds from California's Central Valley, 23–25 nuts per ounce. Sweet, crunchy, and the right size for soaking overnight.",
    ingredients: "Almond kernels (100%)",
    nutrition: NUT.almond,
    shelf: 300,
    tone: "#B98A5E",
    featured: true,
    retailPerKg: 1149,
    wholesalePerKg: 700,
    retailPacks: [250, 500, 1000],
    wholesalePacks: STD_WH,
    stock: [
      { lot: "ALC-2608-A", kg: 90, expDays: 160, supplier: "Pacific Nut Importers, Navi Mumbai", costPerKg: 640 },
      { lot: "ALC-2610-B", kg: 300, expDays: 280, supplier: "Pacific Nut Importers, Navi Mumbai", costPerKg: 655 },
    ],
  },
  {
    slug: "almond-mamra",
    name: "Mamra Almonds",
    cat: "nuts",
    variety: "Almond",
    grade: "Mamra",
    origin: "Iran",
    hsn: "0802",
    desc: "Concave, oil-rich Mamra almonds hand-sorted from Iranian orchards. Prized for their high natural oil content and traditional use in winter.",
    ingredients: "Almond kernels (100%)",
    nutrition: NUT.almond,
    shelf: 300,
    tone: "#9C6B43",
    retailPerKg: 6399,
    wholesalePerKg: 3900,
    retailPacks: [250, 500],
    wholesalePacks: [{ g: 1000, type: "Bulk pouch", min: 2, step: 1 }],
    stock: [{ lot: "ALM-2607-A", kg: 6, expDays: 140, supplier: "Khari Baoli Traders, Delhi", costPerKg: 3600 }],
    lowKg: 8,
  },
  {
    slug: "pistachio-roasted-salted",
    name: "Pistachios Roasted & Salted",
    cat: "nuts",
    variety: "Pistachio",
    grade: "Akbari 28/30",
    origin: "Iran",
    processing: "Roasted & salted",
    hsn: "2008",
    desc: "In-shell Akbari pistachios, slow-roasted and lightly salted. Naturally split, no artificial colour.",
    ingredients: "Pistachios (98%), edible common salt (2%)",
    nutrition: NUT.pistachio,
    shelf: 180,
    tone: "#9BAF6B",
    featured: true,
    retailPerKg: 1699,
    wholesalePerKg: 1050,
    retailPacks: [250, 500, 1000],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "PRS-2610-A", kg: 85, expDays: 150, supplier: "Pacific Nut Importers, Navi Mumbai", costPerKg: 980 }],
  },
  {
    slug: "walnut-kernels",
    name: "Walnut Kernels Light Halves",
    cat: "nuts",
    variety: "Walnut",
    grade: "Light halves",
    origin: "India",
    hsn: "0802",
    desc: "Light-coloured halves from Kashmir's 2026 harvest. Mild, never bitter, cracked fresh each month.",
    ingredients: "Walnut kernels (100%)",
    nutrition: NUT.walnut,
    shelf: 150,
    tone: "#A9875F",
    retailPerKg: 1499,
    wholesalePerKg: 950,
    retailPacks: [250, 500, 1000],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "WLK-2610-A", kg: 70, expDays: 120, supplier: "Sopore Fruit Growers Co-op", costPerKg: 880 }],
  },
  {
    slug: "raisins-afghan-green",
    name: "Afghan Green Raisins",
    cat: "dried-fruits",
    variety: "Raisin",
    grade: "Long green",
    origin: "Afghanistan",
    hsn: "0806",
    desc: "Long, seedless green kishmish, shade-dried in Kandahar. Sweet with a gentle tang — the classic for kheer and pulao.",
    ingredients: "Seedless raisins (100%)",
    allergens: FACILITY,
    nutrition: NUT.raisin,
    shelf: 270,
    tone: "#A7A04E",
    retailPerKg: 699,
    wholesalePerKg: 380,
    retailPacks: [250, 500, 1000],
    wholesalePacks: STD_WH,
    stock: [{ lot: "RAG-2609-A", kg: 210, expDays: 200, supplier: "Kabul Dry Fruit House, Amritsar", costPerKg: 330 }],
  },
  {
    slug: "black-raisins",
    name: "Black Raisins Seedless",
    cat: "dried-fruits",
    variety: "Raisin",
    grade: "Seedless",
    origin: "India",
    hsn: "0806",
    desc: "Sun-dried seedless black grapes from Nashik. Rich, jammy, and good straight from the pack.",
    ingredients: "Seedless black raisins (100%)",
    allergens: FACILITY,
    nutrition: NUT.raisin,
    shelf: 270,
    tone: "#4B3140",
    retailPerKg: 899,
    wholesalePerKg: 500,
    retailPacks: [250, 500],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "RBK-2610-A", kg: 95, expDays: 230, supplier: "Nashik Grape Growers FPO", costPerKg: 430 }],
  },
  {
    slug: "kimia-dates",
    name: "Kimia Dates",
    cat: "dates-figs",
    variety: "Date",
    grade: "Kimia",
    origin: "Iran",
    hsn: "0804",
    desc: "Soft, dark Kimia dates from Bam. Moist and chocolatey — keep refrigerated after opening.",
    ingredients: "Dates (100%)",
    allergens: FACILITY,
    nutrition: NUT.date,
    shelf: 180,
    tone: "#5A3324",
    retailPerKg: 649,
    wholesalePerKg: 360,
    retailPacks: [500, 1000],
    wholesalePacks: SMALL_WH,
    stock: [
      { lot: "DKM-2605-A", kg: 22, expDays: 24, supplier: "Bandar Abbas Trading, Mumbai", costPerKg: 300 },
      { lot: "DKM-2610-B", kg: 120, expDays: 170, supplier: "Bandar Abbas Trading, Mumbai", costPerKg: 310 },
    ],
  },
  {
    slug: "medjool-dates",
    name: "Medjool Dates",
    cat: "dates-figs",
    variety: "Date",
    grade: "Jumbo",
    origin: "Jordan",
    hsn: "0804",
    desc: "Jumbo Medjool dates from the Jordan Valley — big, soft, caramel-sweet.",
    ingredients: "Dates (100%)",
    allergens: FACILITY,
    nutrition: { energyKcal: 277, protein: 1.8, carbs: 75, sugar: 66.5, fat: 0.2, fibre: 6.7 },
    shelf: 240,
    tone: "#6E3F22",
    featured: true,
    retailPerKg: 2499,
    wholesalePerKg: 1600,
    retailPacks: [250, 500],
    wholesalePacks: [{ g: 5000, type: "Carton", min: 1, step: 1 }],
    stock: [{ lot: "DMJ-2610-A", kg: 40, expDays: 210, supplier: "Levant Fresh Imports, Chennai", costPerKg: 1450 }],
  },
  {
    slug: "anjeer-figs",
    name: "Anjeer (Dried Figs)",
    cat: "dates-figs",
    variety: "Fig",
    grade: "Jumbo",
    origin: "Afghanistan",
    hsn: "0804",
    desc: "Sun-dried Afghan figs, strung and pressed. Chewy skin, seedy honeyed centre.",
    ingredients: "Dried figs (100%)",
    allergens: FACILITY,
    nutrition: NUT.fig,
    shelf: 240,
    tone: "#8B6A4A",
    retailPerKg: 1499,
    wholesalePerKg: 950,
    retailPacks: [250, 500],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "FAN-2609-A", kg: 55, expDays: 180, supplier: "Kabul Dry Fruit House, Amritsar", costPerKg: 860 }],
  },
  {
    slug: "turkish-apricots",
    name: "Turkish Apricots",
    cat: "dried-fruits",
    variety: "Apricot",
    grade: "No. 4",
    origin: "Turkey",
    hsn: "0813",
    desc: "Pitted Malatya apricots, soft and bright. No added sugar.",
    ingredients: "Dried apricots (99.9%), preservative (INS 220)",
    allergens: "Contains sulphites. " + FACILITY,
    nutrition: NUT.apricot,
    shelf: 270,
    tone: "#E09A3E",
    retailPerKg: 1599,
    wholesalePerKg: 980,
    retailPacks: [250, 500],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "APT-2610-A", kg: 45, expDays: 260, supplier: "Anatolia Foods, Delhi", costPerKg: 900 }],
  },
  {
    slug: "pumpkin-seeds",
    name: "Pumpkin Seeds",
    cat: "seeds-berries",
    variety: "Pumpkin seed",
    grade: "Shine skin",
    origin: "India",
    hsn: "1207",
    desc: "Raw, hulled pumpkin seeds. Toast lightly or add to your morning bowl.",
    ingredients: "Pumpkin seeds (100%)",
    allergens: FACILITY,
    nutrition: NUT.pumpkin,
    shelf: 180,
    tone: "#6F8C4E",
    retailPerKg: 899,
    wholesalePerKg: 520,
    retailPacks: [250, 500],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "SPK-2610-A", kg: 60, expDays: 160, supplier: "Indore Seed Processors", costPerKg: 470 }],
  },
  {
    slug: "dried-cranberries",
    name: "Dried Cranberries",
    cat: "seeds-berries",
    variety: "Cranberry",
    grade: "Sweetened, sliced",
    origin: "USA",
    hsn: "0813",
    desc: "Wisconsin cranberries, sliced and lightly sweetened. Bright and tart.",
    ingredients: "Cranberries, sugar, sunflower oil",
    allergens: FACILITY,
    nutrition: NUT.cranberry,
    shelf: 300,
    tone: "#A3283B",
    retailPerKg: 1499,
    wholesalePerKg: 900,
    retailPacks: [200, 500],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "CRB-2609-A", kg: 35, expDays: 250, supplier: "Pacific Nut Importers, Navi Mumbai", costPerKg: 820 }],
  },
  {
    slug: "daily-trail-mix",
    name: "Daily Trail Mix",
    cat: "mixes",
    variety: "Mix",
    origin: "India",
    hsn: "0813",
    desc: "Almonds, cashews, raisins, pumpkin seeds and cranberries, mixed in-house each week. No salt, no oil.",
    ingredients: "Almonds (30%), cashews (25%), raisins (20%), pumpkin seeds (15%), dried cranberries (10%)",
    nutrition: NUT.mix,
    shelf: 150,
    tone: "#B7894C",
    retailPerKg: 1099,
    wholesalePerKg: 690,
    retailPacks: [250, 500, 1000],
    wholesalePacks: SMALL_WH,
    stock: [{ lot: "MXD-2610-A", kg: 40, expDays: 140, supplier: "Nutbox blending room", costPerKg: 610 }],
  },
];

const roundTo9 = (rupees: number) => Math.max(9, Math.round((rupees + 1) / 10) * 10 - 1);
const PACK_FACTOR: Record<number, number> = { 200: 0.23, 250: 0.28, 500: 0.53, 1000: 1 };
const label = (g: number) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

async function main() {
  console.log("Seeding Nutbox…");
  await db.execute(sql`TRUNCATE TABLE order_events, order_lines, orders, reservations, stock_movements, lots, inventory_levels,
    variant_components, price_breaks, variants, inventory_items, products, categories, addresses, users, companies, price_lists,
    coupons, settings, invoice_counters, locations RESTART IDENTITY CASCADE`);

  await db.insert(t.settings).values({
    storeName: "Nutbox",
    legalName: "Nutbox Foods Private Limited",
    gstin: STORE_GSTIN,
    fssaiLicence: "10026011000123",
    addressLine: "Plot 14, SIDCO Industrial Estate, Ambattur",
    city: "Chennai",
    stateCode: "33",
    pincode: "600098",
    supportEmail: "care@nutbox.in",
    supportPhone: "+91 44 4000 1234",
    bankDetails: "Nutbox Foods Pvt Ltd · HDFC Bank, Ambattur · A/c 50200012345678 · IFSC HDFC0001234",
  });
  const [loc] = await db.insert(t.locations).values({ name: "Chennai warehouse (Ambattur)", stateCode: "33", isDefault: true }).returning();

  const catRows = await db
    .insert(t.categories)
    .values([
      { slug: "nuts", name: "Nuts", blurb: "Cashews, almonds, pistachios and walnuts by grade.", sortOrder: 1 },
      { slug: "dried-fruits", name: "Dried fruits", blurb: "Raisins, apricots and more — sun and shade dried.", sortOrder: 2 },
      { slug: "dates-figs", name: "Dates & figs", blurb: "Kimia, Medjool and Afghan anjeer.", sortOrder: 3 },
      { slug: "seeds-berries", name: "Seeds & berries", blurb: "Pumpkin seeds and dried cranberries.", sortOrder: 4 },
      { slug: "mixes", name: "Mixes", blurb: "Blended in-house each week.", sortOrder: 5 },
      { slug: "gift-boxes", name: "Gift boxes", blurb: "Festive and corporate gifting.", sortOrder: 6 },
    ])
    .returning();
  const cat = Object.fromEntries(catRows.map((c) => [c.slug, c.id]));

  const [stdList] = await db.insert(t.priceLists).values({ name: "Standard wholesale", adjustmentBps: 0, isDefault: true }).returning();
  const [distList] = await db.insert(t.priceLists).values({ name: "Distributor", adjustmentBps: -400 }).returning();

  const itemBySlug: Record<string, string> = {};
  const variantBySku: Record<string, string> = {};

  for (const s of SPECS) {
    const [p] = await db
      .insert(t.products)
      .values({
        slug: s.slug,
        name: s.name,
        categoryId: cat[s.cat],
        variety: s.variety,
        grade: s.grade,
        origin: s.origin,
        processing: s.processing ?? "Raw",
        description: s.desc,
        hsnCode: s.hsn,
        gstRateBps: 500,
        ingredients: s.ingredients,
        ...(s.allergens ? { allergens: s.allergens } : {}),
        nutrition: s.nutrition,
        shelfLifeDays: s.shelf,
        tone: s.tone,
        isFeatured: s.featured ?? false,
      })
      .returning();

    const sku = s.slug.toUpperCase().replace(/-/g, "");
    const [item] = await db
      .insert(t.inventoryItems)
      .values({ sku: `${sku}-BULK`, name: `${s.name} (bulk)`, uom: "GRAM", productId: p.id, lowStockThreshold: (s.lowKg ?? 20) * 1000 })
      .returning();
    itemBySlug[s.slug] = item.id;

    let order = 0;
    for (const g of s.retailPacks) {
      const price = roundTo9(s.retailPerKg * (PACK_FACTOR[g] ?? g / 1000));
      const [v] = await db
        .insert(t.variants)
        .values({
          productId: p.id,
          sku: `${sku}-${g}G`,
          title: label(g),
          packType: g >= 1000 ? "Zip pouch" : "Pouch",
          netGrams: g,
          shipGrams: g + 40,
          soldRetail: true,
          soldWholesale: false,
          retailPricePaise: price * 100,
          mrpPaise: roundTo9(price * 1.18) * 100,
          sortOrder: order++,
        })
        .returning();
      variantBySku[v.sku] = v.id;
      await db.insert(t.variantComponents).values({ variantId: v.id, inventoryItemId: item.id, requiredQty: g });
    }
    for (const w of s.wholesalePacks) {
      const base = Math.round(s.wholesalePerKg * (w.g / 1000)) * 100;
      const [v] = await db
        .insert(t.variants)
        .values({
          productId: p.id,
          sku: `${sku}-${w.g / 1000}KG-WS`,
          title: `${label(w.g)} ${w.type.toLowerCase()}`,
          packType: w.type,
          netGrams: w.g,
          shipGrams: Math.round(w.g * 1.03),
          soldRetail: false,
          soldWholesale: true,
          wholesaleBasePaise: base,
          wholesaleMinQty: w.min,
          wholesaleStep: w.step,
          sortOrder: order++,
        })
        .returning();
      variantBySku[v.sku] = v.id;
      await db.insert(t.variantComponents).values({ variantId: v.id, inventoryItemId: item.id, requiredQty: w.g });
      // Volume breaks: 3% off at 5+ units, 5% off at 10+ (standard); distributor list goes deeper.
      const tiers =
        w.g >= 10000
          ? [{ q: Math.max(w.min, 4), std: 300, dist: 650 }, { q: Math.max(w.min, 10), std: 500, dist: 800 }]
          : [{ q: w.min + 5 * w.step, std: 250, dist: 600 }, { q: w.min + 15 * w.step, std: 450, dist: 750 }];
      for (const tier of tiers) {
        await db.insert(t.priceBreaks).values([
          { priceListId: stdList.id, variantId: v.id, minQty: tier.q, unitPricePaise: Math.round((base * (10000 - tier.std)) / 10000) },
          { priceListId: distList.id, variantId: v.id, minQty: tier.q, unitPricePaise: Math.round((base * (10000 - tier.dist)) / 10000) },
        ]);
      }
    }

    let onHand = 0;
    for (const lot of s.stock) {
      const qty = lot.kg * 1000;
      onHand += qty;
      const [l] = await db
        .insert(t.lots)
        .values({
          itemId: item.id,
          locationId: loc.id,
          lotNo: lot.lot,
          supplier: lot.supplier,
          costPaisePerKg: lot.costPerKg * 100,
          receivedAt: daysFromNow(-Math.max(5, s.shelf - lot.expDays)),
          expiresOn: daysFromNow(lot.expDays),
          qtyOnHand: qty,
        })
        .returning();
      await db.insert(t.stockMovements).values({
        itemId: item.id,
        locationId: loc.id,
        lotId: l.id,
        reason: "RECEIPT",
        deltaOnHand: qty,
        onHandAfter: onHand,
        reservedAfter: 0,
        refType: "LOT",
        refId: l.id,
        note: `From ${lot.supplier}`,
        actor: "seed",
      });
    }
    await db.insert(t.inventoryLevels).values({ itemId: item.id, locationId: loc.id, onHand, reserved: 0 });
  }

  // Gift box: a combo that draws from four shared pools at once.
  const [box] = await db
    .insert(t.products)
    .values({
      slug: "festive-gift-box",
      name: "Festive Dry Fruit Box",
      categoryId: cat["gift-boxes"],
      variety: "Assorted",
      grade: null,
      origin: "India",
      processing: "Assorted",
      description:
        "Four compartments in a rigid kraft box: W240 cashews, California almonds, roasted pistachios and Afghan green raisins — 700 g in all. Packed to order from the same stock as our loose packs.",
      hsnCode: "0813",
      gstRateBps: 500,
      ingredients: "Cashews (200 g), almonds (200 g), pistachios (150 g), raisins (150 g)",
      nutrition: NUT.mix,
      shelfLifeDays: 150,
      tone: "#7A2E2A",
      isFeatured: true,
    })
    .returning();
  const [boxV] = await db
    .insert(t.variants)
    .values({
      productId: box.id,
      sku: "GIFTBOX-700G",
      title: "700 g box",
      packType: "Gift box",
      netGrams: 700,
      shipGrams: 1050,
      retailPricePaise: 1349_00,
      mrpPaise: 1599_00,
    })
    .returning();
  variantBySku[boxV.sku] = boxV.id;
  await db.insert(t.variantComponents).values([
    { variantId: boxV.id, inventoryItemId: itemBySlug["cashew-w240"], requiredQty: 200 },
    { variantId: boxV.id, inventoryItemId: itemBySlug["almond-california"], requiredQty: 200 },
    { variantId: boxV.id, inventoryItemId: itemBySlug["pistachio-roasted-salted"], requiredQty: 150 },
    { variantId: boxV.id, inventoryItemId: itemBySlug["raisins-afghan-green"], requiredQty: 150 },
  ]);

  await db.insert(t.coupons).values([
    { code: "WELCOME10", type: "PERCENT", value: 1000, minSubtotalPaise: 499_00, channel: "RETAIL" },
    { code: "DIWALI15", type: "PERCENT", value: 1500, minSubtotalPaise: 3499_00, channel: "RETAIL", endsAt: new Date("2026-11-15T18:29:59Z"), usageLimit: 500 },
    { code: "BULK2", type: "PERCENT", value: 200, minSubtotalPaise: 50_000_00, channel: "WHOLESALE" },
  ]);

  // Accounts
  const hash = (pw: string) => bcrypt.hash(pw, 10);
  await db.insert(t.users).values({ email: "admin@nutbox.in", name: "Store Admin", passwordHash: await hash("admin123"), role: "ADMIN" });
  await db.insert(t.users).values({ email: "packing@nutbox.in", name: "Ravi (Packing)", passwordHash: await hash("staff123"), role: "STAFF" });
  const [priya] = await db
    .insert(t.users)
    .values({ email: "priya@example.com", name: "Priya Raman", phone: "9840012345", passwordHash: await hash("customer123") })
    .returning();
  await db.insert(t.addresses).values({
    userId: priya.id,
    name: "Priya Raman",
    phone: "9840012345",
    line1: "Flat 3B, Lotus Apartments, 12 Dr. Radhakrishnan Salai",
    line2: "Mylapore",
    city: "Chennai",
    stateCode: "33",
    pincode: "600004",
    isDefault: true,
  });

  const [sweets] = await db
    .insert(t.companies)
    .values({
      legalName: "Sri Krishna Sweets & Bakers LLP",
      tradeName: "SK Sweets",
      gstin: withCs("29ABMFS4821K1Z"),
      businessType: "Sweet shop / bakery",
      stateCode: "29",
      addressLine: "45, 2nd Cross, Gandhi Bazaar, Basavanagudi",
      city: "Bengaluru",
      pincode: "560004",
      phone: "9880045678",
      status: "APPROVED",
      priceListId: stdList.id,
      paymentTerms: "NET_15",
      creditLimitPaise: 5_00_000_00,
    })
    .returning();
  const [buyer] = await db
    .insert(t.users)
    .values({ email: "orders@sksweets.in", name: "Karthik S.", phone: "9880045678", passwordHash: await hash("wholesale123"), companyId: sweets.id })
    .returning();
  const [pending] = await db
    .insert(t.companies)
    .values({
      legalName: "Hotel Saravana Residency Pvt Ltd",
      gstin: withCs("33AACCH7765Q1Z"),
      businessType: "Hotel / restaurant / caterer",
      stateCode: "33",
      addressLine: "88, Usman Road, T. Nagar",
      city: "Chennai",
      pincode: "600017",
      phone: "9444012233",
      status: "PENDING",
    })
    .returning();
  await db
    .insert(t.users)
    .values({ email: "purchase@saravanaresidency.in", name: "Meena V.", phone: "9444012233", passwordHash: await hash("wholesale123"), companyId: pending.id });

  // Demo orders through the real checkout path (reservations, ledger, invoices).
  const { placeOrder, shipOrder, markDelivered, markPaid, recordOnlinePayment } = await import("../lib/orders");
  const priyaAddr = { name: "Priya Raman", phone: "9840012345", line1: "Flat 3B, Lotus Apartments", line2: "Mylapore", city: "Chennai", stateCode: "33", pincode: "600004" };
  const retail = (items: [string, number][], method: "COD" | "RAZORPAY", addr = priyaAddr, coupon?: string) =>
    placeOrder({
      channel: "RETAIL",
      user: { id: priya.id, email: priya.email, name: priya.name },
      company: null,
      priceList: null,
      items: items.map(([sku, q]) => ({ v: variantBySku[sku], q })),
      address: addr,
      paymentMethod: method,
      couponCode: coupon,
    });
  const delhi = { name: "Priya Raman (gift)", phone: "9840012345", line1: "C-21, Defence Colony", city: "New Delhi", stateCode: "07", pincode: "110024" };

  const o1 = await retail([["CASHEWW240-500G", 2], ["ALMONDCALIFORNIA-1000G", 1]], "RAZORPAY");
  await recordOnlinePayment(o1.id, "pay_demo_seed01", "seed");
  await shipOrder(o1.id, "seed", "Delhivery", "DLV2611004521");
  await markDelivered(o1.id, "seed");

  const o2 = await retail([["GIFTBOX-700G", 3]], "RAZORPAY", delhi, "WELCOME10");
  await recordOnlinePayment(o2.id, "pay_demo_seed02", "seed");
  await shipOrder(o2.id, "seed", "Blue Dart", "BD88812004");

  const o3 = await retail([["KIMIADATES-500G", 2], ["PISTACHIOROASTEDSALTED-250G", 1]], "COD");
  await shipOrder(o3.id, "seed", "Shiprocket · Ekart", "EK5521001");

  await retail([["MEDJOOLDATES-500G", 1], ["WALNUTKERNELS-500G", 1]], "COD");
  const o5 = await retail([["DAILYTRAILMIX-1000G", 1]], "RAZORPAY");
  await recordOnlinePayment(o5.id, "pay_demo_seed05", "seed");

  const ws = (items: [string, number][], method: "NET_TERMS" | "BANK_TRANSFER", asQuote = false) =>
    placeOrder({
      channel: "WHOLESALE",
      user: { id: buyer.id, email: buyer.email, name: buyer.name },
      company: sweets,
      priceList: { id: stdList.id, adjustmentBps: 0 },
      items: items.map(([sku, q]) => ({ v: variantBySku[sku], q })),
      address: { name: sweets.legalName, phone: sweets.phone, line1: sweets.addressLine, city: sweets.city, stateCode: sweets.stateCode, pincode: sweets.pincode },
      paymentMethod: method,
      asQuote,
    });
  const w1 = await ws([["CASHEWW240-25KG-WS", 2], ["RAISINSAFGHANGREEN-10KG-WS", 2]], "NET_TERMS");
  await shipOrder(w1.id, "seed", "VRL Logistics", "VRL-BLR-77812");
  await markDelivered(w1.id, "seed");
  await markPaid(w1.id, "seed", "NEFT UTR HDFC2610998812");
  await ws([["ALMONDCALIFORNIA-10KG-WS", 3], ["PISTACHIOROASTEDSALTED-5KG-WS", 2]], "NET_TERMS");
  await ws([["CASHEWW320-25KG-WS", 4], ["KIMIADATES-5KG-WS", 6]], "BANK_TRANSFER", true);

  // Spread demo orders over the past fortnight so the dashboard has a shape.
  const all = await db.select({ id: t.orders.id, number: t.orders.number }).from(t.orders);
  for (const o of all) {
    const at = daysFromNow(-(14 - o.number * 1.6));
    await db.update(t.orders).set({ createdAt: at }).where(eq(t.orders.id, o.id));
    await db.update(t.orderEvents).set({ createdAt: at }).where(eq(t.orderEvents.orderId, o.id));
  }

  console.log(`✓ ${SPECS.length + 1} products, ${Object.keys(variantBySku).length} variants, ${all.length} demo orders`);
  console.log("  admin@nutbox.in / admin123 · priya@example.com / customer123 · orders@sksweets.in / wholesale123");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
