import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NAMECHEAP_API_USER = Deno.env.get('NAMECHEAP_API_USER') ?? '';
const NAMECHEAP_API_KEY = Deno.env.get('NAMECHEAP_API_KEY') ?? '';
const NAMECHEAP_CLIENT_IP = Deno.env.get('NAMECHEAP_CLIENT_IP') ?? '';
const NAMECHEAP_SANDBOX = Deno.env.get('NAMECHEAP_SANDBOX') === 'true';
// Registrant contact info for all domains registered on behalf of clients
const REG_FIRST = Deno.env.get('REG_FIRST_NAME') ?? 'Onboardin';
const REG_LAST = Deno.env.get('REG_LAST_NAME') ?? 'LLC';
const REG_ADDRESS = Deno.env.get('REG_ADDRESS') ?? '';
const REG_CITY = Deno.env.get('REG_CITY') ?? '';
const REG_STATE = Deno.env.get('REG_STATE_PROVINCE') ?? '';
const REG_ZIP = Deno.env.get('REG_ZIP') ?? '';
const REG_COUNTRY = Deno.env.get('REG_COUNTRY') ?? 'US';
const REG_PHONE = Deno.env.get('REG_PHONE') ?? '';
const REG_EMAIL = Deno.env.get('REG_EMAIL') ?? 'admin@onboardin.llc';

const BASE = NAMECHEAP_SANDBOX
  ? 'https://api.sandbox.namecheap.com/xml.response'
  : 'https://api.namecheap.com/xml.response';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { domain, years = 1 } = await req.json();
    if (!domain) return new Response(JSON.stringify({ error: 'domain required' }), { status: 400, headers: corsHeaders });

    const [sld, tld] = domain.split(/\.(.+)/);

    const contact = {
      RegistrantFirstName: REG_FIRST,
      RegistrantLastName: REG_LAST,
      RegistrantAddress1: REG_ADDRESS,
      RegistrantCity: REG_CITY,
      RegistrantStateProvince: REG_STATE,
      RegistrantPostalCode: REG_ZIP,
      RegistrantCountry: REG_COUNTRY,
      RegistrantPhone: REG_PHONE,
      RegistrantEmailAddress: REG_EMAIL,
    };
    // Mirror to tech/admin/aux contacts
    ['Tech','Admin','AuxBilling'].forEach(role => {
      Object.entries(contact).forEach(([k, v]) => {
        contact[k.replace('Registrant', role)] = v;
      });
    });

    const params = new URLSearchParams({
      ApiUser: NAMECHEAP_API_USER,
      ApiKey: NAMECHEAP_API_KEY,
      UserName: NAMECHEAP_API_USER,
      ClientIp: NAMECHEAP_CLIENT_IP,
      Command: 'namecheap.domains.create',
      DomainName: `${sld}.${tld}`,
      Years: String(years),
      ...contact,
    });

    const res = await fetch(`${BASE}?${params}`);
    const xml = await res.text();

    const success = xml.includes('IsSuccess="true"') || xml.includes('Registered="true"');
    if (!success) {
      const errMatch = xml.match(/Number="(\d+)"[^>]*>([^<]+)</);
      return new Response(JSON.stringify({ error: errMatch?.[2] ?? 'Registration failed', xml }), { status: 400, headers: corsHeaders });
    }

    // Store domain on client profile
    await supabase.from('clients').update({
      domain: `${sld}.${tld}`,
      domain_registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    return new Response(JSON.stringify({ success: true, domain: `${sld}.${tld}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
