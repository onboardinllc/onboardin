import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch all messages due for sending
  const { data: due, error } = await supabase
    .from('messages')
    .select('*, clients(email, company_name, founder_name)')
    .not('scheduled_at', 'is', null)
    .is('sent_at', null)
    .lte('scheduled_at', new Date().toISOString());

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!due || due.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  let sent = 0;
  const results = [];

  for (const msg of due) {
    const client = msg.clients;
    const toEmail = client?.email;
    if (!toEmail) continue;

    // Always insert into the messages thread (mark as delivered in-app)
    await supabase.from('messages').update({ sent_at: new Date().toISOString() }).eq('id', msg.id);

    // Send email if flagged
    if (msg.send_email) {
      const subject = msg.email_subject || `Message from Onboardin`;
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
          <div style="background:#03020a;padding:32px;border-radius:12px;margin-bottom:24px">
            <img src="https://onboardin.llc/logo.png" alt="Onboardin" style="height:32px;margin-bottom:16px" />
            <p style="color:#a78bfa;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;margin:0">Message for ${client.company_name || toEmail}</p>
          </div>
          <div style="padding:0 8px">
            <p style="font-size:15px;line-height:1.7;color:#374151;white-space:pre-wrap">${msg.body}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0" />
            <p style="font-size:12px;color:#9ca3af">This message was sent from your Onboardin dashboard. Reply by logging in at <a href="https://onboardin.llc" style="color:#7c3aed">onboardin.llc</a></p>
          </div>
        </div>
      `;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Onboardin <navigator@onboardin.llc>',
          to: [toEmail],
          subject,
          html,
        }),
      });

      const emailData = await emailRes.json();
      results.push({ id: msg.id, email: toEmail, resend_id: emailData.id, ok: emailRes.ok });
      if (emailRes.ok) sent++;
    } else {
      sent++;
    }
  }

  return new Response(JSON.stringify({ sent, results }), { status: 200 });
});
