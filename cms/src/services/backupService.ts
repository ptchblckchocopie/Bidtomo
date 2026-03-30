import { createGzip } from 'zlib';
import { PassThrough } from 'stream';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import cron from 'node-cron';

let backupInProgress = false;

export function isBackupInProgress(): boolean {
  return backupInProgress;
}

function getS3Client(): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID)!,
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY)!,
    },
    region: process.env.S3_REGION || 'sgp1',
    endpoint: process.env.S3_ENDPOINT || `https://${process.env.S3_REGION || 'sgp1'}.digitaloceanspaces.com`,
    forcePathStyle: true,
  });
}

function escapeSqlString(val: string): string {
  return val.replace(/'/g, "''");
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') return `'${escapeSqlString(JSON.stringify(val))}'`;
  return `'${escapeSqlString(String(val))}'`;
}

export async function runBackup(): Promise<{ success: boolean; key?: string; error?: string }> {
  if (backupInProgress) {
    console.log('[BACKUP] Backup already in progress, skipping');
    return { success: false, error: 'Backup already in progress' };
  }

  backupInProgress = true;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `backups/bidmo-${timestamp}.sql.gz`;

  try {
    const dbUri = process.env.DATABASE_URI;
    if (!dbUri) {
      throw new Error('DATABASE_URI not configured');
    }

    console.log(`[BACKUP] Starting backup to ${key}`);

    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: dbUri,
      ssl: dbUri.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    // Set up gzip stream → S3 upload
    const passthrough = new PassThrough();
    const gzip = createGzip({ level: 6 });
    gzip.pipe(passthrough);

    const bucket = process.env.S3_BUCKET || 'veent';
    const s3 = getS3Client();

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: passthrough,
        ContentType: 'application/gzip',
      },
    });

    // Write SQL header
    gzip.write(`-- Bidmo.to Database Backup\n`);
    gzip.write(`-- Generated: ${new Date().toISOString()}\n`);
    gzip.write(`-- Method: node-pg logical dump\n\n`);
    gzip.write(`SET client_encoding = 'UTF8';\n`);
    gzip.write(`SET standard_conforming_strings = on;\n\n`);

    // Get all user tables
    const tablesResult = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    for (const row of tablesResult.rows) {
      const table = row.tablename;

      // Get column info for the table
      const colsResult = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable,
               character_maximum_length, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      if (colsResult.rows.length === 0) continue;

      const columns = colsResult.rows.map((c: any) => `"${c.column_name}"`);

      // Dump data in batches
      const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
      const totalRows = parseInt(countResult.rows[0].cnt, 10);

      if (totalRows === 0) continue;

      gzip.write(`-- Data for table: ${table} (${totalRows} rows)\n`);

      const batchSize = 500;
      for (let offset = 0; offset < totalRows; offset += batchSize) {
        const dataResult = await pool.query(
          `SELECT * FROM "${table}" ORDER BY ctid LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );

        for (const dataRow of dataResult.rows) {
          const values = colsResult.rows.map((col: any) => formatValue(dataRow[col.column_name]));
          gzip.write(`INSERT INTO "${table}" (${columns.join(', ')}) VALUES (${values.join(', ')});\n`);
        }
      }

      gzip.write('\n');
    }

    // Dump sequences
    const seqResult = await pool.query(`
      SELECT sequencename, last_value FROM pg_sequences
      WHERE schemaname = 'public'
    `);

    if (seqResult.rows.length > 0) {
      gzip.write('-- Sequences\n');
      for (const seq of seqResult.rows) {
        if (seq.last_value !== null) {
          gzip.write(`SELECT setval('"${seq.sequencename}"', ${seq.last_value}, true);\n`);
        }
      }
    }

    // Finalize
    await new Promise<void>((resolve, reject) => {
      gzip.end(() => resolve());
      gzip.on('error', reject);
    });

    await upload.done();
    await pool.end();

    console.log(`[BACKUP] Backup completed successfully: ${key}`);
    return { success: true, key };
  } catch (err: any) {
    console.error(`[BACKUP] Backup failed:`, err.message);
    return { success: false, error: err.message };
  } finally {
    backupInProgress = false;
  }
}

export async function cleanupOldBackups(): Promise<number> {
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const bucket = process.env.S3_BUCKET || 'veent';
  const s3 = getS3Client();

  try {
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'backups/',
    }));

    const objects = listResult.Contents || [];
    const toDelete = objects.filter(obj => obj.LastModified && obj.LastModified < cutoff);

    if (toDelete.length === 0) {
      console.log('[BACKUP] No old backups to clean up');
      return 0;
    }

    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: toDelete.map(obj => ({ Key: obj.Key })),
      },
    }));

    console.log(`[BACKUP] Cleaned up ${toDelete.length} old backup(s)`);
    return toDelete.length;
  } catch (err: any) {
    console.error('[BACKUP] Cleanup failed:', err.message);
    return 0;
  }
}

/**
 * Get the age of the latest backup in hours. Returns null if no backups found or S3 unavailable.
 */
export async function getLatestBackupAgeHours(): Promise<number | null> {
  try {
    const bucket = process.env.S3_BUCKET || 'veent';
    const s3 = getS3Client();
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'backups/',
    }));

    const objects = (listResult.Contents || []).filter(o => o.LastModified);
    if (objects.length === 0) return null;

    // Find the most recent backup
    const latest = objects.reduce((a, b) =>
      (a.LastModified!.getTime() > b.LastModified!.getTime()) ? a : b
    );

    return (Date.now() - latest.LastModified!.getTime()) / (1000 * 60 * 60);
  } catch {
    return null;
  }
}

/**
 * Verify a backup exists in S3 and has a non-zero size.
 */
export async function verifyBackup(key: string): Promise<{ verified: boolean; sizeBytes?: number; error?: string }> {
  try {
    const bucket = process.env.S3_BUCKET || 'veent';
    const s3 = getS3Client();
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const size = head.ContentLength || 0;

    if (size < 100) {
      console.error(`[BACKUP] Verification FAILED: ${key} is only ${size} bytes (likely empty/corrupt)`);
      return { verified: false, sizeBytes: size, error: 'Backup file too small' };
    }

    console.log(`[BACKUP] Verified: ${key} (${(size / 1024).toFixed(1)} KB)`);
    return { verified: true, sizeBytes: size };
  } catch (err: any) {
    console.error(`[BACKUP] Verification FAILED: ${key} — ${err.message}`);
    return { verified: false, error: err.message };
  }
}

export function startBackupScheduler(): void {
  if (process.env.BACKUP_ENABLED !== 'true') {
    console.log('[BACKUP] Backup scheduler disabled (BACKUP_ENABLED != true)');
    return;
  }

  const schedule = process.env.BACKUP_CRON_SCHEDULE || '0 3 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[BACKUP] Invalid cron schedule: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    console.log('[BACKUP] Scheduled backup starting...');
    const result = await runBackup();
    if (result.success && result.key) {
      await verifyBackup(result.key);
    }
    await cleanupOldBackups();
  });

  console.log(`[BACKUP] Scheduler started with schedule: ${schedule}`);
}
