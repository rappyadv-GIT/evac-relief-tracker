const request = require('supertest');
const { buildTestApp } = require('./helpers');

let app; let db; let familyId; let itemId;
beforeEach(async () => {
  ({ app, db } = await buildTestApp());
  const c = await request(app).post('/api/centers').send({ name: 'Bayambang Gym', barangay: 'Zone II', municipality: 'Bayambang', capacity: 100 });
  const f = await request(app).post('/api/families').send({ center_id: c.body.id, head_name: 'Rosa', members: 3, origin_barangay: 'Tampog' });
  const i = await request(app).post('/api/items').send({ name: 'Family food pack', unit: 'packs', quantity: 3, low_stock_threshold: 1 });
  familyId = f.body.id;
  itemId = i.body.id;
});
afterEach(async () => { await db.close(); });

const give = (overrides = {}) => request(app).post('/api/distributions')
  .send({ family_id: familyId, item_id: itemId, distributed_by: 'Volunteer Ana', distributed_on: '2026-11-24', ...overrides });

describe('Relief stock', () => {
  test('labels stock as ok, low, or out of stock', async () => {
    const res = await request(app).post('/api/items').send({ name: 'Water', unit: 'gallons', quantity: 0 }).expect(201);
    expect(res.body.stock_status).toBe('out of stock');
    const restocked = await request(app).post(`/api/items/${res.body.id}/restock`).send({ quantity: 10 }).expect(200);
    expect(restocked.body).toMatchObject({ quantity: 10, stock_status: 'low' });
  });

  test('rejects a duplicate item and a bad restock amount', async () => {
    await request(app).post('/api/items').send({ name: 'family FOOD pack', unit: 'packs' }).expect(409);
    await request(app).post(`/api/items/${itemId}/restock`).send({ quantity: 0 }).expect(400);
    await request(app).post('/api/items/999/restock').send({ quantity: 5 }).expect(404);
  });
});

describe('Relief distribution log', () => {
  test('logs a pack and deducts stock', async () => {
    const res = await give().expect(201);
    expect(res.body).toMatchObject({ head_name: 'Rosa', item_name: 'Family food pack', remaining_stock: 2, distributed_on: '2026-11-24' });
    const item = await request(app).get(`/api/items/${itemId}`);
    expect(item.body.quantity).toBe(2);
  });

  test('BLOCKS a second pack of the same item for the same family on the same day', async () => {
    await give().expect(201);
    const dup = await give({ distributed_by: 'Volunteer Ben' }).expect(409);
    expect(dup.body.error).toMatch(/Duplicate blocked.*already received Family food pack on 2026-11-24 \(given by Volunteer Ana\)/);

    // stock was not deducted twice
    const item = await request(app).get(`/api/items/${itemId}`);
    expect(item.body.quantity).toBe(2);
  });

  test('allows the same item again on a different day', async () => {
    await give().expect(201);
    await give({ distributed_on: '2026-11-25' }).expect(201);
  });

  test('refuses when stock is not enough, and keeps no log entry', async () => {
    const res = await give({ quantity: 5 }).expect(409);
    expect(res.body.error).toMatch(/Not enough Family food pack/);
    const log = await request(app).get('/api/distributions').expect(200);
    expect(log.body).toHaveLength(0);
  });

  test('refuses a family that has checked out', async () => {
    await request(app).patch(`/api/families/${familyId}/checkout`).expect(200);
    await give().expect(409);
  });

  test('validates input', async () => {
    const res = await request(app).post('/api/distributions').send({ family_id: 'x', distributed_on: '24/11/2026' }).expect(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      'family_id must be a whole number', 'item_id is required', 'distributed_by is required',
      'distributed_on must be a date in YYYY-MM-DD format',
    ]));
    await give({ family_id: 999 }).expect(400);
  });

  test('filters the log by date and family', async () => {
    await give().expect(201);
    expect((await request(app).get('/api/distributions?date=2026-11-24')).body).toHaveLength(1);
    expect((await request(app).get('/api/distributions?date=2026-11-23')).body).toHaveLength(0);
    expect((await request(app).get(`/api/distributions?family_id=${familyId}`)).body).toHaveLength(1);
    const fam = await request(app).get(`/api/families/${familyId}`).expect(200);
    expect(fam.body.distributions).toHaveLength(1);
  });
});
