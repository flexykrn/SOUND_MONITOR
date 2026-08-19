# Office Noise Monitor

Live office dB monitoring in the browser (Web Audio API), with threshold
alerts, Postgres logging, and a password-gated dashboard.

## Stack

- Backend: Node.js + Express
- DB: PostgreSQL (via `pg`)
- Frontend: plain HTML/CSS/JS, no framework
- Deploy target: Render

## How it works

- `public/index.html` + `public/js/monitor.js` — the always-open monitor
  tab. Captures mic audio, computes an approximate dB level from RMS of the
  time-domain signal, shows a live number + 60s rolling chart, and fires a
  custom audio clip when the level stays above the threshold for the
  configured sustain time. The clip only fires once per breach (won't
  replay until the level drops back under threshold and re-crosses it).
- `public/dashboard.html` + `public/js/dashboard.js` — password-gated
  dashboard: today's (or any of the last 7 days') timeline, breach event
  list, CSV export.
- `server.js` + `routes/api.js` + `db/index.js` — Express API, Postgres
  schema/init, and an hourly purge job that deletes rows older than 7 days.

### dB calibration note

The browser only gives you a relative signal (dBFS from the mic ADC), not
an absolute SPL value — there's no way to get a "real" dB(A) number from
`getUserMedia` alone. The app computes RMS → dBFS and adds a fixed +100
reference offset to land in a human-readable range, then adds your
**calibration offset** on top. Point a real sound level meter at the room,
compare, and adjust the calibration offset in the Settings panel until the
two agree. Re-calibrate if you change microphones or mic gain/AGC settings
in the OS.

### Custom alert clip

Upload an mp3/wav in the Settings panel. It's stored as a data URL in
`localStorage` in the browser (not uploaded to the server) — so it needs to
be re-selected only if you clear browser storage. Falls back to a plain
beep if no clip is set.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env: DATABASE_URL, DASHBOARD_PASSWORD

npm start
```

Requires a running Postgres instance matching `DATABASE_URL`. The app
creates its own tables on startup (`breach_events`, `ambient_readings`) —
no separate migration step needed.

Open `http://localhost:3000/index.html` for the monitor tab (leave it open
on the always-on machine), and `http://localhost:3000/dashboard.html` for
the dashboard (prompts for `DASHBOARD_PASSWORD`).

## Environment variables

| Variable             | Purpose                                      |
|-----------------------|-----------------------------------------------|
| `DATABASE_URL`        | Postgres connection string                    |
| `DASHBOARD_PASSWORD`  | Password required to view `/dashboard.html`   |
| `PORT`                | Port to listen on (Render sets this for you)  |

## Deploying on Render

1. Push this repo to GitHub/GitLab.
2. In Render: **New +** → **PostgreSQL** — create a free/starter Postgres
   instance, copy its **Internal Connection String**.
3. In Render: **New +** → **Web Service** — connect the repo.
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment variables:**
     - `DATABASE_URL` = the Postgres internal connection string from step 2
     - `DASHBOARD_PASSWORD` = a password of your choice
4. Deploy. Once live, open the monitor tab on the always-on device
   (`https://<your-app>.onrender.com/index.html`) and grant mic permission.
   View the dashboard at `/dashboard.html` from any browser with the
   password.

Note: Render's free web services spin down after inactivity, which would
drop the monitor tab's connection. Use a paid "always on" instance type for
this to run continuously.

## Data retention

`ambient_readings` (logged every 60s) and `breach_events` (logged per
sustained threshold breach) are purged automatically once older than 7
days, checked once at startup and then hourly. Use the dashboard's CSV
export before that window closes if you need to keep evidence longer term.
