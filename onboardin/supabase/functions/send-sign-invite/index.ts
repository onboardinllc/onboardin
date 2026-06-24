import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

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

async function sha256Hex(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildInviteUrl(rawToken: string, origin: string): string {
  return `${origin}/#sign?token=${encodeURIComponent(rawToken)}`;
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

async function generateRawToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // JWT required - only the authenticated initiator triggers send
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const { envelope_id, origin } = body;
    if (!envelope_id) return json({ error: 'envelope_id required' }, 400);

    // Load envelope - verify caller is the initiator (client_id match)
    const { data: envelope, error: envErr } = await supabase
      .from('document_envelopes')
      .select('id, status, client_id, template_id, document_job_id')
      .eq('id', envelope_id)
      .eq('client_id', user.id)
      .maybeSingle();

    if (envErr || !envelope) return json({ error: 'Envelope not found.' }, 404);
    if (envelope.status !== 'pending') {
      return json({ error: `Invites can only be sent when envelope is pending. Current status: ${envelope.status}` }, 400);
    }

    const { data: initiatorRow } = await supabase
      .from('envelope_signers')
      .select('status')
      .eq('envelope_id', envelope_id)
      .eq('is_initiator', true)
      .maybeSingle();

    if (initiatorRow?.status !== 'signed') {
      return json({ error: 'Initiator must sign before sending invites.' }, 400);
    }

    // Load non-initiator signers that are still pending
    const { data: signers, error: sigErr } = await supabase
      .from('envelope_signers')
      .select('id, email, display_name, status, is_initiator')
      .eq('envelope_id', envelope_id)
      .eq('is_initiator', false)
      .in('status', ['pending', 'opened']);

    if (sigErr) return json({ error: sigErr.message }, 500);
    if (!signers?.length) return json({ ok: true, sent: 0, message: 'No pending invitees.' });

    // Load template label for email copy
    const { data: template } = await supabase
      .from('legal_templates')
      .select('label')
      .eq('id', envelope.template_id)
      .maybeSingle();

    // Load initiator name for email
    const { data: client } = await supabase
      .from('clients')
      .select('founder_name, company_name')
      .eq('id', user.id)
      .maybeSingle();

    const initiatorName = client?.founder_name || client?.company_name || 'Your co-founder';
    const templateLabel = template?.label || 'Document';
    const inviteOrigin = resolveInviteOrigin(origin);
    const TOKEN_TTL_DAYS = 14;

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];

    for (const signer of signers) {
      // Generate fresh token
      const rawToken = await generateRawToken();
      const tokenHash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Revoke any existing non-expired invite for this signer
      await supabase
        .from('sign_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('envelope_signer_id', signer.id)
        .is('revoked_at', null);

      // Insert fresh invite
      const { error: inviteErr } = await supabase
        .from('sign_invites')
        .insert({ envelope_signer_id: signer.id, token_hash: tokenHash, expires_at: expiresAt });

      if (inviteErr) {
        results.push({ email: signer.email, ok: false, error: inviteErr.message });
        continue;
      }

      const inviteUrl = buildInviteUrl(rawToken, inviteOrigin);

      // Send via Resend
      if (!RESEND_API_KEY) {
        results.push({ email: signer.email, ok: true, dev_url: inviteUrl });
        continue;
      }

      const displayName = signer.display_name || signer.email.split('@')[0];
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
          <div style="background:#03020a;padding:32px;border-radius:12px;margin-bottom:24px">
            <p style="color:#a78bfa;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;margin:0">
              Onboardin - Document signing
            </p>
          </div>
          <div style="padding:0 8px">
            <p style="font-size:15px;line-height:1.7;color:#374151">
              Hi ${displayName},
            </p>
            <p style="font-size:15px;line-height:1.7;color:#374151">
              ${initiatorName} has invited you to sign the <strong>${templateLabel}</strong>.
              Your signature is required to complete this document.
            </p>
            <p style="margin:24px 0">
              <a href="${inviteUrl}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">
                Review and sign
              </a>
            </p>
            <p style="font-size:13px;color:#6b7280;line-height:1.6">
              This link expires in ${TOKEN_TTL_DAYS} days. Do not forward it - it is bound to your email address.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0" />
            <p style="font-size:12px;color:#9ca3af">Onboardin &mdash; <a href="https://onboardin.llc" style="color:#7c3aed">onboardin.llc</a></p>
          </div>
        </div>
      `;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Onboardin <navigator@onboardin.llc>',
          to: [signer.email],
          subject: `${initiatorName} invited you to sign - ${templateLabel}`,
          html,
        }),
      });

      const emailData = await emailRes.json().catch(() => ({}));
      results.push({
        email: signer.email,
        ok: emailRes.ok,
        ...(emailRes.ok ? { resend_id: emailData.id } : { error: emailData.message }),
      });
    }

    const sent = results.filter((r) => r.ok).length;
    return json({ ok: true, sent, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
