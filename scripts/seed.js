// Fills the database with sample Pangasinan data for demos: `npm run seed`
require('dotenv').config();
const { createDb, createPgPool } = require('../src/db');

const centers = [
  ['Dagupan City Central School', 'Poblacion Oeste', 'Dagupan City', 300],
  ['Calasiao Sports Complex', 'Poblacion East', 'Calasiao', 450],
  ['Bayambang Municipal Gym', 'Zone II', 'Bayambang', 250],
];
const items = [
  ['Family food pack', 'packs', 400, 50],
  ['Bottled water (6L)', 'gallons', 600, 80],
  ['Hygiene kit', 'kits', 150, 30],
  ['Sleeping mat', 'pcs', 60, 20],
  ['Rice (5 kg)', 'sacks', 15, 25],
];
const families = [
  [0, 'Juan Dela Cruz', 5, 'Pantal', '09171234567'],
  [0, 'Maria Santos', 4, 'Bonuan Gueset', null],
  [0, 'Pedro Reyes', 6, 'Pantal', '09281112222'],
  [1, 'Ana Flores', 3, 'Lumbang', null],
  [1, 'Jose Mendoza', 7, 'Nalsian', '09190001111'],
  [2, 'Rosa Villanueva', 2, 'Bical Norte', null],
  [2, 'Carlos Aquino', 5, 'Tampog', '09056667777'],
];

async function seed() {
  const db = createDb(createPgPool());
  await db.migrate();
  const [{ count }] = await db.query('SELECT COUNT(*)::int AS count FROM centers');
  if (count > 0) {
    console.log('Database already has data; seed skipped.');
    return db.close();
  }
  const centerIds = [];
  for (const c of centers) {
    const [row] = await db.query('INSERT INTO centers (name, barangay, municipality, capacity) VALUES ($1,$2,$3,$4) RETURNING id', c);
    centerIds.push(row.id);
  }
  for (const i of items) {
    await db.query('INSERT INTO relief_items (name, unit, quantity, low_stock_threshold) VALUES ($1,$2,$3,$4)', i);
  }
  for (const [ci, ...rest] of families) {
    await db.query('INSERT INTO families (center_id, head_name, members, origin_barangay, contact_number) VALUES ($1,$2,$3,$4,$5)', [centerIds[ci], ...rest]);
  }
  console.log(`Seeded ${centers.length} centers, ${items.length} relief items, ${families.length} families.`);
  return db.close();
}

seed().catch((err) => { console.error(err.message); process.exit(1); });
