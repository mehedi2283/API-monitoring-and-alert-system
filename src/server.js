const app = require('./app');
const { port } = require('./config');
const logger = require('./utils/logger');
const checker = require('./services/checker');

app.listen(port, () => {
  logger.info(`Server running on http://localhost:${port}`);
  checker.start();
});