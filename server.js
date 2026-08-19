require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { init, purgeOldEntries } = require('./db');
const { router: apiRouter } = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

// Gate dashboard.html behind the password cookie; everything else in
// public/ (monitor page, login page, assets) is served freely.
app.get('/dashboard.html', (req, res) => {
  if (req.cookies && req.cookies.noise_auth === '1') {
    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  }
  return res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, 'public')));

async function start() {
  await init();
  app.listen(PORT, () => console.log(`Noise monitor listening on port ${PORT}`));

  // Purge entries older than 7 days, once at startup and then every hour.
  purgeOldEntries().catch(err => console.error('purge failed', err));
  setInterval(() => {
    purgeOldEntries().catch(err => console.error('purge failed', err));
  }, 60 * 60 * 1000);
}

start().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});
