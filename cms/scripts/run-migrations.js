/**
 * Non-interactive migration runner for CI/CD pre-deploy.
 *
 * Payload v2's `payload migrate` prompts interactively when it detects
 * DB_PUSH was used (batch = -1 rows in payload_migrations). This script
 * clears those sentinel rows first, then runs `payload migrate` so it
 * can proceed non-interactively. Already-applied migrations are skipped
 * by Payload based on their name.
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
      // Clear dev-push sentinel rows (batch = -1) so payload migrate won't prompt
      const result = await client.query(
        `DELETE FROM payload_migrations WHERE batch = -1`
      );
      if (result.rowCount > 0) {
        console.log(`[migrate] Cleared ${result.rowCount} dev-push sentinel row(s)`);
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
