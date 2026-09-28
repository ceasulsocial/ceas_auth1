// supabase/functions/send-email-application/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Escape user-supplied strings before interpolating into HTML
function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared email shell — keeps both templates consistent
function emailShell(innerHtml: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #f7f7f8; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 22px; font-weight: 700; color: #181a1b; letter-spacing: 0.5px;">
          Ceasul Social
        </span>
      </div>

      <div style="background: #ffffff; border-radius: 8px; padding: 28px 24px;">
        ${innerHtml}
      </div>

      <p style="color: #999; font-size: 12px; text-align: center; margin: 24px 0 0 0; line-height: 1.5;">
        You received this email because you applied to become a trainer on Ceasul Social.
      </p>
    </div>
  `;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📧 send-email-application invoked');

    const { applicationId, decision, notes } = await req.json();
    console.log('📧 Request body:', { applicationId, decision, notes });

    if (!applicationId || !decision) {
      return new Response(
        JSON.stringify({ error: 'Missing applicationId or decision' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return new Response(
        JSON.stringify({ error: 'decision must be approved or rejected' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // Fetch application
    console.log('📧 Fetching application:', applicationId);
    const { data: app, error: appError } = await admin
      .from('trainer_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !app) {
      console.error('📧 Application lookup failed:', appError);
      throw new Error(`Application not found: ${appError?.message}`);
    }

    // Fetch user email
    console.log('📧 Fetching user:', app.user_id);
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(app.user_id);

    if (userError || !userData?.user?.email) {
      console.error('📧 User lookup failed:', userError);
      throw new Error(`User not found: ${userError?.message}`);
    }

    const toEmail = userData.user.email;
    const applicantName = escapeHtml(app.full_name || 'there');
    const escapedNotes = notes ? escapeHtml(notes) : null;
    console.log('📧 Sending to:', toEmail);

    // Compose
    let subject: string;
    let htmlBody: string;

    // Reusable notes block (renders on both approve and reject if notes provided)
    const notesBlock = escapedNotes
      ? `
        <div style="background: #f0f9ff; border-left: 4px solid #00bcd4; padding: 14px 16px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #181a1b; margin: 0 0 6px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
            Notes from the reviewer
          </p>
          <p style="color: #333; margin: 0; line-height: 1.6; font-size: 15px;">
            ${escapedNotes}
          </p>
        </div>
      `
      : '';

    if (decision === 'approved') {
      subject = `Welcome to Ceasul Social, ${app.full_name || 'trainer'}!`;

      htmlBody = emailShell(`
        <h1 style="color: #00bcd4; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">
          You're in 🎉
        </h1>

        <p style="color: #333; line-height: 1.7; margin: 0 0 16px 0; font-size: 15px;">
          Hi ${applicantName},
        </p>

        <p style="color: #333; line-height: 1.7; margin: 0 0 16px 0; font-size: 15px;">
          We reviewed your credentials and we're excited to welcome you to
          Ceasul Social as a trainer.
        </p>

        ${notesBlock}

        <p style="color: #333; line-height: 1.7; margin: 24px 0 12px 0; font-size: 15px; font-weight: 600;">
          What you can do now:
        </p>

        <ul style="color: #333; line-height: 1.8; margin: 0 0 24px 0; padding-left: 20px; font-size: 15px;">
          <li>Access the trainer dashboard</li>
          <li>Receive clients who need coaching</li>
          <li>Give structured feedback on their speeches</li>
        </ul>

        <div style="text-align: center; margin: 32px 0 8px 0;">
          <a href="https://ceasul-social.vercel.app"
             style="display: inline-block; background: #00bcd4; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Log in to get started
          </a>
        </div>

        <p style="color: #666; line-height: 1.7; margin: 24px 0 0 0; font-size: 14px;">
          If you have questions, just reply to this email.
        </p>
      `);
    } else {
      subject = 'Update on your Ceasul Social application';

      htmlBody = emailShell(`
        <h1 style="color: #ed4245; margin: 0 0 20px 0; font-size: 22px; font-weight: 700;">
          Application update
        </h1>

        <p style="color: #333; line-height: 1.7; margin: 0 0 16px 0; font-size: 15px;">
          Hi ${applicantName},
        </p>

        <p style="color: #333; line-height: 1.7; margin: 0 0 16px 0; font-size: 15px;">
          Thank you for taking the time to apply to become a trainer on
          Ceasul Social. After reviewing your credentials, we're unable to
          approve your application at this time.
        </p>

        ${notesBlock}

        <p style="color: #333; line-height: 1.7; margin: 20px 0 16px 0; font-size: 15px;">
          You're welcome to reapply in <strong>7 days</strong> with updated
          credentials. If you have questions about this decision, just reply
          to this email.
        </p>

        <p style="color: #666; line-height: 1.7; margin: 24px 0 0 0; font-size: 14px;">
          We appreciate your interest and wish you the best with your coaching.
        </p>
      `);
    }

    // Send via Resend
    console.log('📧 Calling Resend API…');
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Ceasul Social <onboarding@resend.dev>',
        to: [toEmail],
        subject,
        html: htmlBody,
      }),
    });

    const resendData = await resendResponse.json();
    console.log('📧 Resend response:', resendResponse.status, resendData);

    if (!resendResponse.ok) {
      return new Response(
        JSON.stringify({
          error: `Resend failed: ${
            resendData.message || JSON.stringify(resendData)
          }`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: resendData.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('📧 send-email-application error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});