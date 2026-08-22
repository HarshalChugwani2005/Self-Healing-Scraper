# 🔄 Self-Healing Scraper

> **Scrape-Verse Hackathon** — A self-healing web scraper for [FreeJobAlert.com](https://www.freejobalert.com/latest-notifications/) that automatically detects, diagnoses, and repairs scraper breakage using Bright Data's AI-powered CLI.

---

## 🎯 Problem Statement

**Millions of Indian job-seekers rely on FreeJobAlert.com** to track government job notifications from agencies like UPSC, SSC, IBPS, and state commissions. The site is updated multiple times daily, and its table-based HTML markup (using classes like `lattbl`, `lattra`, `latoclr`) is fragile — ad injections, DOM restructuring, and CSS class renaming regularly break traditional scrapers.

**This project solves scraper brittleness** by implementing a closed-loop self-healing pipeline:
1. **Detect** — Zod schema validation catches broken fields and low row counts
2. **Diagnose** — Failure descriptions pinpoint *exactly which fields broke and how*
3. **Heal** — Bright Data's AI agent generates new extraction selectors
4. **Verify** — A re-run proves the fix works with before/after comparison

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    node-cron scheduler                   │
│                   (every 30 min / manual)                │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│      runner.js           │──── bdata scraper run ────▶ Bright Data
│  (execute scraper CLI)   │◀── JSON results ──────────    Cloud
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│     validator.js         │
│  (Zod schema + agg)     │
│  ✅ pass → store in DB   │
│  ❌ fail → generate desc │
└──────┬───────┬───────────┘
       │       │
   pass│   fail│
       │       ▼
       │  ┌──────────────────────────┐
       │  │     healer.js            │──── bdata scraper heal ──▶ Bright Data
       │  │  (heal + approve + re-   │◀── heal.json ──────────     AI Agent
       │  │   run verification)      │──── bdata scraper approve ─▶
       │  └──────────┬───────────────┘
       │             │
       ▼             ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│      SQLite DB           │◀───▶│   Express Dashboard      │
│  scrape_runs table       │     │   /api/runs              │
│  heal_events table       │     │   /api/heal-events       │
└──────────────────────────┘     │   /api/stats             │
                                 │   public/index.html      │
                                 └──────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Bright Data account** ([sign up](https://brightdata.com/))

### Setup

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/Self-Healing-Scraper.git
cd Self-Healing-Scraper
npm install

# 2. Install Bright Data CLI
npm install -g @brightdata/cli

# 3. Authenticate
bdata login

# 4. Create the scraper (saves collector_id to config.json)
node src/create-scraper.js

# 5. Configure environment
cp .env.example .env
# Edit .env — add your COLLECTOR_ID if not auto-populated
```

### Run

```bash
# One-shot scrape + validate + heal
npm run scrape

# Continuous mode (every 30 min)
npm start

# Dashboard only
npm run dashboard

# Both scraper + dashboard
npm run dev
```

### Demo

```bash
# Start the dashboard
npm run dashboard

# In another terminal — simulate a break to trigger self-healing
npm run simulate-break

# Open http://localhost:3000 and watch the Self-Healing Events panel
```

## 🔧 How Self-Healing Works

### The Heal Loop (Step by Step)

Here's a real example from our run logs ([full log](demo/example-heal-log.json)):

#### 1. 🔍 Break Detected

The validator runs a Zod schema check on every scraped row. In this case:

```
❌ Field "post_name" was null in 3/3 rows (100%)
❌ Field "recruitment_board" contained date values instead of org names
❌ Field "last_date" contained raw HTML: <span class="dt">31/08/2026</span>
❌ Field "detail_url" was empty in all rows
❌ Only 3 rows returned (expected ≥ 5)
```

#### 2. 💬 Heal Prompt Generated

The validator auto-generates a precise, natural-language description:

> *"The scraper for FreeJobAlert.com latest notifications is returning broken data. Only 3 rows were extracted but the page should have at least 5 job notification rows. The "post_name" field is missing or empty in 100% of rows. The "recruitment_board" field contains date values instead of organization names (column shift). Please fix the extraction selectors..."*

#### 3. 🔧 Heal Executed

```bash
bdata scraper heal c_xxxxx "<generated prompt>" --auto-approve --pretty -o heal.json
```

Bright Data's AI agent analyzes the current page DOM and generates updated extraction selectors.

#### 4. ✅ Verification Run

The scraper re-runs immediately with the fix applied. Before/after comparison:

| Field | Before (Broken) | After (Fixed) |
|-------|---------|-------|
| `recruitment_board` | `"18/08/2026"` ❌ | `"Bank of Baroda"` ✅ |
| `post_name` | `null` ❌ | `"2482 Local Bank Officer"` ✅ |
| `last_date` | `<span class="dt">...` ❌ | `"31/08/2026"` ✅ |
| `detail_url` | `""` ❌ | `"https://www.freejobalert.com/..."` ✅ |

#### 5. 📊 Dashboard Updated

The Self-Healing Events panel on the dashboard shows the entire cycle with expandable details for each step.

## 📁 Project Structure

```
Self-Healing-Scraper/
├── src/
│   ├── index.js            # Orchestrator (cron + one-shot modes)
│   ├── create-scraper.js   # Creates scraper via bdata CLI
│   ├── runner.js           # Executes scraper, parses output
│   ├── validator.js        # Zod schema validation + failure description
│   ├── healer.js           # Self-healing loop (heal → approve → verify → bounded retry)
│   ├── simulate-break.js   # Demo break simulator
│   ├── db.js               # SQLite database layer
│   └── dashboard/
│       ├── server.js       # Express API server
│       └── public/
│           ├── index.html  # Dashboard UI
│           ├── styles.css  # Dark theme + glassmorphism
│           └── app.js      # Client-side logic
├── test/
│   └── validator.test.js   # Unit tests for schema validation & heal prompt generation
├── config.json             # Scraper configuration (collector_id)
├── setup.sh                # One-command setup script
├── demo/
│   └── example-heal-log.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 🔑 Key Design Decisions

1. **Zod for validation** — Type-safe schema checks that generate structured error objects, perfect for building precise heal prompts
2. **SQLite (better-sqlite3)** — Zero-config, synchronous, single-file database. No setup needed for judges.
3. **No build step** — Vanilla HTML/CSS/JS dashboard. `npm run dashboard` and it works immediately.
4. **Failure descriptions as heal prompts** — The validator doesn't just say "failed" — it describes *which fields, what percentage, and what the bad values looked like*. This precision enables Bright Data's AI to pinpoint exact DOM changes.
5. **Bounded 2-Attempt Retry** — If verification fails after an initial heal attempt, the engine automatically refines the prompt with residual validation errors and performs a second attempt.
6. **Human-in-the-Loop or Unattended** — Supports both `AUTO_APPROVE=true` (for unattended cron runs) and `AUTO_APPROVE=false` (for manual preview review before committing fixes).
7. **Downstream Alert Dispatcher** — Automatically broadcasts new job notices or self-healing fix reports to Discord, Slack, or Telegram via configurable `WEBHOOK_URL`.

## 📊 Dashboard Panels

| Panel | What It Shows |
|-------|---------------|
| **📋 Latest Scraped Data** | Most recent successful job listings in a sortable, filterable, paginated table with detail inspection |
| **📅 Run History** | Timeline of all runs with status badges (✅/❌/🔧) and error diagnostics |
| **🔧 Self-Healing Events** | Full 5-step heal cycle: break → prompt → preview → approval → before/after diff |
| **📊 Stats Bar** | Total runs, success rate, heals triggered, verified fixes, last run time |

## 🧪 Live Demo Guide (Judges & Presentation)

### Option 1: Live Real Break (Recommended for Authenticity)

1. Open your **Bright Data Control Panel** → Scraper IDE for your Collector.
2. Edit the extraction selector for `post_name` or `recruitment_board` to an invalid selector (e.g. change `td:nth-child(3)` to `td:nth-child(99)`).
3. Save the template.
4. In your terminal, run with human-in-the-loop approval:
   ```bash
   AUTO_APPROVE=false npm run scrape
   ```
5. Observe the live loop:
   - Validator catches missing `post_name` rows.
   - AI agent diagnoses DOM and outputs `preview_result`.
   - Approval gate pauses for review, then commits fix via `bdata scraper approve`.
   - Verification re-run passes and updates the dashboard with live before/after diff!

### Option 2: Instant Simulated Break (Fast Fallback)

```bash
# Start dashboard
npm run dashboard

# In another terminal — trigger simulated break
npm run simulate-break
```
Open `http://localhost:3000` to inspect the complete 5-step heal cycle with before/after comparison.

## 🧪 Unit Testing

Run unit tests for schema validation and prompt generation:

```bash
npm test
```

## ⚠️ Known Limitations & Tradeoffs

- **Single Target Domain:** The current implementation is scoped specifically to FreeJobAlert.com table extraction. Expanding to arbitrary websites requires configuring per-domain Zod schemas.
- **Bounded Retries:** The self-healing loop is intentionally capped at 2 attempts per break to avoid infinite AI loops and excessive API credit consumption.
- **Human vs Auto-Approve Tradeoff:** Unattended `AUTO_APPROVE=true` prioritizes zero-touch operational uptime, whereas `AUTO_APPROVE=false` guarantees strict human oversight for sensitive data extraction pipelines.

## 📜 License

MIT