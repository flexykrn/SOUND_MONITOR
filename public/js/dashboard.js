(() => {
  const startDateEl = document.getElementById('startDate');
  const endDateEl = document.getElementById('endDate');
  const applyBtn = document.getElementById('applyFilter');
  const exportBreachesBtn = document.getElementById('exportBreaches');
  const exportAmbientBtn = document.getElementById('exportAmbient');
  const logoutBtn = document.getElementById('logoutBtn');
  const breachTableBody = document.getElementById('breachTable');
  const statGridEl = document.getElementById('statGrid');
  const canvas = document.getElementById('timelineChart');
  const ctx = canvas.getContext('2d');
  const hourCanvas = document.getElementById('hourChart');
  const hourCtx = hourCanvas.getContext('2d');
  const histCanvas = document.getElementById('histChart');
  const histCtx = histCanvas.getContext('2d');

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
    renderHourChart(breaches);
    renderHistogram(ambient);
  }

  function renderBreachTable(breaches) {
    breachTableBody.innerHTML = '';
    breaches.forEach(b => {
      const tr = document.createElement('tr');
      const badgeClass = b.type === 'low' ? 'low' : 'high';
      const badgeText = b.type === 'low' ? 'Quiet' : 'Loud';
      tr.innerHTML = `<td>${new Date(b.ts).toLocaleString()}</td>` +
        `<td><span class="badge ${badgeClass}">${badgeText}</span></td>` +
        `<td>${Number(b.peak_db).toFixed(1)} dB</td><td>${Number(b.duration_seconds).toFixed(1)}s</td>` +
        `<td>${b.source || 'Unnamed device'}</td>`;
      breachTableBody.appendChild(tr);
    });
    if (breaches.length === 0) {
      breachTableBody.innerHTML = '<tr><td colspan="5" style="color:#888;">No alerts in this range.</td></tr>';
    }
  }

  function renderSummary(breaches, ambient) {
    const highBreaches = breaches.filter(b => b.type !== 'low');
    const lowBreaches = breaches.filter(b => b.type === 'low');
    const avgDb = ambient.length
      ? (ambient.reduce((s, a) => s + Number(a.db_level), 0) / ambient.length).toFixed(1)
      : '—';
    const maxDb = ambient.length ? Math.max(...ambient.map(a => Number(a.db_level))).toFixed(1) : '—';
    const minDb = ambient.length ? Math.min(...ambient.map(a => Number(a.db_level))).toFixed(1) : '—';
    const longestBreach = breaches.length
      ? Math.max(...breaches.map(b => Number(b.duration_seconds))).toFixed(1)
      : '—';

    let busiestHour = '—';
    if (breaches.length) {
      const counts = {};
      breaches.forEach(b => {
        const h = new Date(b.ts).getHours();
        counts[h] = (counts[h] || 0) + 1;
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      busiestHour = `${top[0]}:00`;
    }

    const stats = [
      { num: highBreaches.length, lbl: 'Loud alerts' },
      { num: lowBreaches.length, lbl: 'Quiet alerts' },
      { num: `${longestBreach}s`, lbl: 'Longest alert' },
      { num: busiestHour, lbl: 'Noisiest hour' },
      { num: avgDb, lbl: 'Avg dB' },
      { num: `${minDb} / ${maxDb}`, lbl: 'Min / Max dB' },
    ];
    statGridEl.innerHTML = stats.map(s =>
      `<div class="stat-box"><div class="num">${s.num}</div><div class="lbl">${s.lbl}</div></div>`
    ).join('');
  }

  function resizeAll() {
    [canvas, hourCanvas, histCanvas].forEach(c => {
      c.width = c.clientWidth * devicePixelRatio;
      c.height = c.clientHeight * devicePixelRatio;
    });
  }
  window.addEventListener('resize', resizeAll);

  function renderTimeline(ambient, breaches) {
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

    ctx.strokeStyle = 'rgba(22,22,26,0.08)';
    for (let db = 40; db <= 100; db += 10) {
      const y = h - ((db - 30) / 70) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(124,92,255,0.28)');
    grad.addColorStop(1, 'rgba(124,140,255,0)');
    ctx.beginPath();
    ambient.forEach((a, i) => {
      const x = ((new Date(a.ts).getTime() - minT) / spanT) * w;
      const y = h - ((Number(a.db_level) - 30) / 70) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ambient.forEach((a, i) => {
      const x = ((new Date(a.ts).getTime() - minT) / spanT) * w;
      const y = h - ((Number(a.db_level) - 30) / 70) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    breaches.forEach(b => {
      ctx.fillStyle = b.type === 'low' ? '#3ec6ff' : '#ff6b6b';
      ctx.strokeStyle = 'rgba(11,13,18,0.6)';
      ctx.lineWidth = 1.5;
      const x = ((new Date(b.ts).getTime() - minT) / spanT) * w;
      ctx.beginPath();
      ctx.arc(x, h - ((Number(b.peak_db) - 30) / 70) * h, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function renderHourChart(breaches) {
    const w = hourCanvas.width, h = hourCanvas.height;
    hourCtx.clearRect(0, 0, w, h);
    const highCounts = new Array(24).fill(0);
    const lowCounts = new Array(24).fill(0);
    breaches.forEach(b => {
      const hour = new Date(b.ts).getHours();
      if (b.type === 'low') lowCounts[hour]++; else highCounts[hour]++;
    });
    const maxCount = Math.max(1, ...highCounts, ...lowCounts);
    const barW = w / 24;
    for (let i = 0; i < 24; i++) {
      const highH = (highCounts[i] / maxCount) * (h - 20);
      const lowH = (lowCounts[i] / maxCount) * (h - 20);
      hourCtx.fillStyle = '#ff6b6b';
      roundRect(hourCtx, i * barW + 2, h - highH, barW / 2 - 3, highH);
      hourCtx.fillStyle = '#3ec6ff';
      roundRect(hourCtx, i * barW + barW / 2 + 1, h - lowH, barW / 2 - 3, lowH);
    }
    if (breaches.length === 0) {
      hourCtx.fillStyle = '#888';
      hourCtx.font = '14px sans-serif';
      hourCtx.fillText('No breach events for this range', 20, 30);
    }
  }

  function renderHistogram(ambient) {
    const w = histCanvas.width, h = histCanvas.height;
    histCtx.clearRect(0, 0, w, h);
    if (ambient.length === 0) {
      histCtx.fillStyle = '#888';
      histCtx.font = '14px sans-serif';
      histCtx.fillText('No ambient data for this range', 20, 30);
      return;
    }
    const bucketSize = 5;
    const buckets = {};
    ambient.forEach(a => {
      const bucket = Math.floor(Number(a.db_level) / bucketSize) * bucketSize;
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    });
    const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    const maxCount = Math.max(...keys.map(k => buckets[k]));
    const barW = w / keys.length;
    histCtx.fillStyle = '#7c5cff';
    keys.forEach((k, i) => {
      const barH = (buckets[k] / maxCount) * (h - 20);
      roundRect(histCtx, i * barW + 2, h - barH, barW - 4, barH);
    });
  }

  function roundRect(c, x, y, w, h) {
    const r = Math.min(4, w / 2, Math.max(h, 0.001) / 2);
    if (h <= 0 || w <= 0) return;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
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

  resizeAll();
  loadData();
})();
