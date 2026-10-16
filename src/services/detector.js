const { thresholds } = require('../config');

function detect(rec) {
  const issues = [];
  const { api_name, response_time_ms: rt, status_code: sc, records_returned: n } = rec || {};

  if (!api_name || typeof sc !== 'number' || typeof rt !== 'number') {
    issues.push({ type: 'INVALID_DATA', severity: 'medium' });
  } else {
        if (sc === 0) issues.push({ type: 'UNREACHABLE', severity: 'critical' });
    else if (sc >= 500) issues.push({ type: 'SERVER_ERROR', severity: 'critical' });
    else if (sc >= 400) issues.push({ type: 'CLIENT_ERROR', severity: 'high' });

    if (rt >= thresholds.criticalMs) issues.push({ type: 'HIGH_LATENCY', severity: 'high' });
    else if (rt >= thresholds.slowMs) issues.push({ type: 'SLOW_RESPONSE', severity: 'medium' });

    if (n === 0 || n == null) issues.push({ type: 'NO_RECORDS', severity: 'high' });
  }

  return issues.length
    ? { api_name: api_name || 'UnknownAPI', record: rec, issues }
    : null;
}

module.exports = { detect };