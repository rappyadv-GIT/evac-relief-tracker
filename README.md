# Evacuation Center Headcount and Relief Goods Tracker

ELEC3 (Node.js) final project, **CS-13**.

**Problem.** During floods in Pangasinan, evacuation centers count families on paper, so relief goods are sometimes given twice to one family or missed entirely.

**Users.** MDRRMO staff, barangay officials, and evacuation center volunteers.

## Features

| Feature | What it does |
|---|---|
| Family registration per evacuation center | Register a family's head, number of members, origin barangay, and contact number. The same family (same head and barangay) cannot be registered twice, even in a different center. |
| Live headcount | Each center shows persons present out of its capacity, with an occupancy label (available, nearly full, over capacity). The header count refreshes every 15 seconds. Check-out removes a family from the count, and check-in brings them back. |
| Relief pack distribution log that blocks duplicates | A family can get each relief item **once per day**. A second attempt is refused with a message saying who gave it first. The database also enforces this with a `UNIQUE (family_id, item_id, distributed_on)` constraint. Families who have checked out cannot receive goods. |
| Stock of relief goods | Add items, restock them, and see ok, low, or out-of-stock status. Giving goods deducts stock in the same transaction, and it is refused when stock is not enough. |
| Summary dashboard | KPI cards, alerts, and Chart.js charts: headcount vs capacity per center, packs given in the last 7 days, and stock on hand. |
| Optional login | Set `APP_PASSWORD` and the whole site asks for a username and password. |

## Tech stack

Node.js 18+, Express 5, PostgreSQL (`pg`), Tailwind CSS, Chart.js, Jest + Supertest.

## Where the required concepts are used

| Concept | Where to look |
|---|---|
| Objects and arrays | `src/routes/dashboard.js` (`reduce`, `map`, `filter`, `Object.fromEntries` to build totals, alerts and chart series), the seed data in `scripts/seed.js` |
| Conditionals | `withOccupancy()` in `src/routes/centers.js`, `withStockStatus()` in `src/routes/items.js`, the duplicate, stock, and checked-out checks in `src/routes/distributions.js` |
| Async / Promises | Every route is `async` with `await`; `Promise.all` runs the dashboard queries in parallel; `db.transaction()` in `src/db.js` |
| REST API | `src/routes/*.js` (see the endpoint list below) |
| Validation | `src/validation.js` (required fields, whole numbers, ranges, dates, PH mobile numbers) |
| Error handling | `src/errors.js` (`HttpError`, `asyncHandler`, central `errorHandler` with clear 400, 404, 409 and 500 responses) |

## Project structure

```
server.js              entry file (starts the app, creates tables automatically)
src/app.js             Express app, security headers, optional login, routes
src/db.js              PostgreSQL pool, query and transaction helpers, migration
src/schema.sql         tables and constraints
src/validation.js      input validation helpers
src/errors.js          error classes and the error handler
src/routes/            centers, families, items, distributions, dashboard
src/styles/input.css   Tailwind source
public/                web pages (index.html, app.js, built styles.css)
scripts/seed.js        sample Pangasinan data for demos
tests/                 Jest + Supertest tests
```

## Run it on your computer

1. Install Node.js 18 or newer, and have a PostgreSQL database ready (local, or a free one from Neon or Supabase, see below).
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`. For local PostgreSQL, for example: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/evac`
4. Optional: run `npm run seed` to add sample centers, families, and relief items.
5. Run `npm start` and open http://localhost:3000

Tables are created automatically the first time the app starts.

## Tests

```
npm test
```

The tests use **pg-mem**, an in-memory PostgreSQL, so they need no database server. There are 31 tests covering validation, duplicate family registration, the live headcount, check-out and check-in, duplicate relief blocking, stock deduction, the dashboard, error responses, and the optional login.

