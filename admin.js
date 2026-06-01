/* =====================================================================
   AFFIDAVIT ENTRY SYSTEM — admin.js
   ===================================================================== */

const $a = id => document.getElementById(id);

let allSessions   = [];   // full list for client-side filter
let searchTimer   = null;

/* =====================================================================
   INIT
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Check existing session
  const { data: { user } } = await db.auth.getUser();
  if (user) {
    showDashboard();
    loadSessions();
  } else {
    showLoginScreen();
  }

  // Allow Enter key on login form
  $a('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  $a('loginEmail').addEventListener('keydown', e => {
    if (e.key === 'Enter') $a('loginPassword').focus();
  });

  // Close modal on overlay click
  $a('sessionModal').addEventListener('click', e => {
    if (e.target === $a('sessionModal')) closeModal();
  });
});

/* ── Auth state listener ────────────────────────────────────────────── */
db.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') showLoginScreen();
});

/* =====================================================================
   AUTH
   ===================================================================== */
function showLoginScreen() {
  $a('loginScreen').classList.remove('hidden');
  $a('loginScreen').style.display = 'flex';
  $a('adminDashboard').classList.add('hidden');
  $a('adminDashboard').style.display = 'none';
}

function showDashboard() {
  $a('loginScreen').classList.add('hidden');
  $a('loginScreen').style.display = 'none';
  $a('adminDashboard').classList.remove('hidden');
  $a('adminDashboard').style.display = 'flex';
}

async function handleLogin() {
  const email    = $a('loginEmail').value.trim();
  const password = $a('loginPassword').value;

  if (!email || !password) {
    showLoginError('Please enter your email and password.');
    return;
  }

  const btn = $a('loginBtn');
  btn.disabled     = true;
  btn.textContent  = 'Signing in…';
  $a('loginError').classList.add('hidden');

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showLoginError(error.message || 'Login failed. Check your credentials.');
    btn.disabled    = false;
    btn.textContent = 'Sign In';
    return;
  }

  showDashboard();
  loadSessions();
}

async function handleLogout() {
  await db.auth.signOut();
  showLoginScreen();
  allSessions = [];
}

