(() => {
  const dbReadingEl = document.getElementById('dbReading');
  const thresholdInfoEl = document.getElementById('thresholdInfo');
  const statusEl = document.getElementById('status');
  const statusTextEl = document.getElementById('statusText');
  const startBtn = document.getElementById('startBtn');
  const permErrEl = document.getElementById('permErr');
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');

  const calibrationEl = document.getElementById('calibration');
  const thresholdEl = document.getElementById('threshold');
  const sustainEl = document.getElementById('sustain');
  const clipFileEl = document.getElementById('clipFile');
  const clipStatusEl = document.getElementById('clipStatus');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const testClipBtn = document.getElementById('testClip');

  const SETTINGS_KEY = 'noiseMonitorSettings';
  const CLIP_KEY = 'noiseMonitorClip';

  let settings = {
    calibration: 0,
    threshold: 65,
    sustain: 3,
  };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      settings = Object.assign(settings, saved);
    } catch (e) { /* ignore */ }
    calibrationEl.value = settings.calibration;
    thresholdEl.value = settings.threshold;
    sustainEl.value = settings.sustain;
    updateThresholdInfo();

    const savedClip = localStorage.getItem(CLIP_KEY);
    if (savedClip) {
      clipStatusEl.textContent = 'Custom clip loaded.';
      alertAudio = new Audio(savedClip);
    }
  }

  function saveSettings() {
    settings.calibration = parseFloat(calibrationEl.value) || 0;
    settings.threshold = parseFloat(thresholdEl.value) || 65;
    settings.sustain = parseFloat(sustainEl.value) || 3;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateThresholdInfo();
  }

  function updateThresholdInfo() {
    thresholdInfoEl.textContent = `Threshold ${settings.threshold} dB, sustained ${settings.sustain}s`;
  }

  saveSettingsBtn.addEventListener('click', saveSettings);

  let alertAudio = null;
  clipFileEl.addEventListener('change', () => {
    const file = clipFileEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem(CLIP_KEY, reader.result);
      alertAudio = new Audio(reader.result);
      clipStatusEl.textContent = `Custom clip loaded: ${file.name}`;
    };
    reader.readAsDataURL(file);
  });

  testClipBtn.addEventListener('click', () => {
    playAlert();
  });

  function playAlert() {
    if (alertAudio) {
      alertAudio.currentTime = 0;
      alertAudio.play().catch(() => {});
    } else {
      beep();
    }
  }

  function beep() {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = 880;
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
    ctx.strokeStyle = '#2a2e38';
    ctx.lineWidth = 1;
    for (let db = 40; db <= 100; db += 10) {
      const y = h - ((db - 30) / 70) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // threshold line
    const threshY = h - ((settings.threshold - 30) / 70) * h;
    ctx.strokeStyle = '#f44336';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (history.length < 2) return;
    const now = performance.now();
    ctx.strokeStyle = '#6cb4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((pt, i) => {
      const age = (now - pt.t) / 1000;
      const x = w - (age / HISTORY_SECONDS) * w;
      const y = h - ((pt.db - 30) / 70) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // --- Audio capture ---
  let audioCtx, analyser, dataArray, mediaStream;
  let monitoring = false;

  let breachStart = null;
  let breachPeak = -Infinity;
  let alertFired = false;

  let lastAmbientLog = 0;

  async function startMonitoring() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      permErrEl.textContent = 'Microphone permission denied or unavailable: ' + err.message;
      permErrEl.style.display = 'block';
      return;
    }
    permErrEl.style.display = 'none';

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    dataArray = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    monitoring = true;
    statusEl.classList.remove('inactive');
    statusEl.classList.add('active');
    statusTextEl.textContent = 'Monitoring active';
    startBtn.disabled = true;
    startBtn.textContent = 'Monitoring...';

    requestAnimationFrame(tick);
  }

  function computeDb() {
    analyser.getFloatTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    // Full-scale RMS sine (~0.707) maps to 0 dBFS. Add calibration + offset
    // to bring it into a "real-world" dB(A)-ish range for a rough reference.
    const dbfs = 20 * Math.log10(rms || 1e-8);
    const approxDb = dbfs + 100 + settings.calibration; // 100 = arbitrary reference offset
    return Math.max(0, approxDb);
  }

  function tick() {
    if (!monitoring) return;
    const db = computeDb();
    const now = performance.now();

    history.push({ t: now, db });
    while (history.length && (now - history[0].t) / 1000 > HISTORY_SECONDS) {
      history.shift();
    }

    dbReadingEl.textContent = db.toFixed(1);
    dbReadingEl.className = 'db-reading ' + (
      db >= settings.threshold ? 'breach' : db >= settings.threshold - 5 ? 'warn' : 'ok'
    );

    handleThresholdLogic(db);
    handleAmbientLogging(db);
    drawChart();

    requestAnimationFrame(tick);
  }

  function handleThresholdLogic(db) {
    const nowMs = Date.now();
    if (db >= settings.threshold) {
      if (breachStart === null) {
        breachStart = nowMs;
        breachPeak = db;
        alertFired = false;
      } else {
        breachPeak = Math.max(breachPeak, db);
        const elapsed = (nowMs - breachStart) / 1000;
        if (!alertFired && elapsed >= settings.sustain) {
          alertFired = true;
          playAlert();
        }
      }
    } else {
      if (breachStart !== null) {
        const duration = (nowMs - breachStart) / 1000;
        if (alertFired) {
          logBreach(breachPeak, duration);
        }
        breachStart = null;
        breachPeak = -Infinity;
        alertFired = false;
      }
    }
  }

  function handleAmbientLogging(db) {
    const nowMs = Date.now();
    if (nowMs - lastAmbientLog >= 60000) {
      lastAmbientLog = nowMs;
      fetch('/api/logs/ambient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: new Date(nowMs).toISOString(), dbLevel: db }),
      }).catch(() => {});
    }
  }

  function logBreach(peakDb, duration) {
    fetch('/api/logs/breach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        peakDb: Number(peakDb.toFixed(1)),
        duration: Number(duration.toFixed(1)),
      }),
    }).catch(() => {});
  }

  startBtn.addEventListener('click', startMonitoring);

  loadSettings();
  drawChart();
})();
