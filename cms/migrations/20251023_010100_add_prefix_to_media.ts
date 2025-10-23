import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(`
    ALTER TABLE media ADD COLUMN IF NOT EXISTS prefix VARCHAR(255);
  `)
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(`
    ALTER TABLE media DROP COLUMN IF EXISTS prefix;
  `)
}
