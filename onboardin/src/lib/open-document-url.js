/**
 * Open a document URL in a new tab when we already have the URL.
 */
export function openDocumentUrl(url) {
  if (!url) return;

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) return;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Open a client-documents storage path. Opens a tab during the click gesture,
 * then navigates once the signed URL returns (mobile Safari blocks late window.open).
 */
export async function openStorageDocument(supabase, path, ttlSec = 300) {
  if (!supabase?.storage || !path) return;

  let popup = null;
  try {
    popup = window.open('about:blank', '_blank');
  } catch {
    /* popup blocked */
  }

  try {
    const { data, error } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(path, ttlSec);

    const url = data?.signedUrl;
    if (error || !url) {
      try {
        popup?.close();
      } catch {
        /* ignore */
      }
      return;
    }

    if (popup && !popup.closed) {
      try {
        popup.location.replace(url);
        return;
      } catch {
        try {
          popup.close();
        } catch {
          /* ignore */
        }
      }
    }

    openDocumentUrl(url);
  } catch {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
  }
}
