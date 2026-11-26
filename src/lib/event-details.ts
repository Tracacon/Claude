/**
 * Zusatzangaben zu einem Termin, so wie sie auf der Eventseite von tracacon.de stehen:
 * Titelbild, Beschreibung („Auf einen Blick“, Einlasszeiten …), Händler mit Logo und Händlertisch-Status.
 *
 * Reine Funktionen ohne Serverzugriff, damit sie sich einfach testen lassen.
 * Die Händlerlogik entspricht der Odoo-Vorlage „TRACACON Händlerübersicht (Inhalt)“
 * (website_event.tc_haendler_section): Tischbuchung und Händlerprofil werden über die E-Mail verknüpft.
 */

export const DEALER_TCGS = [
  { key: "pokemon", label: "Pokémon", answer: 1, field: "x_pokemon" },
  { key: "onepiece", label: "One Piece", answer: 3, field: "x_onepiece" },
  { key: "lorcana", label: "Lorcana", answer: 5, field: "x_lorcana" },
  { key: "magic", label: "Magic", answer: 7, field: "x_magic" },
  { key: "yugioh", label: "Yu-Gi-Oh!", answer: 9, field: "x_yugioh" },
  { key: "dragonball", label: "Dragon Ball Super", answer: 11, field: "x_dragonball" },
  { key: "digimon", label: "Digimon", answer: 13, field: "x_digimon" },
  { key: "riftbound", label: "Riftbound", answer: 15, field: "x_riftbound" },
  { key: "cyberpunk", label: "Cyberpunk", answer: 17, field: "x_cyberpunk" },
] as const;

export const DEALER_PRODUCTS = [
  { key: "singles", label: "Einzelkarten", answer: 19, field: "x_einzelkarten" },
  { key: "sealed", label: "Sealed", answer: 21, field: "x_sealed" },
  { key: "graded", label: "Graded", answer: 23, field: "x_graded" },
] as const;

/** Antwort „Ja, ihr dürft mich auf der Eventseite zeigen“ */
const CONSENT_ANSWER = 25;
/** Fragen „Weitere TCGs“ und „Instagram oder Website“ */
const OTHER_QUESTION = 14;
const LINK_QUESTION = 18;

export type DealerTcg = (typeof DEALER_TCGS)[number]["key"];
export type DealerProduct = (typeof DEALER_PRODUCTS)[number]["key"];

export type Dealer = {
  name: string;
  logo_url: string | null;
  tcgs: DealerTcg[];
  other: string | null;
  products: DealerProduct[];
  link_url: string | null;
  link_label: string | null;
};

export type TextPart = { text: string; bold?: boolean; href?: string };
export type DescBlock = { type: "h" | "p" | "li"; box?: boolean; parts: TextPart[] };

export type DealerTables = { total: number; free: number; on_sale: boolean };

export type EventDetails = {
  cover_url?: string | null;
  description?: DescBlock[];
  dealers?: Dealer[];
  tables?: DealerTables | null;
};

// ---------- Allgemeines ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "" };

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Nur sichere Links: https oder ein Pfad auf der eigenen Website. */
export function safeHref(href: string | null | undefined, publicUrl: string) {
  if (!href) return null;
  const h = decodeEntities(href.trim());
  if (/^https:\/\/[^\s"'<>]+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(h) && /^https:\/\//i.test(publicUrl)) return `${publicUrl.replace(/\/+$/, "")}${h}`;
  return null;
}

// ---------- Titelbild ----------

/** Bild aus den Odoo-Titelbild-Einstellungen (cover_properties), z. B. url('/web/image/5270/hero-halle.jpg') */
export function coverUrl(coverProperties: unknown, publicUrl: string) {
  if (typeof coverProperties !== "string" || !coverProperties) return null;
  let bg = "";
  try {
    const parsed = JSON.parse(coverProperties) as Record<string, unknown>;
    bg = typeof parsed["background-image"] === "string" ? parsed["background-image"] : "";
  } catch {
    return null;
  }
  const m = bg.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
  return m ? safeHref(m[2], publicUrl) : null;
}

// ---------- Beschreibung ----------

const BLOCK_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "div", "ul", "ol", "section", "blockquote", "br"]);

/**
 * Wandelt die HTML-Beschreibung aus Odoo in einfache Absätze um. Es wird kein HTML übernommen,
 * nur Text, Fettschrift und sichere Links. Die Box „Auf einen Blick“ wird markiert.
 */
