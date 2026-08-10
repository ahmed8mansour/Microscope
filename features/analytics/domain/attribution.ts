// Coarse, PII-free traffic attribution (FR-031): referrer HOST only (never
// the full URL, which could carry query strings/paths with identifying
// data), plus `utm_source`/`utm_campaign` marketing tags.
export interface Attribution {
  source: string | null;
  referrer: string | null; // host only
  campaign: string | null;
}

function normalizeSource(host: string): string {
  if (host.includes('google')) return 'google';
  if (host.includes('facebook.com') || host.includes('instagram.com') || host.includes('fb.com')) return 'meta';
  if (host.includes('bing.com')) return 'bing';
  if (host.includes('t.co') || host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  return 'referral';
}

export function parseAttribution(referrerHeader: string | null, requestUrl: string): Attribution {
  let referrerHost: string | null = null;
  if (referrerHeader) {
    try {
      referrerHost = new URL(referrerHeader).host || null;
    } catch {
      referrerHost = null;
    }
  }

  let utmSource: string | null = null;
  let utmCampaign: string | null = null;
  try {
    const url = new URL(requestUrl);
    utmSource = url.searchParams.get('utm_source');
    utmCampaign = url.searchParams.get('utm_campaign');
  } catch {
    // Malformed request URL — attribution stays best-effort/empty.
  }

  const source = utmSource ?? (referrerHost ? normalizeSource(referrerHost) : 'direct');

  return { source, referrer: referrerHost, campaign: utmCampaign };
}
