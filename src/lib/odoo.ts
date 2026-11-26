import "server-only";
import { fixBrand } from "@/lib/brand";
import {
  buildDealers,
  coverUrl,
  dealerTables,
  parseDescription,
  type EventDetails,
  type OdooAnswer,
  type OdooDealerProfile,
  type OdooRegistration,
} from "@/lib/event-details";

/**
 * Liest Termine aus der Odoo-App „Veranstaltungen“ (Modell event.event).
 * Nur lesend. Der API-Schlüssel liegt ausschließlich auf dem Server (Cloudflare-Geheimnis ODOO_API_KEY).
 *
 * Bevorzugt die JSON-2-Schnittstelle (Odoo 19). Für ältere Versionen gibt es den klassischen Weg über
 * /jsonrpc, dafür braucht es zusätzlich ODOO_LOGIN (E-Mail des Odoo-Benutzers).
 */

const fixBrandOrNull = (v: string | null) => (v ? fixBrand(v) : v);

export type OdooEvent = {
  odoo_id: number;
  name: string;
  subtitle: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  ticket_url: string | null;
  website_url: string | null;
  published: boolean;
  /** Nur bei kommenden Terminen; fehlt es, bleiben die gespeicherten Angaben erhalten. */
  details?: EventDetails;
};

export class OdooError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "unauthorized" | "unreachable" | "bad_response",
  ) {
    super(message);
  }
}

export function odooConfig() {
  const url = (process.env.ODOO_URL ?? "").replace(/\/+$/, "");
  const key = process.env.ODOO_API_KEY ?? "";
  const publicUrl = (process.env.ODOO_PUBLIC_URL ?? url).replace(/\/+$/, "");
  const login = process.env.ODOO_LOGIN ?? "";
  let db = process.env.ODOO_DB ?? "";
  if (!db && url) {
    try {
      db = new URL(url).hostname.split(".")[0];
    } catch {
      db = "";
    }
  }
  return { url, key, publicUrl, login, db, configured: Boolean(url && key) };
}

const TIMEOUT_MS = 8000;

type Domain = (string | (string | number | boolean | number[])[])[];
type Caller = (model: string, method: string, kwargs: Record<string, unknown>, ids?: number[]) => Promise<unknown>;

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new OdooError(`Odoo nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`, "unreachable");
  }
  return res;
}

function json2(cfg: ReturnType<typeof odooConfig>): Caller {
  return async (model, method, kwargs, ids) => {
    const headers: Record<string, string> = { Authorization: `bearer ${cfg.key}` };
    if (process.env.ODOO_DB) headers["X-Odoo-Database"] = process.env.ODOO_DB;
    const res = await post(`${cfg.url}/json/2/${model}/${method}`, ids ? { ids, ...kwargs } : kwargs, headers);
    if (res.status === 401 || res.status === 403) throw new OdooError("Odoo lehnt den API-Schlüssel ab", "unauthorized");
    if (res.status === 404) throw new OdooError("JSON-2-Schnittstelle nicht gefunden", "bad_response");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OdooError(`Odoo antwortet mit ${res.status}: ${text.slice(0, 200)}`, "bad_response");
    }
    return res.json();
  };
}

function classic(cfg: ReturnType<typeof odooConfig>): Caller {
  let uid: number | null = null;
  async function rpc(service: string, method: string, args: unknown[]) {
    const res = await post(`${cfg.url}/jsonrpc`, { jsonrpc: "2.0", method: "call", id: 1, params: { service, method, args } });
    const data = (await res.json().catch(() => null)) as { result?: unknown; error?: { message?: string; data?: { message?: string } } } | null;
    if (!data) throw new OdooError(`Odoo antwortet mit ${res.status}`, "bad_response");
    if (data.error) {
      const msg = data.error.data?.message ?? data.error.message ?? "Fehler";
      throw new OdooError(`Odoo: ${msg}`, /access|denied|auth/i.test(msg) ? "unauthorized" : "bad_response");
    }
    return data.result;
  }
  return async (model, method, kwargs, ids) => {
    if (uid === null) {
      const r = await rpc("common", "authenticate", [cfg.db, cfg.login, cfg.key, {}]);
      if (typeof r !== "number" || r <= 0) throw new OdooError("Odoo lehnt Anmeldung oder API-Schlüssel ab", "unauthorized");
      uid = r;
    }
    return rpc("object", "execute_kw", [cfg.db, uid, cfg.key, model, method, ids ? [ids] : [], kwargs]);
  };
}

type FieldInfo = { type: string; string?: string };
type Many2one = [number, string] | false;
type RawEvent = Record<string, unknown> & {
  id: number;
  name: string;
  date_begin: string;
  date_end: string;
  address_id?: Many2one;
};

/** "2027-01-03 09:00:00" (UTC in Odoo) → ISO-Zeitpunkt */
function utc(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null;
}

