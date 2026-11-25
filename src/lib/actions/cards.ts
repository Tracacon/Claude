"use server";

import { getMyProfile } from "@/lib/auth";
import { searchByCode, searchCards, type CodeSearchResult } from "@/lib/cards";
import type { CardHit } from "@/lib/marketplace";

export type CardSearchResult = { hits: CardHit[] } | { error: "card_search_failed" | "not_authenticated" };

/** Vorschläge für die Kartensuche im Inserat-Formular (nur für angemeldete Mitglieder) */
export async function findCards(query: string): Promise<CardSearchResult> {
  const profile = await getMyProfile();
  if (!profile?.nickname) return { error: "not_authenticated" };
  const q = String(query ?? "").slice(0, 80);
  try {
    return { hits: await searchCards(q) };
  } catch (e) {
    console.error("Kartensuche", e instanceof Error ? e.message : e);
    return { error: "card_search_failed" };
  }
}

export type CodeSearchActionResult = CodeSearchResult | { error: "card_search_failed" | "not_authenticated" };

/** Karte über Set-Kürzel und Nummer (z. B. "MEW" + "199") */
export async function findCardByCode(code: string, number: string): Promise<CodeSearchActionResult> {
  const profile = await getMyProfile();
  if (!profile?.nickname) return { error: "not_authenticated" };
  try {
    return await searchByCode(String(code ?? "").slice(0, 20), String(number ?? "").slice(0, 20));
  } catch (e) {
    console.error("Kartensuche (Kürzel)", e instanceof Error ? e.message : e);
    return { error: "card_search_failed" };
  }
}
