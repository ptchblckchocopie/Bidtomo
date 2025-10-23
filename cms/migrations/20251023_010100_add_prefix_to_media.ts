import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  // Add prefix column to media table
  await payload.db.drizzle.execute(sql`
    ALTER TABLE media ADD COLUMN IF NOT EXISTS prefix VARCHAR(255);
  `)

  // Add 'available' value to products status enum if it doesn't exist
  await payload.db.drizzle.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'available'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_products_status')
      ) THEN
        ALTER TYPE enum_products_status ADD VALUE 'available';
      END IF;
    END $$;
  `)
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
    ALTER TABLE media DROP COLUMN IF EXISTS prefix;
  `)
  // Note: Cannot remove enum values in PostgreSQL without recreating the type
}
