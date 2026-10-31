CREATE TYPE "public"."channel" AS ENUM('RETAIL', 'WHOLESALE');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('PERCENT', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_status" AS ENUM('UNFULFILLED', 'SHIPPED', 'DELIVERED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."movement_reason" AS ENUM('RECEIPT', 'RESERVE', 'RELEASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'WASTAGE');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('QUOTE', 'OPEN', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('COD', 'RAZORPAY', 'BANK_TRANSFER', 'NET_TERMS');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'REFUNDED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."payment_terms" AS ENUM('PREPAID', 'NET_7', 'NET_15', 'NET_30');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('CUSTOMER', 'STAFF', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."uom" AS ENUM('GRAM', 'UNIT');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state_code" text NOT NULL,
	"pincode" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"blurb" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"gstin" text,
	"business_type" text NOT NULL,
	"state_code" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"pincode" text NOT NULL,
	"phone" text NOT NULL,
	"status" "company_status" DEFAULT 'PENDING' NOT NULL,
	"price_list_id" text,
	"payment_terms" "payment_terms" DEFAULT 'PREPAID' NOT NULL,
	"credit_limit_paise" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_gstin_unique" UNIQUE("gstin")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "discount_type" NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal_paise" integer DEFAULT 0 NOT NULL,
	"channel" "channel",
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"uom" "uom" DEFAULT 'GRAM' NOT NULL,
	"product_id" text,
	"low_stock_threshold" integer DEFAULT 20000 NOT NULL,
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"location_id" text NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_non_negative" CHECK ("inventory_levels"."on_hand" >= 0 AND "inventory_levels"."reserved" >= 0 AND "inventory_levels"."reserved" <= "inventory_levels"."on_hand")
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"fy" text PRIMARY KEY NOT NULL,
	"next" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state_code" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"location_id" text NOT NULL,
	"lot_no" text NOT NULL,
	"supplier" text,
	"cost_paise_per_kg" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_on" timestamp with time zone NOT NULL,
	"qty_on_hand" integer NOT NULL,
	CONSTRAINT "lot_qty_non_negative" CHECK ("lots"."qty_on_hand" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"hsn_code" text NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"net_grams" integer NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"taxable_paise" integer NOT NULL,
	"tax_paise" integer NOT NULL,
	"total_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "order_status" DEFAULT 'OPEN' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"fulfillment_status" "fulfillment_status" DEFAULT 'UNFULFILLED' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"ship_name" text NOT NULL,
	"ship_line1" text NOT NULL,
	"ship_line2" text,
	"ship_city" text NOT NULL,
	"ship_state_code" text NOT NULL,
	"ship_pincode" text NOT NULL,
	"buyer_gstin" text,
	"buyer_legal_name" text,
	"supply_type" text NOT NULL,
	"items_gross_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"shipping_paise" integer DEFAULT 0 NOT NULL,
	"taxable_paise" integer NOT NULL,
	"cgst_paise" integer DEFAULT 0 NOT NULL,
	"sgst_paise" integer DEFAULT 0 NOT NULL,
	"igst_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"total_grams" integer DEFAULT 0 NOT NULL,
	"coupon_code" text,
	"due_date" timestamp with time zone,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"invoice_no" text,
	"invoiced_at" timestamp with time zone,
	"courier" text,
	"awb" text,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"customer_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "orders_invoice_no_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "price_breaks" (
	"id" text PRIMARY KEY NOT NULL,
	"price_list_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"min_qty" integer NOT NULL,
	"unit_price_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"adjustment_bps" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "price_lists_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"variety" text NOT NULL,
	"grade" text,
	"origin" text NOT NULL,
	"processing" text DEFAULT 'Raw' NOT NULL,
	"description" text NOT NULL,
	"hsn_code" text NOT NULL,
	"gst_rate_bps" integer DEFAULT 500 NOT NULL,
	"ingredients" text NOT NULL,
	"allergens" text DEFAULT 'Contains tree nuts. Packed in a facility that also handles peanuts and sesame.' NOT NULL,
	"nutrition" jsonb NOT NULL,
	"shelf_life_days" integer DEFAULT 180 NOT NULL,
	"is_veg" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"tone" text DEFAULT '#C8A27A' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"item_id" text NOT NULL,
	"location_id" text NOT NULL,
	"qty" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"store_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"gstin" text NOT NULL,
	"fssai_licence" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"state_code" text NOT NULL,
	"pincode" text NOT NULL,
	"support_email" text NOT NULL,
	"support_phone" text NOT NULL,
	"free_shipping_threshold_paise" integer DEFAULT 99900 NOT NULL,
	"retail_shipping_paise" integer DEFAULT 7900 NOT NULL,
	"cod_limit_paise" integer DEFAULT 1000000 NOT NULL,
	"wholesale_freight_per_kg_paise" integer DEFAULT 1200 NOT NULL,
	"wholesale_min_order_paise" integer DEFAULT 1000000 NOT NULL,
	"invoice_prefix" text DEFAULT 'NB' NOT NULL,
	"bank_details" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"location_id" text NOT NULL,
	"lot_id" text,
	"reason" "movement_reason" NOT NULL,
	"delta_on_hand" integer DEFAULT 0 NOT NULL,
	"delta_reserved" integer DEFAULT 0 NOT NULL,
	"on_hand_after" integer NOT NULL,
	"reserved_after" integer NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'CUSTOMER' NOT NULL,
	"company_id" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "variant_components" (
	"variant_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"required_qty" integer NOT NULL,
	CONSTRAINT "variant_components_variant_id_inventory_item_id_pk" PRIMARY KEY("variant_id","inventory_item_id"),
	CONSTRAINT "required_qty_positive" CHECK ("variant_components"."required_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"pack_type" text DEFAULT 'Pouch' NOT NULL,
	"net_grams" integer NOT NULL,
	"ship_grams" integer NOT NULL,
	"sold_retail" boolean DEFAULT true NOT NULL,
	"sold_wholesale" boolean DEFAULT false NOT NULL,
	"mrp_paise" integer DEFAULT 0 NOT NULL,
	"retail_price_paise" integer DEFAULT 0 NOT NULL,
	"wholesale_base_paise" integer DEFAULT 0 NOT NULL,
	"wholesale_min_qty" integer DEFAULT 1 NOT NULL,
	"wholesale_step" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breaks" ADD CONSTRAINT "price_breaks_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breaks" ADD CONSTRAINT "price_breaks_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_components" ADD CONSTRAINT "variant_components_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_components" ADD CONSTRAINT "variant_components_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_levels_item_location" ON "inventory_levels" USING btree ("item_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lots_item_location_lot" ON "lots" USING btree ("item_id","location_id","lot_no");--> statement-breakpoint
CREATE INDEX "lots_fefo" ON "lots" USING btree ("item_id","location_id","expires_on");--> statement-breakpoint
CREATE INDEX "orders_channel_time" ON "orders" USING btree ("channel","created_at");--> statement-breakpoint
CREATE INDEX "orders_status" ON "orders" USING btree ("status","fulfillment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "price_breaks_list_variant_qty" ON "price_breaks" USING btree ("price_list_id","variant_id","min_qty");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_line_item" ON "reservations" USING btree ("order_line_id","item_id");--> statement-breakpoint
CREATE INDEX "reservations_order" ON "reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "movements_item_time" ON "stock_movements" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "movements_ref" ON "stock_movements" USING btree ("ref_type","ref_id");