/**
 * Server-side PDF fill via document-fill edge.
 * Templates and field maps are loaded server-side — client sends only template_id + values.
 */
const FALLBACK_URL = 'https://qatfiicpkunabpphwqee.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA';

function edgeConfig() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : {};
  const isReal = (v) => v && !String(v).startsWith('your-');
  const url = isReal(env?.VITE_SUPABASE_URL) ? env.VITE_SUPABASE_URL : FALLBACK_URL;
  const anon = isReal(env?.VITE_SUPABASE_ANON_KEY) ? env.VITE_SUPABASE_ANON_KEY : FALLBACK_ANON_KEY;
  return { base: `${url}/functions/v1`, anon };
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function callFillEdge(supabase, action, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');

  const { base, anon } = edgeConfig();
  const res = await fetch(`${base}/document-fill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
    body: JSON.stringify({ action, ...body }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `PDF autofill failed (${res.status})`);
  if (!json.pdf_base64) throw new Error('PDF autofill returned no PDF');

  return {
    pdfBytes: base64ToBytes(json.pdf_base64),
    filledCount: json.filled_count ?? 0,
  };
}

export function fillAcroPdfViaEdge({ supabase, template, formId, fieldValues }) {
  if (!template?.id) throw new Error('Template required for autofill');
  return callFillEdge(supabase, 'fill_acro_pdf', {
    form_id: formId || template.kind,
    field_values: fieldValues,
    template_id: template.id,
  });
}

export function fillCoordinatePdfViaEdge({ supabase, template, fieldValues }) {
  if (!template?.id) throw new Error('Template required for autofill');
  return callFillEdge(supabase, 'fill_coordinate_pdf', {
    field_values: fieldValues,
    template_id: template.id,
  });
}

/** @deprecated use fillAcroPdfViaEdge */
export const fillCojPdfViaEdge = fillAcroPdfViaEdge;