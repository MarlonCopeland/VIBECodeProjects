// supabase/functions/_shared/delivery.ts
// Download grants + the "your download is ready" email (Resend REST API).
//
// Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "Legend <hello@yourdomain>" on a
// domain verified in Resend). Optional DOWNLOAD_BASE_URL to front the
// desktop-download function with your own domain.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './common.ts';

export const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export interface Grant {
  token: string;
  user_id: string;
  purchase_id: string;
  revoked: boolean;
  last_emailed_at: string | null;
  emailed_to: string | null;
}

export async function ensureGrant(db: SupabaseClient, userId: string, purchaseId: string): Promise<Grant> {
  const { data: existing } = await db.from('download_grants').select('*').eq('purchase_id', purchaseId).maybeSingle();
  if (existing) {
    if (existing.revoked) {
      const { data } = await db.from('download_grants').update({ revoked: false }).eq('token', existing.token).select().single();
      return data as Grant;
    }
    return existing as Grant;
  }
  const { data, error } = await db.from('download_grants').insert({ user_id: userId, purchase_id: purchaseId }).select().single();
  if (error) throw new Error(error.message);
  return data as Grant;
}

export function downloadUrl(token: string, os?: 'windows' | 'mac' | 'linux'): string {
  const base = Deno.env.get('DOWNLOAD_BASE_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/desktop-download`;
  return `${base}?t=${token}${os ? `&os=${os}` : ''}`;
}

function emailBodies(token: string): { html: string; text: string } {
  const win = downloadUrl(token, 'windows');
  const mac = downloadUrl(token, 'mac');
  const linux = downloadUrl(token, 'linux');
  const button = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 18px;border-radius:10px;background:#2F6FE0;color:#ffffff;text-decoration:none;font-weight:600">${label}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#0B0D12;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#F7F8FA">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
  <div style="font-weight:800;letter-spacing:.08em;font-size:18px">LEGEND</div>
  <h1 style="font-size:24px;margin:24px 0 8px">Your Legend Full Suite is ready</h1>
  <p style="color:#9AA2B1;line-height:1.5">Thanks for buying the Full Suite. Download Legend for your computer, then sign in with the same Legend account you used on your phone.</p>
  <p>${button(win, 'Download for Windows')}${button(mac, 'Download for macOS')}</p>
  <p style="color:#9AA2B1;font-size:13px">On Linux? <a href="${linux}" style="color:#4C8BF5">Download the AppImage</a>.</p>
  <p style="color:#9AA2B1;font-size:13px;line-height:1.5">These links are tied to your purchase. They always fetch the newest version, so you can keep this email and reinstall any time. You can also re-send this email from the Legend app: Settings → Legend Full Suite.</p>
</div></body></html>`;
  const text =
    `Your Legend Full Suite is ready.\n\nDownload Legend for your computer, then sign in with the same Legend account you use on your phone.\n\n` +
    `Windows: ${win}\nmacOS: ${mac}\nLinux: ${linux}\n\n` +
    `These links are tied to your purchase and always fetch the newest version. Re-send this email any time from the Legend app: Settings → Legend Full Suite.\n`;
  return { html, text };
}

/**
 * Email the download links. Without `force` it sends at most once per grant
 * (the first verified purchase); with `force` (the "email me again" button)
 * it's rate-limited to one every RESEND_COOLDOWN_MS.
 */
export async function emailGrant(
  db: SupabaseClient,
  grant: Grant,
  to: string,
  opts: { force: boolean },
): Promise<{ sent: boolean; to: string }> {
  if (grant.last_emailed_at) {
    if (!opts.force) return { sent: false, to: grant.emailed_to ?? to };
    const since = Date.now() - Date.parse(grant.last_emailed_at);
    if (since < RESEND_COOLDOWN_MS) {
      const mins = Math.ceil((RESEND_COOLDOWN_MS - since) / 60000);
      throw new HttpError(429, `We just sent it — check ${grant.emailed_to ?? to} (and spam). You can resend in ${mins} min.`);
    }
  }
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) throw new Error('Email delivery is not configured (RESEND_API_KEY / EMAIL_FROM).');

  const { html, text } = emailBodies(grant.token);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'Download Legend for your computer', html, text }),
  });
  if (!res.ok) throw new Error(`Email failed to send (${res.status}): ${await res.text()}`);

  await db
    .from('download_grants')
    .update({ last_emailed_at: new Date().toISOString(), emailed_to: to })
    .eq('token', grant.token);
  return { sent: true, to };
}
