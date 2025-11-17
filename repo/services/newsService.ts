// Simple USD high-impact news window checker
// Reads either NEWS_CALENDAR_JSON_URL (HTTP endpoint returning JSON array)
// or NEWS_CALENDAR_JSON (stringified JSON array) from environment.
// Event shape expected: { time_utc: string, impact: 'HIGH'|'MEDIUM'|'LOW', currency: string }
// Returns true if "now" is within +/- 15 minutes of a HIGH-impact USD event.

type NewsEvent = {
  time_utc: string;
  impact?: string;
  currency?: string;
};

const fifteenMinutesMs = 15 * 60 * 1000;

function generateDefaultUsdHighImpactEvents(now: Date): NewsEvent[] {
  const events: NewsEvent[] = [];
  // Typical US economic releases around 13:30 UTC
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 30, 0));
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base.getTime());
    d.setUTCDate(base.getUTCDate() + i);
    events.push({ time_utc: d.toISOString(), impact: 'HIGH', currency: 'USD' });
  }
  return events;
}

export async function isWithinUsdNewsLockWindow(now: Date): Promise<boolean> {
  const url = process.env.NEWS_CALENDAR_JSON_URL ?? process.env.VITE_NEWS_CALENDAR_JSON_URL;
  const inline = process.env.NEWS_CALENDAR_JSON ?? process.env.VITE_NEWS_CALENDAR_JSON;
  let events: NewsEvent[] = [];
  try {
    if (url) {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) events = data as NewsEvent[];
      }
    } else if (inline) {
      const parsed = JSON.parse(inline);
      if (Array.isArray(parsed)) events = parsed as NewsEvent[];
    }
  } catch (err) {
    console.warn('[NewsService] Failed to load calendar:', err);
    // continue to default fallback
  }

  if (!events.length) {
    events = generateDefaultUsdHighImpactEvents(now);
  }

  // Developer toggle: inject a synthetic USD HIGH-impact event at now + X minutes
  const devForceStr = process.env.DEV_FORCE_NEWS_LOCK_MINUTES ?? process.env.VITE_DEV_FORCE_NEWS_LOCK_MINUTES;
  if (devForceStr) {
    const m = Number(devForceStr);
    if (Number.isFinite(m) && m > 0) {
      const synthetic = new Date(now.getTime() + m * 60_000).toISOString();
      events.push({ time_utc: synthetic, impact: 'HIGH', currency: 'USD' });
      console.log(`[NewsService] DEV_FORCE_NEWS_LOCK_MINUTES=${m}: injected synthetic USD HIGH at ${synthetic}`);
    }
  }

  const nowMs = now.getTime();
  for (const ev of events) {
    if ((ev.currency ?? '').toUpperCase() !== 'USD') continue;
    const impact = (ev.impact ?? '').toUpperCase();
    if (impact !== 'HIGH') continue;
    const ts = Date.parse(ev.time_utc);
    if (!Number.isFinite(ts)) continue;
    const dt = Math.abs(nowMs - ts);
    if (dt <= fifteenMinutesMs) return true;
  }
  return false;
}