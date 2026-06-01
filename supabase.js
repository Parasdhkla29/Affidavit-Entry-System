/*
 * SUPABASE CONFIGURATION
 * ─────────────────────────────────────────────────────────────────
 * Replace the two constants below with your real project credentials.
 * Dashboard → Your Project → Settings → API
 *
 * ═══════════════════════════════════════════════════════════════
 * STEP 1 — Run this SQL in Supabase SQL Editor
 * ═══════════════════════════════════════════════════════════════
 *
 * CREATE TABLE affidavit_sessions (
 *   id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   file_name        TEXT        NOT NULL,
 *   pdf_path         TEXT,
 *   pdf_url          TEXT,
 *   photo_path       TEXT,
 *   photo_url        TEXT,
 *   first_entry_name TEXT,
 *   second_entry_name TEXT,
 *   total_entries    INTEGER     DEFAULT 0,
 *   status           TEXT        DEFAULT 'SAVED',
 *   created_at       TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE TABLE affidavit_entries (
 *   id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
 *   session_id     UUID    REFERENCES affidavit_sessions(id) ON DELETE CASCADE,
 *   serial_number  INTEGER NOT NULL,
 *   name           TEXT    NOT NULL,
 *   aadhaar_number TEXT,
 *   created_at     TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * ALTER TABLE affidavit_sessions ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE affidavit_entries  ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "anon_insert_sessions"  ON affidavit_sessions FOR INSERT TO anon          WITH CHECK (true);
 * CREATE POLICY "admin_select_sessions" ON affidavit_sessions FOR SELECT TO authenticated USING (true);
 * CREATE POLICY "admin_delete_sessions" ON affidavit_sessions FOR DELETE TO authenticated USING (true);
 *
 * CREATE POLICY "anon_insert_entries"   ON affidavit_entries  FOR INSERT TO anon          WITH CHECK (true);
 * CREATE POLICY "admin_select_entries"  ON affidavit_entries  FOR SELECT TO authenticated USING (true);
 * CREATE POLICY "admin_delete_entries"  ON affidavit_entries  FOR DELETE TO authenticated USING (true);
 *
 * ═══════════════════════════════════════════════════════════════
 * STEP 2 — Create Storage Buckets (Dashboard → Storage → New Bucket)
 * ═══════════════════════════════════════════════════════════════
 *
 * Bucket name: affidavit-pdfs    → toggle "Public bucket" ON
 * Bucket name: affidavit-photos  → toggle "Public bucket" ON
 *
 * Then add Storage policies for each bucket:
 *   INSERT  → role: anon        (main app uploads)
 *   SELECT  → role: public      (anyone can read URLs)
 *   DELETE  → role: authenticated (admin can delete)
 *
 * ═══════════════════════════════════════════════════════════════
 * STEP 3 — Create admin user (Dashboard → Authentication → Users)
 * ═══════════════════════════════════════════════════════════════
 *
 * Click "Invite user" or "Add user" and set an email + password.
 * Use those credentials to log in to admin.html.
 * ─────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL      = 'https://cmarvjdhcvlqxjodgiyj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYXJ2amRoY3ZscXhqb2RnaXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMDkwMjMsImV4cCI6MjA5NTg4NTAyM30.XLGAK8V6plaJptUAVqucQR4BXcdp8H8JoH7Zn3RCuw0';

/*
 * ADMIN USERNAME MAP
 * Add short usernames here that map to the full Supabase Auth email.
 * Usernames are case-insensitive.
 * To add more admins: 'newname': 'their@email.com'
 */
const ADMIN_USERNAMES = {
  'admin':  'work.parasdhakla@gmail.com',
  'paras':  'work.parasdhakla@gmail.com',
  'saral':  'work.parasdhakla@gmail.com',
};

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
