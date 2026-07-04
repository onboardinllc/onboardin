import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const TOKEN_BYTES = 32;
const TOKEN_TTL_DAYS = 14;

async function generateRawToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256Hex(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_ORIGINS = [
  'https://onboardin.llc',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function resolveInviteOrigin(origin: unknown): string {
  const fallback = Deno.env.get('APP_ORIGIN') ?? 'https://onboardin.llc';
  if (typeof origin !== 'string') return fallback;
  const normalized = origin.replace(/\/$/, '');
  if (ALLOWED_ORIGINS.includes(normalized)) return normalized;
  return fallback;
}

function buildInviteUrl(rawToken: string, origin = 'https://onboardin.llc'): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/#sign?token=${encodeURIComponent(rawToken)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const { action, job_id, template_id, signers, origin } = body;
    const inviteOrigin = resolveInviteOrigin(origin);

    // check_finalize: initiator-triggered recovery when all signers signed but
    // the async finalize was dropped. Idempotent (finalize-envelope no-ops on
    // completed envelopes and takes a lock while running).
    if (action === 'check_finalize') {
      const { envelope_id } = body;
      if (!envelope_id) return json({ error: 'envelope_id required.' }, 400);

      const { data: envelope } = await supabase
        .from('document_envelopes')
        .select('id, status, client_id')
        .eq('id', envelope_id)
        .eq('client_id', user.id)
        .maybeSingle();
      if (!envelope) return json({ error: 'Envelope not found.' }, 404);
      if (envelope.status === 'completed') return json({ ok: true, already_completed: true });
      if (envelope.status !== 'pending') {
        return json({ error: `Envelope is not pending (${envelope.status}).` }, 400);
      }

      const { data: allSigners } = await supabase
        .from('envelope_signers')
        .select('status')
        .eq('envelope_id', envelope_id);
      const allSigned = allSigners?.length && allSigners.every((s) => s.status === 'signed');
      if (!allSigned) return json({ ok: false, message: 'Not all signers have signed yet.' });

      const res = await fetch(`${SUPABASE_URL}/functions/v1/finalize-envelope`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ envelope_id }),
      });
      const finalizeJson = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: finalizeJson.error || 'Finalize failed.' }, 502);
      return json(finalizeJson);
    }

    if (action !== 'create') {
      return json({ error: 'Unknown action.' }, 400);
    }

    // Paid plan gate applies to creating envelopes only; recovering an
    // already-signed envelope (check_finalize) stays open if a plan lapses.
    const { data: isPaid } = await supabase
      .rpc('client_has_paid_plan', { p_client_id: user.id });
    if (!isPaid) {
      return json({
        error: 'Request signatures requires a Growth or Enterprise plan.',
        code: 'upgrade_required',
      }, 403);
    }

    if (!job_id || !template_id) {
      return json({ error: 'job_id and template_id required.' }, 400);
    }

    // Validate signers array: [{ email, displayName?, fieldKeys: string[] }]
    if (!Array.isArray(signers) || signers.length === 0) {
      return json({ error: 'At least one co-signer required.' }, 400);
    }
    for (const s of signers) {
      if (!s.email || typeof s.email !== 'string') {
        return json({ error: 'Each signer must have a valid email.' }, 400);
      }
      if (!Array.isArray(s.fieldKeys) || s.fieldKeys.length === 0) {
        return json({ error: `Signer ${s.email} must have at least one fieldKey.` }, 400);
      }
    }

    // Verify job belongs to user and is in 'filled' state
    const { data: job, error: jobErr } = await supabase
      .from('document_jobs')
      .select('id, status, client_id, template_id')
      .eq('id', job_id)
      .eq('client_id', user.id)
      .maybeSingle();
    if (jobErr || !job) return json({ error: 'Document job not found.' }, 404);
    if (job.status !== 'filled') {
      return json({ error: 'Document must be filled before requesting signatures.' }, 400);
    }
    if (job.template_id !== template_id) {
      return json({ error: 'Template mismatch.' }, 400);
    }

    // Verify template exists and is multi_signer_enabled
    const { data: template, error: tErr } = await supabase
      .from('legal_templates')
      .select('id, multi_signer_enabled, multi_signer_field_map, label')
      .eq('id', template_id)
      .eq('active', true)
      .maybeSingle();
    if (tErr || !template) return json({ error: 'Template not found.' }, 404);
    if (!template.multi_signer_enabled) {
      return json({ error: 'This template does not support multi-signer envelopes.' }, 400);
    }

    const multiFieldMap = (template.multi_signer_field_map || {}) as Record<string, { type?: string }>;
    const validSignatureKeys = new Set(
      Object.entries(multiFieldMap)
        .filter(([, def]) => def?.type === 'signature')
        .map(([key]) => key),
    );
    for (const s of signers) {
      for (const key of s.fieldKeys as string[]) {
        if (!validSignatureKeys.has(key)) {
          return json({ error: `Invalid field key for this template: ${key}` }, 400);
        }
        if (key === 'founder_1_signature') {
          return json({ error: 'founder_1_signature is reserved for the initiator.' }, 400);
        }
      }
    }

    // Check no active envelope already exists for this job
    const { data: existingEnvelope } = await supabase
      .from('document_envelopes')
      .select('id, status')
      .eq('document_job_id', job_id)
      .not('status', 'in', '("voided","completed")')
      .maybeSingle();
    if (existingEnvelope) {
      return json({ error: 'An active envelope already exists for this document.', code: 'duplicate_envelope' }, 409);
    }

    // Validate no duplicate emails among invitees
    const inviteeEmails = signers.map((s: { email: string }) => s.email.trim().toLowerCase());
    const uniqueInviteeEmails = new Set(inviteeEmails);
    if (uniqueInviteeEmails.size !== inviteeEmails.length) {
      return json({ error: 'Duplicate email addresses in signer list.' }, 400);
    }

    // Get initiator email from clients table
    const { data: clientRow } = await supabase
      .from('clients')
      .select('email, founder_name')
      .eq('id', user.id)
      .maybeSingle();
    const initiatorEmail = clientRow?.email || user.email || '';
    const initiatorDisplayName = clientRow?.founder_name?.trim() || null;

    // Check initiator email not duplicated among invitees
    if (inviteeEmails.includes(initiatorEmail.toLowerCase())) {
      return json({ error: 'Initiator email cannot be used as a co-signer.' }, 400);
    }

    // Create envelope (draft - moves to pending after initiator signs)
    const now = new Date().toISOString();
    const { data: envelope, error: envErr } = await supabase
      .from('document_envelopes')
      .insert({
        document_job_id: job_id,
        client_id: user.id,
        template_id,
        status: 'draft',
        created_by: user.id,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();
    if (envErr || !envelope) {
      return json({ error: envErr?.message || 'Failed to create envelope.' }, 500);
    }

    const envelopeId = envelope.id;

    // Insert initiator row (order_index 0, field_keys = ['founder_1_signature'])
    const initiatorToken = await generateRawToken();
    const initiatorTokenHash = await sha256Hex(initiatorToken);
    const initiatorExpiry = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: initiatorRow, error: initErr } = await supabase
      .from('envelope_signers')
      .insert({
        envelope_id: envelopeId,
        email: initiatorEmail,
        display_name: initiatorDisplayName,
        field_keys: ['founder_1_signature'],
        is_initiator: true,
        status: 'pending',
        order_index: 0,
      })
      .select('id')
      .single();
    if (initErr || !initiatorRow) {
      await supabase.from('document_envelopes').delete().eq('id', envelopeId);
      return json({ error: initErr?.message || 'Failed to create initiator signer row.' }, 500);
    }

    // Insert initiator invite
    const { error: initInviteErr } = await supabase
      .from('sign_invites')
      .insert({
        envelope_signer_id: initiatorRow.id,
        token_hash: initiatorTokenHash,
        expires_at: initiatorExpiry,
      });
    if (initInviteErr) {
      await supabase.from('document_envelopes').delete().eq('id', envelopeId);
      return json({ error: initInviteErr.message || 'Failed to create initiator invite.' }, 500);
    }

    // Insert invitee rows + tokens
    const inviteUrls: Record<string, string> = {};
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      const { data: signerRow, error: signerErr } = await supabase
        .from('envelope_signers')
        .insert({
          envelope_id: envelopeId,
          email: s.email.trim(),
          display_name: s.displayName?.trim() || null,
          field_keys: s.fieldKeys,
          is_initiator: false,
          status: 'pending',
          order_index: i + 1,
        })
        .select('id')
        .single();
      if (signerErr || !signerRow) {
        await supabase.from('document_envelopes').delete().eq('id', envelopeId);
        return json({ error: signerErr?.message || `Failed to create signer row for ${s.email}.` }, 500);
      }

      const rawToken = await generateRawToken();
      const tokenHash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { error: inviteErr } = await supabase
        .from('sign_invites')
        .insert({ envelope_signer_id: signerRow.id, token_hash: tokenHash, expires_at: expiresAt });
      if (inviteErr) {
        await supabase.from('document_envelopes').delete().eq('id', envelopeId);
        return json({ error: inviteErr.message || `Failed to create invite for ${s.email}.` }, 500);
      }

      inviteUrls[s.email.trim()] = buildInviteUrl(rawToken, inviteOrigin);
    }

    return json({
      envelope_id: envelopeId,
      status: 'draft',
      initiator_invite_url: buildInviteUrl(initiatorToken, inviteOrigin),
      invite_urls: inviteUrls,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
