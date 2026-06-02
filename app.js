/* =====================================================================
   AFFIDAVIT ENTRY SYSTEM — app.js
   ===================================================================== */

/* ── State ──────────────────────────────────────────────────────────── */
const state = {
  sessionPhoto: null,
  photoLocked:  false,
  editingIndex: null,
  cameraStream: null,
  currentUser:  null,   // logged-in Supabase user
};

const persons = [];  // { name: string, aadhaar: string }

/* ── DOM refs ───────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const nameInput    = () => $('nameInput');
const aadhaarInput = () => $('aadhaarInput');

/* =====================================================================
   WELCOME — LOGIN + TRANSITION
   ===================================================================== */

// Check if already logged in (Supabase persists sessions automatically)
async function checkExistingSession() {
  const { data: { user } } = await db.auth.getUser();
  if (user) {
    state.currentUser = user;
    showWelcomeLoggedIn(resolveUsername(user.email));
  }
}

async function loginAndStart() {
  const username = $('welcomeUsername').value.trim().toLowerCase();
  const password = $('welcomePassword').value;

  if (!username || !password) {
    showWelcomeError('Please enter your username and password.');
    return;
  }

  // Build email: "paras" → "paras@saral.local"
  const email = username.includes('@') ? username : (username + AUTH_DOMAIN);

  const btn = $('welcomeLoginBtn');
  btn.disabled    = true;
  btn.textContent = 'Signing in…';
  hideWelcomeError();

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showWelcomeError('Incorrect username or password.');
    btn.disabled  = false;
    btn.innerHTML = '<span>🔐</span> Sign In & Start';
    return;
  }

  state.currentUser = data.user;
  showWelcomeLoggedIn(resolveUsername(data.user.email));
}

// Extract display name from email — "paras@saral.local" → "PARAS"
function resolveUsername(email) {
  return (email || '').split('@')[0].toUpperCase();
}

function showWelcomeLoggedIn(username) {
  $('welcomeLoginSection').classList.add('hidden');
  $('welcomeLoggedIn').classList.remove('hidden');
  $('welcomeUserLabel').textContent = username;
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.querySelector('.eye-icon').style.display     = isHidden ? 'none'  : '';
  btn.querySelector('.eye-off-icon').style.display = isHidden ? ''      : 'none';
}

