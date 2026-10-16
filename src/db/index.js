const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '../../data/alerts.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_name TEXT NOT NULL,
  issue_types TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  message_source TEXT NOT NULL,
  raw TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  interval_sec INTEGER NOT NULL DEFAULT 60,
  last_checked INTEGER,
  last_status INTEGER,
  last_response_time INTEGER,
  last_records INTEGER,
  last_result TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const rank = { critical: 3, high: 2, medium: 1 };

module.exports = {
  insertAlert({ api_name, issues, message, source, record }) {
    const severity = issues.reduce(
      (a, i) => (rank[i.severity] > rank[a] ? i.severity : a),
      'medium'
    );
    return db
      .prepare(
        `INSERT INTO alerts (api_name, issue_types, severity, message, message_source, raw)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(api_name, issues.map((i) => i.type).join(','), severity, message, source, JSON.stringify(record))
      .lastInsertRowid;
  },
  getActive: () =>
    db.prepare(`SELECT * FROM alerts WHERE status = 'active' ORDER BY id DESC`).all(),
  resolve: (id) =>
    db.prepare(`UPDATE alerts SET status = 'resolved' WHERE id = ?`).run(id).changes,
  findActive: (api_name, issue_types) =>
    db
      .prepare(`SELECT id FROM alerts WHERE status='active' AND api_name=? AND issue_types=? LIMIT 1`)
      .get(api_name, issue_types),

  addMonitor: (name, url, interval) =>
    db.prepare(`INSERT INTO monitors (name, url, interval_sec) VALUES (?, ?, ?)`).run(name, url, interval)
      .lastInsertRowid,
  listMonitors: () => db.prepare(`SELECT * FROM monitors ORDER BY id DESC`).all(),
  getMonitor: (id) => db.prepare(`SELECT * FROM monitors WHERE id = ?`).get(id),
  deleteMonitor: (id) => db.prepare(`DELETE FROM monitors WHERE id = ?`).run(id).changes,
  updateMonitorResult: (id, r) =>
    db
      .prepare(
        `UPDATE monitors SET last_checked=?, last_status=?, last_response_time=?, last_records=?, last_result=? WHERE id=?`
      )
      .run(Date.now(), r.status, r.time, r.records, r.result, id),
};