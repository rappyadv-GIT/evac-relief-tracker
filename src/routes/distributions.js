const express = require('express');
const { asyncHandler, conflict, badRequest } = require('../errors');
const { validate, parseId, todayInManila, toDateString } = require('../validation');

const normalize = (row) => ({ ...row, distributed_on: toDateString(row.distributed_on) });

const distributionSchema = {
  family_id: { type: 'int', required: true, min: 1 },
  item_id: { type: 'int', required: true, min: 1 },
  quantity: { type: 'int', min: 1, max: 50, default: 1 },
  distributed_by: { type: 'string', required: true, maxLength: 80 },
  distributed_on: { type: 'date' },
};

const DIST_SELECT = `
  SELECT d.id, d.family_id, d.item_id, d.quantity, d.distributed_on, d.distributed_by, d.created_at,
         f.head_name, f.members, f.center_id, c.name AS center_name, i.name AS item_name, i.unit
  FROM distributions d
  JOIN families f ON f.id = d.family_id
  JOIN centers c ON c.id = f.center_id
  JOIN relief_items i ON i.id = d.item_id`;

module.exports = function distributionsRouter(db) {
  const router = express.Router();

  // GET /api/distributions?center_id=1&date=2026-11-24&family_id=3
  router.get('/', asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (req.query.center_id) { params.push(parseId(req.query.center_id, 'center_id')); where.push(`f.center_id = $${params.length}`); }
    if (req.query.family_id) { params.push(parseId(req.query.family_id, 'family_id')); where.push(`d.family_id = $${params.length}`); }
    if (req.query.date) {
      const { date } = validate({ date: req.query.date }, { date: { type: 'date', required: true } });
      params.push(date);
      where.push(`d.distributed_on = $${params.length}`);
    }
    const sql = `${DIST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.created_at DESC, d.id DESC LIMIT 500`;
    res.json((await db.query(sql, params)).map(normalize));
  }));

  /**
   * Logs a relief pack handed to a family. Blocks it when:
   *  - the family is not in a center anymore (departed),
   *  - the family already got this item today (duplicate),
   *  - there is not enough stock.
   * Stock deduction and the log entry are one transaction, so they succeed or fail together.
   */
  router.post('/', asyncHandler(async (req, res) => {
    const data = validate(req.body, distributionSchema);
    const day = data.distributed_on || todayInManila();

    const result = await db.transaction(async (tx) => {
      const [family] = await tx.query('SELECT id, head_name, status FROM families WHERE id = $1', [data.family_id]);
      if (!family) throw badRequest('family_id does not match any registered family');
      if (family.status !== 'present') throw conflict(`${family.head_name}'s family has checked out of the center`);

      const [item] = await tx.query('SELECT id, name, unit, quantity FROM relief_items WHERE id = $1', [data.item_id]);
      if (!item) throw badRequest('item_id does not match any relief item');

      const previous = await tx.query(
        'SELECT id, distributed_by FROM distributions WHERE family_id = $1 AND item_id = $2 AND distributed_on = $3',
        [data.family_id, data.item_id, day],
      );
      if (previous.length > 0) {
        throw conflict(
          `Duplicate blocked: ${family.head_name}'s family already received ${item.name} on ${day} (given by ${previous[0].distributed_by})`,
        );
      }

      // Atomic: only deducts when enough stock is left, so two volunteers cannot overdraw it.
      const deducted = await tx.query(
        'UPDATE relief_items SET quantity = quantity - $1::int WHERE id = $2 AND quantity >= $1::int RETURNING quantity',
        [data.quantity, data.item_id],
      );
      if (deducted.length === 0) {
        throw conflict(`Not enough ${item.name} in stock (${item.quantity} ${item.unit} left)`);
      }

      const [row] = await tx.query(
        `INSERT INTO distributions (family_id, item_id, quantity, distributed_on, distributed_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [data.family_id, data.item_id, data.quantity, day, data.distributed_by],
      );
      return { id: row.id, remaining_stock: deducted[0].quantity };
    });

    const [created] = await db.query(`${DIST_SELECT} WHERE d.id = $1`, [result.id]);
    res.status(201).json({ ...normalize(created), remaining_stock: result.remaining_stock });
  }));

  return router;
};
