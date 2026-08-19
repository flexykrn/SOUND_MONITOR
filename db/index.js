const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS breach_events (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  peak_db NUMERIC NOT NULL,
  duration_seconds NUMERIC NOT NULL,
  type TEXT NOT NULL DEFAULT 'high',
  source TEXT NOT NULL DEFAULT 'Unnamed device',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE breach_events ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'high';
ALTER TABLE breach_events ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'Unnamed device';

CREATE TABLE IF NOT EXISTS ambient_readings (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  db_level NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'Unnamed device',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ambient_readings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'Unnamed device';

CREATE INDEX IF NOT EXISTS idx_breach_events_ts ON breach_events (ts);
CREATE INDEX IF NOT EXISTS idx_ambient_readings_ts ON ambient_readings (ts);

-- Single-row table: the shared threshold config devices sync to when
-- "Peer mode" is on. Calibration and clips stay per-device on purpose —
-- they're tied to that mic's physical position, not the room as a whole.
CREATE TABLE IF NOT EXISTS shared_settings (
  id INT PRIMARY KEY DEFAULT 1,
  threshold NUMERIC NOT NULL DEFAULT 65,
  sustain NUMERIC NOT NULL DEFAULT 3,
  low_threshold NUMERIC NOT NULL DEFAULT 40,
  low_sustain NUMERIC NOT NULL DEFAULT 5,
  response TEXT NOT NULL DEFAULT 'fast',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO shared_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;

async function init() {
  await pool.query(SCHEMA);
}

async function purgeOldEntries() {
  const res1 = await pool.query(
    "DELETE FROM breach_events WHERE ts < now() - interval '7 days'"
  );
  const res2 = await pool.query(
    "DELETE FROM ambient_readings WHERE ts < now() - interval '7 days'"
  );
  return { breachesDeleted: res1.rowCount, ambientDeleted: res2.rowCount };
}

module.exports = { pool, init, purgeOldEntries };
