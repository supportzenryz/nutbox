// Nutbox — shared-inventory commerce for nuts & dry fruits (retail + wholesale)
// Money: integer paise. Weight: integer grams. GST rate: basis points (500 = 5%).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["CUSTOMER", "STAFF", "ADMIN"]);
export const channelEnum = pgEnum("channel", ["RETAIL", "WHOLESALE"]);
export const uomEnum = pgEnum("uom", ["GRAM", "UNIT"]);
export const companyStatusEnum = pgEnum("company_status", ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
export const paymentTermsEnum = pgEnum("payment_terms", ["PREPAID", "NET_7", "NET_15", "NET_30"]);
export const orderStatusEnum = pgEnum("order_status", ["QUOTE", "OPEN", "CANCELLED", "ARCHIVED"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "PAID", "REFUNDED", "VOIDED"]);
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", ["UNFULFILLED", "SHIPPED", "DELIVERED", "RETURNED"]);
export const paymentMethodEnum = pgEnum("payment_method", ["COD", "RAZORPAY", "BANK_TRANSFER", "NET_TERMS"]);
export const movementReasonEnum = pgEnum("movement_reason", [
  "RECEIPT",
  "RESERVE",
  "RELEASE",
  "SALE",
  "RETURN",
  "ADJUSTMENT",
  "WASTAGE",
]);
export const discountTypeEnum = pgEnum("discount_type", ["PERCENT", "FIXED"]);

export type Channel = (typeof channelEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type PaymentTerms = (typeof paymentTermsEnum.enumValues)[number];
export type MovementReason = (typeof movementReasonEnum.enumValues)[number];

// ───────────────────────── Accounts ─────────────────────────

export const priceLists = pgTable("price_lists", {
  id: id(),
  name: text("name").notNull().unique(),
  adjustmentBps: integer("adjustment_bps").notNull().default(0), // -500 = 5% below wholesale base
  isDefault: boolean("is_default").notNull().default(false),
});

export const companies = pgTable("companies", {
  id: id(),
  legalName: text("legal_name").notNull(),
  tradeName: text("trade_name"),
  gstin: text("gstin").unique(),
  businessType: text("business_type").notNull(),
  stateCode: text("state_code").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  pincode: text("pincode").notNull(),
  phone: text("phone").notNull(),
  status: companyStatusEnum("status").notNull().default("PENDING"),
  priceListId: text("price_list_id").references(() => priceLists.id),
  paymentTerms: paymentTermsEnum("payment_terms").notNull().default("PREPAID"),
  creditLimitPaise: integer("credit_limit_paise").notNull().default(0),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("CUSTOMER"),
  companyId: text("company_id").references(() => companies.id),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  createdAt: createdAt(),
});

export const addresses = pgTable("addresses", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  stateCode: text("state_code").notNull(),
  pincode: text("pincode").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
});

// ───────────────────────── Catalog ─────────────────────────

export const categories = pgTable("categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  blurb: text("blurb"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type Nutrition = { energyKcal: number; protein: number; carbs: number; sugar: number; fat: number; fibre: number };

export const products = pgTable("products", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  variety: text("variety").notNull(),
  grade: text("grade"),
  origin: text("origin").notNull(), // country of origin — Legal Metrology Rule 6(10A) filter
  processing: text("processing").notNull().default("Raw"),
  description: text("description").notNull(),
  hsnCode: text("hsn_code").notNull(),
  gstRateBps: integer("gst_rate_bps").notNull().default(500),
  ingredients: text("ingredients").notNull(),
  allergens: text("allergens")
    .notNull()
    .default("Contains tree nuts. Packed in a facility that also handles peanuts and sesame."),
  nutrition: jsonb("nutrition").$type<Nutrition>().notNull(),
  shelfLifeDays: integer("shelf_life_days").notNull().default(180),
  isVeg: boolean("is_veg").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  tone: text("tone").notNull().default("#C8A27A"),
  createdAt: createdAt(),
});

export const variants = pgTable("variants", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku").notNull().unique(),
  title: text("title").notNull(),
  packType: text("pack_type").notNull().default("Pouch"),
  netGrams: integer("net_grams").notNull(),
  shipGrams: integer("ship_grams").notNull(),
  soldRetail: boolean("sold_retail").notNull().default(true),
  soldWholesale: boolean("sold_wholesale").notNull().default(false),
  mrpPaise: integer("mrp_paise").notNull().default(0), // incl. GST
  retailPricePaise: integer("retail_price_paise").notNull().default(0), // incl. GST
  wholesaleBasePaise: integer("wholesale_base_paise").notNull().default(0), // excl. GST
  wholesaleMinQty: integer("wholesale_min_qty").notNull().default(1),
  wholesaleStep: integer("wholesale_step").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

// ───────────────────────── Inventory ─────────────────────────

export const inventoryItems = pgTable("inventory_items", {
  id: id(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  uom: uomEnum("uom").notNull().default("GRAM"),
  productId: text("product_id").references(() => products.id),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(20000),
});

/** Which stock a variant draws from and how much per unit sold (Medusa "inventory kit" pattern). */
export const variantComponents = pgTable(
  "variant_components",
  {
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    requiredQty: integer("required_qty").notNull(), // grams for GRAM items, units for UNIT items
  },
  (t) => [primaryKey({ columns: [t.variantId, t.inventoryItemId] }), check("required_qty_positive", sql`${t.requiredQty} > 0`)],
);

export const locations = pgTable("locations", {
  id: id(),
  name: text("name").notNull(),
  stateCode: text("state_code").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
});

/** One shared pool per (item, location). Retail AND wholesale orders reserve from this row. */
export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_levels_item_location").on(t.itemId, t.locationId),
    check("levels_non_negative", sql`${t.onHand} >= 0 AND ${t.reserved} >= 0 AND ${t.reserved} <= ${t.onHand}`),
  ],
);

/** Batch / lot for FSSAI traceability and FEFO picking. */
export const lots = pgTable(
  "lots",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    lotNo: text("lot_no").notNull(),
    supplier: text("supplier"),
    costPaisePerKg: integer("cost_paise_per_kg"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    expiresOn: timestamp("expires_on", { withTimezone: true }).notNull(),
    qtyOnHand: integer("qty_on_hand").notNull(),
  },
  (t) => [
    uniqueIndex("lots_item_location_lot").on(t.itemId, t.locationId, t.lotNo),
    index("lots_fefo").on(t.itemId, t.locationId, t.expiresOn),
    check("lot_qty_non_negative", sql`${t.qtyOnHand} >= 0`),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    orderId: text("order_id").notNull(),
    orderLineId: text("order_line_id").notNull(),
    itemId: text("item_id").notNull(),
    locationId: text("location_id").notNull(),
    qty: integer("qty").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reservations_line_item").on(t.orderLineId, t.itemId), index("reservations_order").on(t.orderId)],
);

/** Immutable inventory ledger (Shopify "adjustment history"). */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    locationId: text("location_id").notNull(),
    lotId: text("lot_id"),
    reason: movementReasonEnum("reason").notNull(),
    deltaOnHand: integer("delta_on_hand").notNull().default(0),
    deltaReserved: integer("delta_reserved").notNull().default(0),
    onHandAfter: integer("on_hand_after").notNull(),
    reservedAfter: integer("reserved_after").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    note: text("note"),
    actor: text("actor"),
    createdAt: createdAt(),
  },
  (t) => [index("movements_item_time").on(t.itemId, t.createdAt), index("movements_ref").on(t.refType, t.refId)],
);

