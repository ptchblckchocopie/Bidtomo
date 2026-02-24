-- Users: add missing columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "country_code" varchar DEFAULT '+63';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_number" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "censor_name" boolean DEFAULT false;

-- Products: add missing columns
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "region" varchar;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "city" varchar;

DO $$ BEGIN
  CREATE TYPE "public"."enum_products_delivery_options" AS ENUM('delivery', 'meetup', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "delivery_options" "enum_products_delivery_options";
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;

DO $$ BEGIN
  ALTER TYPE "public"."enum_products_status" ADD VALUE IF NOT EXISTS 'available';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE "public"."enum_products_status" ADD VALUE IF NOT EXISTS 'ended';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Transactions: add voided status
DO $$ BEGIN
  ALTER TYPE "public"."enum_transactions_status" ADD VALUE IF NOT EXISTS 'voided';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Void Requests enums
DO $$ BEGIN
  CREATE TYPE "public"."enum_void_requests_initiator_role" AS ENUM('buyer', 'seller');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."enum_void_requests_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."enum_void_requests_seller_choice" AS ENUM('restart_bidding', 'offer_second_bidder');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."enum_void_requests_second_bidder_offer_offer_status" AS ENUM('pending', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Void Requests table
CREATE TABLE IF NOT EXISTS "void_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "reason" varchar NOT NULL,
  "initiator_role" "enum_void_requests_initiator_role" NOT NULL,
  "status" "enum_void_requests_status" DEFAULT 'pending' NOT NULL,
  "rejection_reason" varchar,
  "approved_at" timestamp(3) with time zone,
  "seller_choice" "enum_void_requests_seller_choice",
  "second_bidder_offer_offer_amount" numeric,
  "second_bidder_offer_offer_status" "enum_void_requests_second_bidder_offer_offer_status",
  "second_bidder_offer_offered_at" timestamp(3) with time zone,
  "second_bidder_offer_responded_at" timestamp(3) with time zone,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "void_requests_created_at_idx" ON "void_requests" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "void_requests_rels" (
  "id" serial PRIMARY KEY NOT NULL,
  "order" integer,
  "parent_id" integer NOT NULL,
  "path" varchar NOT NULL,
  "transactions_id" integer,
  "products_id" integer,
  "users_id" integer
);

DO $$ BEGIN
  ALTER TABLE "void_requests_rels" ADD CONSTRAINT "void_requests_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."void_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "void_requests_rels" ADD CONSTRAINT "void_requests_rels_transactions_fk" FOREIGN KEY ("transactions_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "void_requests_rels" ADD CONSTRAINT "void_requests_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "void_requests_rels" ADD CONSTRAINT "void_requests_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "void_requests_rels_order_idx" ON "void_requests_rels" USING btree ("order");
CREATE INDEX IF NOT EXISTS "void_requests_rels_parent_idx" ON "void_requests_rels" USING btree ("parent_id");
CREATE INDEX IF NOT EXISTS "void_requests_rels_path_idx" ON "void_requests_rels" USING btree ("path");
CREATE INDEX IF NOT EXISTS "void_requests_rels_transactions_id_idx" ON "void_requests_rels" USING btree ("transactions_id");
CREATE INDEX IF NOT EXISTS "void_requests_rels_products_id_idx" ON "void_requests_rels" USING btree ("products_id");
CREATE INDEX IF NOT EXISTS "void_requests_rels_users_id_idx" ON "void_requests_rels" USING btree ("users_id");

-- Add voidRequest relationship to transactions
ALTER TABLE "transactions_rels" ADD COLUMN IF NOT EXISTS "void_requests_id" integer;
DO $$ BEGIN
  ALTER TABLE "transactions_rels" ADD CONSTRAINT "transactions_rels_void_requests_fk" FOREIGN KEY ("void_requests_id") REFERENCES "public"."void_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "transactions_rels_void_requests_id_idx" ON "transactions_rels" USING btree ("void_requests_id");

-- Ratings enums
DO $$ BEGIN
  CREATE TYPE "public"."enum_ratings_rater_role" AS ENUM('buyer', 'seller');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Ratings table
CREATE TABLE IF NOT EXISTS "ratings" (
  "id" serial PRIMARY KEY NOT NULL,
  "rater_role" "enum_ratings_rater_role" NOT NULL,
  "rating" numeric NOT NULL,
  "comment" varchar,
  "follow_up_rating" numeric,
  "follow_up_comment" varchar,
  "follow_up_created_at" timestamp(3) with time zone,
  "has_follow_up" boolean DEFAULT false,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ratings_created_at_idx" ON "ratings" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "ratings_rels" (
  "id" serial PRIMARY KEY NOT NULL,
  "order" integer,
  "parent_id" integer NOT NULL,
  "path" varchar NOT NULL,
  "transactions_id" integer,
  "users_id" integer
);

DO $$ BEGIN
  ALTER TABLE "ratings_rels" ADD CONSTRAINT "ratings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ratings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ratings_rels" ADD CONSTRAINT "ratings_rels_transactions_fk" FOREIGN KEY ("transactions_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ratings_rels" ADD CONSTRAINT "ratings_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "ratings_rels_order_idx" ON "ratings_rels" USING btree ("order");
CREATE INDEX IF NOT EXISTS "ratings_rels_parent_idx" ON "ratings_rels" USING btree ("parent_id");
CREATE INDEX IF NOT EXISTS "ratings_rels_path_idx" ON "ratings_rels" USING btree ("path");
CREATE INDEX IF NOT EXISTS "ratings_rels_transactions_id_idx" ON "ratings_rels" USING btree ("transactions_id");
CREATE INDEX IF NOT EXISTS "ratings_rels_users_id_idx" ON "ratings_rels" USING btree ("users_id");

-- Media prefix column
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "prefix" varchar DEFAULT 'media';
