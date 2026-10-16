const db = require('../db');
const { checkMonitor } = require('../services/checker');

exports.list = (req, res) => res.json(db.listMonitors());

exports.add = async (req, res, next) => {
  try {
    const { name, url, interval_sec } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });

    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    if (!['http:', 'https:'].includes(parsed.protocol))
      return res.status(400).json({ error: 'Only http/https URLs are allowed' });

    const interval = Math.max(10, Number(interval_sec) || 60);
    const id = db.addMonitor(String(name).trim(), parsed.href, interval);
    await checkMonitor(db.getMonitor(id));
    res.status(201).json(db.getMonitor(id));
  } catch (e) { next(e); }
};

exports.check = async (req, res, next) => {
  try {
    const m = db.getMonitor(req.params.id);
    if (!m) return res.status(404).json({ error: 'Monitor not found' });
    await checkMonitor(m);
    res.json(db.getMonitor(m.id));
  } catch (e) { next(e); }
};

exports.remove = (req, res) =>
  db.deleteMonitor(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Monitor not found' });