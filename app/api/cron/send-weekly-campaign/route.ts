import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendNewsletterCampaignEmail } from '@/lib/resend';
import { partyPhoto } from '@/lib/data';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceSupabase();
  const now = new Date().toISOString();

  // 1. Top 5 upcoming approved events, trending (page_views desc).
  const { data: topEvents, error: eventsError } = await service
    .from('parties')
    .select('id, title, location, date, time, vibe, fee_num, cover_url, gradient, page_views')
    .eq('status', 'approved')
    .is('cancelled_at', null)
    .gte('starts_at', now)
    .order('page_views', { ascending: false })
    .limit(5);

  if (eventsError) {
    console.error('[cron:weekly-campaign] events error', eventsError);
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const eventListHtml = (topEvents ?? [])
    .map((e) => {
      const cover = partyPhoto(e.id, e.cover_url);
      const link = `${APP_URL}/party/${e.id}`;
      return `
        <li style="margin-bottom:16px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <div style="position:relative;height:140px;background:${e.gradient};">
            <img src="${cover}" alt="${String(e.title).replace(/"/g, '&quot;')}" style="width:100%;height:100%;object-fit:cover;" />
            <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(7,7,11,0.82) 0%, transparent 60%);"></div>
            <div style="position:absolute;bottom:10px;left:14px;">
              <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#FF2D95;text-transform:uppercase;">${String(e.vibe).replace(/&/g, '&amp;')}</div>
              <div style="font-size:16px;font-weight:800;color:#FFFFFF;margin-top:2px;">${String(e.title).replace(/&/g, '&amp;')}</div>
            </div>
          </div>
          <div style="padding:12px 14px;background:#12121C;">
            <div style="font-size:12px;color:#A7A8B5;">${String(e.date)} · ${String(e.time)} · ${String(e.location).replace(/&/g, '&amp;')}</div>
            <div style="margin-top:8px;">
              <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#FF2D95,#8A2BE2);border-radius:8px;padding:6px 14px;color:#FFFFFF;font-size:11px;font-weight:700;text-decoration:none;">
                ${Number(e.fee_num) === 0 ? 'Free Entry' : `₦${Number(e.fee_num).toLocaleString()}`}
              </a>
            </div>
          </div>
        </li>`;
    })
    .join('');

  if (!topEvents?.length) {
    console.log('[cron:weekly-campaign] no upcoming events, skipping campaign');
    return NextResponse.json({ okay: true, sent: 0, reason: 'no_events' });
  }

  // 2. Get subscribers (service role bypasses staff-only read policy).
  const { data: subscribers, error: subsError } = await service
    .from('newsletter_subscribers')
    .select('id, email, first_name')
    .eq('verified', true);

  if (subsError) {
    console.error('[cron:weekly-campaign] subscribers error', subsError);
    return NextResponse.json({ error: subsError.message }, { status: 500 });
  }
  if (!subscribers?.length) {
    return NextResponse.json({ okay: true, sent: 0, reason: 'no_subscribers' });
  }

  // 3. Create campaign row for tracking.
  const campaignTitle = `Weekly Lagos Events — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const { data: campaign, error: campaignError } = await service
    .from('email_campaigns')
    .insert({ title: campaignTitle, subject: 'This Week in Lagos — Hottest Events', html_content: '[generated]' })
    .select('id')
    .single();

  if (campaignError || !campaign) {
    console.error('[cron:weekly-campaign] campaign insert error', campaignError);
    return NextResponse.json({ error: campaignError?.message ?? 'Could not create campaign' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const accepted = await sendNewsletterCampaignEmail({
      to: sub.email,
      firstName: sub.first_name,
      eventListHtml,
      exploreUrl: `${APP_URL}/explore`,
    });
    if (accepted) {
      sent += 1;
      await service.from('campaign_sends').insert({
        campaign_id: campaign.id,
        subscriber_email: sub.email,
        sent_at: new Date().toISOString(),
      });
    } else {
      failed += 1;
    }
  }

  await service
    .from('email_campaigns')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', campaign.id);

  await service.rpc('write_audit_log', {
    p_action: 'newsletter_campaign_sent',
    p_target_type: 'campaign',
    p_target_id: campaign.id,
    p_details: { sent, failed },
  });

  return NextResponse.json({ okay: true, sent, failed });
}