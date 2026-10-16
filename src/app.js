const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(require('./routes'));

app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;