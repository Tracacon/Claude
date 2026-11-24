-- TRACACON-App: Pflichtfotos und Art "Slab"
-- Einzelkarten und Slabs (gegradete Karten) brauchen mindestens zwei Fotos:
-- Position 0 = Vorderseite, Position 1 = Rückseite.
-- Die Prüfung läuft am Ende der Transaktion (zurückgestellt), damit Inserat und
-- Fotos zusammen angelegt oder geändert werden können.

alter type public.listing_kind add value if not exists 'slab' after 'single';

create function public.listings_check_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.listings l
     where l.id = new.id
       and l.kind::text in ('single', 'slab')
       and (select count(*) from public.listing_photos ph where ph.listing_id = l.id) < 2
  ) then
    raise exception 'front_back_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

create function public.listing_photos_check_remaining()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.listings l
     where l.id = old.listing_id
       and l.kind::text in ('single', 'slab')
       and (select count(*) from public.listing_photos ph where ph.listing_id = l.id) < 2
  ) then
    raise exception 'front_back_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

-- Beim Anlegen und wenn die Art geändert wird (Bearbeiten setzt die Art immer neu).
-- Reine Statuswechsel und Moderation lösen die Prüfung nicht aus.
create constraint trigger listings_photos_required
  after insert or update of kind on public.listings
  deferrable initially deferred
  for each row execute function public.listings_check_photos();

-- Wenn Fotos entfernt werden. Wird das ganze Inserat gelöscht, findet die Prüfung es nicht mehr.
create constraint trigger listing_photos_keep_required
  after delete on public.listing_photos
  deferrable initially deferred
  for each row execute function public.listing_photos_check_remaining();

revoke execute on function public.listings_check_photos() from public, anon, authenticated;
revoke execute on function public.listing_photos_check_remaining() from public, anon, authenticated;