export function parseDescription(html: unknown, publicUrl: string, eventName = ""): DescBlock[] {
  if (typeof html !== "string" || !html.trim()) return [];
  const src = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const blocks: DescBlock[] = [];
  let current: DescBlock | null = null;
  let bold = 0;
  let href: string | null = null;
  const stack: { tag: string; box: boolean; cta: boolean }[] = [];
  const inBox = () => stack.some((s) => s.box);
  const inCta = () => stack.some((s) => s.cta);

  const flush = () => {
    if (current) {
      current.parts = mergeParts(current.parts);
      if (current.parts.length) blocks.push(current);
    }
    current = null;
  };
  const start = (type: DescBlock["type"]) => {
    flush();
    current = { type, parts: [], ...(inBox() ? { box: true } : {}) };
  };

  const re = /<\/?([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[3] !== undefined) {
      const text = decodeEntities(m[3]).replace(/\s+/g, " ");
      if (!text.trim() && !current) continue;
      if (!current) start("p");
      (current as DescBlock | null)?.parts.push({ text, ...(bold > 0 ? { bold: true } : {}), ...(href ? { href } : {}) });
      continue;
    }
    const closing = m[0][1] === "/";
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? "";
    if (tag === "strong" || tag === "b") {
      bold += closing ? -1 : 1;
      bold = Math.max(0, bold);
      continue;
    }
    if (tag === "a") {
      href = closing ? null : safeHref((attrs.match(/href\s*=\s*(["'])(.*?)\1/i) ?? [])[2], publicUrl);
      if (!closing && inCta()) {
        // Knöpfe am Ende der Beschreibung werden je ein eigener Absatz
        start("p");
      }
      continue;
    }
    if (!BLOCK_TAGS.has(tag)) continue;
    if (tag === "br") {
      if (current) (current as DescBlock).parts.push({ text: "\n" });
      continue;
    }
    if (closing) {
      flush();
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.splice(i);
      continue;
    }
    const cls = (attrs.match(/class\s*=\s*(["'])(.*?)\1/i) ?? [])[2] ?? "";
    stack.push({ tag, box: /\btc-auf-einen-blick\b/.test(cls), cta: /\btc-booth-cta\b/.test(cls) });
    if (/^h[1-6]$/.test(tag)) start("h");
    else if (tag === "li") start("li");
    else if (tag === "p" || tag === "blockquote") start("p");
    else flush();
  }
  flush();

  // Die erste Überschrift wiederholt meist nur den Eventnamen
  const first = blocks[0];
  if (first?.type === "h" && !first.box && plain(first) && similar(plain(first), eventName)) blocks.shift();
  return blocks.slice(0, 80);
}

function mergeParts(parts: TextPart[]) {
  const out: TextPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && !!last.bold === !!p.bold && last.href === p.href) last.text += p.text;
    else out.push({ ...p });
  }
  // Leerraum am Anfang und Ende entfernen
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, "");
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  }
  return out.filter((p) => p.text !== "").map((p) => ({ ...p, text: p.text.slice(0, 2000) }));
}

const plain = (b: DescBlock) => b.parts.map((p) => p.text).join("").trim();
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
function similar(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  const wa = new Set(x.split(" "));
  const wb = y.split(" ");
  return wb.filter((w) => wa.has(w)).length >= Math.min(2, wb.length);
}

// ---------- Händler ----------

export type OdooRegistration = { id: number; event_id: number; email: string | null; company_name: string | null };
export type OdooAnswer = { registration_id: number; question_id: number | null; value_answer_id: number | null; value_text_box: string | null };
export type OdooDealerProfile = Record<string, unknown> & { id: number; x_email: string | null };

const lower = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const str = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/** Link wie auf der Homepage: https-Adresse, @instagram oder eine Domain */
export function dealerLink(raw: string): { url: string; label: string } | null {
  const v = raw.trim();
  if (!v) return null;
  let url: string;
  if (/^https?:\/\//i.test(v)) url = v.replace(/^http:/i, "https:");
  else if (v.startsWith("@")) url = `https://www.instagram.com/${v.slice(1).replace(/^\/+|\/+$/g, "")}`;
  else url = `https://${v}`;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Ohne Punkt im Namen ist es keine echte Adresse (z. B. nur "ZenbabyTCG")
  if (!u.hostname.includes(".") || /[\s"'<>]/.test(url)) return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "instagram.com") {
    const handle = u.pathname.split("/").filter(Boolean)[0];
    return { url: handle ? `https://www.instagram.com/${handle}` : u.href, label: handle ? `@${handle}` : "Instagram" };
  }
  return { url: u.href, label: host };
}

/**
 * Händlerliste für einen Termin, genau wie auf tracacon.de:
 * Buchung (bestätigt, mit E-Mail) + Händlerprofil mit gleicher E-Mail. Angaben aus der Buchung gehen vor.
 */
export function buildDealers(
  registrations: OdooRegistration[],
  answers: OdooAnswer[],
  profiles: OdooDealerProfile[],
  logoIds: Map<number, number>,
  publicUrl: string,
): Dealer[] {
  const byEmail = new Map<string, OdooRegistration>();
  for (const r of registrations) {
    const e = lower(r.email);
    if (e) byEmail.set(e, r);
  }
  const profileByEmail = new Map<string, OdooDealerProfile>();
  for (const p of [...profiles].sort((a, b) => a.id - b.id)) {
    const e = lower(p.x_email);
    if (e && byEmail.has(e) && p.x_ausgeblendet !== true) profileByEmail.set(e, p);
  }
  const answersByReg = new Map<number, OdooAnswer[]>();
  for (const a of answers) {
    const list = answersByReg.get(a.registration_id) ?? [];
    list.push(a);
    answersByReg.set(a.registration_id, list);
  }

  const dealers: Dealer[] = [];
  for (const [email, r] of byEmail) {
    const p = profileByEmail.get(email);
    const regAnswers = answersByReg.get(r.id) ?? [];
    const ans = new Set(regAnswers.map((a) => a.value_answer_id).filter((x): x is number => typeof x === "number"));
    const textOf = (q: number) => str(regAnswers.find((a) => a.question_id === q)?.value_text_box);
    const anyIn = (from: number, to: number) => [...ans].some((i) => i >= from && i <= to);

    const name = (str(p?.x_name) || str(r.company_name)).slice(0, 120);
    const ok = p?.x_zustimmung === true || ans.has(CONSENT_ANSWER);
    if (!ok || !name) continue;

    const tcgs = DEALER_TCGS.filter((t) => (anyIn(1, 18) ? ans.has(t.answer) : p?.[t.field] === true)).map((t) => t.key);
    const products = DEALER_PRODUCTS.filter((x) => (anyIn(19, 24) ? ans.has(x.answer) : p?.[x.field] === true)).map((x) => x.key);
    const other = (textOf(OTHER_QUESTION) || str(p?.x_weitere_tcgs)).slice(0, 120) || null;
    const link = dealerLink(str(p?.x_link) || textOf(LINK_QUESTION));
    const logoId = p ? logoIds.get(p.id) : undefined;
    dealers.push({
      name,
      logo_url: logoId ? safeHref(`/web/image/${logoId}/160x160`, publicUrl) : null,
      tcgs,
      other,
      products,
      link_url: link?.url ?? null,
      link_label: link?.label ?? null,
    });
  }
  return dealers.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "de")).slice(0, 300);
}

/** Händlertische (Odoo-Tickets): wie viele gibt es, wie viele sind frei, kann man noch buchen? */
export function dealerTables(
  tickets: { seats_max?: unknown; seats_available?: unknown; sale_available?: unknown; is_sold_out?: unknown }[],
): DealerTables | null {
  if (!tickets.length) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const total = tickets.reduce((s, t) => s + num(t.seats_max), 0);
  const free = tickets.reduce((s, t) => s + (t.is_sold_out === true ? 0 : num(t.seats_available)), 0);
  const onSale = tickets.some((t) => t.sale_available === true && t.is_sold_out !== true);
  return { total, free, on_sale: onSale };
}

/** Kalenderdatei (.ics) für einen Termin */
export function icsFile(e: { id: string; name: string; starts_at: string; ends_at: string; venue: string | null; address: string | null; url: string }) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const location = [e.venue, e.address].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tracacon//Tracacon App//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@tracacon-app`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.starts_at)}`,
    `DTEND:${stamp(e.ends_at)}`,
    `SUMMARY:${esc(e.name)}`,
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    `URL:${e.url}`,
    `DESCRIPTION:${esc(e.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Link „In Google Kalender eintragen“ */
export function googleCalendarUrl(e: { name: string; starts_at: string; ends_at: string; venue: string | null; address: string | null; url: string }) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.name,
    dates: `${stamp(e.starts_at)}/${stamp(e.ends_at)}`,
    details: e.url,
    location: [e.venue, e.address].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
