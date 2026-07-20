import { lazy, Suspense } from 'react';

export function DocumentUiLoading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 px-6 text-sm text-gray-400">
      <span
        className="inline-block w-4 h-4 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

const DocumentEditorInner = lazy(() => import('../components/DocumentEditor.jsx'));
export function LazyDocumentEditor(props) {
  return (
    <Suspense fallback={<DocumentUiLoading label="Opening editor…" />}>
      <DocumentEditorInner {...props} />
    </Suspense>
  );
}

const DocumentFillPanelInner = lazy(() => import('../components/DocumentFillPanel.jsx'));
export function LazyDocumentFillPanel(props) {
  return (
    <Suspense fallback={<DocumentUiLoading label="Opening document…" />}>
      <DocumentFillPanelInner {...props} />
    </Suspense>
  );
}

const SignPortalInner = lazy(() => import('../components/SignPortal.jsx'));
export function LazySignPortal(props) {
  return (
    <Suspense fallback={<DocumentUiLoading label="Loading sign portal…" />}>
      <SignPortalInner {...props} />
    </Suspense>
  );
}

const GoogleDriveConnectPanelInner = lazy(() => import('../components/GoogleDriveConnectPanel.jsx'));
export function LazyGoogleDriveConnectPanel(props) {
  return (
    <Suspense fallback={<DocumentUiLoading label="Loading Drive settings…" />}>
      <GoogleDriveConnectPanelInner {...props} />
    </Suspense>
  );
}

const SignatureCanvasInner = lazy(() => import('../components/SignatureCanvas.jsx'));
export function LazySignatureCanvas(props) {
  return (
    <Suspense fallback={<DocumentUiLoading label="Loading canvas…" />}>
      <SignatureCanvasInner {...props} />
    </Suspense>
  );
}

const DocumentSignOverlayInner = lazy(() => import('../components/DocumentSignOverlay.jsx'));
export function LazyDocumentSignOverlay(props) {
  return (
    <Suspense fallback={<DocumentUiLoading label="Opening sign overlay…" />}>
      <DocumentSignOverlayInner {...props} />
    </Suspense>
  );
}
