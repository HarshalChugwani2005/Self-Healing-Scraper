// ============================================================================
// db.js — SQLite database layer for scrape runs and heal events
// ============================================================================
// Two tables:
//   scrape_runs   — stores each scraper execution with status and raw output
//   heal_events   — stores each self-healing cycle with before/after snapshots
//
// Uses better-sqlite3 for synchronous, zero-config SQLite access.
// ============================================================================

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'scraper.db');

// Create/open the database
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance (dashboard reads while runner writes)
db.pragma('journal_mode = WAL');

// ---------- Schema creation ----------
db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_runs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
        status      TEXT    NOT NULL CHECK (status IN ('success', 'validation_failed', 'error')),
        row_count   INTEGER NOT NULL DEFAULT 0,
        raw_json    TEXT,
        error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS heal_events (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id            INTEGER REFERENCES scrape_runs(id),
        timestamp         TEXT    NOT NULL DEFAULT (datetime('now')),
        failure_description TEXT  NOT NULL,
        heal_prompt       TEXT    NOT NULL,
        preview_result    TEXT,
        approved          INTEGER NOT NULL DEFAULT 0,
        verified          INTEGER NOT NULL DEFAULT 0,
        before_snapshot   TEXT,
        after_snapshot    TEXT
    );
`);

// ---------- Prepared statements ----------

const insertRunStmt = db.prepare(`
    INSERT INTO scrape_runs (status, row_count, raw_json, error_message)
    VALUES (@status, @row_count, @raw_json, @error_message)
`);

const insertHealStmt = db.prepare(`
    INSERT INTO heal_events (run_id, failure_description, heal_prompt, before_snapshot)
    VALUES (@run_id, @failure_description, @heal_prompt, @before_snapshot)
`);

const updateHealStmt = db.prepare(`
    UPDATE heal_events
    SET preview_result  = @preview_result,
        approved        = @approved,
        verified        = @verified,
        after_snapshot  = @after_snapshot
    WHERE id = @id
`);

const getRecentRunsStmt = db.prepare(`
    SELECT * FROM scrape_runs ORDER BY id DESC LIMIT ?
`);

const getRunByIdStmt = db.prepare(`
    SELECT * FROM scrape_runs WHERE id = ?
`);

const getHealEventsStmt = db.prepare(`
    SELECT * FROM heal_events ORDER BY id DESC LIMIT ?
`);

const getHealEventByRunIdStmt = db.prepare(`
    SELECT * FROM heal_events WHERE run_id = ?
`);

const getStatsStmt = db.prepare(`
    SELECT
        COUNT(*)                                          AS total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)          AS success_count,
        SUM(CASE WHEN status = 'validation_failed' THEN 1 ELSE 0 END) AS fail_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)            AS error_count
    FROM scrape_runs
`);

const getHealStatsStmt = db.prepare(`
    SELECT
        COUNT(*)                                    AS total_heals,
        SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS verified_heals
    FROM heal_events
`);

// ---------- Export helper functions ----------

module.exports = {
    /**
     * Insert a new scrape run record.
     * @param {Object} run - { status, row_count, raw_json, error_message }
     * @returns {Object} - The inserted row info (with lastInsertRowid)
     */
    insertRun(run) {
        return insertRunStmt.run({
            status: run.status,
            row_count: run.row_count || 0,
            raw_json: typeof run.raw_json === 'string' ? run.raw_json : JSON.stringify(run.raw_json),
            error_message: run.error_message || null
        });
    },

    /**
     * Insert a new heal event.
     * @param {Object} event - { run_id, failure_description, heal_prompt, before_snapshot }
     * @returns {Object}
     */
    insertHealEvent(event) {
        return insertHealStmt.run({
            run_id: event.run_id,
            failure_description: event.failure_description,
            heal_prompt: event.heal_prompt,
            before_snapshot: typeof event.before_snapshot === 'string'
                ? event.before_snapshot
                : JSON.stringify(event.before_snapshot)
        });
    },

    /**
     * Update a heal event with results.
     * @param {Object} update - { id, preview_result, approved, verified, after_snapshot }
     */
    updateHealEvent(update) {
        return updateHealStmt.run({
            id: update.id,
            preview_result: typeof update.preview_result === 'string'
                ? update.preview_result
                : JSON.stringify(update.preview_result),
            approved: update.approved ? 1 : 0,
            verified: update.verified ? 1 : 0,
            after_snapshot: typeof update.after_snapshot === 'string'
                ? update.after_snapshot
                : JSON.stringify(update.after_snapshot)
        });
    },

    /**
     * Get the N most recent scrape runs.
     */
    getRecentRuns(limit = 20) {
        return getRecentRunsStmt.all(limit);
    },

    /**
     * Get a single run by ID.
     */
    getRunById(id) {
        return getRunByIdStmt.get(id);
    },

    /**
     * Get the N most recent heal events.
     */
    getHealEvents(limit = 20) {
        return getHealEventsStmt.all(limit);
    },

    /**
     * Get heal event for a specific run.
     */
    getHealEventByRunId(runId) {
        return getHealEventByRunIdStmt.get(runId);
    },

    /**
     * Get aggregate stats for the dashboard.
     */
    getStats() {
        const runStats = getStatsStmt.get();
        const healStats = getHealStatsStmt.get();
        return { ...runStats, ...healStats };
    },

    /** Direct DB access for advanced queries */
    db
};
