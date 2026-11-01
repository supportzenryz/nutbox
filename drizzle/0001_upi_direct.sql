ALTER TYPE "public"."payment_method" ADD VALUE 'UPI';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "upi_ref" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "upi_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "upi_payee_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_upi_ref_unique" UNIQUE("upi_ref");