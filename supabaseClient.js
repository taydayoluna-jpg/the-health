/* ==========================================================================
   The Hearth — Supabase client
   Shared by auth.js, reset-password.js, and (soon) chat.js / admin.js.
   The anon/public key below is SAFE to expose in client-side code — it can
   only do what the database's row-level security policies (schema.sql)
   explicitly allow. Never put the service_role key here.
   ========================================================================== */

const SUPABASE_URL = 'https://rhmzdcvbzwzpyyaantzu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobXpkY3Ziend6cHl5YWFudHp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMzEwMjUsImV4cCI6MjA5OTYwNzAyNX0.zy6ijhST1eHI1gk4LkwHyieQzT8VxycpW2GY7El9DdE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
