# Switch Database — Toggle between Neon (cloud) and Docker (local)

Switch the CMS database and Redis configuration between cloud services (Neon + Upstash) and local Docker.

**Argument:** `$ARGUMENTS` — expects `neon` or `docker`. If empty or unrecognized, read `cms/.env` and report which mode is currently active.

## Behavior

### If argument is `neon`:
Edit `cms/.env` to:
- Set `DATABASE_URI` to the Neon connection string (uncommented)
- Comment out the Docker `DATABASE_URI` line
- Set `REDIS_URL` to the Upstash connection string (uncommented)
- Comment out the Docker `REDIS_URL` line

### If argument is `docker`:
Edit `cms/.env` to:
- Set `DATABASE_URI` to the Docker connection string `postgresql://postgres:postgres@localhost:5433/marketplace` (uncommented)
- Comment out the Neon `DATABASE_URI` line
- Set `REDIS_URL` to the Docker Redis string `redis://:localdev@localhost:6380` (uncommented)
- Comment out the Upstash `REDIS_URL` line

### If no argument or unrecognized:
Read `cms/.env` and tell the user which mode is currently active based on which `DATABASE_URI` is uncommented.

## Rules
- Only modify the `DATABASE_URI` and `REDIS_URL` lines. Do not touch any other env vars.
- Keep both options in the file as comments so the user can see them.
- After switching, confirm which mode is now active.
- Remind the user to restart the CMS if it's running.
