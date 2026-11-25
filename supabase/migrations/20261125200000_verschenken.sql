-- Tracacon App: Angebot "Verschenken" für Inserate (ohne Preis).
-- Einmal im SQL Editor von Supabase ausführen (nach 20261125190000_karten_details.sql).

alter type public.listing_offer add value if not exists 'gift';

-- Ohne Preis sind jetzt Tausch und Verschenken erlaubt
-- (Vergleich als Text, damit der neue Wert in derselben Ausführung genutzt werden darf)
alter table public.listings drop constraint listings_price_for_sale;
alter table public.listings add constraint listings_price_for_sale
  check (offer::text in ('trade', 'gift') or price_cents is not null);
