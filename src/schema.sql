-- Evacuation Center Headcount and Relief Goods Tracker
-- Safe to run many times: every statement uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS centers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(120) NOT NULL UNIQUE,
  barangay     VARCHAR(80)  NOT NULL,
  municipality VARCHAR(80)  NOT NULL,
  capacity     INTEGER      NOT NULL CHECK (capacity > 0),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS families (
  id              SERIAL PRIMARY KEY,
  center_id       INTEGER      NOT NULL REFERENCES centers(id),
  head_name       VARCHAR(120) NOT NULL,
  members         INTEGER      NOT NULL CHECK (members > 0),
  origin_barangay VARCHAR(80)  NOT NULL,
  contact_number  VARCHAR(20),
  status          VARCHAR(10)  NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'departed')),
  registered_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  departed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS relief_items (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(80) NOT NULL UNIQUE,
  unit                VARCHAR(30) NOT NULL,
  quantity            INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INTEGER     NOT NULL DEFAULT 20 CHECK (low_stock_threshold >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS distributions (
  id             SERIAL PRIMARY KEY,
  family_id      INTEGER      NOT NULL REFERENCES families(id),
  item_id        INTEGER      NOT NULL REFERENCES relief_items(id),
  quantity       INTEGER      NOT NULL CHECK (quantity > 0),
  distributed_on DATE         NOT NULL,
  distributed_by VARCHAR(80)  NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- The database itself refuses a second pack of the same item for the same family on the same day.
  CONSTRAINT one_pack_per_family_item_day UNIQUE (family_id, item_id, distributed_on)
);

CREATE INDEX IF NOT EXISTS idx_families_center ON families(center_id);
CREATE INDEX IF NOT EXISTS idx_distributions_day ON distributions(distributed_on);
