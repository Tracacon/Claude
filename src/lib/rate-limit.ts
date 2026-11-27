/**
 * Bremse gegen zu viele Anfragen (Angriffe, Bots, Skripte), direkt bei Cloudflare.
 *
 * Gezählt wird pro angemeldeter Person (geprüfte Anmeldung, nicht fälschbar) und sonst pro
 * Internetadresse. So bleiben viele Besucher im selben WLAN einer Messe ungebremst,
 * solange sie angemeldet sind. Zusätzlich gibt es eine hohe Obergrenze je Adresse gegen Fluten.
 *
 * Die Grenzen stehen in wrangler.jsonc ("ratelimits"). Fehlt dort etwas (z. B. lokal oder in Tests),
 * wird nichts gebremst.
 */

export type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type Limiters = {
  RL_USER_READ?: RateLimiter;
  RL_USER_WRITE?: RateLimiter;
  RL_ANON_READ?: RateLimiter;
  RL_ANON_WRITE?: RateLimiter;
  RL_IP_FLOOD?: RateLimiter;
};

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** true = Anfrage darf durch */
export async function checkRateLimit(env: Limiters, req: { method: string; ip: string | null; userId: string | null }) {
  const write = WRITE_METHODS.has(req.method.toUpperCase());
  const checks: [RateLimiter | undefined, string][] = [];
  if (req.ip) checks.push([env.RL_IP_FLOOD, `ip:${req.ip}`]);
  if (req.userId) checks.push([write ? env.RL_USER_WRITE : env.RL_USER_READ, `u:${req.userId}`]);
  else if (req.ip) checks.push([write ? env.RL_ANON_WRITE : env.RL_ANON_READ, `ip:${req.ip}`]);

  for (const [limiter, key] of checks) {
    if (!limiter) continue;
    try {
      const { success } = await limiter.limit({ key });
      if (!success) return false;
    } catch {
      // Störung bei Cloudflare: lieber durchlassen als die App lahmlegen
    }
  }
  return true;
}

export function tooManyRequests(locale: "de" | "en") {
  const text =
    locale === "en"
      ? "Too many requests in a short time. Please wait a minute and try again."
      : "Zu viele Anfragen in kurzer Zeit. Bitte warte eine Minute und versuch es dann noch einmal.";
  const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tracacon App</title><body style="background:#0a0d11;color:#f4efe6;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center"><p style="max-width:28rem;font-size:1.1rem;line-height:1.5">${text}</p></body></html>`;
  return new Response(html, {
    status: 429,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "60", "Cache-Control": "no-store" },
  });
}
