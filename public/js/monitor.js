(() => {
  const dbReadingEl = document.getElementById('dbReading');
  const statusEl = document.getElementById('status');
  const statusTextEl = document.getElementById('statusText');
  const startBtn = document.getElementById('startBtn');
  const permErrEl = document.getElementById('permErr');
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');
  const logoutBtn = document.getElementById('logoutBtn');
  const deviceNameEl = document.getElementById('deviceName');

  const DEVICE_NAME_KEY = 'noiseMonitorDeviceName';
  deviceNameEl.value = localStorage.getItem(DEVICE_NAME_KEY) || '';
  deviceNameEl.addEventListener('change', () => {
    localStorage.setItem(DEVICE_NAME_KEY, deviceNameEl.value.trim());
  });
  function currentDeviceName() {
    return deviceNameEl.value.trim() || 'Unnamed device';
  }
  const needleEl = document.getElementById('needle');
  const lowMarkerEl = document.getElementById('lowMarker');
  const highMarkerEl = document.getElementById('highMarker');
  const eqEl = document.getElementById('eq');
  const responseFastBtn = document.getElementById('responseFast');
  const responseSlowBtn = document.getElementById('responseSlow');

  const statAvgEl = document.getElementById('statAvg');
  const statMinEl = document.getElementById('statMin');
  const statPeakEl = document.getElementById('statPeak');
  const statTimeEl = document.getElementById('statTime');
  const recentFeedEl = document.getElementById('recentFeed');
  const highCountTodayEl = document.getElementById('highCountToday');
  const lowCountTodayEl = document.getElementById('lowCountToday');

  const calibrationEl = document.getElementById('calibration');
  const calibrationReadoutEl = document.getElementById('calibrationReadout');
  const rawDbHintEl = document.getElementById('rawDbHint');
  const meterReadingEl = document.getElementById('meterReading');
  const quickCalibrateBtn = document.getElementById('quickCalibrate');
  const resetCalibrationBtn = document.getElementById('resetCalibration');
  const floorStatusEl = document.getElementById('floorStatus');

  const thresholdEl = document.getElementById('threshold');
  const thresholdSliderEl = document.getElementById('thresholdSlider');
  const sustainEl = document.getElementById('sustain');
  const clipFileEl = document.getElementById('clipFile');
  const clipStatusEl = document.getElementById('clipStatus');
  const testClipHighBtn = document.getElementById('testClipHigh');

  const lowThresholdEl = document.getElementById('lowThreshold');
  const lowThresholdSliderEl = document.getElementById('lowThresholdSlider');
  const lowSustainEl = document.getElementById('lowSustain');
  const lowClipFileEl = document.getElementById('lowClipFile');
  const lowClipStatusEl = document.getElementById('lowClipStatus');
  const testClipLowBtn = document.getElementById('testClipLow');

  const SETTINGS_KEY = 'noiseMonitorSettings';
  const CLIP_HIGH_KEY = 'noiseMonitorClipHigh';
  const CLIP_LOW_KEY = 'noiseMonitorClipLow';
  const METER_MIN = 0, METER_MAX = 140;

  let settings = {
    calibration: 0,
    threshold: 65,
    sustain: 3,        // seconds
    lowThreshold: 40,
    lowSustain: 5,      // minutes
    response: 'fast',   // 'fast' (125ms) or 'slow' (1000ms), like IEC 61672 SLMs
  };

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      settings = Object.assign(settings, saved);
    } catch (e) { /* ignore */ }
    calibrationEl.value = settings.calibration;
    thresholdEl.value = settings.threshold;
    thresholdSliderEl.value = settings.threshold;
    sustainEl.value = settings.sustain;
    lowThresholdEl.value = settings.lowThreshold;
    lowThresholdSliderEl.value = settings.lowThreshold;
    lowSustainEl.value = settings.lowSustain;
    setResponseButtons();
    positionMarkers();
    calibrationReadoutEl.textContent = settings.calibration;

    const savedHigh = localStorage.getItem(CLIP_HIGH_KEY);
    if (savedHigh) {
      clipStatusEl.textContent = 'Custom clip loaded.';
      highAlertAudio = new Audio(savedHigh);
    }
    const savedLow = localStorage.getItem(CLIP_LOW_KEY);
    if (savedLow) {
      lowClipStatusEl.textContent = 'Custom clip loaded.';
      lowAlertAudio = new Audio(savedLow);
    }
  }

  function saveSettings() {
    settings.calibration = parseFloat(calibrationEl.value) || 0;
    settings.threshold = parseFloat(thresholdEl.value) || 65;
    settings.sustain = parseFloat(sustainEl.value) || 3;
    settings.lowThreshold = parseFloat(lowThresholdEl.value) || 40;
    settings.lowSustain = parseFloat(lowSustainEl.value) || 5;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    positionMarkers();
    calibrationReadoutEl.textContent = settings.calibration;
  }

  function positionMarkers() {
    const pct = v => Math.max(0, Math.min(100, ((v - METER_MIN) / (METER_MAX - METER_MIN)) * 100));
    lowMarkerEl.style.left = pct(settings.lowThreshold) + '%';
    highMarkerEl.style.left = pct(settings.threshold) + '%';
  }

  // Number <-> slider two-way sync, auto-saving on every change.
  function linkPair(numberEl, sliderEl) {
    numberEl.addEventListener('input', () => { sliderEl.value = numberEl.value; });
    sliderEl.addEventListener('input', () => { numberEl.value = sliderEl.value; });
    [numberEl, sliderEl].forEach(el => el.addEventListener('change', saveSettings));
  }
  linkPair(thresholdEl, thresholdSliderEl);
  linkPair(lowThresholdEl, lowThresholdSliderEl);
  [sustainEl, lowSustainEl, calibrationEl].forEach(el => el.addEventListener('change', saveSettings));

  responseFastBtn.addEventListener('click', () => { settings.response = 'fast'; setResponseButtons(); saveSettings(); });
  responseSlowBtn.addEventListener('click', () => { settings.response = 'slow'; setResponseButtons(); saveSettings(); });
  function setResponseButtons() {
    responseFastBtn.classList.toggle('toggle-off', settings.response !== 'fast');
    responseSlowBtn.classList.toggle('toggle-off', settings.response !== 'slow');
  }

  // Calibration shifts the whole dB scale, so any threshold set under the
  // old calibration no longer points at the same real-world level unless
  // it moves by the same amount. Every place calibration changes below
  // shifts both thresholds by that same delta to compensate.
  function shiftThresholds(delta) {
    thresholdEl.value = (parseFloat(thresholdEl.value) + delta).toFixed(1);
    thresholdSliderEl.value = Math.max(30, Math.min(120, thresholdEl.value));
    lowThresholdEl.value = (parseFloat(lowThresholdEl.value) + delta).toFixed(1);
    lowThresholdSliderEl.value = Math.max(0, Math.min(90, lowThresholdEl.value));
  }

  // Fills the calibration offset for you: offset = what the real meter
  // says minus what our raw (uncalibrated) reading currently says.
  quickCalibrateBtn.addEventListener('click', () => {
    const meterVal = parseFloat(meterReadingEl.value);
    if (isNaN(meterVal) || lastRawDb === null) return;
    const uncalibratedRaw = lastRawDb - settings.calibration;
    const newCalibration = Number((meterVal - uncalibratedRaw).toFixed(1));
    shiftThresholds(newCalibration - settings.calibration);
    settings.calibration = newCalibration;
    calibrationEl.value = settings.calibration;
    saveSettings();
  });

  // Runs automatically 1s after monitoring starts, no user action needed.
  // Assumes a typical quiet-office ambient of ~45dB SPL and solves for the
  // calibration offset that makes the mic's raw reading land there — good
  // enough for relative tracking and threshold alerts without ever
  // touching a real meter. "Match to meter" (below) still overrides this
  // for anyone who wants true SPL accuracy.
  const AUTO_BASELINE_DB = 45;
  let autoCalibrating = false;
  function autoCalibrate() {
    if (autoCalibrating) return;
    autoCalibrating = true;
    const samples = [];
    floorStatusEl.textContent = 'Auto-calibrating... stay quiet for a moment.';
    const collector = setInterval(() => { if (lastRawDb !== null) samples.push(lastRawDb - settings.calibration); }, 100);
    setTimeout(() => {
      clearInterval(collector);
      autoCalibrating = false;
      if (!samples.length) { floorStatusEl.textContent = 'Could not auto-calibrate — try Reset.'; return; }
      const floor = samples.reduce((a, b) => a + b, 0) / samples.length;
      const newCalibration = Number((AUTO_BASELINE_DB - floor).toFixed(1));
      shiftThresholds(newCalibration - settings.calibration);
      settings.calibration = newCalibration;
      calibrationEl.value = settings.calibration;
      saveSettings();
      floorStatusEl.textContent = `Auto-calibrated (assumed quiet-room baseline: ${AUTO_BASELINE_DB} dB).`;
    }, 3000);
  }

  resetCalibrationBtn.addEventListener('click', () => {
    shiftThresholds(0 - settings.calibration);
    settings.calibration = 0;
    calibrationEl.value = 0;
    saveSettings();
    floorStatusEl.textContent = monitoring
      ? 'Calibration reset. Re-running auto-calibration...'
      : 'Calibration reset to 0.';
    if (monitoring) autoCalibrate();
  });

  let highAlertAudio = null;
  let lowAlertAudio = null;

  clipFileEl.addEventListener('change', () => {
    const file = clipFileEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem(CLIP_HIGH_KEY, reader.result);
      highAlertAudio = new Audio(reader.result);
      clipStatusEl.textContent = `Custom clip loaded: ${file.name}`;
    };
    reader.readAsDataURL(file);
  });

  lowClipFileEl.addEventListener('change', () => {
    const file = lowClipFileEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem(CLIP_LOW_KEY, reader.result);
      lowAlertAudio = new Audio(reader.result);
      lowClipStatusEl.textContent = `Custom clip loaded: ${file.name}`;
    };
    reader.readAsDataURL(file);
  });

  testClipHighBtn.addEventListener('click', () => playAlert('high'));
  testClipLowBtn.addEventListener('click', () => playAlert('low'));

  function playAlert(kind) {
    const audio = kind === 'low' ? lowAlertAudio : highAlertAudio;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      beep(kind === 'low' ? 330 : 880);
    }
  }

  function beep(freq) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ac.destination);
    gain.gain.setValueAtTime(0.2, ac.currentTime);
    osc.start();
    osc.stop(ac.currentTime + 0.4);
  }

  // --- Rolling chart (last 60 seconds) ---
  const HISTORY_SECONDS = 60;
  const history = []; // {t, db}

  function resizeCanvas() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function drawChart() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(22,22,26,0.08)';
    ctx.lineWidth = 1;
    for (let db = 40; db <= 100; db += 10) {
      const y = h - ((db - 30) / 70) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,107,107,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    let y = h - ((settings.threshold - 30) / 70) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();

    ctx.strokeStyle = 'rgba(62,198,255,0.8)';
    y = h - ((settings.lowThreshold - 30) / 70) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    ctx.setLineDash([]);

    if (history.length < 2) return;
    const now = performance.now();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(124,92,255,0.28)');
    grad.addColorStop(1, 'rgba(124,92,255,0)');
    ctx.beginPath();
    history.forEach((pt, i) => {
      const age = (now - pt.t) / 1000;
      const x = w - (age / HISTORY_SECONDS) * w;
      const py = h - ((pt.db - 30) / 70) * h;
      if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    });
    ctx.lineTo(w - ((now - history[history.length - 1].t) / 1000 / HISTORY_SECONDS) * w, h);
    ctx.lineTo(w - ((now - history[0].t) / 1000 / HISTORY_SECONDS) * w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    history.forEach((pt, i) => {
      const age = (now - pt.t) / 1000;
      const x = w - (age / HISTORY_SECONDS) * w;
      const py = h - ((pt.db - 30) / 70) * h;
      if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    });
    ctx.stroke();
  }

  // --- Frequency bars ---
  const EQ_BARS = 24;
  let eqBarEls = [];
  for (let i = 0; i < EQ_BARS; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    eqEl.appendChild(bar);
    eqBarEls.push(bar);
  }
  let freqData = null;

  function drawEq() {
    if (!analyser || !freqData) return;
    analyser.getByteFrequencyData(freqData);
    const bucketSize = Math.floor(freqData.length / EQ_BARS) || 1;
    for (let i = 0; i < EQ_BARS; i++) {
      let sum = 0;
      for (let j = 0; j < bucketSize; j++) sum += freqData[i * bucketSize + j] || 0;
      const avg = sum / bucketSize;
      eqBarEls[i].style.height = Math.max(2, (avg / 255) * 60) + 'px';
    }
  }

  // --- Audio capture & detection ---
  let audioCtx, analyser, dataArray;
  let monitoring = false;

  // Two IEC 61672-style exponential time constants: Fast (125ms) tracks
  // transients (door slams), Slow (1000ms) rides out momentary spikes so
  // sustained-level alerts don't false-trigger. The response toggle picks
  // which one drives the display; alerts always use Slow underneath so a
  // half-second clatter can never itself satisfy a multi-second sustain.
  let fastDb = null;
  let slowDb = null;
  let lastRawDb = null;
  let samplerInterval = null;
  const SAMPLE_MS = 100;
  const FAST_ALPHA = 1 - Math.exp(-SAMPLE_MS / 125);
  const SLOW_ALPHA = 1 - Math.exp(-SAMPLE_MS / 1000);

  let sessionSum = 0, sessionCount = 0, sessionMin = Infinity, sessionPeak = -Infinity;
  let sessionStartMs = null;

  let highBreachStart = null;
  let highBreachPeak = -Infinity;
  let highAlertFired = false;

  let lowBreachStart = null;
  let lowBreachMin = Infinity;
  let lowAlertFired = false;

  let lastAmbientLog = 0;
  const recentAlerts = [];

  async function startMonitoring() {
    let mediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      permErrEl.textContent = 'Microphone permission denied or unavailable: ' + err.message;
      permErrEl.style.display = 'block';
      return;
    }
    permErrEl.style.display = 'none';

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);

    // Band-pass to the range office noise complaints are actually about
    // (~250Hz-4kHz: speech, chatter, chair scrapes) so HVAC rumble and
    // high-frequency hiss don't dominate the RMS and desync the reading
    // from what the room actually sounds like.
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 250;
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4000;

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    dataArray = new Float32Array(analyser.fftSize);
    freqData = new Uint8Array(analyser.frequencyBinCount);

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(analyser);

    monitoring = true;
    sessionStartMs = Date.now();
    statusEl.classList.remove('inactive');
    statusEl.classList.add('active');
    statusTextEl.textContent = 'Monitoring active';
    startBtn.disabled = true;
    startBtn.textContent = 'Monitoring...';

    fetchTodayCounts();

    // Sample at a fixed 10Hz rate instead of once per animation frame
    // (~60Hz) — a deliberate, evenly-spaced measurement rate reads far
    // less jittery than re-measuring 60x/sec on whatever the render loop
    // happens to do.
    samplerInterval = setInterval(sampleAndUpdate, SAMPLE_MS);
    requestAnimationFrame(renderLoop);
    setInterval(updateSessionTimer, 1000);

    // Give the sampler a second to get real readings flowing before
    // auto-calibrating off of them.
    setTimeout(autoCalibrate, 1000);
  }

  function computeRawDb() {
    analyser.getFloatTimeDomainData(dataArray);
    const n = dataArray.length;
    // Hann window before RMS reduces spectral leakage / edge artifacts
    // in the sampled block, so the level doesn't wobble from where in
    // the waveform the measurement window happened to land.
    let sumSquares = 0, windowSum = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      const sample = dataArray[i] * w;
      sumSquares += sample * sample;
      windowSum += w * w;
    }
    const rms = Math.sqrt(sumSquares / windowSum);
    // Full-scale RMS sine (~0.707) maps to 0 dBFS. +94 is the conventional
    // reference used to relate 0 dBFS to real-world SPL (AES17-style); it's
    // still only a starting point — every mic/OS gain chain differs, which
    // is exactly what "Match to meter" / "Auto-detect floor" correct for.
    const dbfs = 20 * Math.log10(rms || 1e-8);
    const approxDb = dbfs + 94 + settings.calibration;
    return Math.max(0, Math.min(140, approxDb));
  }

  function sampleAndUpdate() {
    if (!monitoring) return;
    const rawDb = computeRawDb();
    lastRawDb = rawDb;
    fastDb = fastDb === null ? rawDb : fastDb + FAST_ALPHA * (rawDb - fastDb);
    slowDb = slowDb === null ? rawDb : slowDb + SLOW_ALPHA * (rawDb - slowDb);
    const displayDb = settings.response === 'slow' ? slowDb : fastDb;
    const now = performance.now();

    history.push({ t: now, db: displayDb });
    while (history.length && (now - history[0].t) / 1000 > HISTORY_SECONDS) history.shift();

    sessionSum += displayDb; sessionCount++;
    sessionMin = Math.min(sessionMin, displayDb);
    sessionPeak = Math.max(sessionPeak, displayDb);

    dbReadingEl.textContent = displayDb.toFixed(1);
    rawDbHintEl.textContent = (rawDb - settings.calibration).toFixed(1);
    dbReadingEl.className = 'db-reading ' + (
      displayDb >= settings.threshold ? 'breach' :
      displayDb <= settings.lowThreshold ? 'warn' :
      displayDb >= settings.threshold - 5 ? 'warn' : 'ok'
    );

    const pct = Math.max(0, Math.min(100, ((displayDb - METER_MIN) / (METER_MAX - METER_MIN)) * 100));
    needleEl.style.left = pct + '%';

    statAvgEl.textContent = (sessionSum / sessionCount).toFixed(1);
    statMinEl.textContent = sessionMin.toFixed(1);
    statPeakEl.textContent = sessionPeak.toFixed(1);

    // Alerts always evaluate against the Slow (1000ms) trace regardless of
    // what's displayed, so a brief spike can't itself satisfy a multi-
    // second sustain window — that's the whole point of the sustain setting.
    handleHighThreshold(slowDb);
    handleLowThreshold(slowDb);
    handleAmbientLogging(displayDb);
  }

  function updateSessionTimer() {
    if (!sessionStartMs) return;
    const secs = Math.floor((Date.now() - sessionStartMs) / 1000);
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    statTimeEl.textContent = `${m}:${s}`;
  }

  function renderLoop() {
    drawChart();
    drawEq();
    if (monitoring) requestAnimationFrame(renderLoop);
  }

  function handleHighThreshold(db) {
    const nowMs = Date.now();
    if (db >= settings.threshold) {
      if (highBreachStart === null) {
        highBreachStart = nowMs; highBreachPeak = db; highAlertFired = false;
      } else {
        highBreachPeak = Math.max(highBreachPeak, db);
        const elapsed = (nowMs - highBreachStart) / 1000;
        if (!highAlertFired && elapsed >= settings.sustain) {
          highAlertFired = true;
          playAlert('high');
        }
      }
    } else if (highBreachStart !== null) {
      const duration = (nowMs - highBreachStart) / 1000;
      if (highAlertFired) logBreach(highBreachPeak, duration, 'high');
      highBreachStart = null; highBreachPeak = -Infinity; highAlertFired = false;
    }
  }

  function handleLowThreshold(db) {
    const nowMs = Date.now();
    if (db <= settings.lowThreshold) {
      if (lowBreachStart === null) {
        lowBreachStart = nowMs; lowBreachMin = db; lowAlertFired = false;
      } else {
        lowBreachMin = Math.min(lowBreachMin, db);
        const elapsedMin = (nowMs - lowBreachStart) / 60000;
        if (!lowAlertFired && elapsedMin >= settings.lowSustain) {
          lowAlertFired = true;
          playAlert('low');
        }
      }
    } else if (lowBreachStart !== null) {
      const duration = (nowMs - lowBreachStart) / 1000;
      if (lowAlertFired) logBreach(lowBreachMin, duration, 'low');
      lowBreachStart = null; lowBreachMin = Infinity; lowAlertFired = false;
    }
  }

  function handleAmbientLogging(db) {
    const nowMs = Date.now();
    if (nowMs - lastAmbientLog >= 60000) {
      lastAmbientLog = nowMs;
      fetch('/api/logs/ambient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: new Date(nowMs).toISOString(), dbLevel: db, source: currentDeviceName() }),
      }).catch(() => {});
    }
  }

  function logBreach(extremeDb, duration, type) {
    const payload = {
      timestamp: new Date().toISOString(),
      peakDb: Number(extremeDb.toFixed(1)),
      duration: Number(duration.toFixed(1)),
      type,
      source: currentDeviceName(),
    };
    fetch('/api/logs/breach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
    addToFeed(payload);
    if (type === 'high') highCountTodayEl.textContent = Number(highCountTodayEl.textContent) + 1;
    else lowCountTodayEl.textContent = Number(lowCountTodayEl.textContent) + 1;
  }

  function addToFeed(payload) {
    recentAlerts.unshift(payload);
    if (recentAlerts.length > 8) recentAlerts.pop();
    recentFeedEl.innerHTML = recentAlerts.map(a => {
      const badge = a.type === 'low'
        ? '<span class="badge low">Quiet</span>' : '<span class="badge high">Loud</span>';
      const time = new Date(a.timestamp).toLocaleTimeString();
      return `<div class="feed-item"><span>${badge} ${time}</span><span>${a.peakDb} dB · ${a.duration}s</span></div>`;
    }).join('');
  }

  async function fetchTodayCounts() {
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const res = await fetch(`/api/logs/breaches?start=${start.toISOString()}&end=${new Date().toISOString()}`);
      if (!res.ok) return;
      const rows = await res.json();
      highCountTodayEl.textContent = rows.filter(r => r.type !== 'low').length;
      lowCountTodayEl.textContent = rows.filter(r => r.type === 'low').length;
    } catch (e) { /* dashboard is optional context, ignore */ }
  }

  startBtn.addEventListener('click', startMonitoring);

  loadSettings();
  drawChart();
})();
