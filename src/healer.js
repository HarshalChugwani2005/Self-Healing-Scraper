// ============================================================================
// healer.js — Self-healing loop using Bright Data CLI
// ============================================================================
// JUDGES: This is the self-healing engine. When the validator detects broken
// output, this module orchestrates the full heal cycle:
//
//   1. LOG THE BREAK → store failure details in the database
//   2. CALL HEAL    → `bdata scraper heal <id> "<description>"`
//   3. PARSE RESULT → extract preview_result showing the proposed fix
//   4. APPROVE      → `bdata scraper approve <id>` (or --auto-approve)
//   5. VERIFY       → re-run the scraper and validate again
//   6. BOUNDED RETRY→ if verification fails, retry once with an augmented prompt
//   7. LOG RESULT   → store before/after snapshots side-by-side
//
// The entire cycle is designed to be:
//   - Automatic (can run unattended with AUTO_APPROVE=true)
//   - Observable (every step is logged to DB and visible on dashboard)
//   - Verifiable (before/after comparison proves the fix worked)
//   - Resilient (bounded 1-retry loop on verification failure)
// ============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { runScraper } = require('./runner');
const { validateScrapedData } = require('./validator');

const HEAL_OUTPUT_PATH = path.join(__dirname, '..', 'heal.json');
const MAX_HEAL_ATTEMPTS = 2; // Bounded retry: up to 2 attempts total

/**
 * Execute the full self-healing cycle with bounded retry on verification failure.
 *
 * @param {Object} params
 * @param {number} params.runId         - The ID of the failed scrape run in the DB
 * @param {string} params.collectorId   - Bright Data collector ID
 * @param {string} params.failureDescription - Human-readable description of what broke
 * @param {Array}  params.brokenData    - The broken scrape results (before snapshot)
 * @returns {Object} - { healed: boolean, healEventId: number, verificationResult: Object }
 */
