import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  // Create watchlist table
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "watchlist" (
      "id" serial PRIMARY KEY NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "watchlist_created_at_idx" ON "watchlist" USING btree ("created_at");
  `)

  // Create watchlist_rels table for user and product relationships
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "watchlist_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL REFERENCES "watchlist"("id") ON DELETE CASCADE,
      "path" varchar NOT NULL,
      "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
      "products_id" integer REFERENCES "products"("id") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "watchlist_rels_order_idx" ON "watchlist_rels" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "watchlist_rels_parent_idx" ON "watchlist_rels" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "watchlist_rels_path_idx" ON "watchlist_rels" USING btree ("path");
    CREATE INDEX IF NOT EXISTS "watchlist_rels_users_id_idx" ON "watchlist_rels" USING btree ("users_id");
    CREATE INDEX IF NOT EXISTS "watchlist_rels_products_id_idx" ON "watchlist_rels" USING btree ("products_id");
  `)
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
    DROP TABLE IF EXISTS "watchlist_rels";
    DROP TABLE IF EXISTS "watchlist";
  `)
}
