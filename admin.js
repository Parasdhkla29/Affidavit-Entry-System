/* =====================================================================
   AFFIDAVIT ENTRY SYSTEM — admin.js
   ===================================================================== */

const $a = id => document.getElementById(id);

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.querySelector('.eye-icon').style.display     = isHidden ? 'none' : '';
  btn.querySelector('.eye-off-icon').style.display = isHidden ? ''     : 'none';
}

let allSessions   = [];   // full list for client-side filter
let searchTimer   = null;

/* =====================================================================
   INIT
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is already logged in from index.html session
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    // Not logged in — send back to main app to sign in
    window.location.href = 'index.html';
    return;
  }

  // Logged in — hide the checking screen, show dashboard
  $a('authChecking').style.display = 'none';
  showDashboard(resolveAdminUsername(user.email));
  loadSessions();

  // Auto-refresh every 10 seconds so new sessions appear without clicking Refresh
  setInterval(loadSessions, 10000);

  $a('sessionModal').addEventListener('click', e => {
    if (e.target === $a('sessionModal')) closeModal();
  });
});

/* =====================================================================
   AUTH
   ===================================================================== */
function resolveAdminUsername(email) {
  return (email || '').split('@')[0].toUpperCase();
}

function showDashboard(username) {
  const badge = $a('adminUserBadge');
  if (badge) badge.textContent = '👤 ' + username;
  $a('adminDashboard').classList.remove('hidden');
  $a('adminDashboard').style.display = 'flex';
}

async function handleLogout() {
  await db.auth.signOut();
  window.location.href = 'index.html';
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

  // RLS automatically filters to only this user's sessions via user_id = auth.uid()
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
function displayFileName(session) {
  const rawName = (session.file_name || '').trim();
  if (rawName && rawName.toLowerCase() !== '.pdf') return rawName;

  const fallbackName = (session.first_entry_name || session.second_entry_name || 'SESSION').trim();
  return `${fallbackName || 'SESSION'}.pdf`;
}

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
    const fileName    = displayFileName(s);
    const pdfBtn      = s.pdf_url
      ? `<a class="btn-dl" href="${escHtml(s.pdf_url)}" target="_blank" onclick="event.stopPropagation()">⬇ PDF</a>`
      : '<span style="color:var(--text-3);font-size:11px;">No PDF</span>';

    return `<tr onclick="viewSession('${s.id}')">
      <td class="td-num">${i + 1}</td>
      <td class="td-file" title="${escHtml(fileName)}">${escHtml(fileName)}</td>
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

  const fileName = displayFileName(session);
  $a('modalTitle').textContent = fileName || 'Session Details';
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

  const modalEntries = entries.length ? entries : [
    session.first_entry_name ? {
      serial_number: 1,
      name: session.first_entry_name,
      aadhaar_number: null,
    } : null,
    session.second_entry_name ? {
      serial_number: 2,
      name: session.second_entry_name,
      aadhaar_number: null,
    } : null,
  ].filter(Boolean);

  const entryRows = modalEntries.map(e => {
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
        <span class="meta-value">${escHtml(fileName || '—')}</span>
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
  // ── Guard: JSZip must be loaded ───────────────────────
  if (typeof JSZip === 'undefined') {
    showAdminToast('JSZip library not loaded. Check your internet connection and refresh.', 'error');
    return;
  }

  const monthVal = $a('monthSelect').value;
  if (!monthVal) { showAdminToast('Please select a month first.', 'warning'); return; }

  const sessions = getSessionsForMonth(monthVal);
  if (!sessions.length) {
    showAdminToast('No sessions found for the selected month.', 'warning');
    return;
  }

  const btn = $a('downloadZipBtn');
  btn.disabled    = true;
  btn.textContent = '⏳ Starting…';

  // Human-readable label e.g. "June_2026"
  const [year, mon] = monthVal.split('-');
  const monthLabel  = new Date(parseInt(year), parseInt(mon) - 1, 1)
    .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const safeLabel = monthLabel.replace(/\s+/g, '_');

  try {
    const zip    = new JSZip();
    const folder = zip.folder(`Affidavit_${safeLabel}`);

    // ── Step 1: Load entries from Supabase ────────────────
    btn.textContent = '⏳ Loading entries…';
    const ids = sessions.map(s => s.id);

    const { data: entries, error: entErr } = await db
      .from('affidavit_entries')
      .select('*')
      .in('session_id', ids)
      .order('serial_number', { ascending: true });

    if (entErr) console.warn('Entries fetch warning:', entErr.message);

    // ── Step 2: summary.csv ───────────────────────────────
    const csvHeader = ['SR', 'File Name', 'Date', 'First Entry', 'Second Entry', 'Total Entries', 'Status'];
    const csvRows   = sessions.map((s, i) => [
      i + 1,
      s.file_name         || '',
      formatDate(s.created_at),
      s.first_entry_name  || '',
      s.second_entry_name || '',
      s.total_entries     || 0,
      s.status            || 'SAVED',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    folder.file('summary.csv', [csvHeader.join(','), ...csvRows].join('\r\n'));

    // ── Step 3: entries_detail.csv ────────────────────────
    const detHeader = ['Session File', 'SR', 'Name', 'Aadhar Number', 'Date'];
    const detRows   = (entries || []).map(e => {
      const sess = sessions.find(s => s.id === e.session_id);
      const raw  = e.aadhaar_number || '';
      const fmt  = raw.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
      return [
        sess?.file_name || '',
        e.serial_number,
        e.name          || '',
        fmt,
        formatDate(sess?.created_at),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    folder.file('entries_detail.csv', [detHeader.join(','), ...detRows].join('\r\n'));

    // ── Step 4: Fetch each PDF ────────────────────────────
    let pdfCount = 0;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      btn.textContent = `⏳ PDF ${i + 1} / ${sessions.length}…`;

      if (!s.pdf_url) continue;

      try {
        const res = await fetch(s.pdf_url, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        folder.file(s.file_name || `session_${i + 1}.pdf`, blob);
        pdfCount++;
      } catch (fetchErr) {
        console.warn(`Could not fetch PDF "${s.file_name}":`, fetchErr.message);
        // Add a placeholder text file so user knows which PDF was missing
        folder.file(`MISSING_${s.file_name || `session_${i + 1}`}.txt`,
          `Could not download: ${s.pdf_url}\nError: ${fetchErr.message}`);
      }
    }

    // ── Step 5: Compress and download ────────────────────
    btn.textContent = '⏳ Compressing…';
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

    const url  = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `Affidavit_${safeLabel}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);

    showAdminToast(
      `✅ ZIP ready — ${pdfCount} PDF${pdfCount !== 1 ? 's' : ''} + 2 CSV files for ${monthLabel}.`,
      'success'
    );

  } catch (err) {
    console.error('ZIP export failed:', err);
    showAdminToast('Export failed: ' + (err.message || 'Unknown error'), 'error');
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