function showLoginError(msg) {
  const el = $a('loginError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* =====================================================================
   DATA LOADING
   ===================================================================== */
async function loadSessions() {
  $a('sessionsBody').innerHTML = `
    <tr><td colspan="8" class="admin-loading">Loading records…</td></tr>`;
  $a('tableFooter').textContent = 'Loading…';

  const { data, error } = await db
    .from('affidavit_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    $a('sessionsBody').innerHTML = `
      <tr><td colspan="8" class="admin-loading" style="color:#fca5a5;">
        Failed to load records: ${escHtml(error.message)}
      </td></tr>`;
    $a('tableFooter').textContent = 'Error loading data.';
    return;
  }

  allSessions = data || [];
  updateStats(allSessions);
  applyFilters(); // respects any active search/date filter
}

function updateStats(sessions) {
  $a('statTotal').textContent = sessions.length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = sessions.filter(s => s.created_at?.startsWith(todayStr)).length;
  $a('statToday').textContent = todayCount;

  const totalEntries = sessions.reduce((sum, s) => sum + (s.total_entries || 0), 0);
  $a('statEntries').textContent = totalEntries;
}

/* ── Search + Date Filter ───────────────────────────────────────────── */

// Returns the local date string (YYYY-MM-DD) for a UTC ISO timestamp
function sessionLocalDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD
}

function onFilterChange() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 250);
}

function setTodayFilter() {
  $a('dateFilter').value = new Date().toLocaleDateString('en-CA');
  applyFilters();
}

function clearFilters() {
  $a('searchInput').value = '';
  $a('dateFilter').value  = '';
  applyFilters();
}

function applyFilters() {
  const q = $a('searchInput').value.trim().toLowerCase();
  const d = $a('dateFilter').value; // YYYY-MM-DD or ''

  let result = allSessions;

  if (q) {
    result = result.filter(s =>
      (s.file_name         || '').toLowerCase().includes(q) ||
      (s.first_entry_name  || '').toLowerCase().includes(q) ||
      (s.second_entry_name || '').toLowerCase().includes(q)
    );
  }

  if (d) {
    result = result.filter(s => sessionLocalDate(s.created_at) === d);
  }

  // Show / hide the clear button
  const hasFilter = q || d;
  $a('clearFiltersBtn').classList.toggle('hidden', !hasFilter);

  renderSessionsTable(result);
}

/* ── Render table ───────────────────────────────────────────────────── */
function renderSessionsTable(sessions) {
  if (!sessions.length) {
    $a('sessionsBody').innerHTML = `
      <tr><td colspan="8">
        <div class="admin-empty">
          <p>No records found.</p>
          <small>Try a different search term or check that sessions have been saved.</small>
        </div>
      </td></tr>`;
    $a('tableFooter').textContent = 'No records found.';
    return;
  }

  $a('tableFooter').textContent = `Showing ${sessions.length} record${sessions.length !== 1 ? 's' : ''}`;

  $a('sessionsBody').innerHTML = sessions.map((s, i) => {
    const statusClass = s.status === 'SAVED' ? 'saved' : 'failed';
    const dateStr     = formatDate(s.created_at);
    const pdfBtn      = s.pdf_url
      ? `<a class="btn-dl" href="${escHtml(s.pdf_url)}" target="_blank" onclick="event.stopPropagation()">⬇ PDF</a>`
      : '<span style="color:var(--text-3);font-size:11px;">No PDF</span>';

    return `<tr onclick="viewSession('${s.id}')">
      <td class="td-num">${i + 1}</td>
      <td class="td-file" title="${escHtml(s.file_name || '')}">${escHtml(s.file_name || '—')}</td>
      <td class="td-date">${dateStr}</td>
      <td class="td-name">${escHtml(s.first_entry_name || '—')}</td>
      <td class="td-name">${escHtml(s.second_entry_name || '—')}</td>
      <td class="td-count">${s.total_entries ?? '—'}</td>
      <td><span class="status-pill ${statusClass}">${s.status || 'SAVED'}</span></td>
      <td>
        <div class="admin-actions" onclick="event.stopPropagation()">
          <button class="btn-view" onclick="viewSession('${s.id}')">👁 View</button>
          ${pdfBtn}
          <button class="btn-del" title="Delete" onclick="deleteSession('${s.id}','${escHtml(s.pdf_path||'')}','${escHtml(s.photo_path||'')}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* =====================================================================
   SESSION DETAIL MODAL
   ===================================================================== */
async function viewSession(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  $a('modalTitle').textContent = session.file_name || 'Session Details';
  $a('modalBody').innerHTML    = '<p style="color:var(--text-2);text-align:center;padding:40px;">Loading entries…</p>';
  $a('sessionModal').classList.remove('hidden');

  // Load entries
  const { data: entries, error } = await db
    .from('affidavit_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('serial_number');

  if (error) {
    $a('modalBody').innerHTML = `<p style="color:#fca5a5;">Failed to load entries: ${escHtml(error.message)}</p>`;
    return;
  }

  const photoHtml = session.photo_url
    ? `<img class="modal-photo" src="${escHtml(session.photo_url)}" alt="Session photo">`
    : '<p style="color:var(--text-3);text-align:center;">No photo available.</p>';

  const pdfLink = session.pdf_url
    ? `<a href="${escHtml(session.pdf_url)}" target="_blank">Open / Download PDF ↗</a>`
    : '—';

  const entryRows = entries.map(e => {
    const raw = e.aadhaar_number || '';
    const aadhaarDisplay = raw
      ? raw.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')
      : '—';
    return `<tr>
      <td style="color:var(--text-3);width:36px;">${e.serial_number}</td>
      <td style="font-weight:600;">${escHtml(e.name)}</td>
      <td style="color:var(--text-2);letter-spacing:.5px;font-variant-numeric:tabular-nums;">${escHtml(aadhaarDisplay)}</td>
    </tr>`;
  }).join('');

  $a('modalBody').innerHTML = `
    ${photoHtml}

    <div class="modal-meta">
      <div class="meta-item">
        <span class="meta-label">File Name</span>
        <span class="meta-value">${escHtml(session.file_name || '—')}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Created</span>
        <span class="meta-value">${formatDate(session.created_at)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Status</span>
        <span class="meta-value">
          <span class="status-pill ${session.status === 'SAVED' ? 'saved' : 'failed'}">${session.status || 'SAVED'}</span>
        </span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Total Entries</span>
        <span class="meta-value">${session.total_entries ?? entries.length}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">PDF</span>
        <span class="meta-value">${pdfLink}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">First Entry</span>
        <span class="meta-value">${escHtml(session.first_entry_name || '—')}</span>
      </div>
    </div>

    <div>
      <p style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--text-3);margin-bottom:10px;">Recorded Entries</p>
      <table class="modal-entries-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Aadhaar Number</th>
          </tr>
        </thead>
        <tbody>${entryRows}</tbody>
      </table>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${session.pdf_url
        ? `<a class="btn-dl" href="${escHtml(session.pdf_url)}" target="_blank">⬇ Download PDF</a>`
        : ''}
      <button class="btn-del" style="width:auto;padding:8px 16px;font-size:12px;"
        onclick="deleteSession('${session.id}','${escHtml(session.pdf_path||'')}','${escHtml(session.photo_path||'')}');closeModal();">
        🗑 Delete Session
      </button>
    </div>`;
}

function closeModal() {
  $a('sessionModal').classList.add('hidden');
}

/* =====================================================================
   DELETE SESSION
   ===================================================================== */
async function deleteSession(sessionId, pdfPath, photoPath) {
  if (!confirm('Delete this session and all its records? This cannot be undone.')) return;

  // Remove storage files (ignore errors — files may not exist)
  if (pdfPath)   await db.storage.from('affidavit-pdfs').remove([pdfPath]);
  if (photoPath) await db.storage.from('affidavit-photos').remove([photoPath]);

  const { error } = await db.from('affidavit_sessions').delete().eq('id', sessionId);

  if (error) {
    showAdminToast('Failed to delete session: ' + error.message, 'error');
    return;
  }

  showAdminToast('Session deleted.', 'success');
  loadSessions();
}

/* =====================================================================
   MONTHLY EXPORT
   ===================================================================== */
function onMonthSelect() {
  const val = $a('monthSelect').value; // "2026-06"
  const btn  = $a('downloadZipBtn');
  const prev = $a('monthPreview');

  if (!val) {
    btn.disabled = true;
    prev.classList.add('hidden');
    return;
  }

  // Count sessions for selected month from already-loaded data
  const sessions = getSessionsForMonth(val);
  $a('monthCount').textContent = sessions.length;
  prev.classList.remove('hidden');

  btn.disabled = sessions.length === 0;
}

function getSessionsForMonth(monthVal) {
  // monthVal = "YYYY-MM"
  return allSessions.filter(s => {
    if (!s.created_at) return false;
    const d = new Date(s.created_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}` === monthVal;
  });
}

async function downloadMonthlyZip() {
  const monthVal = $a('monthSelect').value;
  if (!monthVal) return;

  const sessions = getSessionsForMonth(monthVal);
  if (!sessions.length) {
    showAdminToast('No sessions found for selected month.', 'warning');
    return;
  }

  const btn = $a('downloadZipBtn');
  btn.disabled = true;

  // Human-readable month label e.g. "June 2026"
  const [year, month] = monthVal.split('-');
  const monthLabel = new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const safeLabel = monthLabel.replace(/\s+/g, '_');

  try {
    const zip     = new JSZip();
    const folder  = zip.folder(`Affidavit_${safeLabel}`);

    // ── 1. Fetch all entries for CSV ──────────────────────
    btn.textContent = '⏳ Loading entries…';
    const sessionIds = sessions.map(s => s.id);
    const { data: allEntries } = await db
      .from('affidavit_entries')
      .select('*')
      .in('session_id', sessionIds)
      .order('session_id,serial_number');

    // ── 2. Build summary CSV ──────────────────────────────
    const csvLines = [
      'SR,File Name,Date,First Entry,Second Entry,Total Entries,Status'
    ];
    sessions.forEach((s, i) => {
      csvLines.push([
        i + 1,
        s.file_name        || '',
        formatDate(s.created_at),
        s.first_entry_name  || '',
        s.second_entry_name || '',
        s.total_entries     || 0,
        s.status            || 'SAVED'
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    folder.file('summary.csv', csvLines.join('\r\n'));

    // ── 3. Detailed entries CSV ───────────────────────────
    const entryLines = [
      'Session File,SR,Name,Aadhar Number,Date'
    ];
    (allEntries || []).forEach(e => {
      const sess = sessions.find(s => s.id === e.session_id);
      const raw  = e.aadhaar_number || '';
      const fmt  = raw.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
      entryLines.push([
        sess?.file_name      || '',
        e.serial_number,
        e.name               || '',
        fmt                  || '',
        formatDate(sess?.created_at)
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    folder.file('entries_detail.csv', entryLines.join('\r\n'));

    // ── 4. Fetch PDFs ─────────────────────────────────────
    let done = 0;
    for (const s of sessions) {
      btn.textContent = `⏳ Downloading PDFs ${done}/${sessions.length}…`;
      if (!s.pdf_url) { done++; continue; }
      try {
        const res  = await fetch(s.pdf_url);
        const blob = await res.blob();
        const name = s.file_name || `session_${s.id}.pdf`;
        folder.file(name, blob);
      } catch (e) {
        console.warn('PDF fetch failed for', s.file_name, e);
      }
      done++;
    }

    // ── 5. Generate and trigger download ──────────────────
    btn.textContent = '⏳ Compressing…';
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url     = URL.createObjectURL(zipBlob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `Affidavit_${safeLabel}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    showAdminToast(`ZIP downloaded — ${done} PDFs + 2 CSV files for ${monthLabel}.`, 'success');

  } catch (err) {
    console.error('ZIP export error:', err);
    showAdminToast('Export failed: ' + err.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = '⬇ Download ZIP';
  }
}

/* =====================================================================
   HELPERS
   ===================================================================== */
function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch { return iso; }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let adminToastTimer = null;
function showAdminToast(msg, type = 'info') {
  const el = $a('adminToast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(adminToastTimer);
  adminToastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}
