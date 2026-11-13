// supabase/functions/desktop-download
// GET ?t=<grant token>[&os=windows|mac|linux] — the link in the purchase
// email (no JWT: the grant token IS the credential). Checks the grant and its
// purchase are still active, then 302-redirects to a 5-minute signed URL for
// the newest installer of that OS in the private `desktop-releases` bucket.
// Without &os the OS is guessed from the User-Agent.
//
// Responses are plain text on purpose: Supabase serves HTML from the default
// *.supabase.co functions domain as text/plain, so a landing page would not
// render. The email carries one link per OS instead.

import { admin, text } from '../_shared/common.ts';

type Os = 'windows' | 'mac' | 'linux';

function guessOs(ua: string): Os | null {
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return null;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('t') ?? '';
    if (!/^[0-9a-f]{48}$/.test(token)) return text('This download link is incomplete. Use the link from your Legend email.', 400);

    const db = admin();
    const { data: grant } = await db
      .from('download_grants')
      .select('token, revoked, download_count, purchases ( status )')
      .eq('token', token)
      .maybeSingle();
    const purchase = grant?.purchases as unknown as { status: string } | null;
    if (!grant || grant.revoked || purchase?.status !== 'active') {
      return text('This download link is no longer valid. If you own Legend Full Suite, re-send it from the Legend app: Settings → Legend Full Suite.', 403);
    }

    const requested = url.searchParams.get('os') as Os | null;
    const os = requested && ['windows', 'mac', 'linux'].includes(requested) ? requested : guessOs(req.headers.get('user-agent') ?? '');
    if (!os) {
      return text('Open this link on the computer you want to install Legend on (Windows, macOS or Linux), or use the per-OS links in your email.', 400);
    }

    const { data: release } = await db
      .from('desktop_releases')
      .select('version, storage_path, file_name')
      .eq('os', os)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!release) return text(`Legend for ${os === 'mac' ? 'macOS' : os[0]!.toUpperCase() + os.slice(1)} isn't available yet — we'll email you when it is.`, 404);

    const { data: signed, error } = await db.storage
      .from('desktop-releases')
      .createSignedUrl(release.storage_path, 300, { download: release.file_name });
    if (error || !signed) throw new Error(error?.message ?? 'Could not sign download URL');

    await db
      .from('download_grants')
      .update({ download_count: (grant.download_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq('token', token);

    return new Response(null, { status: 302, headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return text('Something went wrong preparing your download. Please try again in a minute.', 500);
  }
});
