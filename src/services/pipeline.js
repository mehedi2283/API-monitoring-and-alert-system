const { detect } = require('./detector');
const { generateAlert } = require('./aiAlert');
const db = require('../db');

const inFlight = new Set();

async function processRecord(rec) {
  const found = detect(rec);
  if (!found) return { anomaly: false };

  const types = found.issues.map((i) => i.type).join(',');
  const key = `${found.api_name}|${types}`;

  if (inFlight.has(key) || db.findActive(found.api_name, types)) {
    return { anomaly: true, duplicate: true, api_name: found.api_name };
  }

  inFlight.add(key);
  try {
    const { message, source } = await generateAlert(found);
    const id = db.insertAlert({ ...found, message, source });
    return { anomaly: true, duplicate: false, id, api_name: found.api_name, message, source };
  } finally {
    inFlight.delete(key);
  }
}

module.exports = { processRecord };