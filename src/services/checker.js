const db = require('../db');
const logger = require('../utils/logger');
const { processRecord } = require('./pipeline');

const TIMEOUT_MS = 10000;
const LIST_KEYS = ['data', 'results', 'items', 'records', 'entries'];

function countRecords(body) {
  if (Array.isArray(body)) return body.length;
  if (body && typeof body === 'object') {
    for (const k of LIST_KEYS) if (Array.isArray(body[k])) return body[k].length;
    return Object.keys(body).length ? 1 : 0;
  }
  return 0;
}

async function checkMonitor(m) {
  const start = Date.now();
  let status = 0;
  let records = 0;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(m.url, { signal: ctrl.signal });
    status = res.status;
    const text = await res.text();
    try { records = countRecords(JSON.parse(text)); } catch { records = 0; }
  } catch (err) {
    logger.warn('Check failed', { monitor: m.name, url: m.url, err: err.message });
  } finally {
    clearTimeout(timer);
  }

  const time = Date.now() - start;
  const record = { api_name: m.name, response_time_ms: time, status_code: status, records_returned: records };

  const result = await processRecord(record);
  const label = status === 0 ? 'down' : result.anomaly ? 'anomaly' : 'healthy';
  db.updateMonitorResult(m.id, { status, time, records, result: label });
  logger.info('Check complete', { monitor: m.name, status, time, records, result: label });
  return record;
}

let running = false;
async function runDue() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const due = db
      .listMonitors()
      .filter((m) => !m.last_checked || now - m.last_checked >= m.interval_sec * 1000);
    await Promise.allSettled(due.map(checkMonitor));
  } finally {
    running = false;
  }
}

function start() {
  setInterval(runDue, 5000);
  logger.info('Monitor scheduler started');
}

module.exports = { checkMonitor, start };