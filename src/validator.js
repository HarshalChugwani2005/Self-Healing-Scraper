// ============================================================================
// validator.js — Schema validation & failure description generator
// ============================================================================
// JUDGES: This is the core logic that bridges "scrape output" to "heal prompt".
//
// Two-layer validation:
//   1. ROW-LEVEL: Each record is validated against a Zod schema to ensure
//      required fields are present, non-empty, and correctly typed.
//   2. AGGREGATE-LEVEL: The result set is checked for minimum row count
//      (the FreeJobAlert page always has 15+ entries — getting fewer
//      means the scraper is reading the wrong DOM region or the page changed).
//
// When validation fails, this module generates a human-readable description
// of *exactly what broke*. This description becomes the prompt for
// `bdata scraper heal` — the more precise the description, the better
// the AI fix. That's why we enumerate specific fields, percentages, and
// example values rather than just saying "validation failed".
// ============================================================================

const { z } = require('zod');

// ---------- Zod Schema ----------
// Defines the expected shape of each scraped job notification row.
// Each field is validated for presence and basic format.

const JobNotificationSchema = z.object({
    // The date the notification was posted (e.g., "18/08/2026" or "August 18, 2026")
    post_date: z.string().min(1, 'post_date must not be empty'),

    // Organization name (e.g., "UPSC", "SSC", "Bank of Baroda")
    recruitment_board: z.string().min(1, 'recruitment_board must not be empty'),

    // Job title / position name (e.g., "Junior Associate (Clerk)")
    post_name: z.string().min(1, 'post_name must not be empty'),

    // Required educational qualification (e.g., "Any Graduate", "B.E/B.Tech")
    qualification: z.string().min(1, 'qualification must not be empty'),

    // Advertisement number — optional on some rows
    advt_no: z.string().optional(),

    // Deadline to apply (e.g., "31/08/2026")
    last_date: z.string().min(1, 'last_date must not be empty'),

    // URL to the full notification detail page
    detail_url: z.string().min(1, 'detail_url must not be empty')
});

// Minimum number of rows we expect from a healthy scrape.
// The FreeJobAlert latest-notifications page typically has 15-50+ rows.
// Fewer than 5 rows strongly indicates the scraper is broken.
const MIN_ROW_COUNT = 5;

// ---------- Validation Function ----------

/**
 * Validate scraped data against the schema and generate a failure description
 * if anything is wrong.
 *
 * @param {Array} rows - Array of scraped job notification objects
 * @returns {Object} - {
 *     valid: boolean,
 *     errors: Array<string>,           // Human-readable error list
 *     failureDescription: string|null,  // Full description for heal prompt
 *     rowErrors: Array<Object>,         // Per-row Zod errors
 *     stats: Object                     // Validation statistics
 *   }
 */
