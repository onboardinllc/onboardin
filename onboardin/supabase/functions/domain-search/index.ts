import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const NAMECHEAP_API_USER = Deno.env.get('NAMECHEAP_API_USER') ?? '';
const NAMECHEAP_API_KEY = Deno.env.get('NAMECHEAP_API_KEY') ?? '';
const NAMECHEAP_CLIENT_IP = Deno.env.get('NAMECHEAP_CLIENT_IP') ?? '';
const NAMECHEAP_SANDBOX = Deno.env.get('NAMECHEAP_SANDBOX') === 'true';

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
    const { domain } = await req.json();
    if (!domain) return new Response(JSON.stringify({ error: 'domain required' }), { status: 400, headers: corsHeaders });

    // Strip TLD if provided - we'll check multiple TLDs
    const sld = domain.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const tlds = ['com', 'co', 'io', 'net', 'org', 'app'];
    const domainList = tlds.map(t => `${sld}.${t}`).join(',');

    const params = new URLSearchParams({
      ApiUser: NAMECHEAP_API_USER,
      ApiKey: NAMECHEAP_API_KEY,
      UserName: NAMECHEAP_API_USER,
      ClientIp: NAMECHEAP_CLIENT_IP,
      Command: 'namecheap.domains.check',
      DomainList: domainList,
    });

    const res = await fetch(`${BASE}?${params}`);
    const xml = await res.text();

    // Parse availability from XML
    const results: { domain: string; available: boolean; price?: string }[] = [];
    const matches = xml.matchAll(/<DomainCheckResult\s+Domain="([^"]+)"\s+Available="([^"]+)"/g);
    for (const m of matches) {
      results.push({ domain: m[1], available: m[2] === 'true' });
    }

    // Attach approximate retail prices (wholesale + ~40% margin, rounded)
    const retailPrices: Record<string, string> = {
      'com': '$12.98', 'co': '$19.98', 'io': '$39.98',
      'net': '$14.98', 'org': '$12.98', 'app': '$19.98',
    };
    results.forEach(r => {
      const tld = r.domain.split('.').pop() ?? '';
      r.price = retailPrices[tld] ?? '$14.98';
    });

    return new Response(JSON.stringify({ results, sld }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
