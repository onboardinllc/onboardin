/**
 * Open a document URL - mobile Safari blocks window.open after await.
 * Use a sync placeholder tab when possible, else same-tab navigation.
 */
export function openDocumentUrl(url) {
  if (!url) return;
  try {
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (popup && !popup.closed) {
      popup.location.href = url;
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.assign(url);
}