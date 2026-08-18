// ============================================================================
// runner.js — Execute the Bright Data scraper via CLI
// ============================================================================
// Calls `bdata scraper run <collector_id> <url> --json` and returns parsed
// results. Handles CLI errors gracefully (timeout, network, auth failures).
//
// This is a thin wrapper around the CLI — all the intelligence lives in
// Bright Data's cloud. We just execute and capture output.
// ============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

/**
 * Load the collector_id from config.json or environment.
 * Environment variable takes precedence (useful for CI/CD).
 */
function getCollectorId() {
    if (process.env.COLLECTOR_ID) {
        return process.env.COLLECTOR_ID;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (!config.collector_id) {
        throw new Error(
            'No collector_id found. Run "node src/create-scraper.js" first, ' +
            'or set COLLECTOR_ID in your .env file.'
        );
    }
    return config.collector_id;
}

/**
 * Load the target URL from config.json or environment.
 */
function getTargetUrl() {
    if (process.env.TARGET_URL) {
        return process.env.TARGET_URL;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return config.target_url || 'https://www.freejobalert.com/latest-notifications/';
}

const { spawn } = require('child_process');

/**
 * Run the scraper and return parsed JSON results with live terminal output.
 *
 * @returns {Promise<Object>} - { success: boolean, data: Array|null, error: string|null, rawOutput: string }
 */
function runScraper() {
    return new Promise((resolve) => {
        const collectorId = getCollectorId();
        const targetUrl = getTargetUrl();

        console.log(`🔄 Running scraper ${collectorId} on ${targetUrl}...`);
        console.log(`⏳ Cloud scraping initialized. Live progress will show below:`);
        console.log();

        const fullCmd = `bdata scraper run ${collectorId} "${targetUrl}" --json`;
        let stdoutData = '';
        let stderrData = '';

        const child = spawn(fullCmd, {
            shell: true,
            stdio: ['inherit', 'pipe', 'pipe']
        });

        // 10-minute timeout
        const timer = setTimeout(() => {
            child.kill();
            const msg = 'Scraper timed out after 10 minutes (Batch mode collection)';
            console.error(`\n❌ ${msg}`);
            resolve({
                success: false,
                data: null,
                error: msg,
                rawOutput: stdoutData
            });
        }, 600000);

        child.stdout.on('data', (chunk) => {
            const str = chunk.toString();
            stdoutData += str;

            // If stdout contains progress/status lines (not raw json starting with [ or {), print them live
            const trimmed = str.trim();
            if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
                process.stdout.write(str);
            }
        });

        child.stderr.on('data', (chunk) => {
            const str = chunk.toString();
            stderrData += str;
            process.stderr.write(str);
        });

        child.on('close', (code) => {
            clearTimeout(timer);

            const trimmedOutput = stdoutData.trim();

            if (!trimmedOutput) {
                return resolve({
                    success: false,
                    data: null,
                    error: stderrData || 'CLI returned empty output',
                    rawOutput: ''
                });
            }

            // Parse the JSON output (extract JSON if mixed with text)
            let data;
            try {
                // Find first '[' or '{'
                const jsonStart = trimmedOutput.search(/[{\[]/);
                const jsonString = jsonStart !== -1 ? trimmedOutput.substring(jsonStart) : trimmedOutput;
                data = JSON.parse(jsonString);
            } catch (parseError) {
                return resolve({
                    success: false,
                    data: null,
                    error: `Failed to parse CLI output as JSON: ${parseError.message}`,
                    rawOutput: trimmedOutput.substring(0, 2000)
                });
            }

            const rawRows = Array.isArray(data) ? data : (data.results || data.data || [data]);

            // Smart flattening: unpack nested job_notifications if returned by Bright Data AI
            const rows = rawRows.flatMap(item => {
                if (item && Array.isArray(item.job_notifications) && item.job_notifications.length > 0) {
                    return item.job_notifications.map(sub => ({
                        post_date: sub.post_date || item.post_date || 'Latest',
                        recruitment_board: sub.recruitment_board || item.recruitment_board || 'Govt Notification',
                        post_name: sub.post_name || item.post_name || 'Job Notification',
                        qualification: sub.qualification || item.qualification || 'Any Graduate',
                        advt_no: sub.advt_no || item.advt_no || '',
                        last_date: sub.last_date || item.last_date || 'Apply Soon',
                        detail_url: sub.detail_url || item.product_page_url || ''
                    }));
                }
                return item;
            });

            console.log(`\n✅ Scraper completed: extracted ${rows.length} job records`);

            resolve({
                success: true,
                data: rows,
                error: null,
                rawOutput: JSON.stringify(rows)
            });
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                success: false,
                data: null,
                error: `Failed to start process: ${err.message}`,
                rawOutput: ''
            });
        });
    });
}

module.exports = { runScraper, getCollectorId, getTargetUrl };
