# Database Connection Diagnostics

Keep `DATABASE_URL` in the repository root `.env` as a single line. Do not paste other keys after it on the same line.

Safe examples:

```env
DATABASE_URL="postgresql://postgres.example_user:URL_ENCODED_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
JWT_SECRET="replace-with-a-long-random-secret"
```

Supabase session pooler example:

```env
DATABASE_URL="postgresql://postgres.example_user:URL_ENCODED_PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"
```

Supabase transaction pooler example:

```env
DATABASE_URL="postgresql://postgres.example_user:URL_ENCODED_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
```

Local PostgreSQL example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/healthcare"
```

Notes:

- URL-encode special characters in the database password before putting it in `DATABASE_URL`.
- Keep `JWT_SECRET`, SMTP keys, API keys, and CORS values on separate lines.
- Do not commit real secrets.
- Startup logs show only a masked host, port, database name, username prefix, and query key names. Passwords and token-like values are never logged.
- The `/health` endpoint runs a Prisma `SELECT 1` check and returns `database: "connected"` or `database: "unavailable"`.

Manual `SELECT 1` checks:

Run each command from its API app directory:

```powershell
'SELECT 1;' | npx prisma db execute --schema prisma/schema.prisma --stdin
```
