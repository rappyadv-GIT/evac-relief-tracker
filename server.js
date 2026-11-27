// Entry file for Hostinger (set "Entry file" to server.js) and for `npm start`.
require('dotenv').config();
const { createApp } = require('./src/app');
const { createDb, createPgPool } = require('./src/db');

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  const db = createDb(createPgPool());
  await db.migrate(); // creates tables on first run, so no manual SQL step is needed
  const app = createApp(db);
  app.listen(PORT, () => console.log(`Evacuation relief tracker running on port ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
