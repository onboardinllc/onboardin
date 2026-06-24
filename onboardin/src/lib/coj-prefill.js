/**
 * COJ autofill — thin wrapper around runDocumentAutofill (autofill-service.js).
 * Kept for backward-compatible import; behavior is identical to direct service call.
 * Never calls document-fill edge (0 credits; no LLM).
 */
export { runDocumentAutofill as applyCojAutofill } from './autofill-service.js';
