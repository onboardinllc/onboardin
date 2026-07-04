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

// In-memory rate limiter for validate_token (resets on cold start).
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

async function sha256Hex(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const PNG_MAX_BYTES = 512 * 1024;

function validatePngBytes(bytes: Uint8Array): { ok: true } | { error: string } {
  if (bytes.length < 4) return { error: 'File too small.' };
  if (bytes.length > PNG_MAX_BYTES) return { error: 'Signature PNG must be 512 KB or smaller.' };
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return { error: 'File must be a PNG image.' };
  }
  return { ok: true };
}

// UUID pattern check (prevent path traversal)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertEnvelopeSigPath(signerUserId: string, envelopeId: string, signerRowId: string): string {
  if (!UUID_RE.test(signerUserId)) throw new Error('Invalid signerUserId.');
  if (!UUID_RE.test(envelopeId)) throw new Error('Invalid envelopeId.');
  if (!UUID_RE.test(signerRowId)) throw new Error('Invalid signerRowId.');
  return `${signerUserId}/envelope-signatures/${envelopeId}/${signerRowId}.png`;
}

async function resolveTokenAndSigner(supabase: ReturnType<typeof createClient>, rawToken: string) {
  const tokenHash = await sha256Hex(rawToken);

  const { data: invite, error: invErr } = await supabase
    .from('sign_invites')
    .select('id, expires_at, revoked_at, opened_at, envelope_signer_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (invErr || !invite) return { error: 'Invalid or expired invite link.', status: 404 };
  if (invite.revoked_at) return { error: 'This invite link has been revoked.', status: 410 };
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invite link has expired.', status: 410 };

  const { data: signer, error: signerErr } = await supabase
    .from('envelope_signers')
    .select('id, email, display_name, status, envelope_id, is_initiator, field_keys, signer_user_id')
    .eq('id', invite.envelope_signer_id)
    .maybeSingle();

  if (signerErr || !signer) return { error: 'Signer not found.', status: 404 };
  if (!['pending', 'opened'].includes(signer.status)) {
    return { error: 'This signature slot is no longer available.', status: 410 };
  }

  const { data: envelope, error: envErr } = await supabase
    .from('document_envelopes')
    .select('id, status, document_job_id, client_id, template_id')
    .eq('id', signer.envelope_id)
    .maybeSingle();

  if (envErr || !envelope) return { error: 'Envelope not found.', status: 404 };

  const envelopeOpen =
    envelope.status === 'pending' ||
    (envelope.status === 'draft' && signer.is_initiator === true);

  if (!envelopeOpen) return { error: 'Envelope is not open for signing.', status: 410 };

  return { invite, signer, envelope };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const { action, token: rawToken } = body;

    // -----------------------------------------------------------------------
    // validate_token - no auth required; rate-limited by IP
    // -----------------------------------------------------------------------
    if (action === 'validate_token') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      if (!checkRateLimit(ip)) {
        return json({ error: 'Too many requests. Try again later.' }, 429);
      }
      if (!rawToken || typeof rawToken !== 'string') {
        return json({ error: 'token required' }, 400);
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const result = await resolveTokenAndSigner(supabase, rawToken);
      if ('error' in result) {
        // Friendly UX when invitee returns after signing
        if (result.status === 410 && result.error === 'This signature slot is no longer available.') {
          const tokenHash = await sha256Hex(rawToken);
          const { data: invite } = await supabase
            .from('sign_invites')
            .select('expires_at, envelope_signer_id')
            .eq('token_hash', tokenHash)
            .maybeSingle();
          const { data: signer } = invite
            ? await supabase
              .from('envelope_signers')
              .select('status, display_name, is_initiator, email')
              .eq('id', invite.envelope_signer_id)
              .maybeSingle()
            : { data: null };
          if (signer?.status === 'signed') {
            const [localPart, domain] = (signer.email ?? '').split('@');
            const maskedEmail = localPart.charAt(0) + '***@' + (domain ?? '');
            return json({
              valid: false,
              already_signed: true,
              masked_email: maskedEmail,
              display_name: signer.display_name ?? null,
              expires_at: invite?.expires_at,
              is_initiator: signer.is_initiator,
            });
          }
        }
        return json({ error: result.error }, result.status);
      }

      const { signer, invite } = result;
      const [localPart, domain] = signer.email.split('@');
      const maskedEmail = localPart.charAt(0) + '***@' + (domain ?? '');

      return json({
        valid: true,
        masked_email: maskedEmail,
        display_name: signer.display_name ?? null,
        expires_at: invite.expires_at,
        is_initiator: signer.is_initiator,
      });
    }

    // -----------------------------------------------------------------------
    // get_context - requires JWT
    // -----------------------------------------------------------------------
    if (action === 'get_context') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Authentication required.' }, 401);

      if (!rawToken || typeof rawToken !== 'string') return json({ error: 'token required' }, 400);

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Verify JWT
      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', ''),
      );
      if (authErr || !user) return json({ error: 'Authentication required.' }, 401);

      const result = await resolveTokenAndSigner(supabase, rawToken);
      if ('error' in result) return json({ error: result.error }, result.status);

      const { invite, signer, envelope } = result;

      // Email binding
      if (user.email?.toLowerCase() !== signer.email.toLowerCase()) {
        return json({ error: 'Signed-in email does not match this invite.' }, 403);
      }

      // Mark opened (first time only)
      const now = new Date().toISOString();
      if (!invite.opened_at) {
        await supabase.from('sign_invites').update({ opened_at: now }).eq('id', invite.id);
      }
      if (signer.status === 'pending') {
        await supabase.from('envelope_signers').update({ status: 'opened' }).eq('id', signer.id);
      }

      // Load job + template (service role - invitees have no RLS access)
      const { data: job, error: jobErr } = await supabase
        .from('document_jobs')
        .select('id, field_values, field_placements')
        .eq('id', envelope.document_job_id)
        .maybeSingle();
      if (jobErr || !job) return json({ error: 'Document job not found.' }, 404);

      const { data: template, error: tErr } = await supabase
        .from('legal_templates')
        .select('id, label, multi_signer_field_map')
        .eq('id', envelope.template_id)
        .maybeSingle();
      if (tErr || !template) return json({ error: 'Template not found.' }, 404);

      // Filter multi_signer_field_map to only this signer's assigned keys
      const fieldMap = template.multi_signer_field_map ?? {};
      const assignedFieldMap: Record<string, unknown> = {};
      for (const key of (signer.field_keys ?? [])) {
        if (fieldMap[key]) assignedFieldMap[key] = fieldMap[key];
      }

      return json({
        template_label: template.label,
        field_values: job.field_values ?? {},
        signer_field_keys: signer.field_keys ?? [],
        assigned_field_map: assignedFieldMap,
        is_initiator: signer.is_initiator,
        envelope_status: envelope.status,
        display_name: signer.display_name ?? null,
        email: signer.email,
      });
    }

    // -----------------------------------------------------------------------
    // save_signature - requires JWT + PNG in body
    // -----------------------------------------------------------------------
    if (action === 'save_signature') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Authentication required.' }, 401);

      if (!rawToken || typeof rawToken !== 'string') return json({ error: 'token required' }, 400);

      const { png_base64, field_placements } = body;
      if (!png_base64 || typeof png_base64 !== 'string') {
        return json({ error: 'png_base64 required' }, 400);
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', ''),
      );
      if (authErr || !user) return json({ error: 'Authentication required.' }, 401);

      const result = await resolveTokenAndSigner(supabase, rawToken);
      if ('error' in result) return json({ error: result.error }, result.status);

      const { signer, envelope } = result;

      // Email binding
      if (user.email?.toLowerCase() !== signer.email.toLowerCase()) {
        return json({ error: 'Signed-in email does not match this invite.' }, 403);
      }

      // Validate PNG
      let pngBytes: Uint8Array;
      try {
        const raw = atob(png_base64.replace(/^data:image\/png;base64,/, ''));
        pngBytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) pngBytes[i] = raw.charCodeAt(i);
      } catch {
        return json({ error: 'Invalid PNG data.' }, 400);
      }
      const pngCheck = validatePngBytes(pngBytes);
      if ('error' in pngCheck) return json({ error: pngCheck.error }, 400);

      // Build and assert storage path
      let storagePath: string;
      try {
        storagePath = assertEnvelopeSigPath(user.id, envelope.id, signer.id);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Invalid path.' }, 400);
      }

      // Upload PNG (service role, no RLS restriction on path)
      const { error: uploadErr } = await supabase.storage
        .from('client-documents')
        .upload(storagePath, pngBytes, { contentType: 'image/png', upsert: true });
      if (uploadErr) return json({ error: uploadErr.message || 'Upload failed.' }, 500);

      const now = new Date().toISOString();

      const placements: Record<string, unknown> = {};
      for (const key of (signer.field_keys ?? [])) {
        placements[key] = { placed: true, path: storagePath };
      }
      if (field_placements && typeof field_placements === 'object') {
        const allowed = new Set(signer.field_keys ?? []);
        for (const [key, val] of Object.entries(field_placements)) {
          if (allowed.has(key)) placements[key] = val;
        }
      }

      const { error: updateErr } = await supabase
        .from('envelope_signers')
        .update({
          status: 'signed',
          signature_storage_path: storagePath,
          field_placements: placements,
          signer_user_id: user.id,
          signed_at: now,
        })
        .eq('id', signer.id);
      if (updateErr) return json({ error: updateErr.message || 'Failed to save signature.' }, 500);

      // Initiator activation after signer row is signed - avoids pending envelope with unsigned initiator
      if (signer.is_initiator && envelope.status === 'draft') {
        const { error: envActivateErr } = await supabase
          .from('document_envelopes')
          .update({ status: 'pending', updated_at: now })
          .eq('id', envelope.id);
        if (envActivateErr) {
          return json({ error: envActivateErr.message || 'Failed to activate envelope.' }, 500);
        }

        const { error: jobActivateErr } = await supabase
          .from('document_jobs')
          .update({ status: 'pending_signatures', updated_at: now })
          .eq('id', envelope.document_job_id);
        if (jobActivateErr) {
          return json({ error: jobActivateErr.message || 'Failed to update document job.' }, 500);
        }
      }

      // Check if all signers have now signed - trigger finalize async (fire-and-forget)
      const { data: allSigners } = await supabase
        .from('envelope_signers')
        .select('id, status')
        .eq('envelope_id', envelope.id);

      const allSigned = allSigners?.every((s) => s.status === 'signed') ?? false;

      if (allSigned) {
        const finalizeUrl = `${SUPABASE_URL}/functions/v1/finalize-envelope`;
        const finalizeCall = fetch(finalizeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ envelope_id: envelope.id }),
        }).catch(() => { /* recovered by check_finalize from the initiator's panel */ });
        // waitUntil keeps the call alive after this response returns;
        // without it the runtime may kill the pending fetch.
        const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (runtime?.waitUntil) runtime.waitUntil(finalizeCall);
      }

      return json({ ok: true, storage_path: storagePath });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
