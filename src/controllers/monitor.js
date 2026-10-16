const { processRecord } = require('../services/pipeline');
const logger = require('../utils/logger');

exports.monitor = async (req, res, next) => {
  try {
    const records = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Body must be a non-empty JSON array' });
    }
    logger.info('Batch received', { count: records.length });

    const settled = await Promise.allSettled(records.map(processRecord));
    const out = settled.map((r) => {
      if (r.status === 'fulfilled') return r.value;
      logger.error('Record processing failed', { err: r.reason.message });
      return { error: r.reason.message };
    });

    const alerts = out.filter((o) => o.anomaly && !o.duplicate);
    const duplicates = out.filter((o) => o.duplicate).length;
    const failed = out.filter((o) => o.error).length;

    logger.info('Batch processed', {
      processed: records.length,
      anomalies: alerts.length,
      duplicates,
      failed,
    });
    res.json({ processed: records.length, anomalies: alerts.length, duplicates, failed, alerts });
  } catch (e) {
    next(e);
  }
};

exports.sample = (req, res, next) => {
  delete require.cache[require.resolve('../../data/sample.json')];
  req.body = require('../../data/sample.json');
  return exports.monitor(req, res, next);
};