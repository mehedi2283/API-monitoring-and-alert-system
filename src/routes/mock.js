const router = require('express').Router();
const sample = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Patient ${i + 1}` }));

router.get('/healthy', (req, res) => res.json({ data: sample(25) }));
router.get('/slow', (req, res) => setTimeout(() => res.json({ data: sample(10) }), 3500));
router.get('/empty', (req, res) => res.json({ data: [] }));
router.get('/error', (req, res) => res.status(500).json({ error: 'Internal server error' }));
router.get('/flaky', (req, res) =>
  Math.random() < 0.5 ? res.status(503).json({ error: 'Service unavailable' }) : res.json({ data: sample(15) })
);

module.exports = router;