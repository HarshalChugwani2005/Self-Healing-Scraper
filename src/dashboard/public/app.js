// ============================================================================
// app.js — Dashboard client-side logic
// ============================================================================
// Vanilla JS — fetches from the Express API, renders the panels,
// auto-refreshes every 15 seconds, and provides trigger buttons.
//
// Features:
//   - Persistent heal card expansion state across polls
//   - Client-side pagination, search filtering, and column sorting
//   - Detail modal for full record inspection (including advt_no)
//   - Hover tooltips (title) on truncated cells & wrapping for key text
//   - Skeleton loading states to prevent empty flashes
//   - Normalized date display (DD MMM YYYY)
//   - Accessibility (aria-live, aria-labels, aria-hidden for emojis)
// ============================================================================

const API_BASE = '';
let refreshInterval = null;
let countdownSeconds = 15;
let countdownTimer = null;

// Table & Data State
let cachedData = [];
let filteredData = [];
let currentPage = 1;
let pageSize = 10;
let sortColumn = 'post_date';
let sortDirection = 'desc';
let filterQuery = '';
let isInitialLoad = true;

// Heal Cards State (preserve expansion across auto-refresh)
let expandedHealCardIds = null;

// ---------- Initialization ----------

document.addEventListener('DOMContentLoaded', () => {
    setupGlobalListeners();
    renderInitialSkeletons();
    fetchAll();
    startCountdown();
});

function setupGlobalListeners() {
    // ESC key closes modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeRowModal();
        }
    });
}

function renderInitialSkeletons() {
    const latestBody = document.getElementById('latest-data-body');
    const runBody = document.getElementById('run-history-body');
    const healBody = document.getElementById('heal-events-body');

    const skeletonHtml = `
        <div class="skeleton-container" aria-label="Loading data...">
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
        </div>
    `;

    if (latestBody) {
        latestBody.classList.add('is-loading');
        latestBody.innerHTML = skeletonHtml;
    }
    if (runBody) {
        runBody.classList.add('is-loading');
        runBody.innerHTML = skeletonHtml;
    }
    if (healBody) {
        healBody.classList.add('is-loading');
        healBody.innerHTML = skeletonHtml;
    }
}

function startCountdown() {
    countdownSeconds = 15;
    updateCountdownUI();

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        countdownSeconds--;
        if (countdownSeconds <= 0) {
            countdownSeconds = 15;
            fetchAll();
        }
        updateCountdownUI();
    }, 1000);
}

function updateCountdownUI() {
    const el = document.getElementById('countdown-timer');
    if (el) {
        el.textContent = `Live • ${countdownSeconds}s`;
    }
}

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
    } finally {
        isInitialLoad = false;
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
    const body = document.getElementById('latest-data-body');
    const countBadge = document.getElementById('latest-count');

    try {
        const res = await fetch(`${API_BASE}/api/runs?limit=1`);
        const runs = await res.json();

        if (body) body.classList.remove('is-loading');

        // Find the most recent successful run
        const successRun = runs.find(r => r.status === 'success');

        if (!successRun || !successRun.raw_json) {
            cachedData = [];
            filteredData = [];
            if (body) body.innerHTML = '<div class="empty-state">No successful scrape data yet — run a scrape to begin.</div>';
            if (countBadge) countBadge.textContent = '0 rows';
            return;
        }

        const data = Array.isArray(successRun.raw_json)
            ? successRun.raw_json
            : (successRun.raw_json.results || successRun.raw_json.data || []);

        cachedData = data;
        applyFilterAndSort();
        renderTable();
    } catch (err) {
        if (body) {
            body.classList.remove('is-loading');
            body.innerHTML = `<div class="empty-state" style="color:var(--accent-red)">Failed to load data: ${escapeHtml(err.message)}</div>`;
        }
        console.error('Failed to fetch latest data:', err);
    }
}

