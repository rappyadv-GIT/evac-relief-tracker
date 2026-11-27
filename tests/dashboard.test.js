const request = require('supertest');
const { buildTestApp } = require('./helpers');
const { todayInManila } = require('../src/validation');
const { lastDays } = require('../src/routes/dashboard');

let app; let db;
beforeEach(async () => { ({ app, db } = await buildTestApp()); });
afterEach(async () => { await db.close(); });

describe('Summary dashboard', () => {
  test('summarizes headcount, stock alerts and today\'s distributions', async () => {
    const c = await request(app).post('/api/centers').send({ name: 'A', barangay: 'B', municipality: 'C', capacity: 4 });
    const f = await request(app).post('/api/families').send({ center_id: c.body.id, head_name: 'Juan', members: 5, origin_barangay: 'X' });
    const i = await request(app).post('/api/items').send({ name: 'Rice', unit: 'sacks', quantity: 2, low_stock_threshold: 5 });
    await request(app).post('/api/distributions').send({ family_id: f.body.id, item_id: i.body.id, distributed_by: 'Ana' }).expect(201);

    const res = await request(app).get('/api/dashboard').expect(200);
    expect(res.body.date).toBe(todayInManila());
    expect(res.body.totals).toMatchObject({ centers: 1, families: 1, persons: 5, capacity: 4, packs_today: 1, low_stock_items: 1 });
    expect(res.body.alerts).toEqual(expect.arrayContaining([expect.stringMatching(/over capacity/), expect.stringMatching(/Rice is low/)]));
    expect(res.body.distributions_last_7_days).toHaveLength(7);
    expect(res.body.distributions_last_7_days[6]).toEqual({ date: todayInManila(), packs: 1 });
    expect(res.body.given_today_by_item).toEqual([{ name: 'Rice', given: 1 }]);
  });

  test('works on an empty database', async () => {
    const res = await request(app).get('/api/dashboard').expect(200);
    expect(res.body.totals.persons).toBe(0);
    expect(res.body.alerts).toEqual([]);
  });
});

describe('Helpers and general API behaviour', () => {
  test('lastDays builds a 7-day window ending today', () => {
    expect(lastDays(3, '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });

  test('todayInManila uses Philippine time', () => {
    // 2026-11-24 17:00 UTC is already 2026-11-25 01:00 in Manila
    expect(todayInManila(new Date('2026-11-24T17:00:00Z'))).toBe('2026-11-25');
  });

  test('health check, unknown routes, and bad JSON', async () => {
    await request(app).get('/api/health').expect(200, { status: 'ok', database: 'connected' });
    await request(app).get('/api/nope').expect(404);
    const res = await request(app).post('/api/centers').set('Content-Type', 'application/json').send('{bad').expect(400);
    expect(res.body.error).toBe('Request body is not valid JSON');
  });
});
