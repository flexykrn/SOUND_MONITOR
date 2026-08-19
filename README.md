# Office Noise Monitor

Live office dB monitoring in the browser (Web Audio API), with loud +
quiet threshold alerts, Postgres logging, and a password-gated site.

## Stack

- Backend: Node.js + Express
- DB: PostgreSQL (via `pg`)
- Frontend: plain HTML/CSS/JS, no framework
- Deploy target: Render (Blueprint included — see below)

## How it works

- `public/index.html` + `public/js/monitor.js` — the always-open monitor
  tab. Captures mic audio through a 250Hz-4kHz band-pass filter (the range
  office chatter/complaints actually live in), computes dB from a
  Hann-windowed RMS, and tracks it with dual Fast(125ms)/Slow(1000ms)
  time constants like a real sound level meter — alerts always evaluate
  against the Slow trace so a single door-slam can't itself satisfy a
  multi-second sustain window. Calibrates itself automatically 1s after
  you hit Start (assumes a ~45dB quiet-office baseline); "Match to meter"
  and "Reset calibration" are there for anyone who wants to override it
  with a real meter. Requests a screen Wake Lock while monitoring, and
  auto-reconnects if the mic stream drops.
- `public/dashboard.html` + `public/js/dashboard.js` ("History") — any of
  the last 7 days' timeline, alert event list (with per-device source),
  hour-of-day / dB-distribution breakdowns, CSV export.
- `server.js` + `routes/api.js` + `db/index.js` — Express API, Postgres
  schema/init, and an hourly purge job that deletes rows older than 7 days.
- The whole site (monitor + history) sits behind one password cookie —
  there's no page you can view without logging in first.

### Multiple devices in one room

Each browser tab is its own independent monitor with its own calibration,
thresholds, and clips (stored in that browser's `localStorage`), but they
all write to the same shared Postgres log. Give each one a **Device name**
(top of the Monitor page) so the History table can tell them apart. The
same real noise event will show up once per device that heard it above
its own threshold — that's expected, not a duplicate bug.

### dB calibration note

A browser mic can't give a true absolute SPL number — there's no way
around that from `getUserMedia` alone. Auto-calibration gets you a
*consistent, relative* reading good enough for threshold alerts; if you
need lab-grade accuracy, use "Match to meter" against a real sound level
meter.

### Custom alert clips

Upload an mp3/wav for the loud alert and/or the quiet alert in their
respective cards. Stored as a data URL in `localStorage` in the browser
(not uploaded to the server), so it needs to be re-selected only if you
clear browser storage. Falls back to a plain beep if no clip is set.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env: DATABASE_URL, DASHBOARD_PASSWORD

npm start
```

Requires a running Postgres instance matching `DATABASE_URL`. The app
creates/migrates its own tables on startup — no separate migration step.

Open `http://localhost:3000/index.html` for the monitor tab (leave it open
on the always-on machine) — you'll be redirected to log in first, and stay
logged in for 30 days via cookie.

## Environment variables

| Variable             | Purpose                                      |
|-----------------------|-----------------------------------------------|
| `DATABASE_URL`        | Postgres connection string                    |
| `DASHBOARD_PASSWORD`  | Password required to view the whole site      |
| `COOKIE_SECRET`       | Set to any random string (not currently used for signing, reserved) |
| `PORT`                | Port to listen on (Render sets this for you)  |

## Deploying on Render

### Option A — Blueprint (recommended)

This repo includes `render.yaml`. In Render: **New +** → **Blueprint** →
connect this repo. It auto-creates the Postgres database, links
`DATABASE_URL`, generates `COOKIE_SECRET`, and only prompts you for
`DASHBOARD_PASSWORD`. Click **Apply**.

### Option B — Manual

1. **New +** → **PostgreSQL** — create an instance, copy its **Internal
   Connection String**.
2. **New +** → **Web Service** — connect the repo.
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment variables:** `DATABASE_URL` (from step 1),
     `DASHBOARD_PASSWORD`, `COOKIE_SECRET` (any random string)
3. Deploy, then open `https://<your-app>.onrender.com/index.html`, log
   in, and grant mic permission.

## Production checklist — read before relying on this for real evidence

The Blueprint deploys on **free** tiers by default, which have real limits:

- **Free web services spin down after ~15 min idle.** An always-open
  monitor tab will silently stop logging and the page will error until
  it wakes back up (30-50s). For genuine 24/7 monitoring, upgrade the web
  service to a paid "always on" instance type in the Render dashboard.
- **Free Postgres databases expire (~30 days).** Fine for testing, not
  for logs you plan to keep. Upgrade the database plan before relying on
  it long-term, and use CSV export regularly regardless — the app itself
  also purges anything older than 7 days.
- **Browser tab throttling.** Some browsers slow down timers in
  minimized/hidden tabs even with the Wake Lock held. Keep the monitor
  tab visible (not just open) on the always-on device for best results.
- A dropped/unplugged mic auto-reconnects with backoff, but there will be
  a gap in ambient logging while it's disconnected.

## Data retention

`ambient_readings` (logged every 60s per device) and `breach_events`
(logged per sustained threshold breach) are purged automatically once
older than 7 days, checked once at startup and then hourly. Use the
History page's CSV export before that window closes if you need to keep
evidence longer term.
