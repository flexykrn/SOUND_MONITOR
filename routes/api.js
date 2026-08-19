const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.cookies && req.cookies.noise_auth === '1') return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// --- Auth ---
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password === process.env.DASHBOARD_PASSWORD) {
    res.cookie('noise_auth', '1', {
      httpOnly: true,
      sameSite: 'lax',
      signed: false,
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'invalid password' });
});

router.post('/logout', (req, res) => {
  res.clearCookie('noise_auth');
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  res.json({ authenticated: !!(req.cookies && req.cookies.noise_auth === '1') });
});

// --- Ingest (called from the always-on monitor tab, no auth required) ---
router.post('/logs/breach', async (req, res) => {
  const { timestamp, peakDb, duration } = req.body || {};
  if (timestamp == null || peakDb == null || duration == null) {
    return res.status(400).json({ error: 'timestamp, peakDb, duration required' });
  }
  try {
    await pool.query(
      'INSERT INTO breach_events (ts, peak_db, duration_seconds) VALUES ($1, $2, $3)',
      [new Date(timestamp), peakDb, duration]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'insert failed' });
  }
});

router.post('/logs/ambient', async (req, res) => {
  const { timestamp, dbLevel } = req.body || {};
  if (timestamp == null || dbLevel == null) {
    return res.status(400).json({ error: 'timestamp, dbLevel required' });
  }
  try {
    await pool.query(
      'INSERT INTO ambient_readings (ts, db_level) VALUES ($1, $2)',
      [new Date(timestamp), dbLevel]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'insert failed' });
  }
});

// --- Read (dashboard, requires auth) ---
router.get('/logs/breaches', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  try {
    const result = await pool.query(
      `SELECT id, ts, peak_db, duration_seconds FROM breach_events
       WHERE ts >= $1 AND ts <= $2 ORDER BY ts DESC`,
      [start || '1970-01-01', end || new Date().toISOString()]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'query failed' });
  }
});

router.get('/logs/ambient', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  try {
    const result = await pool.query(
      `SELECT id, ts, db_level FROM ambient_readings
       WHERE ts >= $1 AND ts <= $2 ORDER BY ts ASC`,
      [start || '1970-01-01', end || new Date().toISOString()]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'query failed' });
  }
});

// --- CSV export (requires auth) ---
router.get('/export/csv', requireAuth, async (req, res) => {
  const { start, end, type } = req.query;
  const table = type === 'ambient' ? 'ambient_readings' : 'breach_events';
  try {
    let rows, header;
    if (table === 'ambient_readings') {
      const result = await pool.query(
        `SELECT ts, db_level FROM ambient_readings WHERE ts >= $1 AND ts <= $2 ORDER BY ts ASC`,
        [start || '1970-01-01', end || new Date().toISOString()]
      );
      rows = result.rows;
      header = 'timestamp,db_level\n';
      var csvBody = rows.map(r => `${r.ts.toISOString()},${r.db_level}`).join('\n');
    } else {
      const result = await pool.query(
        `SELECT ts, peak_db, duration_seconds FROM breach_events WHERE ts >= $1 AND ts <= $2 ORDER BY ts ASC`,
        [start || '1970-01-01', end || new Date().toISOString()]
      );
      rows = result.rows;
      header = 'timestamp,peak_db,duration_seconds\n';
      var csvBody = rows.map(r => `${r.ts.toISOString()},${r.peak_db},${r.duration_seconds}`).join('\n');
    }
    const csv = header + csvBody;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${table}_${start || 'all'}_${end || 'all'}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'export failed' });
  }
});

module.exports = { router, requireAuth };
