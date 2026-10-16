# Intelligent API Monitoring & Alert System

A Node.js/Express service that monitors API health, detects anomalies, and uses an LLM to write human-readable alerts. Alerts are stored in a SQL database and shown on a live dashboard.

<!-- Add a screenshot: ![Dashboard](docs/dashboard.png) -->

## Features

- **Batch ingestion** via `POST /monitor` (JSON array) or a built-in sample dataset
- **Live monitoring**: add any API URL and the server checks it on a schedule, measuring response time, status code, and record count
- **Anomaly detection**: high latency, failed requests, unreachable hosts, missing or zero records, invalid data
- **AI-generated alerts** (Google Gemini) with an automatic template fallback if the LLM is unavailable or rate-limited
- **Duplicate suppression**: the same API with the same issue set never creates a second active alert
- **REST API**, **SQL storage**, **structured logging**
- **Dashboard** with summary counts, severity filters, resolve action, per-API countdown timers, and in-place updates (no full-page reloads)

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js 22.5+, Express |
| Database | SQLite via Node's built-in `node:sqlite` (SQL, no native build step, file created on first run) |
| AI | Google Gemini (`@google/generative-ai`), model set by environment variable |
| Logging | Winston (console + `logs/` files) |
| Frontend | Vanilla HTML/CSS/JS served by Express (no build step) |

## Requirements

- **Node.js 22.5 or newer** (check with `node --version`)
- A Gemini API key is optional. Without one, alerts use the template fallback.

## Setup

```bash
git clone https://github.com/<your-username>/API-monitoring-and-alert-system.git
cd API-monitoring-and-alert-system
npm install
```

