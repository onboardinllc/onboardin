import { createClient } from '@supabase/supabase-js';

// Backend is selected per environment via Vite env vars.
// .env.development -> dev project (npm run dev), .env.production -> prod project (npm run build).
// Falls back to the shared project if an env var is missing, so the app always boots.
const FALLBACK_URL = 'https://qatfiicpkunabpphwqee.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Ignore the placeholder values shipped in the example env file.
const isReal = (v) => v && !v.startsWith('your-');

export const supabaseUrl = isReal(envUrl) ? envUrl : FALLBACK_URL;
export const supabaseAnonKey = isReal(envAnonKey) ? envAnonKey : FALLBACK_ANON_KEY;

function isValidSupabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const supabase =
  isValidSupabaseUrl(supabaseUrl) && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
