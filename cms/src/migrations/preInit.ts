import * as Sentry from '@sentry/node';
import type { Pool as PoolType } from 'pg';

/**
 * Pre-init migration: ensure ratings table has all required columns before Payload queries it.
 * Must run BEFORE payload.init().
 */
export async function runPreInitMigrations(pool: PoolType): Promise<void> {
  try {
    // Ensure enum type exists
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_ratings_rater_role" AS ENUM ('buyer', 'seller');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create table if it doesn't exist at all (with correct column names)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ratings" (
        "id" serial PRIMARY KEY NOT NULL,
        "rating" numeric NOT NULL,
        "comment" varchar,
        "raterRole" "enum_ratings_rater_role" NOT NULL DEFAULT 'buyer',
        "follow_up_rating" numeric,
        "follow_up_comment" varchar,
        "follow_up_created_at" timestamp(3) with time zone,
        "has_follow_up" boolean,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
    `);

    // Fix legacy column: drop "score" if "rating" already exists, otherwise rename
    await pool.query(`
      DO $$
      DECLARE has_score boolean; has_rating boolean;
      BEGIN
        SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ratings' AND column_name='score') INTO has_score;
        SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ratings' AND column_name='rating') INTO has_rating;
        IF has_score AND has_rating THEN
          ALTER TABLE "ratings" DROP COLUMN "score";
        ELSIF has_score AND NOT has_rating THEN
          ALTER TABLE "ratings" RENAME COLUMN "score" TO "rating";
        END IF;
      END $$;
    `);

    // If table already exists but is missing columns, add them
    await pool.query(`
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "rating" numeric;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "comment" varchar;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "follow_up_rating" numeric;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "follow_up_comment" varchar;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "follow_up_created_at" timestamp(3) with time zone;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "has_follow_up" boolean;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp(3) with time zone DEFAULT now();
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "created_at" timestamp(3) with time zone DEFAULT now();
    `);

    // Fix rater_role → raterRole rename if old column exists
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE "ratings" RENAME COLUMN "rater_role" TO "raterRole";
      EXCEPTION WHEN undefined_column THEN null;
      END $$;
    `);

    // Add raterRole if missing entirely
    await pool.query(`
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "raterRole" "enum_ratings_rater_role" NOT NULL DEFAULT 'buyer';
    `);

    // Ensure ratings_rels table exists with all columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ratings_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL REFERENCES "ratings"("id") ON DELETE CASCADE,
        "path" varchar NOT NULL,
        "transactions_id" integer REFERENCES "transactions"("id") ON DELETE CASCADE,
        "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE
      );
      ALTER TABLE "ratings_rels" ADD COLUMN IF NOT EXISTS "order" integer;
      CREATE INDEX IF NOT EXISTS "ratings_rels_order_idx" ON "ratings_rels" USING btree ("order");
      CREATE INDEX IF NOT EXISTS "ratings_rels_parent_idx" ON "ratings_rels" USING btree ("parent_id");
      CREATE INDEX IF NOT EXISTS "ratings_rels_path_idx" ON "ratings_rels" USING btree ("path");
    `);
  } catch (preErr: any) {
    console.error('Pre-init migration (ratings) failed:', preErr.message);
    Sentry.captureException(preErr, { tags: { route: 'startup.migration.ratings' } });
  }

  // Auto-extend minutes — add column for anti-snipe feature
  try {
    await pool.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "auto_extend_minutes" numeric DEFAULT 5;
    `);
  } catch (preErr: any) {
    console.error('Pre-init migration (products auto_extend_minutes) failed:', preErr.message);
    Sentry.captureException(preErr, { tags: { route: 'startup.migration.products' } });
  }

  // Void request offer expiration — add offer_expires_at column
  try {
    await pool.query(`
      ALTER TABLE "void_requests"
      ADD COLUMN IF NOT EXISTS "offer_expires_at" timestamp(3) with time zone;
    `);
  } catch (preErr: any) {
    console.error('Pre-init migration (void_requests offer_expires_at) failed:', preErr.message);
    Sentry.captureException(preErr, { tags: { route: 'startup.migration.void_requests' } });
  }
}
