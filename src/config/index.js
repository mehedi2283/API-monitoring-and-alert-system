require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  thresholds: {
    slowMs: Number(process.env.MAX_RESPONSE_TIME_MS) || 3000,
    criticalMs: 5000,
  },
};