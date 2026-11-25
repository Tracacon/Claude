-- Tracacon App: Kartendetails für Inserate.
-- Karte aus der Kartendatenbank (Name deutsch und englisch, Set, Nummer, Seltenheit, Bild),
-- Variante, Grading (Firma und Note) und Art des Sealed-Produkts.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261125180000_profil_instagram.sql).

alter table public.listings
  add column card_ref        text check (card_ref is null or card_ref ~ '^tcgdex:[A-Za-z0-9._-]{1,60}$'),
  add column card_name       text check (card_name is null or char_length(card_name) <= 100),
  add column card_name_en    text check (card_name_en is null or char_length(card_name_en) <= 100),
  add column card_set        text check (card_set is null or char_length(card_set) <= 100),
  add column card_number     text check (card_number is null or char_length(card_number) <= 20),
  add column card_rarity     text check (card_rarity is null or char_length(card_rarity) <= 60),
  add column card_image      text check (card_image is null or card_image ~ '^https://assets\.tcgdex\.net/[A-Za-z0-9._/-]{1,200}$'),
  add column variant         text check (variant is null or variant in ('normal', 'holo', 'reverse_holo', 'first_edition', 'promo', 'full_art', 'alt_art')),
  add column grading_company text check (grading_company is null or grading_company in ('psa', 'bgs', 'cgc', 'sgc', 'tag', 'ace', 'other')),
  add column grading_grade   numeric(3,1) check (grading_grade is null or (grading_grade between 1 and 10 and grading_grade * 2 = round(grading_grade * 2))),
  add column sealed_type     text check (sealed_type is null or sealed_type in ('booster', 'sleeved_booster', 'booster_bundle', 'display', 'etb', 'collection', 'tin', 'blister', 'other'));

-- Suche: zusätzlich Kartenname (deutsch und englisch), Set und Nummer.
-- So findet "Charizard" auch ein Inserat mit "Glurak".
alter table public.listings drop column search;
alter table public.listings add column search tsvector generated always as (
  to_tsvector('german',
    coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(grading, '') || ' ' ||
    coalesce(card_name, '') || ' ' || coalesce(card_name_en, '') || ' ' || coalesce(card_set, '') || ' ' ||
    coalesce(card_number, ''))
) stored;
create index listings_search_idx on public.listings using gin (search);

-- Details eines eigenen Inserats setzen (nach create_listing bzw. update_listing).
-- p = { card_ref, card_name, card_name_en, card_set, card_number, card_rarity, card_image,
--       variant, grading_company, grading_grade, sealed_type }
create function public.set_listing_details(p_id uuid, p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.listings set
    card_ref        = nullif(btrim(p ->> 'card_ref'), ''),
    card_name       = public._listing_text(p, 'card_name', 100),
    card_name_en    = public._listing_text(p, 'card_name_en', 100),
    card_set        = public._listing_text(p, 'card_set', 100),
    card_number     = public._listing_text(p, 'card_number', 20),
    card_rarity     = public._listing_text(p, 'card_rarity', 60),
    card_image      = nullif(btrim(p ->> 'card_image'), ''),
    variant         = nullif(p ->> 'variant', ''),
    grading_company = nullif(p ->> 'grading_company', ''),
    grading_grade   = (nullif(p ->> 'grading_grade', ''))::numeric,
    sealed_type     = nullif(p ->> 'sealed_type', '')
  where id = p_id and owner_id = auth.uid();

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

grant update (card_ref, card_name, card_name_en, card_set, card_number, card_rarity, card_image,
              variant, grading_company, grading_grade, sealed_type)
  on public.listings to authenticated;

revoke execute on function public.set_listing_details(uuid, jsonb) from public, anon;
grant execute on function public.set_listing_details(uuid, jsonb) to authenticated;
