import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  // ============================================================
  // 1. New enum types
  // ============================================================
  await payload.db.drizzle.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_ratings_rater_role" AS ENUM ('buyer', 'seller');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_products_delivery_options" AS ENUM ('delivery', 'meetup', 'both');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_email_templates_type" AS ENUM (
        'bid_won_buyer', 'bid_won_seller', 'auction_restarted',
        'second_bidder_offer', 'void_request_created', 'void_request_approved',
        'void_request_rejected', 'new_bid_placed', 'outbid_notification'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_void_requests_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_void_requests_seller_choice" AS ENUM ('restart_bidding', 'offer_second_bidder');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_void_requests_second_bidder_offer_offer_status" AS ENUM ('pending', 'accepted', 'declined', 'expired');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `)

  // ============================================================
  // 2. Add 'voided' to transactions status enum
  // ============================================================
  await payload.db.drizzle.execute(sql`
    DO $$ BEGIN
      ALTER TYPE "enum_transactions_status" ADD VALUE IF NOT EXISTS 'voided';
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `)

  // ============================================================
  // 3. New columns on users table
  // ============================================================
  await payload.db.drizzle.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "country_code" varchar;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_number" varchar;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "censor_name" boolean;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_picture_id" integer REFERENCES "media"("id") ON DELETE SET NULL;
  `)

  // ============================================================
  // 4. New columns on products table
  // ============================================================
  await payload.db.drizzle.execute(sql`
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "region" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "city" varchar;
    ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "delivery_options" "enum_products_delivery_options";
  `)

  // ============================================================
  // 5. Create ratings table
  // ============================================================
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "ratings" (
      "id" serial PRIMARY KEY NOT NULL,
      "rating" numeric NOT NULL,
      "comment" varchar,
      "rater_role" "enum_ratings_rater_role" NOT NULL,
      "follow_up_rating" numeric,
      "follow_up_comment" varchar,
      "follow_up_created_at" timestamp(3) with time zone,
      "has_follow_up" boolean,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "ratings_created_at_idx" ON "ratings" USING btree ("created_at");
  `)

  // Create ratings_rels table
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "ratings_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL REFERENCES "ratings"("id") ON DELETE CASCADE,
      "path" varchar NOT NULL,
      "transactions_id" integer REFERENCES "transactions"("id") ON DELETE CASCADE,
      "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "ratings_rels_order_idx" ON "ratings_rels" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "ratings_rels_parent_idx" ON "ratings_rels" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "ratings_rels_path_idx" ON "ratings_rels" USING btree ("path");
    CREATE INDEX IF NOT EXISTS "ratings_rels_transactions_id_idx" ON "ratings_rels" USING btree ("transactions_id");
    CREATE INDEX IF NOT EXISTS "ratings_rels_users_id_idx" ON "ratings_rels" USING btree ("users_id");
  `)

  // ============================================================
  // 6. Create void_requests table (idempotent — may already exist from 001_void_requests.sql)
  //    The old SQL migration used camelCase columns; Payload expects snake_case.
  //    We handle both cases: fresh create OR rename existing camelCase columns.
  // ============================================================
  await payload.db.drizzle.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_void_requests_initiator_role" AS ENUM ('buyer', 'seller');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `)

  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "void_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "initiator_role" "enum_void_requests_initiator_role" NOT NULL,
      "reason" varchar NOT NULL,
      "status" "enum_void_requests_status" NOT NULL DEFAULT 'pending',
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
  `)

  // Fix camelCase columns from 001_void_requests.sql if they exist
  await payload.db.drizzle.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "void_requests" RENAME COLUMN "initiatorRole" TO "initiator_role";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "void_requests" RENAME COLUMN "rejectionReason" TO "rejection_reason";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "void_requests" RENAME COLUMN "sellerChoice" TO "seller_choice";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "void_requests" RENAME COLUMN "secondBidderOffer_offerAmount" TO "second_bidder_offer_offer_amount";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "void_requests" RENAME COLUMN "secondBidderOffer_offerStatus" TO "second_bidder_offer_offer_status";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "void_requests" RENAME COLUMN "secondBidderOffer_offeredAt" TO "second_bidder_offer_offered_at";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "void_requests" RENAME COLUMN "secondBidderOffer_respondedAt" TO "second_bidder_offer_responded_at";
    EXCEPTION WHEN undefined_column THEN null;
    END $$;
  `)

  // Create void_requests_rels table
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "void_requests_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL REFERENCES "void_requests"("id") ON DELETE CASCADE,
      "path" varchar NOT NULL,
      "transactions_id" integer REFERENCES "transactions"("id") ON DELETE CASCADE,
      "products_id" integer REFERENCES "products"("id") ON DELETE CASCADE,
      "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "void_requests_rels_order_idx" ON "void_requests_rels" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "void_requests_rels_parent_idx" ON "void_requests_rels" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "void_requests_rels_path_idx" ON "void_requests_rels" USING btree ("path");
    CREATE INDEX IF NOT EXISTS "void_requests_rels_transactions_id_idx" ON "void_requests_rels" USING btree ("transactions_id");
    CREATE INDEX IF NOT EXISTS "void_requests_rels_products_id_idx" ON "void_requests_rels" USING btree ("products_id");
    CREATE INDEX IF NOT EXISTS "void_requests_rels_users_id_idx" ON "void_requests_rels" USING btree ("users_id");
  `)

  // Add void_requests_id to transactions_rels
  await payload.db.drizzle.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "transactions_rels" ADD COLUMN "void_requests_id" integer REFERENCES "void_requests"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_column THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "transactions_rels_void_requests_id_idx" ON "transactions_rels" USING btree ("void_requests_id");
  `)

  // ============================================================
  // 7. Create email_templates table
  // ============================================================
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "email_templates" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "type" "enum_email_templates_type" NOT NULL,
      "subject" varchar NOT NULL,
      "html_content" varchar NOT NULL,
      "text_content" varchar,
      "active" boolean DEFAULT true,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "email_templates_created_at_idx" ON "email_templates" USING btree ("created_at");
  `)
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Drop new tables
  await payload.db.drizzle.execute(sql`
    DROP TABLE IF EXISTS "email_templates";
    DROP TABLE IF EXISTS "ratings_rels";
    DROP TABLE IF EXISTS "ratings";
    DROP TABLE IF EXISTS "void_requests_rels";
    DROP TABLE IF EXISTS "void_requests";
  `)

  // Remove new columns from existing tables
  await payload.db.drizzle.execute(sql`
    ALTER TABLE "users" DROP COLUMN IF EXISTS "country_code";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_number";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "censor_name";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "profile_picture_id";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "region";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "city";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "delivery_options";
    ALTER TABLE "transactions_rels" DROP COLUMN IF EXISTS "void_requests_id";
  `)

  // Drop new enum types
  await payload.db.drizzle.execute(sql`
    DROP TYPE IF EXISTS "enum_ratings_rater_role";
    DROP TYPE IF EXISTS "enum_products_delivery_options";
    DROP TYPE IF EXISTS "enum_email_templates_type";
    DROP TYPE IF EXISTS "enum_void_requests_status";
    DROP TYPE IF EXISTS "enum_void_requests_seller_choice";
    DROP TYPE IF EXISTS "enum_void_requests_second_bidder_offer_offer_status";
    DROP TYPE IF EXISTS "enum_void_requests_initiator_role";
  `)
}
