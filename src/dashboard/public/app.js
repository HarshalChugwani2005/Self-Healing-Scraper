// ============================================================================
// app.js — Pipeline Console & Data Workbench Logic
// ============================================================================
// Real-time monitoring for FreeJobAlert scraper pipeline,
// data validation telemetry, and automated schema repairs.
// ============================================================================

const API_BASE = '';
let refreshInterval = null;
let countdownSeconds = 15;
let countdownTimer = null;

// Table & Filter State
let cachedData = [];
let filteredData = [];
let currentPage = 1;
let pageSize = 10;
let sortColumn = 'post_date';
let sortDirection = 'desc';
let filterQuery = '';
let activeFilterChip = 'all';
let isInitialLoad = true;
let modalTrigger = null;

// Auto-Recovery Inspector State
let cachedHealEvents = [];
let selectedHealEventId = null;

// ---------- SVG Icon Helper ----------
function getSvgIcon(name, customClass = '') {
    const cls = customClass ? ` ${customClass}` : '';
    const baseStyle = 'width:14px;height:14px;display:inline-block;vertical-align:middle;flex-shrink:0;';
    switch (name) {
        case 'check':
            return `<svg class="btn-icon${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        case 'check-circle':
            return `<svg class="btn-icon${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        case 'x-circle':
            return `<svg class="btn-icon${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        case 'alert-triangle':
            return `<svg class="btn-icon${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        case 'search':
            return `<svg class="search-icon-svg${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
        case 'eye':
            return `<svg class="btn-icon${cls}" style="width:13px;height:13px;display:inline-block;vertical-align:middle;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
        case 'external-link':
            return `<svg class="btn-icon${cls}" style="width:11px;height:11px;display:inline-block;vertical-align:middle;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
        case 'chevron-down':
            return `<svg class="heal-chevron-svg${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
        case 'sort':
            return `<svg class="sort-indicator-svg${cls}" style="width:11px;height:11px;display:inline-block;vertical-align:middle;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`;
        case 'sort-asc':
            return `<svg class="sort-indicator-svg${cls}" style="width:11px;height:11px;display:inline-block;vertical-align:middle;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><line x1="12" y1="19" x2="12" y2="5"/></svg>`;
        case 'sort-desc':
            return `<svg class="sort-indicator-svg${cls}" style="width:11px;height:11px;display:inline-block;vertical-align:middle;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 12-7 7-7-7"/><line x1="12" y1="5" x2="12" y2="19"/></svg>`;
        case 'info':
            return `<svg class="btn-icon${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        case 'shield':
            return `<svg class="btn-icon${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
        case 'wrench':
            return `<svg class="btn-icon${cls}" style="${baseStyle}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
        default:
            return '';
    }
}

// ---------- Initialization ----------
document.addEventListener('DOMContentLoaded', () => {
    setupGlobalListeners();
    renderInitialSkeletons();
    fetchAll();
    startCountdown();
});

function setupGlobalListeners() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeRowModal();
        }

        const modal = document.getElementById('row-detail-modal');
        if (e.key === 'Tab' && modal && modal.style.display !== 'none') {
            const focusable = modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });
}

function renderInitialSkeletons() {
    const latestBody = document.getElementById('latest-data-body');
    const runBody = document.getElementById('run-history-body');
    const healBody = document.getElementById('heal-events-body');

    const skeletonHtml = `
        <div class="skeleton-container" aria-label="Loading pipeline data...">
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
        </div>
    `;

    if (latestBody && !cachedData.length) latestBody.innerHTML = skeletonHtml;
    if (runBody && !runBody.children.length) runBody.innerHTML = skeletonHtml;
    if (healBody && !healBody.children.length) healBody.innerHTML = skeletonHtml;
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
        el.textContent = `Syncing in ${countdownSeconds}s`;
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
        console.error('Pipeline data sync error:', err);
    } finally {
        isInitialLoad = false;
        setText('last-updated', `Updated ${formatTime(new Date().toISOString())}`);
    }
}

// ---------- Telemetry Stats ----------
async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/api/stats`);
        const stats = await res.json();

        setText('stat-total-val', stats.total_runs || 0);

        const successRate = stats.total_runs > 0
            ? Math.round((stats.success_count / stats.total_runs) * 100)
            : 100;
        setText('stat-success-val', `${successRate}%`);

        setText('stat-heals-val', stats.total_heals || 0);
        setText('stat-verified-val', stats.verified_heals || 0);

        if (stats.last_run) {
            setText('stat-lastrun-val', formatTime(stats.last_run));
        } else {
            setText('stat-lastrun-val', 'None');
        }
    } catch (err) {
        console.error('Failed to fetch pipeline stats:', err);
    }
}

