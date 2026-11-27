const request = require('supertest');
const { buildTestApp } = require('./helpers');

let app; let db; let centerId;
beforeEach(async () => {
  ({ app, db } = await buildTestApp());
  const res = await request(app).post('/api/centers')
    .send({ name: 'Calasiao Gym', barangay: 'Poblacion', municipality: 'Calasiao', capacity: 10 });
  centerId = res.body.id;
});
afterEach(async () => { await db.close(); });

const family = (overrides = {}) => ({ center_id: centerId, head_name: 'Juan Dela Cruz', members: 5, origin_barangay: 'Pantal', ...overrides });

describe('Family registration and live headcount', () => {
  test('registers a family and updates the center headcount', async () => {
    const res = await request(app).post('/api/families').send(family()).expect(201);
    expect(res.body).toMatchObject({ status: 'present', members: 5, center_headcount: 5 });

    const c = await request(app).get(`/api/centers/${centerId}`).expect(200);
    expect(c.body).toMatchObject({ headcount: 5, families_present: 1, occupancy: 50 });
  });

  test('validates members and PH mobile number', async () => {
    const res = await request(app).post('/api/families')
      .send(family({ members: 0, contact_number: '12345' })).expect(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      'members must be at least 1', 'contact_number must be a PH mobile number like 09171234567',
    ]));
  });

  test('rejects an unknown center', async () => {
    await request(app).post('/api/families').send(family({ center_id: 999 })).expect(400);
  });

  test('blocks registering the same family twice, even in another center', async () => {
    const other = await request(app).post('/api/centers')
      .send({ name: 'Other Center', barangay: 'X', municipality: 'Y', capacity: 10 });
    await request(app).post('/api/families').send(family()).expect(201);
    const dup = await request(app).post('/api/families')
      .send(family({ center_id: other.body.id, head_name: 'juan dela cruz' })).expect(409);
    expect(dup.body.error).toMatch(/already registered at Calasiao Gym/);
  });

  test('warns when a center goes over capacity', async () => {
    await request(app).post('/api/families').send(family({ members: 8 })).expect(201);
    const res = await request(app).post('/api/families').send(family({ head_name: 'Maria', members: 4 })).expect(201);
    expect(res.body.warning).toMatch(/over capacity \(12\/10/);
  });

  test('checkout removes a family from the headcount; checkin restores it', async () => {
    const { body: f } = await request(app).post('/api/families').send(family()).expect(201);
    await request(app).patch(`/api/families/${f.id}/checkout`).expect(200);
    let c = await request(app).get(`/api/centers/${centerId}`);
    expect(c.body.headcount).toBe(0);

    await request(app).patch(`/api/families/${f.id}/checkout`).expect(409);
    await request(app).patch(`/api/families/${f.id}/checkin`).expect(200);
    c = await request(app).get(`/api/centers/${centerId}`);
    expect(c.body.headcount).toBe(5);
  });

  test('filters by status and search text', async () => {
    const { body: f } = await request(app).post('/api/families').send(family()).expect(201);
    await request(app).post('/api/families').send(family({ head_name: 'Maria Santos', origin_barangay: 'Bonuan' })).expect(201);
    await request(app).patch(`/api/families/${f.id}/checkout`).expect(200);

    const present = await request(app).get('/api/families?status=present').expect(200);
    expect(present.body.map((x) => x.head_name)).toEqual(['Maria Santos']);
    const search = await request(app).get('/api/families?q=bonuan').expect(200);
    expect(search.body).toHaveLength(1);
    await request(app).get('/api/families?status=gone').expect(400);
  });
});
