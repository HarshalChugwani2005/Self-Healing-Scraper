// ============================================================================
// app.js — Dashboard client-side logic
// ============================================================================
// Vanilla JS — fetches from the Express API, renders the 4 panels,
// auto-refreshes every 15 seconds, and provides trigger buttons.
//
// No framework, no build step — just paste and go.
// ============================================================================

const API_BASE = '';
let refreshInterval = null;

// ---------- Initialization ----------

document.addEventListener('DOMContentLoaded', () => {
    fetchAll();
    // Auto-refresh every 15 seconds
    refreshInterval = setInterval(fetchAll, 15000);
});

async function fetchAll() {
    try {
        await Promise.all([
            fetchStats(),
            fetchLatestData(),
            fetchRunHistory(),
            fetchHealEvents()
        ]);
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

// ---------- Stats ----------

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/api/stats`);
        const stats = await res.json();

        setText('stat-total-val', stats.total_runs || 0);

        const successRate = stats.total_runs > 0
            ? Math.round((stats.success_count / stats.total_runs) * 100)
            : 0;
        setText('stat-success-val', `${successRate}%`);

        setText('stat-heals-val', stats.total_heals || 0);
        setText('stat-verified-val', stats.verified_heals || 0);

        if (stats.last_run) {
            setText('stat-lastrun-val', formatTime(stats.last_run));
        }
    } catch (err) {
        console.error('Failed to fetch stats:', err);
    }
}

// ---------- Latest Scraped Data ----------

async function fetchLatestData() {
    try {
        const res = await fetch(`${API_BASE}/api/runs?limit=1`);
        const runs = await res.json();

        const body = document.getElementById('latest-data-body');
        const countBadge = document.getElementById('latest-count');

        // Find the most recent successful run
        const successRun = runs.find(r => r.status === 'success');

        if (!successRun || !successRun.raw_json) {
            body.innerHTML = '<div class="empty-state">No successful scrape data yet — run a scrape to begin.</div>';
            countBadge.textContent = '0 rows';
            return;
        }

        const data = Array.isArray(successRun.raw_json)
            ? successRun.raw_json
            : (successRun.raw_json.results || successRun.raw_json.data || []);

        countBadge.textContent = `${data.length} rows`;

        if (data.length === 0) {
            body.innerHTML = '<div class="empty-state">Scrape returned 0 rows.</div>';
            return;
        }

        // Build the data table
        const fields = ['post_date', 'recruitment_board', 'post_name', 'qualification', 'last_date', 'detail_url'];
        const headers = ['Date', 'Board', 'Post Name', 'Qualification', 'Last Date', 'Details'];

        let html = '<table class="data-table"><thead><tr>';
        headers.forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';

        data.slice(0, 25).forEach(row => {
            html += '<tr>';
            fields.forEach(field => {
                const val = row[field] || '—';
                if (field === 'detail_url' && val !== '—') {
                    html += `<td class="url-cell"><a href="${escapeHtml(val)}" target="_blank" rel="noopener">${truncate(val, 30)}</a></td>`;
                } else {
                    html += `<td>${escapeHtml(truncate(String(val), 50))}</td>`;
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table>';

        if (data.length > 25) {
            html += `<div style="text-align:center;padding:10px;color:var(--text-muted);font-size:0.8rem;">Showing 25 of ${data.length} rows</div>`;
        }

        body.innerHTML = html;
    } catch (err) {
        console.error('Failed to fetch latest data:', err);
    }
}

// ---------- Run History Timeline ----------

async function fetchRunHistory() {
    try {
        const res = await fetch(`${API_BASE}/api/runs?limit=30`);
        const runs = await res.json();

        const body = document.getElementById('run-history-body');

        if (runs.length === 0) {
            body.innerHTML = '<div class="empty-state">No runs yet.</div>';
            return;
        }

        let html = '';
        runs.forEach(run => {
            const statusIcon = getStatusIcon(run.status);
            const statusClass = getStatusClass(run.status);
            const statusBadge = getStatusBadge(run.status);

            html += `
                <div class="timeline-item">
                    <div class="timeline-icon ${statusClass}">${statusIcon}</div>
                    <div class="timeline-content">
                        <div class="timeline-title">
                            Run #${run.id} ${statusBadge}
                            <span style="color:var(--text-muted);font-weight:400;"> — ${run.row_count} rows</span>
                        </div>
                        <div class="timeline-meta">${formatTime(run.timestamp)}</div>
                        ${run.error_message ? `<div class="timeline-error">${escapeHtml(truncate(run.error_message, 150))}</div>` : ''}
                    </div>
                </div>
            `;
        });

        body.innerHTML = html;
    } catch (err) {
        console.error('Failed to fetch run history:', err);
    }
}

// ---------- Self-Healing Events (The Money Panel) ----------

async function fetchHealEvents() {
    try {
        const res = await fetch(`${API_BASE}/api/heal-events`);
        const events = await res.json();

        const body = document.getElementById('heal-events-body');
        const countBadge = document.getElementById('heal-count');
        countBadge.textContent = `${events.length} event${events.length !== 1 ? 's' : ''}`;

        if (events.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    No heal events yet.<br>
                    Click <strong>"Simulate Break"</strong> to trigger a demo heal cycle.
                </div>
            `;
            return;
        }

        let html = '';
        events.forEach((event, index) => {
            const isVerified = event.verified;
            const isApproved = event.approved;

            html += `
                <div class="heal-card${index === 0 ? ' expanded' : ''}" id="heal-card-${event.id}" onclick="toggleHealCard(${event.id})">
                    <div class="heal-card-header">
                        <div class="heal-card-header-left">
                            <span class="heal-number">#${event.id}</span>
                            <div>
                                <div class="heal-card-title">
                                    ${isVerified ? '✅ Healed & Verified' : isApproved ? '⚠️ Approved (Unverified)' : '🔄 Heal Attempted'}
                                </div>
                                <div class="heal-card-time">${formatTime(event.timestamp)} — Run #${event.run_id}</div>
                            </div>
                        </div>
                        <span class="heal-expand-icon">▼</span>
                    </div>
                    <div class="heal-card-body">
                        <div class="heal-steps">
                            <!-- Step 1: Detected Break -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-detect">1</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label">🔍 Break Detected</div>
                                    <div class="heal-step-value">${escapeHtml(truncate(event.failure_description, 300))}</div>
                                </div>
                            </div>

                            <!-- Step 2: Generated Heal Prompt -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-prompt">2</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label">💬 Heal Prompt Sent</div>
                                    <div class="code-block">${escapeHtml(event.heal_prompt)}</div>
                                </div>
                            </div>

                            <!-- Step 3: Preview / Diff -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-preview">3</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label">📄 Preview Result</div>
                                    <div class="code-block">${formatPreview(event.preview_result)}</div>
                                </div>
                            </div>

                            <!-- Step 4: Approval -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-approve">4</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label">✅ Approval</div>
                                    <div class="heal-step-value">
                                        ${isApproved
                                            ? '<span class="badge badge-success">Approved</span>'
                                            : '<span class="badge badge-fail">Not Approved</span>'
                                        }
                                    </div>
                                </div>
                            </div>

                            <!-- Step 5: Before / After Diff -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-verify">5</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label">🔀 Before / After Comparison</div>
                                    <div class="diff-container">
                                        <div class="diff-column diff-before">
                                            <div class="diff-header">❌ Before (Broken)</div>
                                            <div class="diff-body">${formatSnapshot(event.before_snapshot)}</div>
                                        </div>
                                        <div class="diff-column diff-after">
                                            <div class="diff-header">${isVerified ? '✅' : '❓'} After (${isVerified ? 'Fixed' : 'Pending'})</div>
                                            <div class="diff-body">${formatSnapshot(event.after_snapshot)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        body.innerHTML = html;
    } catch (err) {
        console.error('Failed to fetch heal events:', err);
    }
}

// ---------- Action Handlers ----------

async function triggerRun() {
    const btn = document.getElementById('btn-trigger-run');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running...';

    try {
        showToast('🔄 Triggering scrape...', 'info');
        const res = await fetch(`${API_BASE}/api/trigger-run`, { method: 'POST' });
        const data = await res.json();

        if (data.ok) {
            showToast(`✅ Scrape complete: ${data.result.status}`, 'success');
        } else {
            showToast(`❌ Scrape failed: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast(`❌ Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">▶</span> Run Scrape';
        fetchAll();
    }
}

async function simulateBreak() {
    const btn = document.getElementById('btn-simulate-break');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Simulating...';

    try {
        showToast('💥 Simulating scraper break...', 'info');
        const res = await fetch(`${API_BASE}/api/simulate-break`, { method: 'POST' });
        const data = await res.json();

        if (data.ok) {
            showToast('🔧 Break simulated! Check the Self-Healing Events panel.', 'success');
        } else {
            showToast(`❌ Simulation failed: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast(`❌ Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">💥</span> Simulate Break';
        fetchAll();
    }
}

// ---------- UI Helpers ----------

function toggleHealCard(id) {
    const card = document.getElementById(`heal-card-${id}`);
    if (card) {
        card.classList.toggle('expanded');
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'success': return '✅';
        case 'validation_failed': return '❌';
        case 'error': return '⚠️';
        default: return '❓';
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'success': return 'success';
        case 'validation_failed': return 'fail';
        case 'error': return 'error';
        default: return '';
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'success': return '<span class="badge badge-success">Success</span>';
        case 'validation_failed': return '<span class="badge badge-fail">Validation Failed</span>';
        case 'error': return '<span class="badge badge-error">Error</span>';
        default: return '';
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '—';
    try {
        const d = new Date(timestamp.includes('T') ? timestamp : timestamp + 'Z');
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;

        return d.toLocaleString('en-IN', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
            hour12: false
        });
    } catch {
        return timestamp;
    }
}

function formatPreview(preview) {
    if (!preview) return '<span style="color:var(--text-muted)">No preview available</span>';
    if (typeof preview === 'string') return escapeHtml(preview);
    return escapeHtml(JSON.stringify(preview, null, 2));
}

function formatSnapshot(snapshot) {
    if (!snapshot) return '<span style="color:var(--text-muted)">No data</span>';
    if (typeof snapshot === 'string') {
        try {
            const parsed = JSON.parse(snapshot);
            return escapeHtml(JSON.stringify(parsed, null, 2));
        } catch {
            return escapeHtml(snapshot);
        }
    }
    return escapeHtml(JSON.stringify(snapshot, null, 2));
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ---------- Toast Notifications ----------

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
