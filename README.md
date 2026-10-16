# Intelligent API Monitoring & Alert System

A Node.js/Express service that monitors API health, detects anomalies, and uses an LLM to write human-readable alerts. Alerts are stored in SQLite and shown on a live dashboard.

## Features

- **Batch ingestion** via `POST /monitor` (JSON array) or a built-in sample dataset
- **Live monitoring**: add any API URL and the server checks it on a schedule, measuring response time, status code, and record count
- **Anomaly detection**: high latency, failed requests, unreachable hosts, missing or zero records, invalid data
- **AI-generated alerts** (Google Gemini) with an automatic template fallback if the LLM is unavailable or rate-limited
- **Duplicate suppression**: the same API and issue set will not create a second active alert
- **REST API**, **SQL storage**, **structured logging**, and a **dashboard** with filters and per-monitor countdown timers

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js 18+, Express |
| Database | SQLite via `better-sqlite3` (SQL, zero setup, file created on first run) |
| AI | Google Gemini (`@google/generative-ai`), model set by env var |
| Logging | Winston (console + `logs/` files) |
| Frontend | Vanilla HTML/CSS/JS served by Express (no build step) |

## Setup

```bash
git clone <your-repo-url>
cd api-monitor
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` and add your Gemini API key (free key: https://aistudio.google.com/apikey).
The app still runs without a key. Alerts then use the template fallback.

## Run

```bash
npm start        # production
npm run dev      # auto-restart with nodemon
```

Open **http://localhost:3000**.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `GEMINI_API_KEY` | none | Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model name (change if a model is retired) |
| `MAX_RESPONSE_TIME_MS` | `3000` | Latency above this is flagged as slow |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/monitor` | Process a batch of API records |
| `POST` | `/monitor/sample` | Process `data/sample.json` |
| `GET` | `/alerts` | All **active** anomalies |
| `PATCH` | `/alerts/:id/resolve` | Mark an alert resolved |
| `GET` | `/monitors` | List monitored APIs |
| `POST` | `/monitors` | Add a monitor `{name, url, interval_sec}` and run the first check |
| `POST` | `/monitors/:id/check` | Run a check now |
| `DELETE` | `/monitors/:id` | Remove a monitor |
| `GET` | `/mock/{healthy,slow,empty,error,flaky}` | Built-in demo endpoints |

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

An alert's severity is the highest severity among its issues.

## Project Structure

```
src/
  config/        env vars and thresholds
  db/            SQLite schema and queries
  services/
    detector.js  anomaly rules (pure function)
    aiAlert.js   LLM call + template fallback
    pipeline.js  detect -> dedupe -> generate -> store
    checker.js   HTTP checks + scheduler for monitored APIs
  controllers/   request handlers
  routes/        route wiring + mock endpoints
  utils/         logger
public/          dashboard (HTML/CSS/JS)
data/            sample.json (SQLite file is created here at runtime)
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

- **One pipeline for all input.** Manual batches and scheduled checks run through the same `processRecord`, so detection and alerting behave identically.
- **LLM failure never loses an alert.** On error the system stores a template alert. On a quota error (429) it pauses LLM calls for an hour.
- **Duplicate suppression** uses an active-alert lookup plus an in-flight set, so concurrent requests cannot create duplicates.
- **Configurable thresholds and model** through environment variables.
- **Batch handling** uses `Promise.allSettled`, so one bad record cannot fail the whole batch.
- **SQLite** keeps setup to `npm install`. The SQL is portable to PostgreSQL/MySQL.

## Known Limitations

- Monitors fetch user-supplied URLs. A production deployment should block private and internal addresses (SSRF protection) and add authentication.
- The scheduler runs inside the API process, so it suits a single instance. At scale, move it to a worker or queue.
- Record counting looks for a top-level array or common wrapper keys (`data`, `results`, `items`, `records`, `entries`, `users`, `products`, `posts`, `todos`).

## AI Usage

AI assistance was used for code generation and design. All prompts are documented in `AI_Prompts.docx`.