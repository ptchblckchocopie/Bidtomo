import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  // Create reports table
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "reports" (
      "id" serial PRIMARY KEY NOT NULL,
      "reason" varchar,
      "description" varchar,
      "status" varchar DEFAULT 'pending',
      "admin_notes" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "reports_created_at_idx" ON "reports" USING btree ("created_at");
  `)

  // Create reports_rels table for product and reporter relationships
  await payload.db.drizzle.execute(sql`
    CREATE TABLE IF NOT EXISTS "reports_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL REFERENCES "reports"("id") ON DELETE CASCADE,
      "path" varchar NOT NULL,
      "products_id" integer REFERENCES "products"("id") ON DELETE CASCADE,
      "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "reports_rels_order_idx" ON "reports_rels" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "reports_rels_parent_idx" ON "reports_rels" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "reports_rels_path_idx" ON "reports_rels" USING btree ("path");
    CREATE INDEX IF NOT EXISTS "reports_rels_products_id_idx" ON "reports_rels" USING btree ("products_id");
    CREATE INDEX IF NOT EXISTS "reports_rels_users_id_idx" ON "reports_rels" USING btree ("users_id");
  `)
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
    DROP TABLE IF EXISTS "reports_rels";
    DROP TABLE IF EXISTS "reports";
  `)
}