// ───────────────────────── Wholesale pricing ─────────────────────────

export const priceBreaks = pgTable(
  "price_breaks",
  {
    id: id(),
    priceListId: text("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    minQty: integer("min_qty").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(), // excl. GST
  },
  (t) => [uniqueIndex("price_breaks_list_variant_qty").on(t.priceListId, t.variantId, t.minQty)],
);

// ───────────────────────── Orders ─────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: id(),
    number: serial("number").notNull().unique(),
    channel: channelEnum("channel").notNull(),
    status: orderStatusEnum("status").notNull().default("OPEN"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("PENDING"),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status").notNull().default("UNFULFILLED"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    companyId: text("company_id").references(() => companies.id),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    shipName: text("ship_name").notNull(),
    shipLine1: text("ship_line1").notNull(),
    shipLine2: text("ship_line2"),
    shipCity: text("ship_city").notNull(),
    shipStateCode: text("ship_state_code").notNull(),
    shipPincode: text("ship_pincode").notNull(),
    buyerGstin: text("buyer_gstin"),
    buyerLegalName: text("buyer_legal_name"),
    supplyType: text("supply_type").$type<"INTRA" | "INTER">().notNull(),
    itemsGrossPaise: integer("items_gross_paise").notNull(), // retail: incl. GST; wholesale: excl. GST
    discountPaise: integer("discount_paise").notNull().default(0),
    shippingPaise: integer("shipping_paise").notNull().default(0),
    taxablePaise: integer("taxable_paise").notNull(),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    totalGrams: integer("total_grams").notNull().default(0),
    couponCode: text("coupon_code"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id"),
    invoiceNo: text("invoice_no").unique(),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
    courier: text("courier"),
    awb: text("awb"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    customerNote: text("customer_note"),
    createdAt: createdAt(),
  },
  (t) => [index("orders_channel_time").on(t.channel, t.createdAt), index("orders_status").on(t.status, t.fulfillmentStatus)],
);

export const orderLines = pgTable("order_lines", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  variantId: text("variant_id")
    .notNull()
    .references(() => variants.id),
  sku: text("sku").notNull(),
  title: text("title").notNull(),
  hsnCode: text("hsn_code").notNull(),
  gstRateBps: integer("gst_rate_bps").notNull(),
  netGrams: integer("net_grams").notNull(),
  qty: integer("qty").notNull(),
  unitPricePaise: integer("unit_price_paise").notNull(), // retail incl. GST, wholesale excl. GST
  discountPaise: integer("discount_paise").notNull().default(0),
  taxablePaise: integer("taxable_paise").notNull(),
  taxPaise: integer("tax_paise").notNull(),
  totalPaise: integer("total_paise").notNull(),
});

export const orderEvents = pgTable("order_events", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  actor: text("actor"),
  createdAt: createdAt(),
});

