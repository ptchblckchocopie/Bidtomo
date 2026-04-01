import { createGzip, createGunzip } from 'zlib';
import { PassThrough, Readable } from 'stream';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import cron from 'node-cron';

/** Validate SQL identifier (table/database name) to prevent injection */
function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

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

      if (!isValidIdentifier(table)) {
        console.warn(`[Backup] Skipping invalid table name: ${table}`);
        continue;
      }

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
        if (seq.last_value !== null && isValidIdentifier(seq.sequencename)) {
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

/**
 * Download the latest backup from S3, restore it into a temporary Postgres database,
 * and verify data integrity by counting rows. Cleans up the temp database afterwards.
 */
export async function restoreAndVerify(): Promise<{
  success: boolean;
  productCount?: number;
  error?: string;
  durationMs?: number;
}> {
  const startTime = Date.now();
  const { Pool } = require('pg');
  const dbUri = process.env.DATABASE_URI;
  if (!dbUri) return { success: false, error: 'DATABASE_URI not configured' };

  const tempDbName = `bidmo_restore_test_${Date.now()}`;
  if (!isValidIdentifier(tempDbName)) {
    throw new Error('Generated temp database name is invalid');
  }
  let adminPool: any = null;
  let tempPool: any = null;
  const sslConfig = dbUri.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined;

  try {
    // 1. Find latest backup in S3
    const bucket = process.env.S3_BUCKET || 'veent';
    const s3 = getS3Client();
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'backups/',
    }));

    const objects = (listResult.Contents || []).filter(o => o.LastModified && o.Key);
    if (objects.length === 0) return { success: false, error: 'No backups found in S3' };

    const latest = objects.reduce((a, b) =>
      (a.LastModified!.getTime() > b.LastModified!.getTime()) ? a : b
    );

    console.log(`[BACKUP-RESTORE] Testing restore of: ${latest.Key}`);

    // 2. Download and decompress backup
    const getResult = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: latest.Key!,
    }));

    const bodyStream = getResult.Body as Readable;
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      bodyStream.pipe(gunzip);
      gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gunzip.on('end', resolve);
      gunzip.on('error', reject);
    });

    const sqlContent = Buffer.concat(chunks).toString('utf8');
    console.log(`[BACKUP-RESTORE] Decompressed backup: ${(sqlContent.length / 1024).toFixed(1)} KB`);

    // 3. Extract schema DDL from main database
    const mainPool = new Pool({ connectionString: dbUri, ssl: sslConfig });

    const tablesResult = await mainPool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );

    const createStatements: string[] = [];
    for (const row of tablesResult.rows) {
      const table = row.tablename;

      if (!isValidIdentifier(table)) {
        console.warn(`[Backup] Skipping invalid table name: ${table}`);
        continue;
      }

      const colsResult = await mainPool.query(`
        SELECT a.attname as column_name,
               format_type(a.atttypid, a.atttypmod) as data_type,
               a.attnotnull as not_null,
               pg_get_expr(d.adbin, d.adrelid) as column_default
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE c.relname = $1
          AND n.nspname = 'public'
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `, [table]);

      if (colsResult.rows.length === 0) continue;

      const columns = colsResult.rows.map((col: any) => {
        let def = `"${col.column_name}" ${col.data_type}`;
        if (col.column_default) def += ` DEFAULT ${col.column_default}`;
        if (col.not_null) def += ' NOT NULL';
        return def;
      });

      createStatements.push(`CREATE TABLE IF NOT EXISTS "${table}" (\n${columns.join(',\n')}\n);`);
    }

    const seqResult = await mainPool.query(
      `SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`
    );
    const sequenceStatements = seqResult.rows
      .filter((seq: any) => isValidIdentifier(seq.sequencename))
      .map((seq: any) =>
        `CREATE SEQUENCE IF NOT EXISTS "${seq.sequencename}";`
      );

    await mainPool.end();

    // 4. Create temp database
    const url = new URL(dbUri);
    const adminUri = `${url.protocol}//${url.username}:${url.password}@${url.host}/postgres${url.search}`;

    adminPool = new Pool({ connectionString: adminUri, ssl: sslConfig, max: 2 });
    await adminPool.query(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await adminPool.query(`CREATE DATABASE "${tempDbName}"`);
    console.log(`[BACKUP-RESTORE] Created temp database: ${tempDbName}`);

    // 5. Connect to temp database and apply schema
    const tempUri = `${url.protocol}//${url.username}:${url.password}@${url.host}/${tempDbName}${url.search}`;
    tempPool = new Pool({ connectionString: tempUri, ssl: sslConfig, max: 2 });

    for (const stmt of sequenceStatements) {
      try { await tempPool.query(stmt); } catch { /* sequence may reference missing types */ }
    }

    for (const stmt of createStatements) {
      try { await tempPool.query(stmt); } catch (err: any) {
        console.warn(`[BACKUP-RESTORE] Schema warning: ${err.message.slice(0, 100)}`);
      }
    }

    console.log(`[BACKUP-RESTORE] Schema applied (${createStatements.length} tables)`);

    // 6. Execute backup SQL statements
    const statements = sqlContent
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('--') && !line.startsWith('SET '));

    let executed = 0;
    let errors = 0;
    for (const stmt of statements) {
      if (!stmt.trim().endsWith(';')) continue;
      try {
        await tempPool.query(stmt);
        executed++;
      } catch {
        errors++;
      }
    }

    console.log(`[BACKUP-RESTORE] Executed ${executed} statements (${errors} errors)`);

    // 7. Verify: count products
    let productCount = 0;
    try {
      const countResult = await tempPool.query('SELECT COUNT(*) as count FROM products');
      productCount = parseInt(countResult.rows[0].count, 10);
    } catch (err: any) {
      console.warn(`[BACKUP-RESTORE] Products count failed: ${err.message}`);
    }

    // 8. Cleanup
    await tempPool.end();
    tempPool = null;
    await adminPool.query(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await adminPool.end();
    adminPool = null;

    const durationMs = Date.now() - startTime;
    const success = productCount > 0 || executed > 0;
    console.log(`[BACKUP-RESTORE] Restore test ${success ? 'PASSED' : 'FAILED'} — ${productCount} products, ${(durationMs / 1000).toFixed(1)}s`);

    return { success, productCount, durationMs };
  } catch (err: any) {
    console.error(`[BACKUP-RESTORE] Restore test FAILED:`, err.message);

    // Best-effort cleanup
    try {
      if (tempPool) await tempPool.end();
      if (adminPool) {
        await adminPool.query(`DROP DATABASE IF EXISTS "${tempDbName}"`);
        await adminPool.end();
      }
    } catch { /* ignore cleanup errors */ }

    return { success: false, error: err.message, durationMs: Date.now() - startTime };
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

  // Weekly restore test — every Sunday at 4 AM (1 hour after daily backup)
  const restoreSchedule = process.env.BACKUP_RESTORE_CRON || '0 4 * * 0';
  if (cron.validate(restoreSchedule)) {
    cron.schedule(restoreSchedule, async () => {
      console.log('[BACKUP-RESTORE] Weekly restore test starting...');
      const result = await restoreAndVerify();
      if (!result.success) {
        console.error(`[BACKUP-RESTORE] WEEKLY RESTORE TEST FAILED: ${result.error}`);
      }
    });
    console.log(`[BACKUP] Restore test scheduled: ${restoreSchedule}`);
  }

  console.log(`[BACKUP] Scheduler started with schedule: ${schedule}`);
}
