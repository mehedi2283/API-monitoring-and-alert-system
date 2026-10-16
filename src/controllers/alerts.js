const db = require('../db');

exports.list = (req, res) => res.json(db.getActive());

exports.resolve = (req, res) =>
  db.resolve(req.params.id)
    ? res.json({ ok: true })
    : res.status(404).json({ error: 'Alert not found' });