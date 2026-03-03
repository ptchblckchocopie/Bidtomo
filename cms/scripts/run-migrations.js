/**
 * Non-interactive migration runner for CI/CD and startup.
 *
 * Payload v2's `payload migrate` prompts interactively when it detects
 * DB_PUSH was used (batch = -1 rows in payload_migrations). This script
 * promotes those sentinel rows to a real batch number so Payload treats
 * them as already-applied and skips them. Then runs `payload migrate`
 * non-interactively to apply any new migration files.
 */
const { execSync } = require('child_process');
const { Client } = require('pg');

async function main() {
  const dbUrl = process.env.DATABASE_URI || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('[migrate] No DATABASE_URI/DATABASE_URL — skipping migrations');
    process.exit(0);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('railway.internal')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Check if payload_migrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'payload_migrations'
      )
    `);

    if (tableCheck.rows[0].exists) {
      // Promote dev-push sentinel rows (batch = -1) to a real batch number
      // so Payload treats them as already-applied instead of re-running them.
      // Deleting them would cause Payload to re-run migrations on tables that
      // already exist (from DB_PUSH), causing "already exists" errors.
      const maxBatchResult = await client.query(
        `SELECT COALESCE(MAX(batch), 0) as max_batch FROM payload_migrations WHERE batch > 0`
      );
      const nextBatch = maxBatchResult.rows[0].max_batch + 1;

      const result = await client.query(
        `UPDATE payload_migrations SET batch = $1 WHERE batch = -1`,
        [nextBatch]
      );
      if (result.rowCount > 0) {
        console.log(`[migrate] Promoted ${result.rowCount} dev-push sentinel row(s) to batch ${nextBatch}`);
      }
    }

    await client.end();
  } catch (err) {
    console.error('[migrate] DB cleanup warning:', err.message);
    // Non-fatal — try running migrate anyway
    try { await client.end(); } catch {}
  }

  // Run payload migrate
  console.log('[migrate] Running payload migrate...');
  try {
    execSync('npx payload migrate', {
      stdio: 'inherit',
      cwd: __dirname + '/..',
      env: { ...process.env },
    });
    console.log('[migrate] Migrations complete');
  } catch (err) {
    console.error('[migrate] Migration failed:', err.message);
    process.exit(1);
  }
}

main();
