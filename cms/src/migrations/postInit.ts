import * as Sentry from '@sentry/node';
import type { Pool as PoolType } from 'pg';
import type { Payload } from 'payload';

/**
 * Post-init migrations: create/fix tables that depend on Payload tables existing.
 * Runs AFTER payload.init().
 */
export async function runPostInitMigrations(pool: PoolType, payloadLogger: Payload['logger']): Promise<void> {
  try {
    // users_rels table (needed for profilePicture upload field)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "users_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL,
        "path" varchar NOT NULL,
        "media_id" integer
      );
      DO $$ BEGIN
        ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE INDEX IF NOT EXISTS "users_rels_order_idx" ON "users_rels" USING btree ("order");
      CREATE INDEX IF NOT EXISTS "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
      CREATE INDEX IF NOT EXISTS "users_rels_path_idx" ON "users_rels" USING btree ("path");
      CREATE INDEX IF NOT EXISTS "users_rels_media_id_idx" ON "users_rels" USING btree ("media_id");
    `);

    // Add void_requests_id column to transactions_rels if missing
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE "transactions_rels" ADD COLUMN "void_requests_id" integer;
      EXCEPTION WHEN duplicate_column THEN null;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "transactions_rels" ADD CONSTRAINT "transactions_rels_void_requests_fk" FOREIGN KEY ("void_requests_id") REFERENCES "public"."void_requests"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE INDEX IF NOT EXISTS "transactions_rels_void_requests_id_idx" ON "transactions_rels" USING btree ("void_requests_id");
    `);

    // Auto-migrate: create user_events table for analytics collection
    // Payload ORM uses camelCase "eventType" column. DB_PUSH may create snake_case "event_type" instead.
    // This migration ensures only "eventType" exists.
    await pool.query(`
      DO $$ BEGIN
        -- Case 1: DB_PUSH created event_type (snake_case) but eventType doesn't exist → rename
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_events' AND column_name = 'event_type'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_events' AND column_name = 'eventType'
        ) THEN
          ALTER TABLE "user_events" RENAME COLUMN "event_type" TO "eventType";
          ALTER TABLE "user_events" ALTER COLUMN "eventType" TYPE varchar;
        END IF;

        -- Case 2: Both columns exist (DB_PUSH added event_type alongside eventType) → merge and drop
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_events' AND column_name = 'event_type'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_events' AND column_name = 'eventType'
        ) THEN
          UPDATE "user_events" SET "eventType" = event_type WHERE "eventType" IS NULL AND event_type IS NOT NULL;
          ALTER TABLE "user_events" DROP COLUMN "event_type";
        END IF;
      END $$;
    `);

    // Create enum type for eventType select field
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_user_events_event_type" AS ENUM (
          'page_view', 'login', 'login_failed', 'logout', 'register',
          'search', 'product_view', 'conversation_opened', 'user_profile_viewed', 'media_uploaded',
          'bid_placed', 'product_created', 'product_updated', 'product_sold',
          'message_sent', 'transaction_status_changed', 'rating_created', 'rating_follow_up',
          'bid_accepted', 'void_request_created', 'void_request_responded',
          'seller_choice_made', 'second_bidder_responded', 'profile_updated', 'profile_picture_changed'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "eventType" "enum_user_events_event_type",
        "page" varchar,
        "metadata" jsonb,
        "session_id" varchar,
        "device_info" jsonb,
        "referrer" varchar,
        "ip" varchar,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "user_events_event_type_idx" ON "user_events" USING btree ("eventType");
      CREATE INDEX IF NOT EXISTS "user_events_session_id_idx" ON "user_events" USING btree ("session_id");
      CREATE INDEX IF NOT EXISTS "user_events_created_at_idx" ON "user_events" USING btree ("created_at");
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_events_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL,
        "path" varchar NOT NULL,
        "users_id" integer
      );
    `);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE "user_events_rels" ADD CONSTRAINT "user_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user_events"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "user_events_rels" ADD CONSTRAINT "user_events_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE INDEX IF NOT EXISTS "user_events_rels_order_idx" ON "user_events_rels" USING btree ("order");
      CREATE INDEX IF NOT EXISTS "user_events_rels_parent_idx" ON "user_events_rels" USING btree ("parent_id");
      CREATE INDEX IF NOT EXISTS "user_events_rels_path_idx" ON "user_events_rels" USING btree ("path");
      CREATE INDEX IF NOT EXISTS "user_events_rels_users_id_idx" ON "user_events_rels" USING btree ("users_id");
    `);

    // Products categories (hasMany select)
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_products_categories" AS ENUM (
          'electronics', 'fashion', 'home_garden', 'sports_outdoors', 'collectibles',
          'vehicles', 'books_media', 'toys_games', 'art_crafts', 'beauty_health',
          'jewelry_watches', 'musical_instruments', 'pet_supplies', 'tools_equipment',
          'food_beverages', 'tickets_vouchers', 'real_estate', 'services', 'other'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "products_categories" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL,
        "value" "enum_products_categories"
      );
      DO $$ BEGIN
        ALTER TABLE "products_categories" ADD CONSTRAINT "products_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE INDEX IF NOT EXISTS "products_categories_order_idx" ON "products_categories" USING btree ("order");
      CREATE INDEX IF NOT EXISTS "products_categories_parent_idx" ON "products_categories" USING btree ("parent_id");
    `);

    payloadLogger.info('Database schema verified/migrated');
  } catch (migrationErr: any) {
    payloadLogger.error('Failed to run startup migration: ' + migrationErr.message);
    Sentry.captureException(migrationErr, { tags: { route: 'startup.migration.schema' } });
  }
}