function showWelcomeError(msg) {
  const el = $('welcomeError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideWelcomeError() { $('welcomeError').classList.add('hidden'); }

async function signOutMain() {
  await db.auth.signOut();
  state.currentUser = null;

  $('welcomeLoggedIn').classList.add('hidden');
  $('welcomeLoginSection').classList.remove('hidden');
  $('welcomePassword').value = '';
  $('welcomeUsername').value = '';
  hideWelcomeError();

  if (!$('mainApp').classList.contains('hidden')) {
    $('mainApp').classList.add('hidden');
    const ws = $('welcomeScreen');
    ws.classList.remove('hidden', 'fade-out');
    stopCamera();
  }

  $('headerUserBadge').classList.add('hidden');
  $('headerLogoutBtn').classList.add('hidden');
}

function startApp() {
  const ws = $('welcomeScreen');
  ws.classList.add('fade-out');
  setTimeout(() => {
    ws.classList.add('hidden');
    const app = $('mainApp');
    app.classList.remove('hidden');
    app.classList.add('fade-in');

    if (state.currentUser) {
      const badge = $('headerUserBadge');
      badge.textContent = '👤 ' + resolveUsername(state.currentUser.email);
      badge.classList.remove('hidden');
      $('headerLogoutBtn').classList.remove('hidden');
    }

    setupCamera();
    renderEntries();
  }, 550);
}

/* =====================================================================
   CAMERA
   ===================================================================== */
async function setupCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    state.cameraStream = stream;
    const vid = $('cameraFeed');
    vid.srcObject = stream;
    $('liveDot').classList.remove('error');
    $('liveLabel').textContent = 'LIVE';
  } catch (err) {
    $('cameraFeed').classList.add('hidden');
    $('cameraError').classList.remove('hidden');
    $('liveDot').classList.add('error');
    $('liveLabel').textContent = 'NO CAMERA';
    $('captureBtn').disabled = true;
    console.warn('Camera error:', err);
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
}

function capturePhoto() {
  if (state.photoLocked) {
    showStatus('Photo is already locked. Start a new session to retake.', 'info');
    return;
  }

  const vid    = $('cameraFeed');
  const canvas = $('canvas');
  const ctx    = canvas.getContext('2d');

  if (!vid.videoWidth) {
    showStatus('Camera is not ready yet. Please wait a moment.', 'warning');
    return;
  }

  canvas.width  = vid.videoWidth;
  canvas.height = vid.videoHeight;
  ctx.drawImage(vid, 0, 0);

  state.sessionPhoto = canvas.toDataURL('image/jpeg', 0.95);
  state.photoLocked  = true;

  flashScreen();

  // Show captured image
  const img = $('capturedPhoto');
  img.src = state.sessionPhoto;
  img.classList.remove('hidden');
  $('photoPlaceholder').classList.add('hidden');

  // Update capture button
  const btn = $('captureBtn');
  btn.innerHTML = '<span class="btn-icon">🔒</span> PHOTO LOCKED';
  btn.className = 'btn btn-locked';
  btn.disabled  = true;

  // Show retake button
  $('retakeBtn').classList.remove('hidden');

  // Update badge
  $('photoBadge').textContent  = '🔒 Photo Locked';
  $('photoBadge').className    = 'photo-badge locked';

  // Unlock add button
  $('addBtn').disabled = false;

  showToast('Photo captured and locked. You can now add entries.', 'success');
  nameInput().focus();
}

function confirmRetake() {
  if (persons.length > 0) {
    if (!confirm('Retaking the photo will clear all entries. Continue?')) return;
  }
  retakePhoto();
}

function retakePhoto() {
  state.sessionPhoto = null;
  state.photoLocked  = false;

  persons.length = 0;
  state.editingIndex = null;

  const img = $('capturedPhoto');
  img.src = '';
  img.classList.add('hidden');
  $('photoPlaceholder').classList.remove('hidden');

  const btn = $('captureBtn');
  btn.innerHTML = '<span class="btn-icon">📷</span> CAPTURE PHOTO';
  btn.className = 'btn btn-capture';
  btn.disabled  = false;

  $('retakeBtn').classList.add('hidden');

  $('photoBadge').textContent = '📷 Capture photo to begin';
  $('photoBadge').className   = 'photo-badge waiting';

  $('addBtn').disabled  = true;
  $('cancelEditBtn').classList.add('hidden');
  $('addBtnText').textContent = 'ADD PERSON';

  clearForm();
  renderEntries();
  showToast('Photo cleared. Camera ready for new capture.', 'info');
}

/* =====================================================================
   ENTRY: ADD / UPDATE / EDIT / DELETE
   ===================================================================== */
function handleAddPerson() {
  if (!state.sessionPhoto) {
    showStatus('Capture a photo before adding entries.', 'warning');
    return;
  }

  const name    = nameInput().value.trim().replace(/[a-z]/g, c => c.toUpperCase());
  const aadhaar = aadhaarInput().value.trim();

  const isFirst = state.editingIndex !== null
    ? state.editingIndex === 0
    : persons.length === 0;

  const err = validateEntry(name, aadhaar, isFirst);
  if (err) { showStatus(err, 'error'); return; }

  if (state.editingIndex !== null) {
    persons[state.editingIndex] = { name, aadhaar };
    state.editingIndex = null;
    $('addBtnText').textContent = 'ADD PERSON';
    $('cancelEditBtn').classList.add('hidden');
  } else {
    persons.push({ name, aadhaar });
  }

  clearForm();
  renderEntries();
  updateAadhaarHint();
  showToast('Entry saved successfully.', 'success');
  nameInput().focus();
}

function editPerson(index) {
  const p = persons[index];
  nameInput().value    = p.name;
  aadhaarInput().value = p.aadhaar || '';

  state.editingIndex = index;

  $('addBtnText').textContent = 'UPDATE ENTRY';
  $('addBtn').disabled        = false;
  $('cancelEditBtn').classList.remove('hidden');

  updateAadhaarHint();
  renderEntries();          // re-render to highlight editing row
  nameInput().focus();
  nameInput().scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEdit() {
  state.editingIndex = null;
  clearForm();
  $('addBtnText').textContent = 'ADD PERSON';
  $('cancelEditBtn').classList.add('hidden');
  updateAadhaarHint();
  renderEntries();
}

function deletePerson(index) {
  const name = persons[index].name;
  if (!confirm(`Delete entry for "${name}"?`)) return;

  persons.splice(index, 1);

  if (state.editingIndex !== null) {
    state.editingIndex = null;
    clearForm();
    $('addBtnText').textContent = 'ADD PERSON';
    $('cancelEditBtn').classList.add('hidden');
  }

  renderEntries();
  updateAadhaarHint();
}

/* ── Validation ─────────────────────────────────────────────────────── */
function validateEntry(name, aadhaar, isFirstEntry) {
  if (!name) return 'Please enter a name.';

  if (isFirstEntry) {
    if (aadhaar && !/^\d{12}$/.test(aadhaar))
      return 'If entering Aadhaar for first entry, it must be exactly 12 digits.';
    return null;
  }

  if (!aadhaar || !/^\d{12}$/.test(aadhaar))
    return 'Aadhaar is required from the second entry onwards and must be exactly 12 digits.';

  return null;
}

/* ── Render ─────────────────────────────────────────────────────────── */
function renderEntries() {
  $('totalCount').textContent = persons.length;

  if (persons.length === 0) {
    $('entriesContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No entries recorded yet.</p>
        <small>Capture a photo and start adding entries.</small>
      </div>`;
    return;
  }

  const rows = persons.map((p, i) => {
    const editing  = state.editingIndex === i;
    const aadhaarDisplay = p.aadhaar
      ? p.aadhaar.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')
      : (i === 0 ? '—' : '');

    return `<tr class="${editing ? 'editing' : ''}">
      <td class="td-num">${i + 1}</td>
      <td class="td-name">${escHtml(p.name)}</td>
      <td class="td-aadh">${aadhaarDisplay}</td>
      <td class="td-acts">
        <div class="td-acts-wrap">
          <button class="btn-sm btn-edit"   title="Edit"   onclick="editPerson(${i})">✏️</button>
          <button class="btn-sm btn-delete" title="Delete" onclick="deletePerson(${i})">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  $('entriesContent').innerHTML = `
    <table class="entries-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Aadhaar Number</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── UI helpers ─────────────────────────────────────────────────────── */
function clearForm() {
  nameInput().value    = '';
  aadhaarInput().value = '';
  hideStatus();
}

function updateAadhaarHint() {
  const isFirst = state.editingIndex !== null
    ? state.editingIndex === 0
    : persons.length === 0;
  const hint = $('aadhaarHint');
  if (isFirst) {
    hint.textContent = 'Optional for first entry';
    hint.className   = 'field-hint';
  } else {
    hint.textContent = 'Required — exactly 12 digits';
    hint.className   = 'field-hint required';
  }
}

function onNameInput() {
  // CSS handles uppercase display for English (text-transform: uppercase on the input).
  // No value manipulation here — avoids cursor-jump issues.
  // Hindi (Devanagari) is unaffected by text-transform, so it renders as typed.
}

function onAadhaarInput() { /* numeric filter already in oninput attr */ }

function showStatus(msg, type = 'info') {
  const el = $('statusMsg');
  $('statusMsgText').textContent = msg;
  el.className = `status-msg ${type}`;
  el.classList.remove('hidden');
}

function hideStatus() {
  $('statusMsg').classList.add('hidden');
}

let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = $('toast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

function flashScreen() {
  const f = $('flash');
  f.style.opacity = '1';
  setTimeout(() => { f.style.opacity = '0'; }, 130);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── New Session ────────────────────────────────────────────────────── */
function confirmNewSession() {
  if (persons.length > 0 || state.sessionPhoto) {
    if (!confirm('Start a new session? All entries and the captured photo will be cleared.')) return;
  }
  resetSession();
}

function resetSession() {
  stopCamera();

  persons.length     = 0;
  state.sessionPhoto = null;
  state.photoLocked  = false;
  state.editingIndex = null;

  clearForm();
  renderEntries();
  updateAadhaarHint();

  // Reset camera UI
  $('cameraFeed').classList.remove('hidden');
  $('cameraError').classList.add('hidden');
  $('capturedPhoto').src = '';
  $('capturedPhoto').classList.add('hidden');
  $('photoPlaceholder').classList.remove('hidden');

  const btn = $('captureBtn');
  btn.innerHTML = '<span class="btn-icon">📷</span> CAPTURE PHOTO';
  btn.className = 'btn btn-capture';
  btn.disabled  = false;

  $('retakeBtn').classList.add('hidden');
  $('addBtn').disabled        = true;
  $('addBtnText').textContent = 'ADD PERSON';
  $('cancelEditBtn').classList.add('hidden');

  $('photoBadge').textContent = '📷 Capture photo to begin';
  $('photoBadge').className   = 'photo-badge waiting';

  $('liveDot').classList.remove('error');
  $('liveLabel').textContent = 'LIVE';

  setupCamera();
  showToast('New session started.', 'info');
}

/* =====================================================================
   HINDI FONT SUPPORT
   Noto Sans Devanagari covers both Latin (English) and Devanagari (Hindi).
   Loaded once in the background when the app starts; cached in _devFont.
   generatePDF() stays synchronous so window.open() is not blocked.
   ===================================================================== */
let _devFont = null;

async function loadDevanagariFont() {
  if (_devFont) return;
  try {
    const url = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main' +
                '/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _devFont = arrayBufferToBase64(await res.arrayBuffer());
    console.log('Devanagari font ready.');
  } catch (e) {
    console.warn('Devanagari font could not load — Hindi text may show as boxes in PDF:', e.message);
  }
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 8192)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.byteLength)));
  return btoa(binary);
}

/* =====================================================================
   PDF GENERATION
   ===================================================================== */
function generateFileName() {
  if (persons.length >= 2) {
    const safe = persons[1].name.replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return `${safe}.pdf`;
  }
  if (persons.length === 1) {
    const safe = persons[0].name.replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_');
    return `AFFIDAVIT_${safe}_${Date.now()}.pdf`;
  }
  return `AFFIDAVIT_SESSION_${Date.now()}.pdf`;
}

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── Register Devanagari font if preloaded ────────────────
  let usingUnicode = false;
  if (_devFont) {
    try {
      doc.addFileToVFS('NotoSansDevanagari.ttf', _devFont);
      doc.addFont('NotoSansDevanagari.ttf', 'NotoSansDevanagari', 'normal');
      usingUnicode = true;
    } catch (e) { /* fall back to helvetica */ }
  }

  const plainFont = (w = 'normal') => doc.setFont('helvetica', w);

  // Render a name that may contain mixed Hindi + English segments.
  // Splits text into Devanagari / Latin runs and draws each with the right font,
  // advancing X so the segments sit next to each other correctly.
  function drawName(text, x, y) {
    const hasDevanagari = /[ऀ-ॿ]/.test(text);

    if (!usingUnicode || !hasDevanagari) {
      // Pure English (or font not loaded) — single Helvetica bold call
      doc.setFont('helvetica', 'bold');
      doc.text(text, x, y);
      return;
    }

    // Split into alternating runs: Devanagari vs. everything-else
    const runs = [];
    let cur = '';
    let curHindi = /[ऀ-ॿ]/.test(text.charAt(0));

    for (const ch of text) {
      const chHindi = /[ऀ-ॿ]/.test(ch);
      if (chHindi === curHindi) {
        cur += ch;
      } else {
        if (cur) runs.push({ t: cur, h: curHindi });
        cur = ch;
        curHindi = chHindi;
      }
    }
    if (cur) runs.push({ t: cur, h: curHindi });

    // Draw each run with its correct font
    let cx = x;
    for (const run of runs) {
      if (run.h) {
        doc.setFont('NotoSansDevanagari', 'normal');
      } else {
        doc.setFont('helvetica', 'bold');
      }
      doc.text(run.t, cx, y);
      cx += doc.getTextWidth(run.t);
    }
  }

  // ── Photo ────────────────────────────────────────────────
  const imgW = 150;
  const imgH = 65;
  const imgX = (pageW - imgW) / 2;
  const imgY = pageH * 0.10;

  doc.addImage(state.sessionPhoto, 'JPEG', imgX, imgY, imgW, imgH);

  // ── Date / centre line ───────────────────────────────────
  const dateStr = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  doc.setFontSize(6);
  plainFont();
  doc.text(`${dateStr} / SARAL CENTRE NILOKHERI`, pageW / 2, imgY + imgH + 5, { align: 'center' });

  // ── Table header ─────────────────────────────────────────
  let ty = imgY + imgH + 15;

  doc.setFontSize(7);
  plainFont('bold');
  doc.text('SR.',             10,  ty);
  doc.text('NAME',            25,  ty);
  doc.text('AADHAR NUMBER',  95,  ty);
  doc.text('SIGNATURE',       155, ty);

  doc.setLineWidth(0.3);
  doc.line(10, ty + 2, 200, ty + 2);
  ty += 9;

  // ── Rows ─────────────────────────────────────────────────
  const drawHeader = () => {
    doc.setFontSize(7); plainFont('bold');
    doc.text('SR.', 10, ty);
    doc.text('NAME', 25, ty);
    doc.text('AADHAR NUMBER', 95, ty);
    doc.text('SIGNATURE', 155, ty);
    doc.line(10, ty + 2, 200, ty + 2);
    ty += 9;
  };

  persons.forEach((p, i) => {
    if (ty > pageH - 20) { doc.addPage(); ty = 20; drawHeader(); }

    // SR number
    doc.setFontSize(7); plainFont();
    doc.text(String(i + 1), 10, ty);

    // Name — handles pure English, pure Hindi, and mixed scripts
    const nameText = p.name.length > 32 ? p.name.substring(0, 32) : p.name;
    doc.setFontSize(7);
    drawName(nameText, 25, ty);

    // Aadhaar (always Latin digits) — formatted as XXXX XXXX XXXX
    plainFont();
    const fmtAadhaar = a => (a || '').replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
    if (i === 0) {
      if (p.aadhaar && p.aadhaar.trim() !== '') doc.text(fmtAadhaar(p.aadhaar), 95, ty);
    } else {
      doc.text(fmtAadhaar(p.aadhaar), 95, ty);
    }

    doc.text('________________________', 155, ty);

    if (i === 0) {
      doc.setFontSize(5); plainFont('italic');
      doc.text('Advocate/Numberdar/Sarpanch/Panch', 25, ty + 4);
      ty += 13;
    } else {
      ty += 9.1;
    }
  });

  // ── Footer line on every page ────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(0, 0, 0);        // black
    doc.setLineWidth(0.6);
    doc.line(10, pageH - 12, pageW - 10, pageH - 12);
  }

  return doc;
}

/* =====================================================================
   PRINT PDF HANDLER
   ===================================================================== */
async function handlePrint() {
  if (!state.sessionPhoto) {
    showToast('Capture a photo before printing.', 'error');
    return;
  }
  if (persons.length === 0) {
    showToast('Add at least one entry before printing.', 'error');
    return;
  }

  const btn = $('printBtn');
  btn.disabled     = true;
  btn.innerHTML    = '<span class="btn-icon">⏳</span> PREPARING...';

  try {
    const fileName = generateFileName();
    const doc      = generatePDF();

    // embed auto-print action
    doc.autoPrint();

    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);

    // ── Open print dialog immediately (synchronous, inside user gesture) ──
    const printWin = window.open(blobUrl, '_blank');
    if (!printWin) {
      // Popup blocked fallback
      doc.save(fileName);
      showToast('Pop-up was blocked. PDF downloaded instead. Allow pop-ups for direct printing.', 'warning');
    }

    // ── Save to Supabase asynchronously ───────────────────────────────────
    showStatus('Saving to admin dashboard…', 'info');
    const result = await saveToSupabase(pdfBlob, fileName);

    if (result.success) {
      hideStatus();
      showToast('Document saved to admin dashboard and print command opened.', 'success');
    } else {
      const errDetail = result.error?.message || result.error?.error_description || JSON.stringify(result.error) || 'Unknown error';
      showStatus(`Save failed: ${errDetail}`, 'error');
      showToast(`Admin save failed: ${errDetail}`, 'error');
      console.error('Full save error:', result.error);
    }

    // Revoke URL after 2 min
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);

  } catch (err) {
    console.error('Print error:', err);
    showToast('An error occurred while generating the PDF. Check console.', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<span class="btn-icon">🖨️</span> PRINT PDF';
  }
}

/* =====================================================================
   SUPABASE SAVE
   ===================================================================== */
async function saveToSupabase(pdfBlob, fileName) {
  try {
    // Always fetch the live authenticated user — never rely on stale state
    const { data: { user: liveUser } } = await db.auth.getUser();
    if (!liveUser) throw new Error('Not logged in. Please sign in and try again.');

    const ts        = Date.now();
    const pdfPath   = `sessions/${ts}_${fileName}`;
    const photoName = fileName.replace(/\.pdf$/i, '') + '_photo.jpg';
    const photoPath = `photos/${ts}_${photoName}`;

    // 1. Upload PDF
    const { error: pdfErr } = await db.storage
      .from('affidavit-pdfs')
      .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: false });
    if (pdfErr) throw pdfErr;

    const { data: { publicUrl: pdfUrl } } = db.storage
      .from('affidavit-pdfs').getPublicUrl(pdfPath);

    // 2. Upload photo
    const photoBlob = dataURLtoBlob(state.sessionPhoto);
    const { error: photoErr } = await db.storage
      .from('affidavit-photos')
      .upload(photoPath, photoBlob, { contentType: 'image/jpeg', upsert: false });
    if (photoErr) throw photoErr;

    const { data: { publicUrl: photoUrl } } = db.storage
      .from('affidavit-photos').getPublicUrl(photoPath);

    // 3. Insert session record (tagged with logged-in user's ID)
    const { data: session, error: sessErr } = await db
      .from('affidavit_sessions')
      .insert({
        file_name:         fileName,
        pdf_path:          pdfPath,
        pdf_url:           pdfUrl,
        photo_path:        photoPath,
        photo_url:         photoUrl,
        first_entry_name:  persons[0]?.name  || '',
        second_entry_name: persons[1]?.name  || '',
        total_entries:     persons.length,
        status:            'SAVED',
        operator_name:     resolveUsername(liveUser.email),
        user_id:           liveUser.id,
      })
      .select()
      .single();
    if (sessErr) throw sessErr;

    // 4. Insert entry records
    const entries = persons.map((p, i) => ({
      session_id:    session.id,
      serial_number: i + 1,
      name:          p.name,
      aadhaar_number: (p.aadhaar && p.aadhaar.trim() !== '') ? p.aadhaar : null,
    }));

    const { error: entErr } = await db.from('affidavit_entries').insert(entries);
    if (entErr) throw entErr;

    return { success: true };

  } catch (err) {
    console.error('Supabase save error:', err);
    return { success: false, error: err };
  }
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(';base64,');
  const mime     = header.split(':')[1];
  const binary   = atob(data);
  const bytes    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* =====================================================================
   INIT
   ===================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadDevanagariFont();   // preload Hindi font in background
  checkExistingSession(); // auto-show logged-in state if session cookie present
  updateAadhaarHint();

  // Allow Enter key in form fields
  nameInput().addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); aadhaarInput().focus(); }
  });
  aadhaarInput().addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddPerson(); }
  });
});
