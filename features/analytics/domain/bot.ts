// Coarse User-Agent bot/crawler detection (research R9) — keeps the
// funnel-entry denominator honest by excluding non-genuine traffic at
// record time. Not a security control; a simple, low-maintenance filter
// appropriate for a single-product store's analytics.
const BOT_PATTERNS: readonly RegExp[] = [
  /bot/i,
  /spider/i,
  /crawl/i,
  /slurp/i,
  /facebookexternalhit/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /pingdom/i,
  /uptimerobot/i,
  /headlesschrome/i,
  /phantomjs/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /node-fetch/i,
  /go-http-client/i,
];

// A missing User-Agent header is itself a strong non-browser signal — real
// browsers always send one — so it is treated as a bot for funnel-counting
// purposes.
export function isKnownBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}
