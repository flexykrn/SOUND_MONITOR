(() => {
  const startDateEl = document.getElementById('startDate');
  const endDateEl = document.getElementById('endDate');
  const applyBtn = document.getElementById('applyFilter');
  const exportBreachesBtn = document.getElementById('exportBreaches');
  const exportAmbientBtn = document.getElementById('exportAmbient');
  const logoutBtn = document.getElementById('logoutBtn');
  const breachTableBody = document.getElementById('breachTable');
  const summaryEl = document.getElementById('summary');
  const canvas = document.getElementById('timelineChart');
  const ctx = canvas.getContext('2d');

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }
  function sevenDaysAgoStr() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }

  startDateEl.value = todayStr();
  endDateEl.value = todayStr();
  startDateEl.min = sevenDaysAgoStr();
  endDateEl.min = sevenDaysAgoStr();

  function rangeParams() {
    const start = new Date(startDateEl.value + 'T00:00:00').toISOString();
    const end = new Date(endDateEl.value + 'T23:59:59').toISOString();
    return { start, end };
  }

  async function loadData() {
    const { start, end } = rangeParams();
    const [breaches, ambient] = await Promise.all([
      fetch(`/api/logs/breaches?start=${start}&end=${end}`).then(r => r.json()),
      fetch(`/api/logs/ambient?start=${start}&end=${end}`).then(r => r.json()),
    ]);
    renderBreachTable(breaches);
    renderSummary(breaches, ambient);
    renderTimeline(ambient, breaches);
  }

  function renderBreachTable(breaches) {
    breachTableBody.innerHTML = '';
    breaches.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${new Date(b.ts).toLocaleString()}</td><td>${Number(b.peak_db).toFixed(1)}</td><td>${Number(b.duration_seconds).toFixed(1)}</td>`;
      breachTableBody.appendChild(tr);
    });
    if (breaches.length === 0) {
      breachTableBody.innerHTML = '<tr><td colspan="3" style="color:#888;">No breach events in this range.</td></tr>';
    }
  }

  function renderSummary(breaches, ambient) {
    const avgDb = ambient.length
      ? (ambient.reduce((s, a) => s + Number(a.db_level), 0) / ambient.length).toFixed(1)
      : '—';
    const maxDb = ambient.length
      ? Math.max(...ambient.map(a => Number(a.db_level))).toFixed(1)
      : '—';
    summaryEl.innerHTML = `
      Breach events: <b>${breaches.length}</b><br>
      Ambient readings: <b>${ambient.length}</b><br>
      Average ambient dB: <b>${avgDb}</b><br>
      Peak ambient dB: <b>${maxDb}</b>
    `;
  }

  function resizeCanvas() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  }
  window.addEventListener('resize', () => { resizeCanvas(); });

  function renderTimeline(ambient, breaches) {
    resizeCanvas();
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (ambient.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.fillText('No data for this range', 20, 30);
      return;
    }

    const times = ambient.map(a => new Date(a.ts).getTime());
    const minT = Math.min(...times), maxT = Math.max(...times);
    const spanT = Math.max(maxT - minT, 1);

    ctx.strokeStyle = '#2a2e38';
    for (let db = 40; db <= 100; db += 10) {
      const y = h - ((db - 30) / 70) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#6cb4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ambient.forEach((a, i) => {
      const x = ((new Date(a.ts).getTime() - minT) / spanT) * w;
      const y = h - ((Number(a.db_level) - 30) / 70) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = 'rgba(244,67,54,0.6)';
    breaches.forEach(b => {
      const x = ((new Date(b.ts).getTime() - minT) / spanT) * w;
      ctx.beginPath();
      ctx.arc(x, h - ((Number(b.peak_db) - 30) / 70) * h, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  applyBtn.addEventListener('click', loadData);

  exportBreachesBtn.addEventListener('click', () => {
    const { start, end } = rangeParams();
    window.location.href = `/api/export/csv?type=breaches&start=${start}&end=${end}`;
  });
  exportAmbientBtn.addEventListener('click', () => {
    const { start, end } = rangeParams();
    window.location.href = `/api/export/csv?type=ambient&start=${start}&end=${end}`;
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  loadData();
})();