function validateScrapedData(rows) {
    const errors = [];
    const rowErrors = [];
    const fieldFailCounts = {};

    // ────────────────────────────────────────────────────────────
    // AGGREGATE CHECK: Do we have enough rows?
    // ────────────────────────────────────────────────────────────
    // WHY: If the scraper returns 0-4 rows from a page that always
    // has 15+, the scraper is pointing at the wrong DOM element or
    // the page structure changed fundamentally.
    // ────────────────────────────────────────────────────────────

    if (!rows || !Array.isArray(rows)) {
        return {
            valid: false,
            errors: ['Scraper returned non-array output (got: ' + typeof rows + ')'],
            failureDescription: 'The scraper returned non-array output instead of a JSON array of job notifications. The page structure may have changed, causing the extraction to fail completely.',
            rowErrors: [],
            stats: { totalRows: 0, validRows: 0, invalidRows: 0 }
        };
    }

    if (rows.length < MIN_ROW_COUNT) {
        errors.push(
            `Row count too low: got ${rows.length}, expected ≥ ${MIN_ROW_COUNT}. ` +
            `The page typically has 15+ job notifications.`
        );
    }

    // ────────────────────────────────────────────────────────────
    // ROW-LEVEL CHECK: Validate each row against the Zod schema
    // ────────────────────────────────────────────────────────────
    // WHY: Even if we get enough rows, individual fields might be
    // null/empty/wrong-type because the scraper's CSS selectors
    // shifted. We track WHICH fields fail and HOW OFTEN to give
    // the heal AI a precise fix target.
    // ────────────────────────────────────────────────────────────

    let validRows = 0;
    let invalidRows = 0;

    rows.forEach((row, index) => {
        const result = JobNotificationSchema.safeParse(row);

        if (result.success) {
            validRows++;
        } else {
            invalidRows++;
            const issues = result.error.issues;

            // Track per-field failure counts for the heal prompt
            issues.forEach(issue => {
                const fieldPath = issue.path.join('.');
                if (!fieldFailCounts[fieldPath]) {
                    fieldFailCounts[fieldPath] = {
                        count: 0,
                        sampleValues: [],
                        errorMessages: new Set()
                    };
                }
                fieldFailCounts[fieldPath].count++;
                fieldFailCounts[fieldPath].errorMessages.add(issue.message);

                // Capture sample bad values (up to 3) for the heal prompt
                const actualValue = row[fieldPath];
                if (fieldFailCounts[fieldPath].sampleValues.length < 3) {
                    fieldFailCounts[fieldPath].sampleValues.push(
                        actualValue === undefined ? 'undefined'
                            : actualValue === null ? 'null'
                                : actualValue === '' ? '(empty string)'
                                    : String(actualValue).substring(0, 100)
                    );
                }
            });

            rowErrors.push({ rowIndex: index, issues });
        }
    });

    // ────────────────────────────────────────────────────────────
    // BUILD FAILURE DESCRIPTION
    // ────────────────────────────────────────────────────────────
    // This is the most important part for self-healing. The better
    // we describe what broke, the better Bright Data's AI can fix it.
    //
    // We enumerate:
    //   - Which fields failed (by name)
    //   - How many rows were affected (ratio)
    //   - What the bad values looked like (samples)
    //   - What we expected instead
    //
    // This description becomes the literal prompt for `bdata scraper heal`.
    // ────────────────────────────────────────────────────────────

    if (invalidRows > 0) {
        errors.push(
            `${invalidRows}/${rows.length} rows failed schema validation.`
        );
    }

    // Generate per-field failure descriptions
    for (const [field, info] of Object.entries(fieldFailCounts)) {
        const pct = Math.round((info.count / rows.length) * 100);
        errors.push(
            `Field "${field}" failed in ${info.count}/${rows.length} rows (${pct}%). ` +
            `Sample values: [${info.sampleValues.join(', ')}]. ` +
            `Expected: ${[...info.errorMessages].join('; ')}.`
        );
    }

    const valid = errors.length === 0;

    // ────────────────────────────────────────────────────────────
    // COMPOSE THE HEAL PROMPT
    // ────────────────────────────────────────────────────────────
    // Format the failure description as a natural-language prompt
    // that Bright Data's AI agent can act on. Be specific but concise.
    // ────────────────────────────────────────────────────────────

    let failureDescription = null;
    if (!valid) {
        const fieldIssues = Object.entries(fieldFailCounts)
            .map(([field, info]) => {
                const pct = Math.round((info.count / rows.length) * 100);
                return `The "${field}" field is missing or empty in ${pct}% of rows (sample bad values: ${info.sampleValues.join(', ')})`;
            })
            .join('. ');

        const rowCountIssue = rows.length < MIN_ROW_COUNT
            ? `Only ${rows.length} rows were extracted but the page should have at least ${MIN_ROW_COUNT} job notification rows. `
            : '';

        failureDescription =
            `The scraper for FreeJobAlert.com latest notifications is returning broken data. ` +
            rowCountIssue +
            (fieldIssues ? fieldIssues + '. ' : '') +
            `Please fix the extraction selectors to correctly capture: post_date, recruitment_board, post_name, qualification, advt_no, last_date, and detail_url from the job notification table rows.`;
    }

    return {
        valid,
        errors,
        failureDescription,
        rowErrors,
        stats: {
            totalRows: rows.length,
            validRows,
            invalidRows
        }
    };
}

module.exports = { validateScrapedData, JobNotificationSchema, MIN_ROW_COUNT };
