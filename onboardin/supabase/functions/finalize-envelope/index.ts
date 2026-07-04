import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1?target=deno';

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

function isServiceRoleRequest(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return token.length > 0 && token === SUPABASE_SERVICE_ROLE_KEY;
}

async function releaseFinalizeLock(
  supabase: ReturnType<typeof createClient>,
  envelopeId: string,
) {
  await supabase.from('document_envelopes').update({ finalize_lock: null }).eq('id', envelopeId);
}

async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface AuditSigner { name: string; email: string; signedAt: string | null }
interface AuditInfo { docLabel: string; referenceId: string; signers: AuditSigner[] }

async function buildSignedPdf(opts: {
  templatePdfBytes: Uint8Array;
  fieldMap: Record<string, { page?: number; x?: number; y?: number; w?: number; h?: number; fontSize?: number; type: string }>;
  fieldValues: Record<string, string>;
  placements: Record<string, { placed?: boolean; value?: string; path?: string }>;
  signaturesByFieldKey: Record<string, Uint8Array>;
  audit?: AuditInfo;
}): Promise<Uint8Array> {
  const { templatePdfBytes, fieldMap, fieldValues, placements, signaturesByFieldKey, audit } = opts;
  const pdfDoc = await PDFDocument.load(templatePdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const embeddedImages = new Map<Uint8Array, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();
  async function getEmbedded(bytes: Uint8Array) {
    if (embeddedImages.has(bytes)) return embeddedImages.get(bytes)!;
    const img = await pdfDoc.embedPng(bytes);
    embeddedImages.set(bytes, img);
    return img;
  }

  for (const [key, def] of Object.entries(fieldMap)) {
    const pageIndex = def.page ?? 0;
    const page = pdfDoc.getPages()[pageIndex];
    if (!page) continue;

    const { height: pageHeight } = page.getSize();
    const x = def.x ?? 72;
    const w = def.w ?? 200;
    const h = def.h ?? 24;
    const pdfY = pageHeight - (def.y ?? 0) - h;
    const fontSize = def.fontSize ?? 10;

    if (def.type === 'text') {
      const text = String(fieldValues[key] ?? '').trim();
      if (text) page.drawText(text, { x, y: pdfY + 4, size: fontSize, font });
    } else if (def.type === 'date') {
      const text = String(placements[key]?.value ?? fieldValues[key] ?? '').trim();
      if (text) page.drawText(text, { x, y: pdfY + 4, size: fontSize, font });
    } else if (def.type === 'signature' && placements[key]?.placed) {
      const fieldBytes = signaturesByFieldKey[key];
      if (fieldBytes?.length) {
        const img = await getEmbedded(fieldBytes);
        page.drawImage(img, { x, y: pdfY, width: w, height: h });
      }
    }
  }

  // Signature certificate page: attribution + integrity record in the artifact itself
  if (audit) {
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const templateSha256 = await sha256HexOfBytes(templatePdfBytes);
    const page = pdfDoc.addPage([612, 792]);
    let y = 720;
    const left = 72;
    const line = (text: string, size = 10, bold = false, gap = 18) => {
      page.drawText(text, { x: left, y, size, font: bold ? boldFont : font });
      y -= gap;
    };
    line('Signature Certificate', 18, true, 30);
    line(`Document: ${audit.docLabel || 'Untitled document'}`, 11, false, 20);
    line(`Reference: ${audit.referenceId}`, 10, false, 20);
    line(`Generated: ${new Date().toISOString()}`, 10, false, 28);
    line('Signed by', 12, true, 22);
    for (const s of audit.signers) {
      line(`${s.name ? s.name + '  ' : ''}${s.email ? '<' + s.email + '>' : ''}`, 11, false, 16);
      if (s.signedAt) line(`Signed at ${s.signedAt}`, 9, false, 22);
      else y -= 6;
    }
    y -= 10;
    line('Integrity', 12, true, 22);
    line('SHA-256 of source document before signing:', 9, false, 14);
    line(templateSha256, 9, false, 14);
    y -= 14;
    line('Recorded by Onboardin (onboardin.llc). Signature placements and timestamps', 8, false, 12);
    line('are stored with this document record and available on request.', 8, false, 12);
  }

  return new Uint8Array(await pdfDoc.save());
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!isServiceRoleRequest(req)) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { envelope_id } = body;
    if (!envelope_id) return json({ error: 'envelope_id required' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load envelope
    const { data: envelope, error: envErr } = await supabase
      .from('document_envelopes')
      .select('id, status, document_job_id, client_id, template_id, finalize_lock, completed_at')
      .eq('id', envelope_id)
      .maybeSingle();

    if (envErr || !envelope) return json({ error: 'Envelope not found.' }, 404);

    // Idempotency: already completed
    if (envelope.status === 'completed') return json({ ok: true, already_completed: true });

    // Only finalize pending envelopes
    if (envelope.status !== 'pending') {
      return json({ error: `Cannot finalize envelope in status: ${envelope.status}` }, 400);
    }

    // Check all signers signed
    const { data: signers, error: sigErr } = await supabase
      .from('envelope_signers')
      .select('id, status, field_keys, field_placements, signature_storage_path, is_initiator, email, display_name, signed_at')
      .eq('envelope_id', envelope_id);

    if (sigErr || !signers?.length) return json({ error: 'No signers found.' }, 400);

    const allSigned = signers.every((s) => s.status === 'signed');
    if (!allSigned) return json({ ok: false, message: 'Not all signers have signed yet.' });

    const lockNow = new Date().toISOString();
    const { data: lockedRow, error: lockErr } = await supabase
      .from('document_envelopes')
      .update({ finalize_lock: lockNow })
      .eq('id', envelope_id)
      .is('finalize_lock', null)
      .select('id')
      .maybeSingle();

    if (lockErr) return json({ error: lockErr.message }, 500);
    if (!lockedRow) return json({ ok: false, message: 'Finalize already in progress.' });

    // Load job + template
    const { data: job } = await supabase
      .from('document_jobs')
      .select('id, field_values, field_placements, template_id')
      .eq('id', envelope.document_job_id)
      .single();

    const { data: template } = await supabase
      .from('legal_templates')
      .select('id, label, template_path, vault_card_id, multi_signer_field_map')
      .eq('id', envelope.template_id)
      .single();

    if (!job || !template) {
      await releaseFinalizeLock(supabase, envelope_id);
      return json({ error: 'Job or template not found.' }, 404);
    }

    // Load client email for notification
    const { data: client } = await supabase
      .from('clients')
      .select('email, company_name, founder_name')
      .eq('id', envelope.client_id)
      .maybeSingle();

    // Merge placements: job base + each signer (signer wins)
    const basePlacements = (Array.isArray(job.field_placements) ? {} : job.field_placements) ?? {};
    const mergedPlacements: Record<string, { placed?: boolean; value?: string; path?: string }> = { ...basePlacements };
    for (const s of signers) {
      const sp = s.field_placements ?? {};
      Object.assign(mergedPlacements, sp);
    }

    // Load PNG bytes per field key from signature_storage_path
    const signaturesByFieldKey: Record<string, Uint8Array> = {};
    for (const s of signers) {
      if (!s.signature_storage_path || !s.field_keys?.length) continue;
      const { data: pngData, error: dlErr } = await supabase.storage
        .from('client-documents')
        .download(s.signature_storage_path);
      if (dlErr || !pngData) {
        await releaseFinalizeLock(supabase, envelope_id);
        return json({ error: `Failed to load signature PNG for signer ${s.id}.` }, 500);
      }
      const pngBytes = new Uint8Array(await pngData.arrayBuffer());
      for (const key of s.field_keys) {
        if (key && (template.multi_signer_field_map?.[key]?.type === 'signature')) {
          signaturesByFieldKey[key] = pngBytes;
          if (!mergedPlacements[key]) mergedPlacements[key] = { placed: true, path: s.signature_storage_path };
        }
      }
    }

    const requiredSigKeys = Object.entries(template.multi_signer_field_map ?? {})
      .filter(([, def]) => def?.type === 'signature')
      .map(([key]) => key);
    const missingSig = requiredSigKeys.filter((key) => !signaturesByFieldKey[key]?.length);
    if (missingSig.length) {
      await releaseFinalizeLock(supabase, envelope_id);
      return json({ error: `Missing signature images for: ${missingSig.join(', ')}` }, 500);
    }

    // Fetch template PDF
    const templateRes = await fetch(template.template_path);
    if (!templateRes.ok) {
      await releaseFinalizeLock(supabase, envelope_id);
      return json({ error: 'Failed to fetch template PDF.' }, 502);
    }
    const templatePdfBytes = new Uint8Array(await templateRes.arrayBuffer());

    // Build signed PDF
    const signedPdfBytes = await buildSignedPdf({
      templatePdfBytes,
      fieldMap: template.multi_signer_field_map ?? {},
      fieldValues: job.field_values ?? {},
      placements: mergedPlacements,
      signaturesByFieldKey,
      audit: {
        docLabel: template.label,
        referenceId: envelope_id,
        signers: signers.map((s) => ({
          name: (s.display_name as string) || '',
          email: (s.email as string) || '',
          signedAt: (s.signed_at as string) || null,
        })),
      },
    });

    // Upload to client path (initiator path, same as solo)
    const vaultCardId = template.vault_card_id || 'vault';
    const ts = Date.now();
    const signedPath = `${envelope.client_id}/${vaultCardId}/signed-${ts}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from('client-documents')
      .upload(signedPath, signedPdfBytes, { contentType: 'application/pdf', upsert: false });
    if (uploadErr) {
      await releaseFinalizeLock(supabase, envelope_id);
      return json({ error: uploadErr.message || 'PDF upload failed.' }, 500);
    }

    const now = new Date().toISOString();

    // Insert documents row (vault visibility). Column set must match live
    // public.documents schema (no mime_type column).
    const { error: docErr } = await supabase.from('documents').insert({
      client_id: envelope.client_id,
      category: vaultCardId,
      name: `${template.label} - signed`,
      path: signedPath,
      size: signedPdfBytes.byteLength,
      created_at: now,
    });
    if (docErr) {
      await supabase.storage.from('client-documents').remove([signedPath]);
      await releaseFinalizeLock(supabase, envelope_id);
      return json({ error: docErr.message || 'Failed to insert vault document.' }, 500);
    }

    // Update document_jobs: signed + merged placements
    await supabase.from('document_jobs').update({
      status: 'signed',
      signed_path: signedPath,
      signed_at: now,
      field_placements: mergedPlacements,
      updated_at: now,
    }).eq('id', job.id);

    // Update envelope: completed
    await supabase.from('document_envelopes').update({
      status: 'completed',
      completed_at: now,
      updated_at: now,
    }).eq('id', envelope_id);

    // Notify initiator via Resend
    if (RESEND_API_KEY && client?.email) {
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
          <div style="background:#03020a;padding:32px;border-radius:12px;margin-bottom:24px">
            <p style="color:#a78bfa;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;margin:0">
              Onboardin - ${client.company_name || 'Document signing'}
            </p>
          </div>
          <div style="padding:0 8px">
            <p style="font-size:15px;line-height:1.7;color:#374151">
              All signatures are in. Your signed ${template.label} is ready in your vault.
            </p>
            <p style="margin:24px 0">
              <a href="https://onboardin.llc" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">
                View in vault
              </a>
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0" />
            <p style="font-size:12px;color:#9ca3af">Onboardin &mdash; <a href="https://onboardin.llc" style="color:#7c3aed">onboardin.llc</a></p>
          </div>
        </div>
      `;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Onboardin <navigator@onboardin.llc>',
          to: [client.email],
          subject: `All signatures complete - ${template.label}`,
          html,
        }),
      });
    }

    return json({ ok: true, signed_path: signedPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
