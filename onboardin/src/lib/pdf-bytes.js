/** Decode base64 PDF payloads - chunked for large strings on mobile WebKit. */
export function base64ToBytes(b64) {
  const input = String(b64 || '').replace(/\s/g, '');
  if (!input) return new Uint8Array(0);

  const chunkSize = 0x8000;
  const parts = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    const slice = input.slice(i, i + chunkSize);
    const binary = atob(slice);
    const bytes = new Uint8Array(binary.length);
    for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
    parts.push(bytes);
  }

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Blob upload body - more reliable than raw Uint8Array on iOS Safari. */
export function pdfBytesToUploadBody(pdfBytes) {
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  return new Blob([bytes], { type: 'application/pdf' });
}