function applyFilterAndSort() {
    let result = [...cachedData];

    // 1. Text Filter
    if (filterQuery) {
        const q = filterQuery.toLowerCase();
        result = result.filter(row => {
            const postName = String(row.post_name || '').toLowerCase();
            const board = String(row.recruitment_board || '').toLowerCase();
            const qual = String(row.qualification || '').toLowerCase();
            const advt = String(row.advt_no || '').toLowerCase();
            return postName.includes(q) || board.includes(q) || qual.includes(q) || advt.includes(q);
        });
    }

    // 2. Sorting
    if (sortColumn) {
        result.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];

            if (sortColumn === 'post_date' || sortColumn === 'last_date') {
                const dateA = parseDateForSort(valA);
                const dateB = parseDateForSort(valB);
                return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
            }

            const strA = String(valA || '').toLowerCase();
            const strB = String(valB || '').toLowerCase();
            const cmp = strA.localeCompare(strB);
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }

    filteredData = result;

    // Update count badge
    const countBadge = document.getElementById('latest-count');
    if (countBadge) {
        if (filterQuery && filteredData.length !== cachedData.length) {
            countBadge.textContent = `${filteredData.length} of ${cachedData.length} rows`;
        } else {
            countBadge.textContent = `${cachedData.length} row${cachedData.length !== 1 ? 's' : ''}`;
        }
    }
}

