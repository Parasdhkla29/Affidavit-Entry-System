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

  const fallbackName = (session.second_entry_name || session.first_entry_name || 'SESSION').trim();
  return `${fallbackName || 'SESSION'}.pdf`;
}

const sessionEntriesCache = new Map();

function normalizeArchivedName(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function formatArchivedPrintName(value) {
  return normalizeArchivedName(value)
    .split(' ')
    .map(word => `<span class="name-word">${escHtml(word)}</span>`)
    .join('');
}

function fallbackSessionEntries(session) {
  return [
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
}

async function loadSessionEntries(session) {
  if (sessionEntriesCache.has(session.id)) return sessionEntriesCache.get(session.id);

  const { data, error } = await db
    .from('affidavit_entries')
    .select('*')
    .eq('session_id', session.id)
    .order('serial_number');

  if (error) throw error;

  const entries = data?.length ? data : fallbackSessionEntries(session);
  sessionEntriesCache.set(session.id, entries);
  return entries;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the saved session photo.'));
    reader.readAsDataURL(blob);
  });
}

async function loadSessionPhoto(session) {
  if (!session.photo_url) return '';

  const response = await fetch(session.photo_url, { mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load session photo (HTTP ${response.status}).`);
  return blobToDataUrl(await response.blob());
}

function archivedSessionDate(session) {
  const date = session.created_at ? new Date(session.created_at) : new Date();
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

function generateArchivedPrintHTML(session, entries, photoDataUrl) {
  const fmtAadhaar = value => (value || '').replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  const rows = entries.map((entry, index) => {
    const serial = Number(entry.serial_number) || index + 1;
    const aadhaarCell = (serial === 1 && !entry.aadhaar_number)
      ? ''
      : fmtAadhaar(entry.aadhaar_number);
    const roleText = serial === 1
      ? '<div class="role">Advocate/Numberdar/Sarpanch/Panch</div>'
      : '';

    return `<tr class="${serial === 1 ? 'row-first' : ''}">
      <td class="td-sr">${serial}</td>
      <td class="td-name"><strong>${formatArchivedPrintName(entry.name)}</strong>${roleText}</td>
      <td class="td-aadh">${escHtml(aadhaarCell)}</td>
      <td class="td-sig"></td>
    </tr>`;
  }).join('');

  const photoHtml = photoDataUrl
    ? `<img class="photo" src="${photoDataUrl}" alt="Photo">`
    : '<div class="photo photo-empty"></div>';

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<title>${escHtml(displayFileName(session))}</title>
<style>
  @font-face {
    font-family: 'NotoDevanagari';
    src: url('data:font/truetype;base64,${window._DEV_FONT_B64 || ''}') format('truetype');
    font-weight: normal;
  }
  @font-face {
    font-family: 'NotoDevanagari';
    src: url('data:font/truetype;base64,${window._DEV_FONT_B64 || ''}') format('truetype');
    font-weight: bold;
  }
  @page { size: A4 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-size: 11pt; background: #fff; }
  body {
    font-family: 'NotoDevanagari', 'Nirmala UI', 'Mangal', sans-serif;
    font-size: 11pt; line-height: 1.35; color: #000;
    width: 210mm; height: 297mm; overflow: hidden; position: relative;
    padding: 32mm 12mm 12mm; background: #fff;
  }
  .photo {
    display: block; width: 150mm; height: 65mm;
    object-fit: cover; margin: 0 auto 4mm;
  }
  .photo-empty { background: #fff; }
  .centre-line { text-align: center; font-size: 8pt; color: #333; margin-bottom: 10mm; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  thead th, tbody td { font-size: 11pt; line-height: 1.35; }
  .td-name strong { font-size: 11pt; font-weight: bold; }
  .name-word { display: inline-block; }
  .name-word + .name-word { margin-left: 0.35em; }
  thead th {
    text-align: left; font-weight: bold; padding: 0 2mm 2mm 0;
    border-bottom: 0.6pt solid #000;
  }
  .td-sr   { width: 10mm; padding: 2.5mm 1mm; vertical-align: top; }
  .td-name { width: 72mm; padding: 2.5mm 2mm; vertical-align: top; }
  .td-aadh { width: 48mm; padding: 2.5mm 2mm; vertical-align: top; letter-spacing: 0.5pt; }
  .td-sig  { width: 48mm; padding: 2.5mm 0 2.5mm 2mm; vertical-align: bottom; }
  tbody .td-sig::after {
    content: ''; display: block; width: 44mm; max-width: 100%;
    border-bottom: 0.5pt solid #000; margin-left: auto;
  }
  .role { font-size: 8pt; font-style: italic; font-weight: normal; margin-top: 1.5mm; }
  .row-first td { padding-bottom: 5mm; }
  .footer-line {
    position: absolute; bottom: 10mm; left: 14mm; right: 14mm;
    border-bottom: 0.7pt solid #000;
  }
</style>
</head>
<body>
  ${photoHtml}
  <p class="centre-line">${archivedSessionDate(session)} / SARAL CENTRE NILOKHERI</p>
  <table>
    <thead>
      <tr>
        <th class="td-sr">SR.</th>
        <th class="td-name">NAME</th>
        <th class="td-aadh">AADHAR NUMBER</th>
        <th class="td-sig">SIGNATURE</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer-line"></div>
</body>
</html>`;
}

async function waitForArchivedPrintDocument(doc) {
  if (doc.fonts?.ready) await doc.fonts.ready;

  await Promise.all(Array.from(doc.images || []).map(image => {
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }));
}

async function renderArchivedPdfBlob(session, entries) {
  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    throw new Error('PDF renderer is not loaded. Refresh the admin portal and try again.');
  }

  const photoDataUrl = await loadSessionPhoto(session);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    const printDoc = iframe.contentDocument;
    printDoc.open();
    printDoc.write(generateArchivedPrintHTML(session, entries, photoDataUrl));
    printDoc.close();
    await waitForArchivedPrintDocument(printDoc);

    const canvas = await html2canvas(printDoc.body, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      width: printDoc.body.scrollWidth,
      height: printDoc.body.scrollHeight,
      windowWidth: printDoc.documentElement.scrollWidth,
      windowHeight: printDoc.documentElement.scrollHeight,
    });

    const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const imageHeight = Math.min(297, canvas.height * 210 / canvas.width);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, imageHeight);
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

