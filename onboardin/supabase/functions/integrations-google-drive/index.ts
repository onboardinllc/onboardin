/**
 * integrations-google-drive - Ticket #06 Google Drive export (Phase A stub)
 *
 * Handlers: oauth_start, oauth_callback, ensure_folder_tree, upload_file,
 * get_file_link, disconnect
 *
 * Full implementation blocked until work/compliance.md § Prerequisites (#10 Google Cloud terms).
 *
 * Required for production:
 * - Google Cloud project with Google Drive API enabled
 * - OAuth 2.0 Web client + consent screen scoped to drive.file only:
 *   https://www.googleapis.com/auth/drive.file
 * - Supabase edge secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * - Redirect URI registered for oauth_callback (this function URL)
 * - Privacy policy URL on OAuth consent screen (compliance #3)
 * - Token encryption key for client_integration_secrets.refresh_token_encrypted
 * - npm/googleapis or raw Drive API v3 for folder tree + resumable upload
 *
 * Folder taxonomy source: scaffolds/data/drive-vault-category-map.json (embedded below).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Mirrors scaffolds/data/drive-vault-category-map.json - keep in sync on #06 changes. */
const DRIVE_VAULT_CATEGORY_MAP = {
  root: 'Onboardin/{company_slug}',
  subfolders: {
    Registration: ['articles', 'registered_agent', 'jam_brc', 'name_reservation'],
    Legal: ['operating_agreement', 'founder_docs', 'bylaws_governance', 'founder_stock'],
    Tax: ['personal_trn', 'tax_id', 'gct_registration', 'us_annual_tax', 'de_franchise_tax', 'wy_annual_report'],
    Identity: ['gov_id'],
    Statutory: ['nis_nht_heart', 'coj_annual_return', 'boi_report'],
    Banking: ['banking'],
    Marketing: [] as string[],
    Compliance: [] as string[],
    Deliverables: ['_admin_deliverable'],
    Other: ['other'],
  },
  file_name_pattern: '{category_id}-{YYYYMMDD}-{original_base_name}.{ext}',
} as const;

const SUBFOLDER_NAMES = Object.keys(DRIVE_VAULT_CATEGORY_MAP.subfolders);

const PENDING_ERROR = 'Google Drive integration pending: GCP OAuth not configured';

const HANDLERS = [
  'oauth_start',
  'oauth_callback',
  'ensure_folder_tree',
  'upload_file',
  'get_file_link',
  'disconnect',
] as const;

type HandlerAction = (typeof HANDLERS)[number];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pendingResponse(): Response {
  return jsonResponse({ error: PENDING_ERROR }, 501);
}

/** Map vault category_id → Drive subfolder name (ensure_folder_tree / upload_file). */
function resolveSubfolderForCategory(categoryId: string | null | undefined): string {
  if (categoryId == null) return 'Other';
  for (const [subfolder, categories] of Object.entries(DRIVE_VAULT_CATEGORY_MAP.subfolders)) {
    if ((categories as readonly string[]).includes(categoryId)) return subfolder;
  }
  return 'Other';
}

function buildOauthRedirectUri(): string {
  const explicit = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI');
  if (explicit) return explicit;
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  return `${base}/functions/v1/integrations-google-drive`;
}

function handleOauthStart(userId: string): Response {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const redirectUri = buildOauthRedirectUri();
  if (clientId && redirectUri) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      state: userId,
    });
    return jsonResponse({
      auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      scope: 'https://www.googleapis.com/auth/drive.file',
      redirect_uri: redirectUri,
    });
  }

  return jsonResponse({
    status: 'pending',
    message: PENDING_ERROR,
    scope: 'https://www.googleapis.com/auth/drive.file',
    folder_map: {
      root: DRIVE_VAULT_CATEGORY_MAP.root,
      subfolders: SUBFOLDER_NAMES,
      category_map: DRIVE_VAULT_CATEGORY_MAP.subfolders,
      file_name_pattern: DRIVE_VAULT_CATEGORY_MAP.file_name_pattern,
      examples: {
        articles: resolveSubfolderForCategory('articles'),
        gov_id: resolveSubfolderForCategory('gov_id'),
        unknown: resolveSubfolderForCategory('future_category'),
      },
    },
    setup: {
      blocked_by: 'work/compliance.md § Prerequisites item #10 (Google Cloud terms)',
      owner: 'Jayson',
      steps: [
        'Create Google Cloud project and enable Google Drive API',
        'Configure OAuth consent screen with drive.file scope only',
        'Create OAuth 2.0 Web client; add redirect URI for this edge function',
        'Set Supabase secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
        'Publish privacy policy URL on consent screen (compliance #3)',
        'Deploy full handler implementations in this function',
      ],
      secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      handlers: HANDLERS,
    },
  });
}

function dispatch(action: HandlerAction, userId: string): Response {
  if (action === 'oauth_start') return handleOauthStart(userId);
  return pendingResponse();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    let action: string | undefined;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      action = typeof body?.action === 'string' ? body.action : undefined;
    }

    if (!action || !HANDLERS.includes(action as HandlerAction)) {
      return jsonResponse({
        error: 'Invalid or missing action',
        valid_actions: HANDLERS,
      }, 400);
    }

    return dispatch(action as HandlerAction, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});