const $ = (id) => document.getElementById(id);

let alerts = [];
let filter = 'all';
let lastKey = '';
const seenAlerts = new Set();

/* ---------- Helpers ---------- */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 4000);
}

function countUp(node) {
  const to = Number(node.textContent);
  const t0 = performance.now();
  const duration = 700;
  (function frame(t) {
    const p = Math.min((t - t0) / duration, 1);
    node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}

/* ---------- Alerts ---------- */
async function loadAlerts() {
  try {
    const res = await fetch('/alerts');
    alerts = await res.json();
    render();
  } catch {
    toast('Could not load alerts', true);
  }
}

function render() {
  const key = filter + '|' + alerts.map((a) => a.id).join(',');
  if (key === lastKey) return;
  lastKey = key;

  const count = (s) => alerts.filter((a) => a.severity === s).length;
  $('stats').innerHTML = `
    <div class="stat"><b>${alerts.length}</b><span>Active</span></div>
    <div class="stat"><b>${count('critical')}</b><span>Critical</span></div>
    <div class="stat"><b>${count('high')}</b><span>High</span></div>
    <div class="stat"><b>${count('medium')}</b><span>Medium</span></div>`;
  document.querySelectorAll('.stat b').forEach(countUp);

  const list = filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter);
  const root = $('alerts');
  root.innerHTML = '';

  if (!list.length) {
    root.append(el('p', 'empty', 'No active alerts.'));
    return;
  }

  list.forEach((a) => {
    const card = el('div', `card ${a.severity}`);
    if (seenAlerts.has(a.id)) card.style.animation = 'none';

    const top = el('div', 'card-top');
    top.append(el('strong', '', a.api_name), el('span', `badge ${a.severity}`, a.severity));

    const msg = el('p', 'msg', a.message);

    const meta = el('div', 'meta');
    const tags = el('div', 'tags');
    a.issue_types.split(',').forEach((t) => tags.append(el('span', '', t)));
    const time = el(
      'span',
      '',
      `${a.created_at} UTC · ${a.message_source === 'llm' ? 'AI' : 'template'}`
    );
    const btn = el('button', 'secondary', 'Resolve');
    btn.onclick = () => resolveAlert(a.id);
    meta.append(tags, time, btn);

    card.append(top, msg, meta);
    root.append(card);
  });

  list.forEach((a) => seenAlerts.add(a.id));
}

async function resolveAlert(id) {
  await fetch(`/alerts/${id}/resolve`, { method: 'PATCH' });
  loadAlerts();
}

async function send(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'Request failed', true);
    const dup = data.duplicates ? `, ${data.duplicates} already active` : '';
    toast(`Processed ${data.processed} records, ${data.anomalies} new anomalies${dup}`);
    loadAlerts();
  } catch {
    toast('Request failed', true);
  }
}

$('sampleBtn').onclick = () => {
  toast('Processing sample data...');
  send('/monitor/sample');
};
$('refreshBtn').onclick = () => {
  loadAlerts();
  loadMonitors();
};
$('customBtn').onclick = () => $('custom').classList.toggle('hidden');
$('sendBtn').onclick = () => {
  try {
    send('/monitor', JSON.parse($('jsonInput').value));
  } catch {
    toast('Invalid JSON', true);
  }
};

document.querySelectorAll('.chip').forEach((c) => {
  c.onclick = () => {
    document.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    filter = c.dataset.filter;
    render();
  };
});

/* ---------- Monitored APIs ---------- */
let monitors = [];
const monRows = new Map();

async function loadMonitors() {
  try {
    monitors = await (await fetch('/monitors')).json();
    renderMonitors();
  } catch {}
}

function buildMonRow(m) {
  const row = el('div', 'mon');
  row.classList.add('enter');
  row.addEventListener('animationend', () => row.classList.remove('enter', 'flash'));
  const name = el('strong');
  const sub = el('small');
  const info = el('div', 'mon-info');
  info.append(name, sub);

  const stats = el('div', 'mon-stats');
  const statsText = el('span');
  const timer = el('small', 'mon-timer');
  stats.append(statsText, timer);

  const label = el('span', 'mon-label');
  const bar = el('i', 'mon-bar');

  const check = el('button', 'secondary', 'Check now');
  check.onclick = async () => {
    check.textContent = 'Checking...';
    await fetch(`/monitors/${m.id}/check`, { method: 'POST' });
    check.textContent = 'Check now';
    loadMonitors();
    loadAlerts();
  };
  const del = el('button', 'secondary', 'Remove');
  del.onclick = async () => {
    await fetch(`/monitors/${m.id}`, { method: 'DELETE' });
    loadMonitors();
  };

  row.append(el('span', 'dot'), info, stats, label, check, del, bar);
  return { el: row, name, sub, statsText, timer, bar, label, m, last: null, lastPoll: 0 };
}