/** Erster EVENTIM-Link aus einem eigenen Feld oder aus der Beschreibung */
export function findTicketUrl(raw: Record<string, unknown>, ticketFields: string[]) {
  for (const f of ticketFields) {
    const u = httpsUrl(raw[f]);
    if (u) return u;
  }
  for (const value of Object.values(raw)) {
    if (typeof value !== "string" || !/eventim/i.test(value)) continue;
    const m = value.match(/https:\/\/[^\s"'<>]*eventim[^\s"'<>]*/i);
    if (m) return m[0].replace(/&amp;/g, "&").replace(/[),.;]+$/, "");
  }
  return null;
}

/** Alle Termine, die ab "since" enden. */
export async function fetchOdooEvents(since: Date): Promise<OdooEvent[]> {
  const cfg = odooConfig();
  if (!cfg.configured) throw new OdooError("Odoo ist nicht eingerichtet (ODOO_URL, ODOO_API_KEY)", "not_configured");

  let call: Caller = json2(cfg);
  let fields: Record<string, FieldInfo>;
  try {
    fields = (await call("event.event", "fields_get", { attributes: ["type", "string"] })) as Record<string, FieldInfo>;
  } catch (e) {
    if (!(e instanceof OdooError) || e.code !== "bad_response" || !cfg.login) throw e;
    call = classic(cfg);
    fields = (await call("event.event", "fields_get", { attributes: ["type", "string"] })) as Record<string, FieldInfo>;
  }
  if (!fields || typeof fields !== "object" || !fields.date_begin) {
    throw new OdooError("Die Odoo-App „Veranstaltungen“ ist nicht verfügbar", "bad_response");
  }

  const ticketFields = Object.entries(fields)
    .filter(([name, f]) => name.startsWith("x_") && ["char", "text"].includes(f.type) && /eventim|ticket/i.test(`${name} ${f.string ?? ""}`))
    .map(([name]) => name);
  const wanted = ["name", "subtitle", "date_begin", "date_end", "date_tz", "address_id", "is_published", "website_url", "description", "note", "cover_properties"];
  const read = [...wanted.filter((f) => f in fields), ...ticketFields];

  const sinceStr = since.toISOString().slice(0, 19).replace("T", " ");
  const domain: Domain = [["date_end", ">=", sinceStr]];
  const raw = (await call("event.event", "search_read", { domain, fields: read, order: "date_begin asc", limit: 300 })) as RawEvent[];
  if (!Array.isArray(raw)) throw new OdooError("Unerwartete Antwort von Odoo", "bad_response");

  // Veranstaltungsorte nachladen
  const partnerIds = [...new Set(raw.map((e) => (Array.isArray(e.address_id) ? e.address_id[0] : null)).filter((x): x is number => !!x))];
  const partners = new Map<number, { name: string | null; street: string | null; zip: string | null; city: string | null }>();
  if (partnerIds.length) {
    try {
      const rows = (await call("res.partner", "read", { fields: ["name", "street", "zip", "city"] }, partnerIds)) as Record<string, unknown>[];
      for (const p of rows ?? []) {
        partners.set(p.id as number, { name: text(p.name), street: text(p.street), zip: text(p.zip), city: text(p.city) });
      }
    } catch (e) {
      // Ohne Leserecht auf Kontakte nur den Namen aus dem Termin verwenden
      console.warn("Odoo-Orte", e instanceof Error ? e.message : e);
    }
  }

  const out: OdooEvent[] = [];
  for (const e of raw) {
    const starts = utc(e.date_begin);
    const ends = utc(e.date_end) ?? starts;
    const rawName = text(e.name);
    const name = rawName ? fixBrand(rawName) : rawName;
    if (!starts || !ends || !name) continue;
    const addrId = Array.isArray(e.address_id) ? e.address_id[0] : null;
    const p = addrId ? partners.get(addrId) : undefined;
    const website = typeof e.website_url === "string" && e.website_url.startsWith("/") ? `${cfg.publicUrl}${e.website_url}` : httpsUrl(e.website_url);
    out.push({
      odoo_id: e.id,
      name,
      subtitle: fixBrandOrNull(text(e.subtitle)),
      starts_at: starts,
      ends_at: ends,
      timezone: text(e.date_tz),
      venue: p?.name ?? (Array.isArray(e.address_id) ? text(e.address_id[1]) : null),
      address: p ? [p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null,
      city: p?.city ?? null,
      ticket_url: findTicketUrl(e, ticketFields),
      website_url: httpsUrl(website),
      published: "is_published" in fields ? e.is_published === true : true,
    });
  }

  // Titelbild, Beschreibung, Händler und Händlertische für kommende Termine (wie auf tracacon.de)
  const upcoming = out.filter((e) => new Date(e.ends_at).getTime() >= Date.now() - 86400_000);
  if (upcoming.length) {
    const rawById = new Map(raw.map((e) => [e.id, e]));
    let extras: Map<number, Pick<EventDetails, "dealers" | "tables">> | null = null;
    try {
      extras = await fetchDealerExtras(call, upcoming.map((e) => e.odoo_id), cfg.publicUrl);
    } catch (e) {
      // Ohne Händler trotzdem weitermachen; die zuletzt gespeicherte Liste bleibt dann erhalten
      console.warn("Odoo-Händler", e instanceof Error ? e.message : e);
    }
    for (const e of upcoming) {
      const r = rawById.get(e.odoo_id);
      if (!r) continue;
      const details: EventDetails = {
        cover_url: coverUrl(r.cover_properties, cfg.publicUrl),
        description: parseDescription(r.description, cfg.publicUrl, e.name).map((b) => ({
          ...b,
          parts: b.parts.map((p) => ({ ...p, text: fixBrand(p.text) })),
        })),
      };
      if (extras) Object.assign(details, extras.get(e.odoo_id) ?? { dealers: [], tables: null });
      else continue; // Teilangaben würden die gespeicherte Händlerliste löschen
      e.details = details;
    }
  }
  return out;
}

type Many2oneId = [number, string] | false | number;
const m2oId = (v: Many2oneId | undefined) => (Array.isArray(v) ? v[0] : typeof v === "number" ? v : null);

/** Händler (Tischbuchungen + Händlerprofile) und Händlertische für mehrere Termine auf einmal */
async function fetchDealerExtras(call: Caller, eventIds: number[], publicUrl: string) {
  const regsRaw = (await call("event.registration", "search_read", {
    domain: [["event_id", "in", eventIds], ["state", "in", ["open", "done"]], ["email", "!=", false]],
    fields: ["event_id", "email", "company_name"],
    order: "id asc",
    limit: 5000,
  })) as (Record<string, unknown> & { id: number; event_id: Many2oneId })[];
  const regs: OdooRegistration[] = regsRaw.map((r) => ({
    id: r.id,
    event_id: m2oId(r.event_id) ?? 0,
    email: typeof r.email === "string" ? r.email : null,
    company_name: typeof r.company_name === "string" ? r.company_name : null,
  }));

  let answers: OdooAnswer[] = [];
  if (regs.length) {
    const rows = (await call("event.registration.answer", "search_read", {
      domain: [["registration_id", "in", regs.map((r) => r.id)]],
      fields: ["registration_id", "question_id", "value_answer_id", "value_text_box"],
      limit: 50000,
    })) as Record<string, unknown>[];
    answers = rows.map((a) => ({
      registration_id: m2oId(a.registration_id as Many2oneId) ?? 0,
      question_id: m2oId(a.question_id as Many2oneId),
      value_answer_id: m2oId(a.value_answer_id as Many2oneId),
      value_text_box: typeof a.value_text_box === "string" ? a.value_text_box : null,
    }));
  }

  const profileFields = [
    "x_name", "x_email", "x_link", "x_zustimmung", "x_ausgeblendet", "x_weitere_tcgs",
    "x_pokemon", "x_onepiece", "x_lorcana", "x_magic", "x_yugioh", "x_dragonball", "x_digimon", "x_riftbound", "x_cyberpunk",
    "x_einzelkarten", "x_sealed", "x_graded",
  ];
  const profiles = (await call("x_haendlerprofil", "search_read", {
    domain: [["x_ausgeblendet", "=", false], ["x_email", "!=", false]],
    fields: profileFields,
    order: "id asc",
    limit: 2000,
  })) as OdooDealerProfile[];

  const logoIds = new Map<number, number>();
  if (profiles.length) {
    const atts = (await call("ir.attachment", "search_read", {
      domain: [["res_model", "=", "x_haendlerprofil"], ["res_field", "=", "x_logo"], ["res_id", "in", profiles.map((p) => p.id)], ["public", "=", true]],
      fields: ["res_id"],
      limit: 2000,
    })) as { id: number; res_id: number }[];
    for (const a of atts) logoIds.set(a.res_id, a.id);
  }

  const tickets = (await call("event.event.ticket", "search_read", {
    domain: [["event_id", "in", eventIds]],
    fields: ["event_id", "seats_max", "seats_available", "sale_available", "is_sold_out"],
    limit: 1000,
  })) as { event_id: Many2oneId; seats_max?: unknown; seats_available?: unknown; sale_available?: unknown; is_sold_out?: unknown }[];

  const result = new Map<number, Pick<EventDetails, "dealers" | "tables">>();
  for (const id of eventIds) {
    result.set(id, {
      dealers: buildDealers(regs.filter((r) => r.event_id === id), answers, profiles, logoIds, publicUrl),
      tables: dealerTables(tickets.filter((t) => m2oId(t.event_id) === id)),
    });
  }
  return result;
}
