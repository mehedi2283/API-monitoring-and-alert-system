const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiKey, geminiModel } = require('../config');
const logger = require('../utils/logger');

const model = geminiKey && geminiKey !== 'your_key_here'
  ? new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: geminiModel })
  : null;

function templateAlert({ api_name, record, issues }) {
  return `${api_name} issue: ${issues.map((i) => i.type).join(', ')} ` +
    `(status ${record.status_code}, ${record.response_time_ms}ms, ${record.records_returned} records).`;
}
let pausedUntil = 0;
async function generateAlert(result) {
  if (!model || Date.now() < pausedUntil) return { message: templateAlert(result), source: 'template' };

  const prompt = `You are an API monitoring assistant for a healthcare company.
Write ONE concise, human-readable alert (max 2 sentences) for an engineer.
Mention the API name, what went wrong, and a likely cause.
Do not use markdown.

API: ${result.api_name}
Metrics: ${JSON.stringify(result.record)}
Detected issues: ${result.issues.map((i) => i.type).join(', ')}`;

    try {
    const res = await model.generateContent(prompt);
    return { message: res.response.text().trim(), source: 'llm' };
  } catch (err) {
    logger.error('LLM failed, using template', { err: err.message });

    if (String(err.message).includes('429')) {
      pausedUntil = Date.now() + 60 * 60 * 1000;
      logger.warn('LLM quota hit, using templates for 1 hour');
    }

    return { message: templateAlert(result), source: 'template' };
  }
}

module.exports = { generateAlert };