function updateMonRow(r, m) {
  r.m = m;
  r.el.classList.remove('healthy', 'anomaly', 'down', 'pending');
  r.el.classList.add(m.last_result || 'pending');
  r.name.textContent = m.name;
  r.sub.textContent = `${m.url} · every ${m.interval_sec}s`;
  r.statsText.textContent = m.last_checked
    ? `${m.last_status || 'No response'} · ${m.last_response_time}ms · ${m.last_records} records`
    : 'Checking...';
  r.label.textContent = m.last_result || 'pending';

  if (r.last !== null && r.last !== m.last_checked) {
    r.el.classList.remove('flash');
    void r.el.offsetWidth;
    r.el.classList.add('flash');
  }
  r.last = m.last_checked;
}

function renderMonitors() {
  const root = $('monitorList');
  const empty = root.querySelector('.empty');

  if (!monitors.length) {
    monRows.forEach((r) => r.el.remove());
    monRows.clear();
    if (!empty) root.append(el('p', 'empty', 'No APIs monitored yet. Add one above.'));
    return;
  }
  if (empty) empty.remove();

  const ids = new Set(monitors.map((m) => m.id));
  monRows.forEach((r, id) => {
    if (!ids.has(id)) {
      r.el.remove();
      monRows.delete(id);
    }
  });

  monitors.forEach((m, i) => {
    let r = monRows.get(m.id);
    if (!r) {
      r = buildMonRow(m);
      monRows.set(m.id, r);
    }
    updateMonRow(r, m);
    if (root.children[i] !== r.el) root.insertBefore(r.el, root.children[i] || null);
  });
}

$('addMonBtn').onclick = async () => {
  const body = {
    name: $('monName').value,
    url: $('monUrl').value,
    interval_sec: Number($('monIntervalDD').dataset.value),
  };
  try {
    const res = await fetch('/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'Could not add monitor', true);
    toast(`Now monitoring ${data.name}`);
    $('monName').value = '';
    $('monUrl').value = '';
    loadMonitors();
    loadAlerts();
  } catch {
    toast('Request failed', true);
  }
};

document.querySelectorAll('.demo-links a').forEach((a) => {
  a.onclick = () => {
    $('monUrl').value = location.origin + a.dataset.path;
    if (!$('monName').value) $('monName').value = 'Demo ' + a.textContent;
  };
});


function tickTimers() {
  const now = Date.now();
  monRows.forEach((r) => {
    const m = r.m;
    if (!m || !m.last_checked) {
      r.timer.textContent = 'Checking...';
      r.bar.style.width = '0%';
      return;
    }
    const total = m.interval_sec * 1000;
    const left = m.last_checked + total - now;
    if (left > 0) {
      r.timer.textContent = `Next check in ${Math.ceil(left / 1000)}s`;
      r.bar.style.width = `${(1 - left / total) * 100}%`;
    } else {
      r.timer.textContent = 'Checking...';
      r.bar.style.width = '100%';
      if (now - r.lastPoll > 3000) {
        r.lastPoll = now;
        loadMonitors();
        loadAlerts();
      }
    }
  });
}

/* ---------- Init ---------- */

/* ---------- Custom dropdown ---------- */
const dd = $('monIntervalDD');
dd.querySelector('.dd-btn').onclick = (e) => {
  e.stopPropagation();
  dd.classList.toggle('open');
};
dd.querySelectorAll('li').forEach((li) => {
  li.onclick = () => {
    dd.dataset.value = li.dataset.value;
    dd.querySelector('.dd-label').textContent = li.textContent;
    dd.querySelectorAll('li').forEach((x) => x.classList.toggle('sel', x === li));
    dd.classList.remove('open');
  };
});
document.addEventListener('click', () => dd.classList.remove('open'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dd.classList.remove('open'); });
loadAlerts();
loadMonitors();
setInterval(tickTimers, 1000);
setInterval(() => {
  loadAlerts();
  loadMonitors();
}, 10000);