// ---------- Ingested Scraped Data ----------
async function fetchLatestData() {
    const body = document.getElementById('latest-data-body');
    const countBadge = document.getElementById('latest-count');

    try {
        const res = await fetch(`${API_BASE}/api/runs?limit=50`);
        const runs = await res.json();

        if (!Array.isArray(runs) || runs.length === 0) {
            cachedData = [];
            filteredData = [];
            if (body) body.innerHTML = '<div class="empty-state">No pipeline runs recorded yet. Click "Run Ingestion" to begin.</div>';
            if (countBadge) countBadge.textContent = '0 records';
            return;
        }

        const latestSuccessfulRun = runs.find(r => r.status === 'success' && r.raw_json && (Array.isArray(r.raw_json) ? r.raw_json.length > 0 : true));

        if (!latestSuccessfulRun || !latestSuccessfulRun.raw_json) {
            cachedData = [];
            filteredData = [];
            if (body) body.innerHTML = '<div class="empty-state">No successful scrape data found. Click "Run Ingestion" to fetch notifications.</div>';
            if (countBadge) countBadge.textContent = '0 records';
            return;
        }

        const data = Array.isArray(latestSuccessfulRun.raw_json)
            ? latestSuccessfulRun.raw_json
            : (latestSuccessfulRun.raw_json.results || latestSuccessfulRun.raw_json.data || []);

        cachedData = data;
        applyFilterAndSort();
        renderTable();
    } catch (err) {
        if (body) {
            body.innerHTML = `<div class="empty-state" style="color:var(--rose)">Failed to load data: ${escapeHtml(err.message)}</div>`;
        }
        console.error('Failed to fetch data:', err);
    }
}

function applyFilterAndSort() {
    let result = [...cachedData];

    if (activeFilterChip !== 'all') {
        const chip = activeFilterChip.toLowerCase();
        result = result.filter(row => {
            const board = String(row.recruitment_board || '').toLowerCase();
            const post = String(row.post_name || '').toLowerCase();
            const qual = String(row.qualification || '').toLowerCase();
            if (chip === 'bank') return board.includes('bank') || board.includes('sbi') || board.includes('ibps');
            if (chip === 'tech') return board.includes('drdo') || board.includes('bhel') || qual.includes('engg') || qual.includes('degree') || qual.includes('diploma');
            if (chip === 'psc') return board.includes('court') || board.includes('psc') || board.includes('upsc') || board.includes('ssc');
            if (chip === 'apprentice') return post.includes('apprentice') || qual.includes('iti');
            return true;
        });
    }

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

    const countBadge = document.getElementById('latest-count');
    if (countBadge) {
        if ((filterQuery || activeFilterChip !== 'all') && filteredData.length !== cachedData.length) {
            countBadge.textContent = `${filteredData.length} of ${cachedData.length} records`;
        } else {
            countBadge.textContent = `${cachedData.length} record${cachedData.length !== 1 ? 's' : ''}`;
        }
    }
}

