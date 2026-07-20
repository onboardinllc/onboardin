import { GOOGLE_DRIVE_CONNECT_DISCLOSURE } from './google-drive-processor.js';

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL || 'https://qatfiicpkunabpphwqee.supabase.co'}/functions/v1`;

export { GOOGLE_DRIVE_CONNECT_DISCLOSURE };

export async function startGoogleDriveOAuth(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to connect Google Drive.');

  const res = await fetch(`${EDGE_BASE}/integrations-google-drive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'oauth_start' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Drive connect failed (${res.status})`);
  return data;
}

export async function fetchGoogleDriveIntegration(supabase, clientId) {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from('client_integrations')
    .select('id, provider, connected_at, revoked_at, drive_root_folder_id, company_slug')
    .eq('client_id', clientId)
    .eq('provider', 'google_drive')
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at) return null;
  return data;
}
