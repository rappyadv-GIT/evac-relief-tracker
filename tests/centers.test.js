const request = require('supertest');
const { buildTestApp } = require('./helpers');

let app; let db;
beforeEach(async () => { ({ app, db } = await buildTestApp()); });
afterEach(async () => { await db.close(); });

const center = { name: 'Dagupan Central School', barangay: 'Poblacion', municipality: 'Dagupan City', capacity: 10 };

describe('Evacuation centers API', () => {
  test('creates and lists a center with zero headcount', async () => {
    const created = await request(app).post('/api/centers').send(center).expect(201);
    expect(created.body).toMatchObject({ name: center.name, headcount: 0, occupancy: 0, occupancy_status: 'available' });

    const list = await request(app).get('/api/centers').expect(200);
    expect(list.body).toHaveLength(1);
  });

  test('rejects invalid input with every problem listed', async () => {
    const res = await request(app).post('/api/centers').send({ name: '', capacity: -5 }).expect(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(expect.arrayContaining([
      'name is required', 'barangay is required', 'municipality is required', 'capacity must be at least 1',
    ]));
  });

  test('blocks a duplicate center name (case-insensitive)', async () => {
    await request(app).post('/api/centers').send(center).expect(201);
    await request(app).post('/api/centers').send({ ...center, name: center.name.toUpperCase() }).expect(409);
  });

  test('returns 404 for a missing center and 400 for a bad id', async () => {
    await request(app).get('/api/centers/999').expect(404);
    await request(app).get('/api/centers/abc').expect(400);
  });

  test('updates a center and refuses to delete one with families', async () => {
    const { body: c } = await request(app).post('/api/centers').send(center).expect(201);
    const updated = await request(app).put(`/api/centers/${c.id}`).send({ ...center, capacity: 50 }).expect(200);
    expect(updated.body.capacity).toBe(50);

    await request(app).post('/api/families').send({ center_id: c.id, head_name: 'Juan', members: 3, origin_barangay: 'Pantal' }).expect(201);
    await request(app).delete(`/api/centers/${c.id}`).expect(409);
  });

  test('deletes an empty center', async () => {
    const { body: c } = await request(app).post('/api/centers').send(center).expect(201);
    await request(app).delete(`/api/centers/${c.id}`).expect(204);
    await request(app).get(`/api/centers/${c.id}`).expect(404);
  });
});
