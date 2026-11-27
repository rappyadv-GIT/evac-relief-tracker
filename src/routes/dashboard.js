const express = require('express');
const { asyncHandler } = require('../errors');
const { todayInManila, toDateString } = require('../validation');
const { withOccupancy } = require('./centers');
const { withStockStatus } = require('./items');

/** Returns the last `days` dates (oldest first) as YYYY-MM-DD strings. */
function lastDays(days, today) {
  const end = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

module.exports = function dashboardRouter(db) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const today = todayInManila();
    const days = lastDays(7, today);

    // Independent queries run in parallel.
    const [centers, items, daily, todayByItem] = await Promise.all([
      db.query(`
        SELECT c.id, c.name, c.barangay, c.municipality, c.capacity,
               COALESCE(SUM(CASE WHEN f.status = 'present' THEN f.members ELSE 0 END), 0)::int AS headcount,
               COALESCE(SUM(CASE WHEN f.status = 'present' THEN 1 ELSE 0 END), 0)::int AS families_present
        FROM centers c LEFT JOIN families f ON f.center_id = c.id
        GROUP BY c.id, c.name, c.barangay, c.municipality, c.capacity ORDER BY c.name`),
      db.query('SELECT * FROM relief_items ORDER BY name'),
      db.query(
        `SELECT distributed_on, COUNT(*)::int AS packs FROM distributions
         WHERE distributed_on >= $1 GROUP BY distributed_on`,
        [days[0]],
      ),
      db.query(
        `SELECT i.name, COALESCE(SUM(d.quantity), 0)::int AS given
         FROM relief_items i LEFT JOIN distributions d ON d.item_id = i.id AND d.distributed_on = $1
         GROUP BY i.id, i.name ORDER BY i.name`,
        [today],
      ),
    ]);

    const centerList = centers.map(withOccupancy);
    const stock = items.map(withStockStatus);
    const packsByDay = Object.fromEntries(daily.map((r) => [toDateString(r.distributed_on), r.packs]));

    const totals = centerList.reduce(
      (acc, c) => ({
        centers: acc.centers + 1,
        families: acc.families + c.families_present,
        persons: acc.persons + c.headcount,
        capacity: acc.capacity + c.capacity,
      }),
      { centers: 0, families: 0, persons: 0, capacity: 0 },
    );

    res.json({
      date: today,
      totals: {
        ...totals,
        packs_today: packsByDay[today] || 0,
        low_stock_items: stock.filter((s) => s.stock_status !== 'ok').length,
      },
      centers: centerList,
      stock,
      alerts: [
        ...centerList.filter((c) => c.occupancy >= 100).map((c) => `${c.name} is over capacity (${c.headcount}/${c.capacity})`),
        ...stock.filter((s) => s.stock_status === 'out of stock').map((s) => `${s.name} is out of stock`),
        ...stock.filter((s) => s.stock_status === 'low').map((s) => `${s.name} is low (${s.quantity} ${s.unit} left)`),
      ],
      distributions_last_7_days: days.map((d) => ({ date: d, packs: packsByDay[d] || 0 })),
      given_today_by_item: todayByItem,
    });
  }));

  return router;
};

module.exports.lastDays = lastDays;
