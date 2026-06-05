# Graph Report - .  (2026-06-02)

## Corpus Check
- Corpus is ~5,900 words - fits in a single context window. You may not need a graph.

## Summary
- 138 nodes · 286 edges · 13 communities (10 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Session & UI Utilities|Session & UI Utilities]]
- [[_COMMUNITY_Admin Module|Admin Module]]
- [[_COMMUNITY_App Module|App Module]]
- [[_COMMUNITY_Admin Portal & Export|Admin Portal & Export]]
- [[_COMMUNITY_Entry & Form Flow|Entry & Form Flow]]
- [[_COMMUNITY_Authentication|Authentication]]
- [[_COMMUNITY_Camera & Entry UI|Camera & Entry UI]]
- [[_COMMUNITY_Supabase Storage & Data|Supabase Storage & Data]]
- [[_COMMUNITY_Output Rendering & Escaping|Output Rendering & Escaping]]
- [[_COMMUNITY_Logout & Session Teardown|Logout & Session Teardown]]
- [[_COMMUNITY_Cleanup & Sign-Out|Cleanup & Sign-Out]]
- [[_COMMUNITY_Supabase Client|Supabase Client]]
- [[_COMMUNITY_DevOps  Git Docs|DevOps / Git Docs]]

## God Nodes (most connected - your core abstractions)
1. `$()` - 24 edges
2. `$a()` - 16 edges
3. `handleAddPerson()` - 10 edges
4. `Supabase DB Client (db)` - 10 edges
5. `saveToSupabase()` - 10 edges
6. `clearForm()` - 9 edges
7. `resetSession()` - 9 edges
8. `index.html (Main App)` - 9 edges
9. `renderEntries()` - 8 edges
10. `handlePrint()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `index.html (Main App)` --references--> `Supabase Configuration & Schema`  [EXTRACTED]
  index.html → supabase.js
- `allSessions Array (client-side cache)` --semantically_similar_to--> `persons Array (Entry Data)`  [INFERRED] [semantically similar]
  admin.js → app.js
- `resolveUsername()` --semantically_similar_to--> `resolveAdminUsername()`  [INFERRED] [semantically similar]
  app.js → admin.js
- `togglePassword() (app.js)` --semantically_similar_to--> `togglePassword() (admin.js)`  [INFERRED] [semantically similar]
  app.js → admin.js
- `admin.html (Admin Portal)` --references--> `Supabase Configuration & Schema`  [EXTRACTED]
  admin.html → supabase.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Main App: Photo Capture → Entry → PDF Save Flow** — appjs_capturePhoto, appjs_handleAddPerson, appjs_handlePrint, appjs_saveToSupabase, supabase_table_affidavit_sessions, supabase_table_affidavit_entries [EXTRACTED 0.95]
- **Admin: Load → Filter → Render Sessions Flow** — adminjs_loadSessions, adminjs_applyFilters, adminjs_renderSessionsTable, adminjs_allSessions, supabase_table_affidavit_sessions [EXTRACTED 0.95]
- **Shared Username+AUTH_DOMAIN Auth Pattern** — appjs_loginAndStart, adminjs_handleLogin, supabase_auth_domain, appjs_email_username_pattern [EXTRACTED 0.95]

## Communities (13 total, 3 thin omitted)

### Community 0 - "Session & UI Utilities"
Cohesion: 0.10
Nodes (25): allSessions Array (client-side cache), showAdminToast(), capturePhoto(), confirmRetake(), deletePerson(), drawName() (Mixed Script PDF Renderer), editPerson(), generatePDF() (+17 more)

### Community 1 - "Admin Module"
Cohesion: 0.17
Nodes (22): $a(), allSessions, applyFilters(), clearFilters(), closeModal(), deleteSession(), downloadMonthlyZip(), escHtml() (+14 more)

### Community 2 - "App Module"
Cohesion: 0.14
Nodes (17): arrayBufferToBase64(), checkExistingSession(), dataURLtoBlob(), generateFileName(), generatePDF(), handlePrint(), hideStatus(), loadDevanagariFont() (+9 more)

### Community 3 - "Admin Portal & Export"
Cohesion: 0.24
Nodes (11): admin.html (Admin Portal), closeModal(), downloadMonthlyZip(), formatDate(), getSessionsForMonth(), onMonthSelect(), togglePassword() (admin.js), viewSession() (+3 more)

### Community 4 - "Entry & Form Flow"
Cohesion: 0.31
Nodes (10): cancelEdit(), clearForm(), confirmNewSession(), confirmRetake(), deletePerson(), renderEntries(), resetSession(), retakePhoto() (+2 more)

### Community 5 - "Authentication"
Cohesion: 0.31
Nodes (8): handleLogin(), resolveAdminUsername(), checkExistingSession(), Username-to-Email Auth Pattern, loginAndStart(), resolveUsername(), showWelcomeLoggedIn(), AUTH_DOMAIN Constant

### Community 6 - "Camera & Entry UI"
Cohesion: 0.50
Nodes (9): aadhaarInput(), capturePhoto(), editPerson(), flashScreen(), handleAddPerson(), nameInput(), showStatus(), showToast() (+1 more)

### Community 7 - "Supabase Storage & Data"
Cohesion: 0.36
Nodes (6): deleteSession(), loadSessions(), saveToSupabase(), affidavit-pdfs Storage Bucket, affidavit-photos Storage Bucket, affidavit_sessions Table

### Community 8 - "Output Rendering & Escaping"
Cohesion: 0.50
Nodes (4): applyFilters(), escHtml() (admin.js), renderSessionsTable(), escHtml() (app.js)

### Community 10 - "Cleanup & Sign-Out"
Cohesion: 0.67
Nodes (3): hideWelcomeError(), signOutMain(), stopCamera()

## Knowledge Gaps
- **8 isolated node(s):** `allSessions`, `state`, `persons`, `db`, `drawName() (Mixed Script PDF Renderer)` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Supabase DB Client (db)` connect `Logout & Session Teardown` to `Session & UI Utilities`, `Admin Portal & Export`, `Authentication`, `Supabase Storage & Data`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `saveToSupabase()` connect `Supabase Storage & Data` to `Session & UI Utilities`, `Logout & Session Teardown`, `Admin Portal & Export`, `Authentication`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `index.html (Main App)` connect `Session & UI Utilities` to `Admin Portal & Export`, `Authentication`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `allSessions`, `state`, `persons` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Session & UI Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.10098522167487685 - nodes in this community are weakly interconnected._
- **Should `App Module` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._