async function buildUpdatedPdfBlob(session, entries = null) {
  const sessionEntries = entries || await loadSessionEntries(session);
  return renderArchivedPdfBlob(session, sessionEntries);
}

function savePdfBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function downloadUpdatedPdf(sessionId, button) {
  const session = allSessions.find(item => item.id === sessionId);
  if (!session) return;

  const originalText = button?.textContent || 'PDF';
  if (button) {
    button.disabled = true;
    button.textContent = 'Preparing...';
  }

  try {
    const blob = await buildUpdatedPdfBlob(session);
    savePdfBlob(blob, displayFileName(session));
    showAdminToast('Updated PDF downloaded.', 'success');
  } catch (error) {
    console.error('Updated PDF generation failed:', error);
    showAdminToast('PDF generation failed: ' + (error.message || 'Unknown error'), 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
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
    const pdfBtn      = s.photo_url
      ? `<button class="btn-dl" onclick="event.stopPropagation();downloadUpdatedPdf('${s.id}', this)">⬇ PDF</button>`
      : '<span style="color:var(--text-3);font-size:11px;">No photo</span>';

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

  if (entries?.length) sessionEntriesCache.set(sessionId, entries);

  const photoHtml = session.photo_url
    ? `<img class="modal-photo" src="${escHtml(session.photo_url)}" alt="Session photo">`
    : '<p style="color:var(--text-3);text-align:center;">No photo available.</p>';

  const pdfLink = session.photo_url
    ? `<button class="btn-dl" onclick="downloadUpdatedPdf('${session.id}', this)">Download updated PDF</button>`
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
      ${session.photo_url
        ? `<button class="btn-dl" onclick="downloadUpdatedPdf('${session.id}', this)">⬇ Download Updated PDF</button>`
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

    // ── Step 4: Regenerate each PDF with the current print template ──
    let pdfCount = 0;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      btn.textContent = `⏳ PDF ${i + 1} / ${sessions.length}…`;

      try {
        const sessionEntries = (entries || []).filter(entry => entry.session_id === s.id);
        const printableEntries = sessionEntries.length ? sessionEntries : fallbackSessionEntries(s);
        sessionEntriesCache.set(s.id, printableEntries);

        const blob = await buildUpdatedPdfBlob(s, printableEntries);
        folder.file(displayFileName(s) || `session_${i + 1}.pdf`, blob);
        pdfCount++;
      } catch (pdfError) {
        const fileName = displayFileName(s) || `session_${i + 1}.pdf`;
        console.warn(`Could not regenerate PDF "${fileName}":`, pdfError.message);
        folder.file(`MISSING_${fileName}.txt`,
          `Could not regenerate this PDF.\nError: ${pdfError.message}`);
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
