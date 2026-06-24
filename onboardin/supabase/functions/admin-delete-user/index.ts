import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user: caller }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { data: callerProfile } = await admin.from('clients').select('is_admin').eq('id', caller.id).single();
    if (!callerProfile?.is_admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { user_id } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (user_id === caller.id) return new Response(JSON.stringify({ error: 'Cannot delete yourself' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Clean up storage objects under the user's folder
    const { data: storageList } = await admin.storage.from('client-documents').list(user_id, { limit: 1000 });
    if (storageList && storageList.length > 0) {
      const paths = storageList.map(f => `${user_id}/${f.name}`);
      await admin.storage.from('client-documents').remove(paths);
    }
    // Also clean any nested category folders (path is {user_id}/{category}/{file})
    const { data: nested } = await admin.storage.from('client-documents').list(user_id);
    if (nested) {
      for (const item of nested) {
        if (!item.id) {
          const { data: inside } = await admin.storage.from('client-documents').list(`${user_id}/${item.name}`, { limit: 1000 });
          if (inside && inside.length > 0) {
            const paths = inside.map(f => `${user_id}/${item.name}/${f.name}`);
            await admin.storage.from('client-documents').remove(paths);
          }
        }
      }
    }

    // Delete the auth user - cascades to public.clients, documents, messages via FK
    const { error: deleteError } = await admin.auth.admin.deleteUser(user_id);
    if (deleteError) return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