function renderTable() {
    const body = document.getElementById('latest-data-body');
    if (!body) return;

    const filterHadFocus = document.activeElement?.id === 'table-filter-input';

    if (cachedData.length === 0) {
        body.innerHTML = '<div class="empty-state">No scraped data available. Trigger an ingestion run to fetch notifications.</div>';
        return;
    }

    const totalRows = filteredData.length;
    const effectivePageSize = pageSize === 'all' ? totalRows : parseInt(pageSize, 10);
    const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(totalRows / effectivePageSize)) : 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * effectivePageSize;
    const endIdx = effectivePageSize === totalRows ? totalRows : Math.min(startIdx + effectivePageSize, totalRows);
    const pageRows = filteredData.slice(startIdx, endIdx);

    let html = `
        <div class="table-toolbar-wrapper">
            <div class="table-toolbar">
                <div class="search-box">
                    ${getSvgIcon('search')}
                    <input
                        type="text"
                        class="search-input"
                        id="table-filter-input"
                        placeholder="Search positions, boards, qualifications..."
                        value="${escapeHtml(filterQuery)}"
                        oninput="handleTableFilter(this.value)"
                        aria-label="Filter job notifications"
                    >
                    <button
                        class="btn-clear-filter"
                        id="btn-clear-filter"
                        onclick="clearTableFilter()"
                        aria-label="Clear filter"
                        style="display: ${filterQuery ? 'flex' : 'none'};"
                    >&times;</button>
                </div>
            </div>
            <div class="filter-preset-chips">
                <button class="chip-filter ${activeFilterChip === 'all' ? 'active' : ''}" onclick="setFilterChip('all')">All Records</button>
                <button class="chip-filter ${activeFilterChip === 'bank' ? 'active' : ''}" onclick="setFilterChip('bank')">Banking / Finance</button>
                <button class="chip-filter ${activeFilterChip === 'tech' ? 'active' : ''}" onclick="setFilterChip('tech')">Engineering / Tech</button>
                <button class="chip-filter ${activeFilterChip === 'psc' ? 'active' : ''}" onclick="setFilterChip('psc')">Courts & PSC</button>
                <button class="chip-filter ${activeFilterChip === 'apprentice' ? 'active' : ''}" onclick="setFilterChip('apprentice')">Apprenticeships</button>
            </div>
        </div>
    `;

    if (totalRows === 0) {
        html += `<div class="empty-state">No matching job records found for current filters.</div>`;
        body.innerHTML = html;
        return;
    }

    function renderTh(colKey, label, cssClass = '') {
        const isSorted = sortColumn === colKey;
        const activeClass = isSorted ? ' sort-active' : '';
        const sortIcon = isSorted ? (sortDirection === 'asc' ? getSvgIcon('sort-asc') : getSvgIcon('sort-desc')) : getSvgIcon('sort');
        const ariaSort = isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
        return `
            <th
                class="sortable${activeClass} ${cssClass}"
                onclick="handleSort('${colKey}')"
                aria-sort="${ariaSort}"
                role="columnheader"
                tabindex="0"
                onkeydown="if(event.key==='Enter'||event.key===' ') handleSort('${colKey}')"
            >
                ${label}${sortIcon}
            </th>
        `;
    }

    html += `
        <div class="table-responsive">
            <table class="data-table" role="table">
                <thead>
                    <tr role="row">
                        ${renderTh('post_date', 'Posted', 'col-post-date')}
                        ${renderTh('recruitment_board', 'Board / Org', 'col-recruitment-board')}
                        ${renderTh('post_name', 'Position / Post Name', 'col-post-title')}
                        ${renderTh('qualification', 'Eligibility', 'col-eligibility')}
                        ${renderTh('last_date', 'Deadline', 'col-last-date')}
                        <th class="col-source-url">Source</th>
                        <th class="col-inspect-btn" title="Inspect Record"></th>
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
            <tr role="row" tabindex="0" onclick="openRowModal(${globalRowIndex})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openRowModal(${globalRowIndex})}">
                <td class="cell-date col-post-date" title="${escapeHtml(String(row.post_date || '—'))}">${escapeHtml(postDate)}</td>
                <td class="cell-board col-recruitment-board" title="${escapeHtml(board)}">${escapeHtml(board)}</td>
                <td class="cell-post col-post-title" title="${escapeHtml(postName)}">${escapeHtml(postName)}</td>
                <td class="cell-qual col-eligibility" title="${escapeHtml(qual)}">${escapeHtml(qual)}</td>
                <td class="cell-date col-last-date" title="${escapeHtml(String(row.last_date || '—'))}">${escapeHtml(lastDate)}</td>
                <td class="col-source-url" onclick="event.stopPropagation()">
                    ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(url)}">Link ${getSvgIcon('external-link')}</a>` : '—'}
                </td>
                <td class="col-inspect-btn" onclick="event.stopPropagation()">
                    <button class="btn-view-row" onclick="openRowModal(${globalRowIndex})" aria-label="View record details" title="View details">
                        ${getSvgIcon('eye')}
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

    const displayStart = totalRows === 0 ? 0 : startIdx + 1;
    const displayEnd = endIdx;

    html += `
        <div class="pagination-container" role="navigation" aria-label="Data table pagination">
            <div class="pagination-info">
                Showing <strong class="pagination-num">${displayStart}–${displayEnd}</strong> of <strong class="pagination-num">${totalRows}</strong> records
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
                <div class="pagination-page-badge">
                    <span>Page</span>
                    <span class="pagination-page-current">${currentPage}</span>
                    <span class="pagination-page-divider">/</span>
                    <span class="pagination-page-total">${totalPages}</span>
                </div>
                <button
                    class="pagination-btn"
                    id="btn-next-page"
                    onclick="goToPage(${currentPage + 1})"
                    ${currentPage >= totalPages ? 'disabled' : ''}
                    aria-label="Next page"
                >
                    Next &rarr;
                </button>
                <div class="pagination-select-wrap">
                    <select
                        class="pagination-size-select"
                        id="pagination-size-select"
                        onchange="changePageSize(this.value)"
                        aria-label="Rows per page"
                    >
                        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / page</option>
                        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / page</option>
                        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / page</option>
                        <option value="all" ${pageSize === 'all' ? 'selected' : ''}>All</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    body.innerHTML = html;

    if (filterHadFocus) {
        const input = document.getElementById('table-filter-input');
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }
}

function setFilterChip(chip) {
    activeFilterChip = chip;
    currentPage = 1;
    applyFilterAndSort();
    renderTable();
}

function handleTableFilter(val) {
    filterQuery = (val || '').trim();
    currentPage = 1;
    applyFilterAndSort();
    renderTable();

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

function handleSort(colKey) {
    if (sortColumn === colKey) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = colKey;
        sortDirection = 'asc';
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

// ---------- Row Modal Inspector ----------
function openRowModal(index) {
    const row = filteredData[index];
    if (!row) return;

    const modal = document.getElementById('row-detail-modal');
    const body = document.getElementById('modal-row-body');
    if (!modal || !body) return;

    const postDate = formatDateDisplay(row.post_date);
    const lastDate = formatDateDisplay(row.last_date);

    body.innerHTML = `
        <div class="modal-field">
            <div class="modal-field-label">Position / Post Name</div>
            <div class="modal-field-value" style="font-weight:600;font-size:0.95rem;color:#38bdf8;">${escapeHtml(row.post_name || '—')}</div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Recruitment Board / Organization</div>
            <div class="modal-field-value">${escapeHtml(row.recruitment_board || '—')}</div>
        </div>

        <div class="modal-grid-2">
            <div class="modal-field">
                <div class="modal-field-label">Date of Notification</div>
                <div class="modal-field-value">${escapeHtml(postDate)}</div>
            </div>
            <div class="modal-field">
                <div class="modal-field-label">Application Deadline</div>
                <div class="modal-field-value">${escapeHtml(lastDate)}</div>
            </div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Advertisement ID / Notice Number</div>
            <div class="modal-field-value">${escapeHtml(row.advt_no || 'Not specified')}</div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Eligibility / Educational Qualifications</div>
            <div class="modal-field-value">${escapeHtml(row.qualification || '—')}</div>
        </div>

        <div class="modal-field">
            <div class="modal-field-label">Official Listing Source URL</div>
            <div class="modal-field-value">
                ${row.detail_url
                    ? `<a href="${escapeHtml(row.detail_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.detail_url)}</a>`
                    : '<span style="color:var(--text-muted)">No URL provided</span>'
                }
            </div>
        </div>
    `;

    modalTrigger = document.activeElement;
    modal.style.display = 'flex';
    const closeBtn = modal.querySelector('.btn-close-modal');
    if (closeBtn) closeBtn.focus();
}

function closeRowModal() {
    const modal = document.getElementById('row-detail-modal');
    if (modal) {
        modal.style.display = 'none';
        if (modalTrigger && typeof modalTrigger.focus === 'function') {
            modalTrigger.focus();
        }
        modalTrigger = null;
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
        const res = await fetch(`${API_BASE}/api/runs?limit=25`);
        const runs = await res.json();

        if (!body) return;

        if (runs.length === 0) {
            body.innerHTML = '<div class="empty-state">No pipeline history recorded yet.</div>';
            return;
        }

        let html = '';
        runs.forEach(run => {
            const isSuccess = run.status === 'success';
            const isHealed = run.status === 'validation_failed';
            const statusClass = isSuccess ? 'success' : isHealed ? 'fail' : 'error';
            const statusLabel = isSuccess ? 'Schema Verified' : isHealed ? 'Anomaly Detected' : 'Error / Timeout';
            const statusIcon = isSuccess ? getSvgIcon('check') : isHealed ? getSvgIcon('wrench') : getSvgIcon('alert-triangle');

            html += `
                <div class="timeline-item">
                    <div class="timeline-status-icon ${statusClass}">
                        ${statusIcon}
                    </div>
                    <div class="timeline-content">
                        <div class="timeline-header-line">
                            <div class="timeline-title">Run #${run.id}</div>
                            <span class="badge-status ${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="timeline-details">
                            Extracted <strong>${run.row_count || 0}</strong> job notifications &bull;
                            <span class="timeline-meta">${formatTime(run.timestamp)}</span>
                        </div>
                        ${run.error_message ? `<div class="timeline-error-box">${escapeHtml(truncate(run.error_message, 180))}</div>` : ''}
                    </div>
                </div>
            `;
        });

        body.innerHTML = html;
    } catch (err) {
        if (body) {
            body.innerHTML = `<div class="empty-state" style="color:var(--rose)">Failed to load timeline: ${escapeHtml(err.message)}</div>`;
        }
        console.error('Failed to fetch run history:', err);
    }
}

// ---------- Auto-Recovery & Schema Repair Inspector (Right Column) ----------
async function fetchHealEvents() {
    const body = document.getElementById('heal-events-body');
    const countBadge = document.getElementById('heal-count');

    try {
        const res = await fetch(`${API_BASE}/api/heal-events?limit=20`);
        const events = await res.json();

        cachedHealEvents = Array.isArray(events) ? events : [];

        if (countBadge) {
            countBadge.textContent = `${cachedHealEvents.length} recovery events`;
        }

        if (!body) return;

        if (cachedHealEvents.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                    <p><strong>All extraction selectors are healthy.</strong></p>
                    <p class="empty-sub">Click <strong>"Simulate Schema Drift"</strong> to test automated recovery.</p>
                </div>
            `;
            return;
        }

        // Set default selected event (latest verified or latest event)
        if (!selectedHealEventId || !cachedHealEvents.some(e => e.id === selectedHealEventId)) {
            const firstVerified = cachedHealEvents.find(e => e.verified);
            selectedHealEventId = firstVerified ? firstVerified.id : cachedHealEvents[0].id;
        }

        renderHealInspector();
    } catch (err) {
        if (body) {
            body.innerHTML = `<div class="empty-state" style="color:var(--rose)">Failed to load recovery events: ${escapeHtml(err.message)}</div>`;
        }
        console.error('Failed to fetch heal events:', err);
    }
}

