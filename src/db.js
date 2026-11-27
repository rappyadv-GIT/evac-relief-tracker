const fs = require('fs');
const path = require('path');
const pg = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings, not JS Dates (avoids timezone shifts).
pg.types.setTypeParser(1082, (value) => value);

/**
 * Wraps a pg-compatible Pool with two helpers the routes use:
 *   query(text, params)  -> Promise<rows>
 *   transaction(fn)      -> runs fn(client) inside BEGIN/COMMIT, ROLLBACK on error
 */
function createDb(pool) {
  return {
    pool,
    async query(text, params = []) {
      const result = await pool.query(text, params);
      return result.rows;
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn({
          query: async (text, params = []) => (await client.query(text, params)).rows,
        });
        await client.query('COMMIT');
        return value;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async migrate() {
      const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

/** Builds a real PostgreSQL pool from DATABASE_URL (Neon, Supabase, Hostinger VPS, local). */
function createPgPool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(databaseUrl);
  const sslDisabled = process.env.DATABASE_SSL === 'false';
  // SSL is configured below, so drop sslmode/sslrootcert from the URL (pg would otherwise
  // insist on full certificate checks, which fails with Supabase's pooler certificate).
  const url = new URL(databaseUrl);
  ['sslmode', 'sslrootcert', 'channel_binding'].forEach((key) => url.searchParams.delete(key));
  return new pg.Pool({
    connectionString: url.toString(),
    ssl: isLocal || sslDisabled ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || 5),
  });
}

module.exports = { createDb, createPgPool };
