const express = require('express');
const { asyncHandler, notFound, conflict, badRequest } = require('../errors');
const { validate, parseId, PH_MOBILE, toDateString } = require('../validation');

const familySchema = {
  center_id: { type: 'int', required: true, min: 1 },
  head_name: { type: 'string', required: true, maxLength: 120 },
  members: { type: 'int', required: true, min: 1, max: 30 },
  origin_barangay: { type: 'string', required: true, maxLength: 80 },
  contact_number: {
    type: 'string', maxLength: 20, pattern: PH_MOBILE,
    patternMessage: 'contact_number must be a PH mobile number like 09171234567',
  },
};

const FAMILY_SELECT = `
  SELECT f.*, c.name AS center_name
  FROM families f JOIN centers c ON c.id = f.center_id`;

module.exports = function familiesRouter(db) {
  const router = express.Router();

  // GET /api/families?center_id=1&status=present&q=dela
  router.get('/', asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (req.query.center_id) {
      params.push(parseId(req.query.center_id, 'center_id'));
      where.push(`f.center_id = $${params.length}`);
    }
    if (req.query.status) {
      if (!['present', 'departed'].includes(req.query.status)) throw badRequest('status must be present or departed');
      params.push(req.query.status);
      where.push(`f.status = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${String(req.query.q).toLowerCase()}%`);
      where.push(`(LOWER(f.head_name) LIKE $${params.length} OR LOWER(f.origin_barangay) LIKE $${params.length})`);
    }
    const sql = `${FAMILY_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY f.registered_at DESC, f.id DESC`;
    res.json(await db.query(sql, params));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [family] = await db.query(`${FAMILY_SELECT} WHERE f.id = $1`, [id]);
    if (!family) throw notFound('Family');
    const distributions = await db.query(
      `SELECT d.id, d.quantity, d.distributed_on, d.distributed_by, i.name AS item_name, i.unit
       FROM distributions d JOIN relief_items i ON i.id = d.item_id
       WHERE d.family_id = $1 ORDER BY d.distributed_on DESC, d.id DESC`,
      [id],
    );
    res.json({ ...family, distributions: distributions.map((d) => ({ ...d, distributed_on: toDateString(d.distributed_on) })) });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const data = validate(req.body, familySchema);

    const [center] = await db.query('SELECT id, name, capacity FROM centers WHERE id = $1', [data.center_id]);
    if (!center) throw badRequest('center_id does not match any evacuation center');

    // Same family head from the same barangay already staying somewhere = double registration.
    const dupes = await db.query(
      `${FAMILY_SELECT} WHERE LOWER(f.head_name) = LOWER($1) AND LOWER(f.origin_barangay) = LOWER($2) AND f.status = 'present'`,
      [data.head_name, data.origin_barangay],
    );
    if (dupes.length > 0) {
      throw conflict(`${data.head_name} of ${data.origin_barangay} is already registered at ${dupes[0].center_name}`);
    }

    const [family] = await db.query(
      `INSERT INTO families (center_id, head_name, members, origin_barangay, contact_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.center_id, data.head_name, data.members, data.origin_barangay, data.contact_number],
    );

    const [{ headcount }] = await db.query(
      `SELECT COALESCE(SUM(members), 0)::int AS headcount FROM families WHERE center_id = $1 AND status = 'present'`,
      [data.center_id],
    );
    const body = { ...family, center_name: center.name, center_headcount: headcount };
    if (headcount > center.capacity) {
      body.warning = `${center.name} is now over capacity (${headcount}/${center.capacity} persons)`;
    }
    res.status(201).json(body);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = validate(req.body, familySchema);
    const [center] = await db.query('SELECT id FROM centers WHERE id = $1', [data.center_id]);
    if (!center) throw badRequest('center_id does not match any evacuation center');
    const rows = await db.query(
      `UPDATE families SET center_id = $1, head_name = $2, members = $3, origin_barangay = $4, contact_number = $5
       WHERE id = $6 RETURNING id`,
      [data.center_id, data.head_name, data.members, data.origin_barangay, data.contact_number, id],
    );
    if (rows.length === 0) throw notFound('Family');
    const [family] = await db.query(`${FAMILY_SELECT} WHERE f.id = $1`, [id]);
    res.json(family);
  }));

  // Family leaves the center: they drop out of the live headcount.
  router.patch('/:id/checkout', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [family] = await db.query('SELECT id, status FROM families WHERE id = $1', [id]);
    if (!family) throw notFound('Family');
    if (family.status === 'departed') throw conflict('Family has already checked out');
    await db.query(`UPDATE families SET status = 'departed', departed_at = NOW() WHERE id = $1`, [id]);
    const [updated] = await db.query(`${FAMILY_SELECT} WHERE f.id = $1`, [id]);
    res.json(updated);
  }));

  // Family returns to the center (e.g. checked out by mistake).
  router.patch('/:id/checkin', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [family] = await db.query('SELECT id, status FROM families WHERE id = $1', [id]);
    if (!family) throw notFound('Family');
    if (family.status === 'present') throw conflict('Family is already checked in');
    await db.query(`UPDATE families SET status = 'present', departed_at = NULL WHERE id = $1`, [id]);
    const [updated] = await db.query(`${FAMILY_SELECT} WHERE f.id = $1`, [id]);
    res.json(updated);
  }));

  return router;
};
