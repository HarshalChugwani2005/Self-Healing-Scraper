// ============================================================================
// index.js — Main orchestrator: ties runner → validator → healer together
// ============================================================================
// This is the entry point. It supports two modes:
//
//   1. CRON MODE (default): `node src/index.js`
//      Runs the scrape→validate→heal pipeline on a schedule (default: every
//      30 minutes). Uses node-cron for scheduling.
//
//   2. ONE-SHOT MODE: `node src/index.js --once`
//      Runs the pipeline once and exits. Useful for testing and demos.
//
// Pipeline:  Run → Validate → (if fail) Heal → Approve → Re-run → Validate → Log
// ============================================================================

const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

// Load .env if present (for local development)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=');
            if (key && value !== undefined && !process.env[key]) {
                process.env[key] = value;
            }
        }
    });
}

const db = require('./db');
const { runScraper, getCollectorId } = require('./runner');
const { validateScrapedData } = require('./validator');
const { healScraper } = require('./healer');

// ---------- Pipeline ----------

/**
 * Execute one full scrape → validate → (heal) cycle.
 * This is the core pipeline that runs on each tick.
 */
async function executePipeline() {
    const timestamp = new Date().toISOString();
    console.log();
    console.log(`┌─────────────────────────────────────────────────────┐`);
    console.log(`│  📡 SCRAPE PIPELINE — ${timestamp}  │`);
    console.log(`└─────────────────────────────────────────────────────┘`);

    // ── STEP 1: RUN THE SCRAPER ──
    const scrapeResult = await runScraper();

    if (!scrapeResult.success) {
        // CLI-level failure (timeout, auth, network) — not a schema issue
        console.log('❌ Scraper execution failed (CLI error, not a schema break)');
        db.insertRun({
            status: 'error',
            row_count: 0,
            raw_json: scrapeResult.rawOutput,
            error_message: scrapeResult.error
        });
        return { status: 'error', error: scrapeResult.error };
    }

    // ── STEP 2: VALIDATE THE OUTPUT ──
    const validation = validateScrapedData(scrapeResult.data);

    console.log(`📊 Validation: ${validation.stats.totalRows} rows, ` +
        `${validation.stats.validRows} valid, ${validation.stats.invalidRows} invalid`);

    if (validation.valid) {
        // ── HAPPY PATH: Store and done ──
        console.log('✅ All validations passed — data is clean');
        const run = db.insertRun({
            status: 'success',
            row_count: validation.stats.totalRows,
            raw_json: scrapeResult.rawOutput,
            error_message: null
        });
        return { status: 'success', runId: run.lastInsertRowid, stats: validation.stats };
    }

    // ── STEP 3: VALIDATION FAILED → TRIGGER HEAL ──
    console.log('❌ Validation failed:');
    validation.errors.forEach(err => console.log(`   • ${err}`));

    // Store the broken run
    const failedRun = db.insertRun({
        status: 'validation_failed',
        row_count: validation.stats.totalRows,
        raw_json: scrapeResult.rawOutput,
        error_message: validation.errors.join('; ')
    });

    // Attempt self-healing
    let collectorId;
    try {
        collectorId = getCollectorId();
    } catch (e) {
        console.error('❌ Cannot heal: no collector_id configured');
        return { status: 'validation_failed', error: e.message };
    }

    const healResult = await healScraper({
        runId: failedRun.lastInsertRowid,
        collectorId,
        failureDescription: validation.failureDescription,
        brokenData: scrapeResult.data
    });

    return {
        status: healResult.healed ? 'healed' : 'heal_attempted',
        runId: failedRun.lastInsertRowid,
        healEventId: healResult.healEventId,
        healed: healResult.healed
    };
}

// ---------- Entrypoint ----------

if (require.main === module) {
    const isOnce = process.argv.includes('--once');

    if (isOnce) {
        // One-shot mode
        console.log('🔄 Running in one-shot mode...');
        executePipeline()
            .then(result => {
                console.log(`\n📋 Result: ${JSON.stringify(result, null, 2)}`);
                process.exit(result.status === 'error' ? 1 : 0);
            })
            .catch(err => {
                console.error('💥 Pipeline crashed:', err);
                process.exit(1);
            });
    } else {
        // Cron mode
        const schedule = process.env.CRON_SCHEDULE || '*/30 * * * *';
        console.log('╔══════════════════════════════════════════════════════╗');
        console.log('║  🤖 Self-Healing Scraper — Cron Mode                ║');
        console.log(`║  Schedule: ${schedule.padEnd(40)}║`);
        console.log('║  Press Ctrl+C to stop                               ║');
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log();

        // Run immediately on startup
        console.log('▶ Running initial scrape...');
        executePipeline()
            .then(result => {
                console.log(`📋 Initial result: ${result.status}`);
            })
            .catch(err => console.error('💥 Initial pipeline error:', err));

        // Then schedule recurring runs
        cron.schedule(schedule, () => {
            console.log(`\n▶ Cron tick at ${new Date().toISOString()}`);
            executePipeline()
                .then(result => {
                    console.log(`📋 Result: ${result.status}`);
                })
                .catch(err => console.error('💥 Pipeline error:', err));
        });
    }
}

module.exports = { executePipeline };