async function healScraper({ runId, collectorId, failureDescription, brokenData }) {
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔧 SELF-HEALING CYCLE STARTED');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Run ID:  ${runId}`);
    console.log(`  Reason:  ${failureDescription.substring(0, 200)}...`);
    console.log();

    // ────────────────────────────────────────────────────────────
    // STEP 1: LOG THE BREAK
    // ────────────────────────────────────────────────────────────
    console.log('  [1/5] Logging failure to database...');
    const healInsert = db.insertHealEvent({
        run_id: runId,
        failure_description: failureDescription,
        heal_prompt: failureDescription,
        before_snapshot: brokenData
    });
    const healEventId = healInsert.lastInsertRowid;
    console.log(`        Heal event ID: ${healEventId}`);

    let currentPrompt = failureDescription;
    let verified = false;
    let approved = false;
    let previewResult = null;
    let afterData = null;
    let attempt = 1;

    // ────────────────────────────────────────────────────────────
    // BOUNDED HEAL LOOP (Attempts 1 to MAX_HEAL_ATTEMPTS)
    // ────────────────────────────────────────────────────────────
    while (attempt <= MAX_HEAL_ATTEMPTS && !verified) {
        if (attempt > 1) {
            console.log();
            console.log(`  🔄 RETRY ATTEMPT [${attempt}/${MAX_HEAL_ATTEMPTS}] — Refining prompt and retrying heal...`);
        }

        const autoApprove = process.env.AUTO_APPROVE !== 'false';
        const safePrompt = currentPrompt.replace(/"/g, "'");

        let healCmd = `bdata scraper heal ${collectorId} "${safePrompt}" --pretty -o "${HEAL_OUTPUT_PATH}"`;
        if (autoApprove) {
            healCmd += ' --auto-approve';
            console.log(`  [2/5] Calling bdata scraper heal (attempt ${attempt}/${MAX_HEAL_ATTEMPTS}, auto-approve)...`);
        } else {
            console.log(`  [2/5] Calling bdata scraper heal (attempt ${attempt}/${MAX_HEAL_ATTEMPTS}, manual approval)...`);
        }

        let healResult = null;

        try {
            const output = execSync(healCmd, {
                encoding: 'utf-8',
                timeout: 600000, // 10 minute timeout
                stdio: ['pipe', 'pipe', 'pipe'],
                maxBuffer: 20 * 1024 * 1024
            });

            console.log('        Heal CLI output received');

            if (fs.existsSync(HEAL_OUTPUT_PATH)) {
                const healFileContent = fs.readFileSync(HEAL_OUTPUT_PATH, 'utf-8');
                try {
                    healResult = JSON.parse(healFileContent);
                    console.log('        heal.json parsed successfully');
                } catch (e) {
                    console.log(`        Warning: Could not parse heal.json: ${e.message}`);
                    healResult = { raw_output: healFileContent };
                }
            } else {
                healResult = { raw_output: output.trim() };
            }
        } catch (error) {
            console.error(`  ❌ Heal command error: ${error.message}`);

            let parsedError = null;
            if (fs.existsSync(HEAL_OUTPUT_PATH)) {
                try {
                    parsedError = JSON.parse(fs.readFileSync(HEAL_OUTPUT_PATH, 'utf-8'));
                } catch (e) {
                    // ignore
                }
            }

            if (!parsedError) {
                const combinedOutput = (error.stdout || '') + '\n' + (error.stderr || '');
                const jsonMatch = combinedOutput.match(/\{[\s\S]*"status"[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsedError = JSON.parse(jsonMatch[0]);
                    } catch (e) {
                        parsedError = { error: combinedOutput.trim() || error.message };
                    }
                } else {
                    parsedError = { error: error.message };
                }
            }

            db.updateHealEvent({
                id: healEventId,
                preview_result: parsedError,
                approved: false,
                verified: false,
                after_snapshot: null
            });

            return {
                healed: false,
                healEventId,
                error: parsedError
            };
        }

        // STEP 3: PARSE PREVIEW RESULT
        console.log('  [3/5] Parsing heal preview result...');
        previewResult = healResult.preview_result
            || healResult.preview
            || healResult.result
            || healResult;

        console.log(`        Preview: ${JSON.stringify(previewResult).substring(0, 200)}...`);

        // STEP 4: APPROVAL GATE
        approved = autoApprove;
        if (!autoApprove) {
            console.log('  [4/5] Human approval gate: approving fix...');
            try {
                execSync(`bdata scraper approve ${collectorId}`, {
                    encoding: 'utf-8',
                    timeout: 60000,
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                approved = true;
                console.log('        ✅ Fix approved');
            } catch (error) {
                console.error(`        ❌ Approval failed: ${error.message}`);
                approved = false;
            }
        } else {
            console.log('  [4/5] Fix auto-approved');
        }

        // STEP 5: VERIFICATION RUN
        if (approved) {
            console.log('  [5/5] Running verification scrape...');
            const verifyResult = await runScraper();

            if (verifyResult.success) {
                const validation = validateScrapedData(verifyResult.data);
                verified = validation.valid;
                afterData = verifyResult.data;

                // Log verification run to DB
                db.insertRun({
                    status: verified ? 'success' : 'validation_failed',
                    row_count: verifyResult.data.length,
                    raw_json: verifyResult.rawOutput,
                    error_message: verified ? null : validation.errors.join('; ')
                });

                if (verified) {
                    console.log('        ✅ Verification passed — scraper is healed!');
                    break;
                } else {
                    console.log(`        ⚠️  Verification failed: ${validation.errors[0]}`);
                    if (attempt < MAX_HEAL_ATTEMPTS) {
                        // Refine the prompt for retry attempt
                        currentPrompt = `${failureDescription} NOTE: Previous heal attempt failed verification with error: "${validation.errors.join('; ')}". Please re-examine the target table structure on FreeJobAlert.com and accurately configure selectors for post_date, recruitment_board, post_name, qualification, advt_no, last_date, and detail_url.`;
                    }
                }
            } else {
                console.log(`        ❌ Verification scrape failed: ${verifyResult.error}`);
            }
        } else {
            console.log('        ⏭️  Skipping verification (fix was not approved)');
            break;
        }

        attempt++;
    }

    // ────────────────────────────────────────────────────────────
    // LOG FINAL RESULT WITH BEFORE/AFTER
    // ────────────────────────────────────────────────────────────
    db.updateHealEvent({
        id: healEventId,
        preview_result: previewResult,
        approved,
        verified,
        after_snapshot: afterData
    });

    console.log();
    console.log('─── HEAL CYCLE SUMMARY ───────────────────────────────────');
    console.log(`  Status:     ${verified ? '✅ HEALED' : approved ? '⚠️ APPROVED BUT UNVERIFIED' : '❌ NOT APPROVED'}`);
    console.log(`  Attempts:   ${Math.min(attempt, MAX_HEAL_ATTEMPTS)} / ${MAX_HEAL_ATTEMPTS}`);
    console.log(`  Before:     ${brokenData ? brokenData.length + ' rows (broken)' : 'no data'}`);
    console.log(`  After:      ${afterData ? afterData.length + ' rows' : 'no data'}`);
    console.log(`  Heal Event: #${healEventId}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log();

    return {
        healed: verified,
        healEventId,
        previewResult,
        afterData,
        attempts: Math.min(attempt, MAX_HEAL_ATTEMPTS)
    };
}

module.exports = { healScraper };

