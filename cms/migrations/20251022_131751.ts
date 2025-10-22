import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'

export async function up({ payload }: MigrateUpArgs): Promise<void> {
await payload.db.drizzle.execute(sql`

ALTER TABLE "products" ADD COLUMN "hide_from_browse" boolean;
ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_url" varchar;
ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_width" numeric;
ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_height" numeric;
ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_mime_type" varchar;
ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filesize" numeric;
ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filename" varchar;
ALTER TABLE "media" ADD COLUMN "sizes_card_url" varchar;
ALTER TABLE "media" ADD COLUMN "sizes_card_width" numeric;
ALTER TABLE "media" ADD COLUMN "sizes_card_height" numeric;
ALTER TABLE "media" ADD COLUMN "sizes_card_mime_type" varchar;
ALTER TABLE "media" ADD COLUMN "sizes_card_filesize" numeric;
ALTER TABLE "media" ADD COLUMN "sizes_card_filename" varchar;
CREATE INDEX IF NOT EXISTS "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
CREATE INDEX IF NOT EXISTS "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");`);

};

export async function down({ payload }: MigrateDownArgs): Promise<void> {
await payload.db.drizzle.execute(sql`

DROP INDEX IF EXISTS "media_sizes_thumbnail_sizes_thumbnail_filename_idx";
DROP INDEX IF EXISTS "media_sizes_card_sizes_card_filename_idx";
ALTER TABLE "products" DROP COLUMN IF EXISTS "hide_from_browse";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_url";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_width";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_height";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_mime_type";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_filesize";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_filename";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_url";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_width";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_height";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_mime_type";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_filesize";
ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_filename";`);

};