export const coupons = pgTable("coupons", {
  id: id(),
  code: text("code").notNull().unique(),
  type: discountTypeEnum("type").notNull(),
  value: integer("value").notNull(), // PERCENT: basis points; FIXED: paise
  minSubtotalPaise: integer("min_subtotal_paise").notNull().default(0),
  channel: channelEnum("channel"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  storeName: text("store_name").notNull(),
  legalName: text("legal_name").notNull(),
  gstin: text("gstin").notNull(),
  fssaiLicence: text("fssai_licence").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  stateCode: text("state_code").notNull(),
  pincode: text("pincode").notNull(),
  supportEmail: text("support_email").notNull(),
  supportPhone: text("support_phone").notNull(),
  freeShippingThresholdPaise: integer("free_shipping_threshold_paise").notNull().default(99900),
  retailShippingPaise: integer("retail_shipping_paise").notNull().default(7900),
  codLimitPaise: integer("cod_limit_paise").notNull().default(1000000),
  wholesaleFreightPerKgPaise: integer("wholesale_freight_per_kg_paise").notNull().default(1200),
  wholesaleMinOrderPaise: integer("wholesale_min_order_paise").notNull().default(1000000),
  invoicePrefix: text("invoice_prefix").notNull().default("NB"),
  bankDetails: text("bank_details").notNull().default(""),
});

export const invoiceCounters = pgTable("invoice_counters", {
  fy: text("fy").primaryKey(), // "2627" = FY 2026-27
  next: integer("next").notNull().default(1),
});