function renderTable() {
    const body = document.getElementById('latest-data-body');
    if (!body) return;

    if (cachedData.length === 0) {
        body.innerHTML = '<div class="empty-state">No successful scrape data yet — run a scrape to begin.</div>';
        return;
    }

    // Pagination calculations
    const totalRows = filteredData.length;
    const effectivePageSize = pageSize === 'all' ? totalRows : parseInt(pageSize, 10);
    const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(totalRows / effectivePageSize)) : 1;

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }

    const startIdx = (currentPage - 1) * effectivePageSize;
    const endIdx = effectivePageSize === totalRows ? totalRows : Math.min(startIdx + effectivePageSize, totalRows);
    const pageRows = filteredData.slice(startIdx, endIdx);

    // Build Toolbar HTML
    let html = `
        <div class="table-toolbar">
            <div class="search-box">
                <span class="search-icon" aria-hidden="true">🔍</span>
                <input
                    type="text"
                    class="search-input"
                    id="table-filter-input"
                    placeholder="Filter by post name, board, or qualification..."
                    value="${escapeHtml(filterQuery)}"
                    oninput="handleTableFilter(this.value)"
                    aria-label="Filter scraped data"
                >
                <button
                    class="btn-clear-filter"
                    id="btn-clear-filter"
                    onclick="clearTableFilter()"
                    aria-label="Clear search filter"
                    title="Clear filter"
                    style="display: ${filterQuery ? 'flex' : 'none'};"
                >✕</button>
            </div>
        </div>
    `;

    if (totalRows === 0) {
        html += `<div class="empty-state">No matching job notifications found for "<strong>${escapeHtml(filterQuery)}</strong>".</div>`;
        body.innerHTML = html;
        return;
    }

    // Sort column helper
    function renderTh(colKey, label, cssClass = '') {
        const isSorted = sortColumn === colKey;
        const activeClass = isSorted ? ' sort-active' : '';
        const sortIcon = isSorted ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ↕';
        const ariaSort = isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
        return `
            <th
                class="sortable${activeClass} ${cssClass}"
                onclick="handleSort('${colKey}')"
                aria-sort="${ariaSort}"
                title="Sort by ${label}"
                role="columnheader"
                tabindex="0"
                onkeydown="if(event.key==='Enter'||event.key===' ') handleSort('${colKey}')"
            >
                ${label}<span class="sort-indicator" aria-hidden="true">${sortIcon}</span>
            </th>
        `;
    }

    // Build Table
    html += `
        <div class="table-responsive">
            <table class="data-table" role="table">
                <thead>
                    <tr role="row">
                        ${renderTh('post_date', 'Date', 'col-date')}
                        ${renderTh('recruitment_board', 'Board', 'col-board')}
                        ${renderTh('post_name', 'Post Name', 'col-post')}
                        ${renderTh('qualification', 'Qualification', 'col-qualification')}
                        ${renderTh('last_date', 'Last Date', 'col-lastdate')}
                        <th class="col-url">Details</th>
                        <th class="col-actions" title="View full row details"><span aria-hidden="true">👁️</span></th>
                    </tr>
                </thead>
                <tbody>
    `;

    pageRows.forEach((row, pageRowIndex) => {
        const globalRowIndex = startIdx + pageRowIndex;
        const postDate = formatDateDisplay(row.post_date);
        const lastDate = formatDateDisplay(row.last_date);
        const board = row.recruitment_board || '—';
        const postName = row.post_name || '—';
        const qual = row.qualification || '—';
        const url = row.detail_url || '';

        html += `
            <tr role="row" onclick="openRowModal(${globalRowIndex})" title="Click to view full details">
                <td class="cell-date col-date" title="${escapeHtml(String(row.post_date || '—'))}">${escapeHtml(postDate)}</td>
                <td class="cell-board cell-wrap col-board" title="${escapeHtml(board)}">${escapeHtml(board)}</td>
                <td class="cell-post cell-wrap col-post" title="${escapeHtml(postName)}">${escapeHtml(postName)}</td>
                <td class="cell-qual cell-wrap col-qualification" title="${escapeHtml(qual)}">${escapeHtml(qual)}</td>
                <td class="cell-date col-lastdate" title="${escapeHtml(String(row.last_date || '—'))}">${escapeHtml(lastDate)}</td>
                <td class="url-cell col-url" onclick="event.stopPropagation()">
                    ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(url)}">${escapeHtml(truncate(url, 26))}</a>` : '—'}
                </td>
                <td class="col-actions" onclick="event.stopPropagation()">
                    <button class="btn-view-row" onclick="openRowModal(${globalRowIndex})" aria-label="View details for ${escapeHtml(postName)}" title="View details">
                        👁️
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    // Build Pagination Controls
    const displayStart = startIdx + 1;
    const displayEnd = endIdx;

    html += `
        <div class="pagination-container" role="navigation" aria-label="Data table pagination">
            <div class="pagination-info">
                Showing ${displayStart}–${displayEnd} of ${totalRows} rows
            </div>
            <div class="pagination-controls">
                <button
                    class="pagination-btn"
                    id="btn-prev-page"
                    onclick="goToPage(${currentPage - 1})"
                    ${currentPage <= 1 ? 'disabled' : ''}
                    aria-label="Previous page"
                >
                    &larr; Prev
                </button>
                <span class="pagination-page">Page ${currentPage} of ${totalPages}</span>
                <button
                    class="pagination-btn"
                    id="btn-next-page"
                    onclick="goToPage(${currentPage + 1})"
                    ${currentPage >= totalPages ? 'disabled' : ''}
                    aria-label="Next page"
                >
                    Next &rarr;
                </button>
                <select
                    class="pagination-size-select"
                    id="pagination-size-select"
                    onchange="changePageSize(this.value)"
                    aria-label="Rows per page"
                >
                    <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / page</option>
                    <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / page</option>
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / page</option>
                    <option value="all" ${pageSize === 'all' ? 'selected' : ''}>All rows</option>
                </select>
            </div>
        </div>
    `;

    body.innerHTML = html;
}

// Table Handlers
function handleTableFilter(val) {
    filterQuery = (val || '').trim();
    currentPage = 1;
    applyFilterAndSort();
    renderTable();

    // Maintain input focus and cursor position after re-rendering
    const input = document.getElementById('table-filter-input');
    if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

function clearTableFilter() {
    filterQuery = '';
    currentPage = 1;
    applyFilterAndSort();
    renderTable();
}

function handleSort(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = column.includes('date') ? 'desc' : 'asc';
    }
    applyFilterAndSort();
    renderTable();
}

function goToPage(page) {
    currentPage = page;
    renderTable();
}

function changePageSize(size) {
    pageSize = size === 'all' ? 'all' : parseInt(size, 10);
    currentPage = 1;
    renderTable();
}

// ---------- Detail Modal ----------