function selectHealEvent(id) {
    selectedHealEventId = id;
    renderHealInspector();
}

function renderHealInspector() {
    const body = document.getElementById('heal-events-body');
    if (!body || cachedHealEvents.length === 0) return;

    const currentEvent = cachedHealEvents.find(e => e.id === selectedHealEventId) || cachedHealEvents[0];
    const isVerified = Boolean(currentEvent.verified);
    const previewObj = typeof currentEvent.preview_result === 'object' && currentEvent.preview_result !== null ? currentEvent.preview_result : {};
    const selectorsMap = previewObj.selectors || null;

    let html = `
        <div class="heal-inspector-container">
            <!-- Event Tabs Selector Strip -->
            <div class="heal-event-tabs" role="tablist" aria-label="Recovery event tabs">
    `;

    cachedHealEvents.forEach(e => {
        const isActive = e.id === currentEvent.id;
        const eVerified = Boolean(e.verified);
        html += `
            <button
                class="heal-event-tab-btn ${isActive ? 'active' : ''}"
                role="tab"
                aria-selected="${isActive}"
                onclick="selectHealEvent(${e.id})"
                title="Event #${e.id} (${eVerified ? 'Verified' : 'Anomaly'})"
            >
                <span class="heal-tab-dot ${eVerified ? 'verified' : 'unverified'}"></span>
                <span>#${e.id}</span>
                ${isActive ? `<span style="font-size:0.65rem;opacity:0.8;">(${eVerified ? 'Verified' : 'Anomaly'})</span>` : ''}
            </button>
        `;
    });

    html += `
            </div>

            <!-- Active Selected Event Card -->
            <div class="heal-detail-card">
                <div class="heal-detail-header">
                    <div class="heal-detail-title-group">
                        <span class="heal-detail-id">Event #${currentEvent.id}</span>
                        <span class="badge-status ${isVerified ? 'success' : 'error'}">
                            ${isVerified ? '✓ Verified Patch Applied' : '⚠ Selector Anomaly Diagnosed'}
                        </span>
                    </div>
                    <div class="heal-detail-time">
                        ${formatTime(currentEvent.timestamp)} &bull; Run #${currentEvent.run_id}
                    </div>
                </div>

                <div class="heal-detail-body">
                    <div class="repair-steps">
                        <!-- Step 1: Diagnostics -->
                        <div class="repair-step">
                            <div class="repair-step-num">1</div>
                            <div class="repair-step-content">
                                <div class="repair-step-header">
                                    <div class="repair-step-title">
                                        ${getSvgIcon('alert-triangle')} Anomaly Diagnostics
                                    </div>
                                </div>
                                <div class="repair-step-desc">${escapeHtml(currentEvent.failure_description || 'Selector schema mismatch detected.')}</div>
                            </div>
                        </div>

                        <!-- Step 2: Selector Re-alignment -->
                        <div class="repair-step">
                            <div class="repair-step-num">2</div>
                            <div class="repair-step-content">
                                <div class="repair-step-header">
                                    <div class="repair-step-title">
                                        ${getSvgIcon('wrench')} Selector Re-alignment
                                    </div>
                                </div>
                                ${selectorsMap ? `
                                    <div class="selector-map-grid">
                                        ${Object.entries(selectorsMap).map(([field, selector]) => `
                                            <div class="selector-map-item">
                                                <span class="selector-field-name">${escapeHtml(field)}</span>
                                                <span class="selector-css-rule">${escapeHtml(selector)}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="repair-step-desc" style="font-family:var(--font-mono);font-size:0.7rem;">
                                        ${escapeHtml(truncate(currentEvent.heal_prompt, 200))}
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- Step 3: Verification Check -->
                        <div class="repair-step">
                            <div class="repair-step-num">3</div>
                            <div class="repair-step-content">
                                <div class="repair-step-header">
                                    <div class="repair-step-title">
                                        ${getSvgIcon('shield')} Verification Test Results
                                    </div>
                                    <span class="badge-status ${isVerified ? 'success' : 'error'}">
                                        ${isVerified ? '100% Passed' : 'Pending Verification'}
                                    </span>
                                </div>
                                <div class="repair-step-desc">
                                    ${isVerified
                                        ? 'Target schema validated successfully. All mandatory fields extracted without data loss.'
                                        : (previewObj.error ? `Status: ${escapeHtml(previewObj.error)}` : 'Schema patch generated — awaiting verification run.')
                                    }
                                </div>
                            </div>
                        </div>

                        <!-- Step 4: Before / After Data Diff -->
                        <div class="repair-step">
                            <div class="repair-step-num">4</div>
                            <div class="repair-step-content">
                                <div class="repair-step-header">
                                    <div class="repair-step-title">Data Snapshot Comparison</div>
                                </div>
                                <div class="diff-grid">
                                    <div class="diff-panel diff-panel-broken">
                                        <div class="diff-panel-title">Before (Broken Extraction)</div>
                                        <div class="diff-panel-content">${formatSnapshot(currentEvent.before_snapshot)}</div>
                                    </div>
                                    <div class="diff-panel diff-panel-fixed">
                                        <div class="diff-panel-title">After (${isVerified ? 'Repaired & Validated' : 'Pending'})</div>
                                        <div class="diff-panel-content">${currentEvent.after_snapshot ? formatSnapshot(currentEvent.after_snapshot) : 'Pending next pipeline execution'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    body.innerHTML = html;
}

// ---------- Action Handlers ----------
async function triggerRun() {
    const btn = document.getElementById('btn-trigger-run');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running Pipeline...';

    try {
        showToast('Initiating scraper execution...', 'info');
        const res = await fetch(`${API_BASE}/api/trigger-run`, { method: 'POST' });
        const data = await res.json();

        if (data.ok) {
            showToast(`Ingestion complete: ${data.result.status}`, 'success');
        } else {
            showToast(`Pipeline execution failed: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast(`Execution error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
            <span>Run Ingestion</span>
        `;
        fetchAll();
    }
}

async function simulateBreak() {
    if (!window.confirm('Trigger a simulated DOM shift test to observe automated schema recovery?')) {
        return;
    }

    const btn = document.getElementById('btn-simulate-break');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Simulating Drift...';

    try {
        showToast('Simulating selector drift & triggering auto-recovery...', 'info');
        const res = await fetch(`${API_BASE}/api/simulate-break`, { method: 'POST' });
        const data = await res.json();

        if (data.ok) {
            showToast('Recovery cycle executed successfully. Schema restored.', 'success');
            if (data.healEventId) {
                selectedHealEventId = data.healEventId;
            }
        } else {
            showToast(`Simulation failed: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast(`Simulation error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Simulate Schema Drift</span>
        `;
        fetchAll();
    }
}

// ---------- Formatting Helpers ----------
function formatDateDisplay(dateStr) {
    if (!dateStr) return '—';
    const cleanStr = String(dateStr).replace(/<[^>]*>/g, '').trim();
    if (!cleanStr || cleanStr === '—') return '—';

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

function formatSnapshot(snapshot) {
    if (!snapshot) return 'No snapshot data';
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

// ---------- Toasts ----------
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    const icon = type === 'success' ? getSvgIcon('check-circle') : type === 'error' ? getSvgIcon('x-circle') : getSvgIcon('info');
    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toast-out 0.2s ease forwards';
        setTimeout(() => toast.remove(), 200);
    }, 4500);
}

// ---------- Export Data ----------
function exportData(format) {
    if (!cachedData || cachedData.length === 0) {
        showToast('No dataset available to export yet', 'error');
        return;
    }

    const exportList = filteredData.length > 0 ? filteredData : cachedData;
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `job-notifications-${dateStr}.${format}`;

    if (format === 'json') {
        const jsonStr = JSON.stringify(exportList, null, 2);
        downloadFile(jsonStr, filename, 'application/json');
        showToast(`Exported ${exportList.length} records to JSON`, 'success');
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
        showToast(`Exported ${exportList.length} records to CSV`, 'success');
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
