/**
 * Client-side wrapper for the create-envelope edge function.
 * All DB writes go through the edge (service role); no direct table inserts.
 */

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA';
const EDGE_BASE = 'https://qatfiicpkunabpphwqee.supabase.co/functions/v1';

async function callEdge(token, body) {
  const res = await fetch(`${EDGE_BASE}/create-envelope`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error || `create-envelope failed (${res.status})`);
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json;
}

/**
 * Create a new envelope for a document job.
 * signers: [{ email, displayName?, fieldKeys: string[] }] - invitees only (initiator row added by edge)
 * Returns { envelope_id, initiator_invite_url, invite_urls: { [email]: url } }
 */
export async function createEnvelope(supabase, { jobId, templateId, signers, origin }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  const appOrigin = origin
    ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
  return callEdge(session.access_token, {
    action: 'create',
    job_id: jobId,
    template_id: templateId,
    signers,
    ...(appOrigin ? { origin: appOrigin } : {}),
  });
}

/**
 * Recovery nudge: when every signer has signed but the envelope is still
 * pending (async finalize was dropped), ask the edge to finalize now.
 * Idempotent server-side; safe to call repeatedly.
 */
export async function checkFinalize(supabase, envelopeId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  return callEdge(session.access_token, {
    action: 'check_finalize',
    envelope_id: envelopeId,
  });
}

/**
 * Fetch the active envelope for a document job (initiator SELECT, RLS enforced).
 * Returns the envelope row or null.
 */
export async function fetchActiveEnvelope(supabase, jobId) {
  const { data, error } = await supabase
    .from('document_envelopes')
    .select('id, status, created_at, updated_at, completed_at')
    .eq('document_job_id', jobId)
    .not('status', 'in', '("voided","completed")')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Fetch signer rows for an envelope (initiator SELECT, RLS enforced).
 */
export async function fetchEnvelopeSigners(supabase, envelopeId) {
  const { data, error } = await supabase
    .from('envelope_signers')
    .select('id, email, display_name, field_keys, is_initiator, status, signed_at, order_index')
    .eq('envelope_id', envelopeId)
    .order('order_index');
  if (error) throw error;
  return data || [];
}

/**
 * Void an active envelope (initiator only, client UPDATE status=voided via RLS).
 */
export async function voidEnvelope(supabase, envelopeId) {
  const { error } = await supabase
    .from('document_envelopes')
    .update({ status: 'voided', updated_at: new Date().toISOString() })
    .eq('id', envelopeId);
  if (error) throw error;
}

/**
 * Send (or resend) sign invites to non-initiator signers via the send-sign-invite edge.
 * Only works when envelope.status === 'pending'.
 * Returns { sent, results }.
 */
export async function sendInvites(supabase, envelopeId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://onboardin.llc';
  const res = await fetch(`${EDGE_BASE}/send-sign-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ envelope_id: envelopeId, origin }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error || `send-sign-invite failed (${res.status})`);
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json;
}
