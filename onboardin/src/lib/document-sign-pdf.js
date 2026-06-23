import { PDFDocument, StandardFonts } from '../vendor/pdf-lib.esm.min.js';

const EDGE_BASE = 'https://qatfiicpkunabpphwqee.supabase.co/functions/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA';

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Fetch master template PDF bytes. Browser fetch first; edge proxy on CORS failure.
 */
export async function fetchTemplatePdfBytes(template, supabase) {
  if (!template?.template_path) throw new Error('Template path missing');

  try {
    const res = await fetch(template.template_path);
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {
    /* edge fallback */
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');

  const res = await fetch(`${EDGE_BASE}/document-fill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ action: 'fetch_template', template_id: template.id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Template fetch failed (${res.status})`);
  if (!json.pdf_base64) throw new Error('Template fetch returned no data');
  return base64ToBytes(json.pdf_base64);
}

/**
 * Burn field_values, placements, and signature PNG onto template PDF.
 * field_map y is top-left UI coords; pdf-lib uses bottom-left origin.
 */
export async function buildSignedPdf({
  templatePdfBytes,
  fieldMap,
  fieldValues,
  placements,
  signaturePngBytes,
}) {
  const pdfDoc = await PDFDocument.load(templatePdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sigImage = signaturePngBytes?.length
    ? await pdfDoc.embedPng(signaturePngBytes)
    : null;

  for (const [key, def] of Object.entries(fieldMap || {})) {
    const pageIndex = def.page ?? 0;
    const page = pdfDoc.getPages()[pageIndex];
    if (!page) continue;

    const { height: pageHeight } = page.getSize();
    const x = def.x ?? 72;
    const w = def.w ?? 200;
    const h = def.h ?? 24;
    const uiY = def.y ?? 0;
    const pdfY = pageHeight - uiY - h;
    const fontSize = def.fontSize ?? 10;

    if (def.type === 'text') {
      const text = String(fieldValues?.[key] ?? '').trim();
      if (text) page.drawText(text, { x, y: pdfY + 4, size: fontSize, font });
    } else if (def.type === 'date') {
      const text = String(placements?.[key]?.value ?? fieldValues?.[key] ?? '').trim();
      if (text) page.drawText(text, { x, y: pdfY + 4, size: fontSize, font });
    } else if (def.type === 'signature' && placements?.[key]?.placed && sigImage) {
      page.drawImage(sigImage, { x, y: pdfY, width: w, height: h });
    }
  }

  return new Uint8Array(await pdfDoc.save());
}