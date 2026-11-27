// Bremse gegen zu viele Anfragen
import { describe, expect, it } from "vitest";
import { checkRateLimit, tooManyRequests, type RateLimiter } from "@/lib/rate-limit";

function limiter(max: number) {
  const seen = new Map<string, number>();
  const keys: string[] = [];
  const l: RateLimiter & { keys: string[] } = {
    keys,
    async limit({ key }) {
      keys.push(key);
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return { success: n <= max };
    },
  };
  return l;
}

describe("Bremse", () => {
  it("zählt angemeldete Personen einzeln, nicht nach WLAN-Adresse", async () => {
    const env = { RL_USER_READ: limiter(2), RL_ANON_READ: limiter(100), RL_IP_FLOOD: limiter(100) };
    const ip = "1.2.3.4";
    expect(await checkRateLimit(env, { method: "GET", ip, userId: "ana" })).toBe(true);
    expect(await checkRateLimit(env, { method: "GET", ip, userId: "ana" })).toBe(true);
    expect(await checkRateLimit(env, { method: "GET", ip, userId: "ana" })).toBe(false);
    expect(await checkRateLimit(env, { method: "GET", ip, userId: "ben" })).toBe(true);
    expect(env.RL_ANON_READ.keys).toEqual([]);
  });

  it("Schreiben ist strenger als Lesen, ohne Anmeldung zählt die Adresse", async () => {
    const env = { RL_ANON_WRITE: limiter(1), RL_ANON_READ: limiter(5) };
    expect(await checkRateLimit(env, { method: "POST", ip: "5.6.7.8", userId: null })).toBe(true);
    expect(await checkRateLimit(env, { method: "POST", ip: "5.6.7.8", userId: null })).toBe(false);
    expect(await checkRateLimit(env, { method: "GET", ip: "5.6.7.8", userId: null })).toBe(true);
  });

  it("Obergrenze je Adresse gilt für alle, ohne Grenzen wird nichts gebremst", async () => {
    const env = { RL_IP_FLOOD: limiter(1), RL_USER_READ: limiter(100) };
    expect(await checkRateLimit(env, { method: "GET", ip: "9.9.9.9", userId: "ana" })).toBe(true);
    expect(await checkRateLimit(env, { method: "GET", ip: "9.9.9.9", userId: "ben" })).toBe(false);
    expect(await checkRateLimit({}, { method: "POST", ip: "9.9.9.9", userId: null })).toBe(true);
  });

  it("bei einer Störung von Cloudflare wird durchgelassen", async () => {
    const broken: RateLimiter = { limit: async () => Promise.reject(new Error("weg")) };
    expect(await checkRateLimit({ RL_IP_FLOOD: broken }, { method: "GET", ip: "1.1.1.1", userId: null })).toBe(true);
  });

  it("Hinweisseite mit Status 429", async () => {
    const r = tooManyRequests("de");
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(await r.text()).toContain("Zu viele Anfragen");
  });
});
