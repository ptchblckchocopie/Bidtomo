import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
    DO $$
    DECLARE
      has_old boolean;
      has_new boolean;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='hide_from_browse') INTO has_old;
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='active') INTO has_new;
      IF has_old AND has_new THEN
        ALTER TABLE "products" DROP COLUMN "hide_from_browse";
      ELSIF has_old AND NOT has_new THEN
        ALTER TABLE "products" RENAME COLUMN "hide_from_browse" TO "active";
      END IF;
    END $$;
  `);
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
    ALTER TABLE "products" RENAME COLUMN "active" TO "hide_from_browse";
  `);
}