function openRowModal(rowIndex) {
    const row = filteredData[rowIndex];
    if (!row) return;

    const modal = document.getElementById('row-detail-modal');
    const modalBody = document.getElementById('modal-row-body');
    if (!modal || !modalBody) return;

    const postDate = formatDateDisplay(row.post_date);
    const lastDate = formatDateDisplay(row.last_date);
    const rawPostDate = row.post_date ? String(row.post_date) : '—';
    const rawLastDate = row.last_date ? String(row.last_date) : '—';

    modalBody.innerHTML = `
        <div class="modal-field">
            <div class="modal-field-label">Post Name / Title</div>
            <div class="modal-field-value" style="font-weight: 600; font-size: 0.95rem;">${escapeHtml(row.post_name || '—')}</div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Recruitment Board</div>
            <div class="modal-field-value highlight-board">${escapeHtml(row.recruitment_board || '—')}</div>
        </div>

        <div class="modal-grid-2">
            <div class="modal-field">
                <div class="modal-field-label">Post Date</div>
                <div class="modal-field-value highlight-date">
                    ${escapeHtml(postDate)}
                    ${postDate !== rawPostDate && rawPostDate !== '—' ? `<span style="color:var(--text-muted);font-size:0.75rem;"> (Raw: ${escapeHtml(rawPostDate)})</span>` : ''}
                </div>
            </div>
            <div class="modal-field">
                <div class="modal-field-label">Last Date (Deadline)</div>
                <div class="modal-field-value highlight-date">
                    ${escapeHtml(lastDate)}
                    ${lastDate !== rawLastDate && rawLastDate !== '—' ? `<span style="color:var(--text-muted);font-size:0.75rem;"> (Raw: ${escapeHtml(rawLastDate)})</span>` : ''}
                </div>
            </div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Advertisement No. (Advt No)</div>
            <div class="modal-field-value highlight-advt">${escapeHtml(row.advt_no || 'None specified')}</div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Qualification Required</div>
            <div class="modal-field-value">${escapeHtml(row.qualification || '—')}</div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Detail URL</div>
            <div class="modal-field-value">
                ${row.detail_url
                    ? `<a href="${escapeHtml(row.detail_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.detail_url)}</a>`
                    : '<span style="color:var(--text-muted)">No URL provided</span>'
                }
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeRowModal() {
    const modal = document.getElementById('row-detail-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function handleModalBackdropClick(event) {
    if (event.target.id === 'row-detail-modal') {
        closeRowModal();
    }
}

// ---------- Run History Timeline ----------

async function fetchRunHistory() {
    const body = document.getElementById('run-history-body');

    try {
        const res = await fetch(`${API_BASE}/api/runs?limit=30`);
        const runs = await res.json();

        if (body) body.classList.remove('is-loading');

        if (!body) return;

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
                    <div class="timeline-icon ${statusClass}" aria-hidden="true">${statusIcon}</div>
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
        if (body) {
            body.classList.remove('is-loading');
            body.innerHTML = `<div class="empty-state" style="color:var(--accent-red)">Failed to load run history: ${escapeHtml(err.message)}</div>`;
        }
        console.error('Failed to fetch run history:', err);
    }
}

// ---------- Self-Healing Events (Preserving Card State) ----------

async function fetchHealEvents() {
    const body = document.getElementById('heal-events-body');
    const countBadge = document.getElementById('heal-count');

    try {
        const res = await fetch(`${API_BASE}/api/heal-events`);
        const events = await res.json();

        if (body) body.classList.remove('is-loading');

        if (countBadge) {
            countBadge.textContent = `${events.length} event${events.length !== 1 ? 's' : ''}`;
        }

        if (!body) return;

        if (events.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    No heal events yet.<br>
                    Click <strong>"Simulate Break"</strong> to trigger a demo heal cycle.
                </div>
            `;
            return;
        }

        // Initialize expanded set on first load with the first item open
        if (expandedHealCardIds === null) {
            expandedHealCardIds = new Set();
            if (events.length > 0) {
                expandedHealCardIds.add(events[0].id);
            }
        }

        let html = '';
        events.forEach((event) => {
            const isVerified = event.verified;
            const isApproved = event.approved;
            const isExpanded = expandedHealCardIds.has(event.id);

            html += `
                <div class="heal-card${isExpanded ? ' expanded' : ''}" id="heal-card-${event.id}" onclick="toggleHealCard(${event.id})">
                    <div class="heal-card-header" role="button" aria-expanded="${isExpanded}" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();toggleHealCard(${event.id});}">
                        <div class="heal-card-header-left">
                            <span class="heal-number">#${event.id}</span>
                            <div>
                                <div class="heal-card-title">
                                    ${isVerified ? '✅ Healed & Verified' : isApproved ? '⚠️ Approved (Unverified)' : '🔄 Heal Attempted'}
                                </div>
                                <div class="heal-card-time">${formatTime(event.timestamp)} — Run #${event.run_id}</div>
                            </div>
                        </div>
                        <span class="heal-expand-icon" aria-hidden="true">▼</span>
                    </div>
                    <div class="heal-card-body" onclick="event.stopPropagation()">
                        <div class="heal-steps">
                            <!-- Step 1: Detected Break -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-detect">1</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label"><span aria-hidden="true">🔍</span> Break Detected</div>
                                    <div class="heal-step-value">${escapeHtml(truncate(event.failure_description, 300))}</div>
                                </div>
                            </div>

                            <!-- Step 2: Generated Heal Prompt -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-prompt">2</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label"><span aria-hidden="true">💬</span> Heal Prompt Sent</div>
                                    <div class="code-block">${escapeHtml(event.heal_prompt)}</div>
                                </div>
                            </div>

                            <!-- Step 3: Preview / Diff -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-preview">3</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label"><span aria-hidden="true">📄</span> Preview Result</div>
                                    <div class="code-block">${formatPreview(event.preview_result)}</div>
                                </div>
                            </div>

                            <!-- Step 4: Approval -->
                            <div class="heal-step">
                                <div class="heal-step-marker step-approve">4</div>
                                <div class="heal-step-content">
                                    <div class="heal-step-label"><span aria-hidden="true">✅</span> Approval</div>
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
                                    <div class="heal-step-label"><span aria-hidden="true">🔀</span> Before / After Comparison</div>
                                    <div class="diff-container">
                                        <div class="diff-column diff-before">
                                            <div class="diff-header"><span aria-hidden="true">❌</span> Before (Broken)</div>
                                            <div class="diff-body">${formatSnapshot(event.before_snapshot)}</div>
                                        </div>
                                        <div class="diff-column diff-after">
                                            <div class="diff-header"><span aria-hidden="true">${isVerified ? '✅' : '❓'}</span> After (${isVerified ? 'Fixed' : 'Pending'})</div>
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
        if (body) {
            body.classList.remove('is-loading');
            body.innerHTML = `<div class="empty-state" style="color:var(--accent-red)">Failed to load heal events: ${escapeHtml(err.message)}</div>`;
        }
        console.error('Failed to fetch heal events:', err);
    }
}

function toggleHealCard(id) {
    if (!expandedHealCardIds) expandedHealCardIds = new Set();

    const card = document.getElementById(`heal-card-${id}`);
    if (card) {
        const isNowExpanded = card.classList.toggle('expanded');
        const header = card.querySelector('.heal-card-header');
        if (header) header.setAttribute('aria-expanded', isNowExpanded);

        if (isNowExpanded) {
            expandedHealCardIds.add(id);
        } else {
            expandedHealCardIds.delete(id);
        }
    } else {
        if (expandedHealCardIds.has(id)) {
            expandedHealCardIds.delete(id);
        } else {
            expandedHealCardIds.add(id);
        }
    }
}

// ---------- Action Handlers ----------

async function triggerRun() {
    const btn = document.getElementById('btn-trigger-run');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running...';

    // Show loading indicator on panels
    const latestBody = document.getElementById('latest-data-body');
    const runBody = document.getElementById('run-history-body');
    if (latestBody) latestBody.classList.add('is-loading');
    if (runBody) runBody.classList.add('is-loading');

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
        btn.innerHTML = '<span class="btn-icon" aria-hidden="true">▶</span> Run Scrape';
        fetchAll();
    }
}