To run the same tests against a real PostgreSQL database (warning: it **drops** the app's tables in that database first, so use an empty test database):

```
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/evac_test npm test
```

## Deploy on Hostinger

Hostinger runs Node.js apps on the **Business Web Hosting** plan and the **Cloud** plans (Startup, Professional, Enterprise, Enterprise Plus). These plans do not include a PostgreSQL server, so the database is hosted for free on **Neon** or **Supabase**, and the app connects to it with `DATABASE_URL`. The app still uses PostgreSQL as the project spec requires.

### Step 1. Create a free PostgreSQL database

**Option A: Neon (simplest)**
1. Sign up at https://neon.tech and create a project. Pick the region closest to the Philippines (for example Singapore).
2. On the project dashboard, click **Connect** and copy the connection string. It looks like `postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

**Option B: Supabase**
1. Sign up at https://supabase.com and create a project (region: Southeast Asia, Singapore).
2. Click **Connect** at the top of the project, and copy the **Session pooler** connection string (use the pooler, because the direct connection needs IPv6). Replace `[YOUR-PASSWORD]` with your database password.

You do not need to run any SQL. The app creates its tables on first start.

### Step 2. Upload the app to Hostinger

1. Log in to **hPanel** and go to **Websites**, then **Add website**, then **Node.js Apps** (on some accounts it is shown as **Web App**).
2. Choose your domain, or use a temporary domain.
3. Choose **Upload your files** and upload `evac-relief-tracker.zip`. The zip already has `package.json` at its root and no `node_modules` folder, which is what Hostinger expects.
4. In the build settings, check these values:

   | Setting | Value |
   |---|---|
   | Framework preset | Express (or **Other** if Express is not listed) |
   | Node.js version | 22 (20 or 24 also work) |
   | Package manager | npm |
   | Entry file | `server.js` |
   | Build command | leave empty / None (the CSS is already built) |
   | Output directory | leave empty |

5. Under **Environment variables**, click **Add** and set:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the connection string from Step 1 |
   | `APP_PASSWORD` | optional: a password so only staff can open the site |
   | `APP_USERNAME` | optional: the login name (default `admin`) |

   Do not set `PORT`. Hostinger provides it, and the app reads it automatically.
6. Click **Deploy**. Hostinger installs the dependencies and starts `server.js`.
7. Open your domain. Visit `/api/health` to confirm the database is connected: it should show `{"status":"ok","database":"connected"}`.

### Optional: load sample data on the live database

On your own computer, put the same `DATABASE_URL` in `.env` and run `npm run seed`. It only adds data when the database is empty.

### Updating the app later

Make your changes, create a new zip (exclude `node_modules` and `.env`), and upload it again from the app's dashboard in hPanel under **Deployments**. Your data stays in Neon or Supabase.

### Troubleshooting

| Problem | Fix |
|---|---|
| Build succeeds but the site shows an error | Open **Runtime logs** in hPanel. `DATABASE_URL is not set` means the environment variable is missing; add it and redeploy. |
| `/api/health` says `unreachable` | Check the password in `DATABASE_URL`. For Supabase, use the **Session pooler** string. If the password has symbols like `@` or `#`, URL-encode them (for example `@` becomes `%40`). |
| Changed the Tailwind classes and the style did not update | Run `npm run build:css` before zipping, so `public/styles.css` is rebuilt. |
| The first page load is slow | Hostinger stops idle apps and restarts them on the next visit; Neon also sleeps idle databases. The first request after a quiet period takes a few seconds. |

## REST API

All endpoints use JSON. Errors return `{ "error": "...", "details": [...] }` with status 400 (invalid input), 404 (not found), or 409 (duplicate or business rule).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | App and database status |
| GET | `/api/dashboard` | Totals, alerts, per-center headcount, stock, 7-day chart data |
| GET, POST | `/api/centers` | List (with headcount and occupancy) or add evacuation centers |
| GET, PUT, DELETE | `/api/centers/:id` | View, edit, or delete a center (delete only when it has no families) |
| GET | `/api/families?center_id=&status=present\|departed&q=` | List and search families |
| POST | `/api/families` | Register a family (`center_id`, `head_name`, `members`, `origin_barangay`, `contact_number`) |
| GET, PUT | `/api/families/:id` | View (with relief history) or edit a family |
| PATCH | `/api/families/:id/checkout` | Family leaves the center |
| PATCH | `/api/families/:id/checkin` | Family returns to the center |
| GET, POST | `/api/items` | List or add relief items |
| GET, PUT | `/api/items/:id` | View or edit an item's name, unit, and low-stock level |
| POST | `/api/items/:id/restock` | Add stock: `{ "quantity": 100 }` |
| GET | `/api/distributions?date=&center_id=&family_id=` | Distribution log |
| POST | `/api/distributions` | Give relief goods (`family_id`, `item_id`, `quantity`, `distributed_by`, optional `distributed_on`). Returns 409 for duplicates, checked-out families, or low stock. |

Dates follow Philippine time (Asia/Manila), so "once per day" means a Philippine calendar day.
