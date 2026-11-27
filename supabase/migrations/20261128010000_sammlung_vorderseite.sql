-- Tracacon App: Für die reine Sammlung reicht ein Foto der Vorderseite.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261128000000_binder_effekte.sql).
--
-- Einzelkarten und Slabs:
--   * nur Sammlung oder Verschenken: mindestens ein Foto (Vorderseite)
--   * Tausch, Verkauf, Verkauf oder Tausch (im Marktplatz): Vorder- und Rückseite
-- Titel und Spiel sind in der Sammlung freiwillig; die App setzt dann einen automatischen
-- Titel (title_auto = true). Zum Tauschen oder Verkaufen braucht es einen echten Titel.

alter table public.listings add column title_auto boolean not null default false;
grant update (title_auto) on public.listings to authenticated;

-- Wie viele Fotos braucht dieses Stück?
create function public.listing_photos_needed(p_kind text, p_status text, p_offer text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind not in ('single', 'slab') or p_status = 'removed' then 0
    when p_status in ('active', 'reserved') and p_offer in ('sell', 'trade', 'sell_or_trade') then 2
    else 1
  end;
$$;

create or replace function public.listings_check_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.listings l
     where l.id = new.id
       and (select count(*) from public.listing_photos ph where ph.listing_id = l.id)
           < public.listing_photos_needed(l.kind::text, l.status::text, l.offer::text)
  ) then
    raise exception 'front_back_required' using errcode = '23514';
  end if;
  -- Im Marktplatz zum Tauschen oder Verkaufen braucht es einen echten Titel
  if exists (
    select 1 from public.listings l
     where l.id = new.id and l.title_auto
       and l.status::text in ('active', 'reserved') and l.offer::text in ('sell', 'trade', 'sell_or_trade')
  ) then
    raise exception 'title_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function public.listing_photos_check_remaining()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.listings l
     where l.id = old.listing_id
       and (select count(*) from public.listing_photos ph where ph.listing_id = l.id)
           < public.listing_photos_needed(l.kind::text, l.status::text, l.offer::text)
  ) then
    raise exception 'front_back_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

-- Prüfung auch, wenn sich Angebot oder automatischer Titel ändern
drop trigger listings_photos_required on public.listings;
create constraint trigger listings_photos_required
  after insert or update of kind, status, offer, title_auto on public.listings
  deferrable initially deferred
  for each row execute function public.listings_check_photos();

-- Sammlung eines Profils: jetzt mit Angabe, ob der Titel automatisch ist
drop function public.profile_collection(text, int, int);
create function public.profile_collection(p_nickname text, p_limit int default 600, p_offset int default 0)
returns table (
  id uuid,
  title text,
  title_auto boolean,
  tcg public.tcg,
  kind public.listing_kind,
  offer public.listing_offer,
  price_cents int,
  negotiable boolean,
  status public.listing_status,
  quantity smallint,
  card_name text,
  cover_photo_id uuid,
  owner_id uuid,
  binder_id uuid,
  pocket int,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.title_auto, l.tcg, l.kind, l.offer, l.price_cents, l.negotiable, l.status, l.quantity,
         l.card_name,
         (select ph.id from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
         l.owner_id, l.binder_id, l.pocket, l.created_at,
         count(*) over ()
    from public.profiles p
    join public.listings l on l.owner_id = p.id
   where lower(p.nickname) = lower(p_nickname)
     and l.status::text in ('collection', 'active', 'reserved')
     and public.can_view_profile(p.id)
     and public.binder_visible(l.binder_id)
   order by l.binder_id nulls last, l.pocket, l.created_at desc
   limit least(greatest(coalesce(p_limit, 600), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.listing_photos_needed(text, text, text) from public, anon, authenticated;
revoke execute on function public.profile_collection(text, int, int) from public;
grant execute on function public.profile_collection(text, int, int) to anon, authenticated;
