const express = require('express');
const { asyncHandler, notFound, conflict } = require('../errors');
const { validate, parseId } = require('../validation');

const itemSchema = {
  name: { type: 'string', required: true, maxLength: 80 },
  unit: { type: 'string', required: true, maxLength: 30 },
  quantity: { type: 'int', min: 0, max: 1000000, default: 0 },
  low_stock_threshold: { type: 'int', min: 0, max: 1000000, default: 20 },
};

/** Labels each item: out of stock, low, or ok. */
function withStockStatus(item) {
  let stockStatus = 'ok';
  if (item.quantity === 0) stockStatus = 'out of stock';
  else if (item.quantity <= item.low_stock_threshold) stockStatus = 'low';
  return { ...item, stock_status: stockStatus };
}

module.exports = function itemsRouter(db) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const rows = await db.query('SELECT * FROM relief_items ORDER BY name');
    res.json(rows.map(withStockStatus));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const [row] = await db.query('SELECT * FROM relief_items WHERE id = $1', [parseId(req.params.id)]);
    if (!row) throw notFound('Relief item');
    res.json(withStockStatus(row));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const data = validate(req.body, itemSchema);
    const existing = await db.query('SELECT id FROM relief_items WHERE LOWER(name) = LOWER($1)', [data.name]);
    if (existing.length > 0) throw conflict(`Relief item "${data.name}" already exists; restock it instead`);
    const [row] = await db.query(
      `INSERT INTO relief_items (name, unit, quantity, low_stock_threshold) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.name, data.unit, data.quantity, data.low_stock_threshold],
    );
    res.status(201).json(withStockStatus(row));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { quantity, ...editable } = itemSchema; // stock only changes through restock/distribution
    const data = validate(req.body, editable);
    const clash = await db.query('SELECT id FROM relief_items WHERE LOWER(name) = LOWER($1) AND id <> $2', [data.name, id]);
    if (clash.length > 0) throw conflict(`Relief item "${data.name}" already exists`);
    const [row] = await db.query(
      `UPDATE relief_items SET name = $1, unit = $2, low_stock_threshold = $3 WHERE id = $4 RETURNING *`,
      [data.name, data.unit, data.low_stock_threshold, id],
    );
    if (!row) throw notFound('Relief item');
    res.json(withStockStatus(row));
  }));

  // POST /api/items/:id/restock  { "quantity": 100 }
  router.post('/:id/restock', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { quantity } = validate(req.body, { quantity: { type: 'int', required: true, min: 1, max: 1000000 } });
    const [row] = await db.query(
      'UPDATE relief_items SET quantity = quantity + $1::int WHERE id = $2 RETURNING *',
      [quantity, id],
    );
    if (!row) throw notFound('Relief item');
    res.json(withStockStatus(row));
  }));

  return router;
};

module.exports.withStockStatus = withStockStatus;
