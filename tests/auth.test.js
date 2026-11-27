const request = require('supertest');
const { newDb } = require('pg-mem');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

describe('Optional password protection', () => {
  let app; let db;
  beforeAll(async () => {
    const { Pool } = newDb().adapters.createPg();
    db = createDb(new Pool());
    await db.migrate();
    app = createApp(db, { auth: { username: 'mdrrmo', password: 'secret' } });
  });
  afterAll(() => db.close());

  test('asks for login without credentials', async () => {
    await request(app).get('/api/centers').expect(401);
  });
  test('accepts the right credentials', async () => {
    await request(app).get('/api/centers').auth('mdrrmo', 'secret').expect(200);
  });
  test('rejects wrong credentials', async () => {
    await request(app).get('/api/centers').auth('mdrrmo', 'wrong').expect(401);
  });
  test('health check stays open for uptime monitors', async () => {
    await request(app).get('/api/health').expect(200);
  });
});
