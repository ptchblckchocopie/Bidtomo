import { spawn } from 'child_process';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
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
    region: process.env.S3_REGION || 'ap-northeast-2',
    endpoint: process.env.S3_ENDPOINT || 'https://htcdkqplcmdbyjlvzono.storage.supabase.co/storage/v1/s3',
    forcePathStyle: true,
  });
}

function parseDatabaseUri(uri: string) {
  const url = new URL(uri);
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.slice(1),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sslmode: url.searchParams.get('sslmode') || undefined,
  };
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

    const db = parseDatabaseUri(dbUri);
    console.log(`[BACKUP] Starting backup to ${key}`);

    const pgDumpArgs = [
      '-h', db.host,
      '-p', db.port,
      '-U', db.username,
      '-d', db.database,
      '-Z', '6',
    ];

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      PGPASSWORD: db.password,
    };

    if (db.sslmode) {
      env.PGSSLMODE = db.sslmode;
    }

    const pgDump = spawn('pg_dump', pgDumpArgs, { env, stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrOutput = '';
    pgDump.stderr.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    const bucket = process.env.S3_BUCKET || 'bidmo-media';
    const s3 = getS3Client();

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: pgDump.stdout,
        ContentType: 'application/gzip',
      },
    });

    // Wait for both pg_dump to finish and S3 upload to complete
    const [exitCode] = await Promise.all([
      new Promise<number>((resolve, reject) => {
        pgDump.on('close', resolve);
        pgDump.on('error', reject);
      }),
      upload.done(),
    ]);

    if (exitCode !== 0) {
      throw new Error(`pg_dump exited with code ${exitCode}: ${stderrOutput}`);
    }

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
  const bucket = process.env.S3_BUCKET || 'bidmo-media';
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
    await runBackup();
    await cleanupOldBackups();
  });

  console.log(`[BACKUP] Scheduler started with schedule: ${schedule}`);
}