Create your environment file:

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Open `.env` and set `GEMINI_API_KEY` (free key: https://aistudio.google.com/apikey).

## Run

```bash
npm start        # run the server
npm run dev      # auto-restart on file changes (nodemon)
```

Open **http://localhost:3000**.

On startup Node may print an `ExperimentalWarning` about SQLite. It is harmless.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `GEMINI_API_KEY` | none | Gemini API key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Model name. Change it if a model is retired or its quota is used up |
| `MAX_RESPONSE_TIME_MS` | `3000` | Response time at or above this is flagged as slow |

## Quick Demo

1. Click **Load sample data**. 14 records are processed and 11 anomalies are created.
2. Click it again. Zero new anomalies are created because the alerts are already active.
3. In **Monitored APIs**, click a demo link (`healthy`, `slow`, `empty`, `error`, `flaky`), enter a name, and click **Add & check**.
4. Watch each monitor's countdown. When it reaches zero the row re-checks itself and flashes.
5. Click **Resolve** on an alert to close it.

To reset all data, stop the server and delete `data/alerts.db`.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/monitor` | Process a batch of API records |
| `POST` | `/monitor/sample` | Process `data/sample.json` |
| `GET` | `/alerts` | All **active** anomalies |
| `PATCH` | `/alerts/:id/resolve` | Mark an alert resolved |
| `GET` | `/monitors` | List monitored APIs with their latest result |
| `POST` | `/monitors` | Add a monitor `{name, url, interval_sec}` and run the first check |
| `POST` | `/monitors/:id/check` | Run a check immediately |
| `DELETE` | `/monitors/:id` | Remove a monitor |
| `GET` | `/mock/{healthy,slow,empty,error,flaky}` | Built-in demo endpoints |

### Input format

```json
[
  { "api_name": "PatientDataAPI", "response_time_ms": 1200, "status_code": 200, "records_returned": 50 },
  { "api_name": "AppointmentAPI", "response_time_ms": 5500, "status_code": 500, "records_returned": 0 }
]
```

### Example

```bash
curl -X POST http://localhost:3000/monitor \
  -H "Content-Type: application/json" \
  -d '[{"api_name":"AppointmentAPI","response_time_ms":5500,"status_code":500,"records_returned":0}]'
```

```json
{
  "processed": 1,
  "anomalies": 1,
  "duplicates": 0,
  "failed": 0,
  "alerts": [{
    "id": 1,
    "api_name": "AppointmentAPI",
    "message": "AppointmentAPI is returning 500 errors with high latency and no records, indicating a likely server-side issue.",
    "source": "llm"
  }]
}
```

`source` is `llm` when Gemini wrote the message and `template` when the fallback was used.

## Detection Rules

| Issue | Condition | Severity |
|---|---|---|
| `UNREACHABLE` | status 0 (timeout or DNS failure) | critical |
| `SERVER_ERROR` | status >= 500 | critical |
| `CLIENT_ERROR` | status 400-499 | high |
| `HIGH_LATENCY` | response time >= 5000 ms | high |
| `SLOW_RESPONSE` | response time >= `MAX_RESPONSE_TIME_MS` | medium |
| `NO_RECORDS` | records is 0, null, or missing | high |
| `INVALID_DATA` | missing name, or non-numeric status or time | medium |

An alert's severity is the highest severity among its issues. Healthy records produce no alert.

## How Live Monitoring Works

- A scheduler inside the server checks which monitors are due every 5 seconds.
- Each check fetches the URL with a 10-second timeout, then measures response time and status code and counts records.
- Records are counted from a top-level array or from common wrapper keys (`data`, `results`, `items`, `records`, `entries`, `users`, `products`, `posts`, `todos`). Non-2xx responses count as 0 records.
- The result goes through the same pipeline as a manual batch: detect, deduplicate, generate the alert, store it.
- The dashboard polls the server every 10 seconds and updates only the rows that changed.

## Project Structure

```
src/
  config/        environment variables and thresholds
  db/            SQLite schema and queries
  services/
    detector.js  anomaly rules (pure function)
    aiAlert.js   LLM call, template fallback, quota pause
    pipeline.js  detect -> dedupe -> generate -> store
    checker.js   HTTP checks and the scheduler
  controllers/   request handlers (monitor, monitors, alerts)
  routes/        route wiring and mock endpoints
  utils/         logger
public/          dashboard (HTML, CSS, JS)
data/            sample.json (alerts.db is created here at runtime)
logs/            combined.log and error.log (created at runtime)
```

## Architecture

```
POST /monitor ─┐
               ├─> pipeline ─> detector ─> dedupe ─> LLM (or template) ─> SQLite
Scheduler ─────┘                                                            │
(checker.js)                                                                │
Dashboard  <───────────────── GET /alerts, GET /monitors <──────────────────┘
```

## Key Design Decisions

- **One pipeline for all input.** Manual batches and scheduled checks share `processRecord`, so detection and alerting behave identically.
- **An LLM failure never loses an alert.** On any error the system stores a template alert. On a quota error (429) it pauses LLM calls for one hour and uses templates meanwhile.
- **Duplicate suppression** combines an active-alert lookup with an in-flight set, so concurrent requests cannot create duplicates.
- **Configurable thresholds and model** through environment variables, so a retired model needs no code change.
- **Batch handling** uses `Promise.allSettled`, so one bad record cannot fail the whole batch.
- **Built-in SQLite** keeps setup to `npm install`. The SQL is portable to PostgreSQL or MySQL.
- **Plain HTML/CSS/JS frontend** with no build step. Alert text is inserted with `textContent` to avoid HTML injection.

## Troubleshooting

| Problem | Fix |
|---|---|
| Alerts show "template" instead of "AI" | Check `GEMINI_API_KEY`. Look in `logs/error.log` for a 429 (daily quota used up) or 404 (model retired) and set a different `GEMINI_MODEL` |
| `node:sqlite` module not found | Upgrade to Node.js 22.5 or newer |
| Port already in use | Set `PORT` in `.env` to another value |
| Monitor shows 0 records on a working API | The response uses a list key not in the supported wrapper keys |

## Known Limitations

- Monitors fetch user-supplied URLs. A production deployment should block private and internal addresses (SSRF protection) and add authentication.
- The scheduler runs inside the API process, so it suits a single instance. At scale, move it to a worker or queue.
- `node:sqlite` is marked experimental by Node. A production system would use PostgreSQL or a similar server database.
- The Gemini free tier has a small daily quota. When it is exhausted, alerts use templates until it resets.

## AI Usage

AI assistance (Claude) was used for code generation, design, and debugging. The application also uses Google Gemini at runtime to write alert messages. All prompts are documented in the separately submitted `AI_Prompts.docx`.