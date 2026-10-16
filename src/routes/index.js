const router = require('express').Router();
const monitor = require('../controllers/monitor');
const alerts = require('../controllers/alerts');
const monitors = require('../controllers/monitors');

router.post('/monitor', monitor.monitor);
router.post('/monitor/sample', monitor.sample);
router.get('/alerts', alerts.list);
router.patch('/alerts/:id/resolve', alerts.resolve);

router.get('/monitors', monitors.list);
router.post('/monitors', monitors.add);
router.post('/monitors/:id/check', monitors.check);
router.delete('/monitors/:id', monitors.remove);

router.use('/mock', require('./mock'));

module.exports = router;