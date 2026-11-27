const express = require('express');
const { asyncHandler, notFound, conflict } = require('../errors');
const { validate, parseId } = require('../validation');

const centerSchema = {
  name: { type: 'string', required: true, maxLength: 120 },
  barangay: { type: 'string', required: true, maxLength: 80 },
  municipality: { type: 'string', required: true, maxLength: 80 },
  capacity: { type: 'int', required: true, min: 1, max: 100000 },
};

// Headcount = sum of members of families still present in the center.
const CENTER_SELECT = `
  SELECT c.id, c.name, c.barangay, c.municipality, c.capacity, c.created_at,
         COALESCE(SUM(CASE WHEN f.status = 'present' THEN f.members ELSE 0 END), 0)::int AS headcount,
         COALESCE(SUM(CASE WHEN f.status = 'present' THEN 1 ELSE 0 END), 0)::int AS families_present
  FROM centers c
  LEFT JOIN families f ON f.center_id = c.id`;

/** Adds occupancy % and a status label to a center row (conditionals). */
function withOccupancy(center) {
  const occupancy = Math.round((center.headcount / center.capacity) * 100);
  let occupancyStatus = 'available';
  if (occupancy >= 100) occupancyStatus = 'over capacity';
  else if (occupancy >= 80) occupancyStatus = 'nearly full';
  return { ...center, occupancy, occupancy_status: occupancyStatus };
}

module.exports = function centersRouter(db) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const rows = await db.query(`${CENTER_SELECT} GROUP BY c.id, c.name, c.barangay, c.municipality, c.capacity, c.created_at ORDER BY c.name`);
    res.json(rows.map(withOccupancy));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [row] = await db.query(`${CENTER_SELECT} WHERE c.id = $1 GROUP BY c.id, c.name, c.barangay, c.municipality, c.capacity, c.created_at`, [id]);
    if (!row) throw notFound('Evacuation center');
    res.json(withOccupancy(row));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const data = validate(req.body, centerSchema);
    const existing = await db.query('SELECT id FROM centers WHERE LOWER(name) = LOWER($1)', [data.name]);
    if (existing.length > 0) throw conflict(`An evacuation center named "${data.name}" already exists`);
    const [row] = await db.query(
      `INSERT INTO centers (name, barangay, municipality, capacity) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.name, data.barangay, data.municipality, data.capacity],
    );
    res.status(201).json(withOccupancy({ ...row, headcount: 0, families_present: 0 }));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = validate(req.body, centerSchema);
    const clash = await db.query('SELECT id FROM centers WHERE LOWER(name) = LOWER($1) AND id <> $2', [data.name, id]);
    if (clash.length > 0) throw conflict(`An evacuation center named "${data.name}" already exists`);
    const updated = await db.query(
      `UPDATE centers SET name = $1, barangay = $2, municipality = $3, capacity = $4 WHERE id = $5 RETURNING id`,
      [data.name, data.barangay, data.municipality, data.capacity, id],
    );
    if (updated.length === 0) throw notFound('Evacuation center');
    const [row] = await db.query(`${CENTER_SELECT} WHERE c.id = $1 GROUP BY c.id, c.name, c.barangay, c.municipality, c.capacity, c.created_at`, [id]);
    res.json(withOccupancy(row));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [{ count }] = await db.query('SELECT COUNT(*)::int AS count FROM families WHERE center_id = $1', [id]);
    if (count > 0) throw conflict('Cannot delete a center that has registered families');
    const deleted = await db.query('DELETE FROM centers WHERE id = $1 RETURNING id', [id]);
    if (deleted.length === 0) throw notFound('Evacuation center');
    res.status(204).end();
  }));

  return router;
};

module.exports.withOccupancy = withOccupancy;