async function simulateBreak() {
    const btn = document.getElementById('btn-simulate-break');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Simulating...';

    const healBody = document.getElementById('heal-events-body');
    const runBody = document.getElementById('run-history-body');
    if (healBody) healBody.classList.add('is-loading');
    if (runBody) runBody.classList.add('is-loading');

    try {
        showToast('💥 Simulating scraper break...', 'info');
        const res = await fetch(`${API_BASE}/api/simulate-break`, { method: 'POST' });
        const data = await res.json();

        if (data.ok) {
            showToast('🔧 Break simulated! Check the Self-Healing Events panel.', 'success');
            // Ensure the newly triggered heal card gets expanded
            if (data.healEventId) {
                if (!expandedHealCardIds) expandedHealCardIds = new Set();
                expandedHealCardIds.add(data.healEventId);
            }
        } else {
            showToast(`❌ Simulation failed: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast(`❌ Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon" aria-hidden="true">💥</span> Simulate Break';
        fetchAll();
    }
}

// ---------- UI & Formatting Helpers ----------

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

/**
 * Normalizes dates to consistent "DD MMM YYYY" format (e.g. "18 Aug 2026").
 * Also cleans any rogue HTML tags like '<span class="dt">...</span>'.
 */
function formatDateDisplay(dateStr) {
    if (!dateStr) return '—';
    const cleanStr = String(dateStr).replace(/<[^>]*>/g, '').trim();
    if (!cleanStr || cleanStr === '—') return '—';

    // 1. Match DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1], 10);
        const month = parseInt(ddmmyyyy[2], 10) - 1;
        const year = parseInt(ddmmyyyy[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
    }

    // 2. Match YYYY-MM-DD or YYYY/MM/DD
    const yyyymmdd = cleanStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (yyyymmdd) {
        const year = parseInt(yyyymmdd[1], 10);
        const month = parseInt(yyyymmdd[2], 10) - 1;
        const day = parseInt(yyyymmdd[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
    }

    // 3. Fallback generic Date parse
    const genericDate = new Date(cleanStr);
    if (!isNaN(genericDate.getTime()) && genericDate.getFullYear() > 1990) {
        return genericDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    return cleanStr;
}

function parseDateForSort(dateStr) {
    if (!dateStr) return 0;
    const cleanStr = String(dateStr).replace(/<[^>]*>/g, '').trim();
    if (!cleanStr || cleanStr === '—') return 0;

    const ddmmyyyy = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1], 10);
        const month = parseInt(ddmmyyyy[2], 10) - 1;
        const year = parseInt(ddmmyyyy[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d.getTime();
    }

    const d = new Date(cleanStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
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
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function truncate(str, len) {
    if (!str) return '';
    const s = String(str);
    return s.length > len ? s.substring(0, len) + '...' : s;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ---------- Toast Notifications ----------

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span aria-hidden="true">${icon}</span><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ---------- Data Export (CSV & JSON) ----------

function exportData(format) {
    if (!cachedData || cachedData.length === 0) {
        showToast('No scraped data available to export yet', 'error');
        return;
    }

    const exportList = filteredData.length > 0 ? filteredData : cachedData;
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `freejobalert-notifications-${dateStr}.${format}`;

    if (format === 'json') {
        const jsonStr = JSON.stringify(exportList, null, 2);
        downloadFile(jsonStr, filename, 'application/json');
        showToast(`📥 Exported ${exportList.length} records to JSON`, 'success');
    } else if (format === 'csv') {
        const fields = ['post_date', 'recruitment_board', 'post_name', 'qualification', 'advt_no', 'last_date', 'detail_url'];
        const headers = ['Post Date', 'Recruitment Board', 'Post Name', 'Qualification', 'Advt No', 'Last Date', 'Detail URL'];

        let csvContent = headers.join(',') + '\n';
        exportList.forEach(row => {
            const values = fields.map(field => {
                let val = (row[field] || '').toString().replace(/"/g, '""');
                return `"${val}"`;
            });
            csvContent += values.join(',') + '\n';
        });

        downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
        showToast(`📥 Exported ${exportList.length} records to CSV`, 'success');
    }
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
