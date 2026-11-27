const { newDb } = require('pg-mem');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

/**
 * Builds the app on an in-memory PostgreSQL (pg-mem), so tests need no database server.
 * Set TEST_DATABASE_URL to run the same tests against a real PostgreSQL instead.
 */
async function buildTestApp() {
  let pool;
  if (process.env.TEST_DATABASE_URL) {
    const { createPgPool } = require('../src/db');
    pool = createPgPool(process.env.TEST_DATABASE_URL);
    await pool.query('DROP TABLE IF EXISTS distributions, families, relief_items, centers CASCADE');
  } else {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    pool = new Pool();
  }
  const db = createDb(pool);
  await db.migrate();
  const app = createApp(db, { auth: null });
  return { app, db };
}

module.exports = { buildTestApp };
