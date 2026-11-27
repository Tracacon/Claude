-- Tracacon App: Sammelkartenbinder und Fotopflicht in der Sammlung.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261127200000_sammlung.sql).
--
-- 1. Vorder- und Rückseite sind bei Einzelkarten und Slabs immer Pflicht, auch in der Sammlung.
-- 2. Binder: Jeder kann mehrere Binder anlegen (Name, Farbe, wer ihn sieht).
--    Jede Karte liegt in einem Fach (pocket, ab 0 gezählt; 9 Fächer je Seite).
--    Leere Fächer sind erlaubt, wie in einem echten Binder.

-- ---------------------------------------------------------------------------
-- 1. Fotopflicht wieder unabhängig vom Status
-- ---------------------------------------------------------------------------
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
       and l.kind::text in ('single', 'slab')
       and l.status::text <> 'removed'
       and (select count(*) from public.listing_photos ph where ph.listing_id = l.id) < 2
  ) then
    raise exception 'front_back_required' using errcode = '23514';
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
       and l.kind::text in ('single', 'slab')
       and l.status::text <> 'removed'
       and (select count(*) from public.listing_photos ph where ph.listing_id = l.id) < 2
  ) then
    raise exception 'front_back_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Binder
-- ---------------------------------------------------------------------------
create table public.binders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null,
  color      text not null default 'night',
  visibility text not null default 'public',
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint binders_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint binders_color check (color in ('night', 'amber', 'red', 'blue', 'green', 'purple', 'black', 'cream')),
  constraint binders_visibility check (visibility in ('public', 'followers', 'private'))
);

create index binders_owner_idx on public.binders (owner_id, position, created_at);

create trigger binders_set_updated_at
  before update on public.binders
  for each row execute function public.set_updated_at();

-- Höchstens 50 Binder je Person
create function public.binders_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.binders where owner_id = new.owner_id) >= 50 then
    raise exception 'too_many_binders' using errcode = '54000';
  end if;
  new.position := coalesce((select max(position) + 1 from public.binders where owner_id = new.owner_id), 0);
  return new;
end;
$$;

create trigger binders_limit
  before insert on public.binders
  for each row execute function public.binders_limit();

alter table public.binders enable row level security;

create policy "binders_select_own_or_team"
  on public.binders for select
  to authenticated
  using (owner_id = auth.uid() or public.is_team());
create policy "binders_insert_own"
  on public.binders for insert
  to authenticated
  with check (owner_id = auth.uid());
create policy "binders_update_own"
  on public.binders for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy "binders_delete_own"
  on public.binders for delete
  to authenticated
  using (owner_id = auth.uid());

revoke all on public.binders from anon, authenticated;
grant select on public.binders to authenticated;
grant insert (name, color, visibility) on public.binders to authenticated;
grant update (name, color, visibility, position) on public.binders to authenticated;
grant delete on public.binders to authenticated;

-- Fach der Karte im Binder. Ohne Binder liegt die Karte in "Ohne Binder".
alter table public.listings
  add column binder_id uuid references public.binders (id) on delete set null,
  add column pocket    integer constraint listings_pocket_range check (pocket is null or pocket between 0 and 8999);

create index listings_binder_idx on public.listings (binder_id, pocket) where binder_id is not null;
create unique index listings_binder_pocket_unique on public.listings (binder_id, pocket) where binder_id is not null;

-- Wird ein Binder gelöscht, landen seine Karten in "Ohne Binder" und verlieren ihr Fach.
create function public.listings_binder_cleanup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.binder_id is null then
    new.pocket := null;
  end if;
  return new;
end;
$$;

create trigger listings_binder_cleanup
  before update of binder_id on public.listings
  for each row execute function public.listings_binder_cleanup();

-- Darf die angemeldete Person (oder ein Besucher) diesen Binder sehen?
-- Ohne Binder (null) gilt die Sichtbarkeit des Profils.
create function public.binder_visible(p_binder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_binder is null
      or exists (
           select 1 from public.binders b
            where b.id = p_binder
              and (b.owner_id = auth.uid()
                   or public.is_team()
                   or (b.visibility = 'public' and public.can_view_profile(b.owner_id))
                   or (b.visibility = 'followers' and exists (
                         select 1 from public.follows f
                          where f.follower_id = auth.uid() and f.following_id = b.owner_id and f.status = 'accepted'))));
$$;

-- Sammlungsstücke in einem privaten Binder sind auch über die direkte Adresse nicht sichtbar.
drop policy "listings_select_visible" on public.listings;
create policy "listings_select_visible"
  on public.listings for select
  to anon, authenticated
  using (
    status in ('active', 'reserved')
    or owner_id = auth.uid()
    or public.is_team()
    or (status::text = 'collection' and public.can_view_profile(owner_id) and public.binder_visible(binder_id))
  );

create or replace function public.get_listing(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'listing', to_jsonb(l) - 'search' - 'removed_by',
    'owner', jsonb_build_object(
      'nickname', pr.nickname,
      'role', pr.role,
      'member_since', pr.created_at,
      'avatar_id', case when public.can_view_profile(pr.id) then pr.avatar_id end
    ),
    'photos', coalesce((select jsonb_agg(ph.id order by ph.position)
                          from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb),
    'binder', (select jsonb_build_object('id', b.id, 'name', b.name)
                 from public.binders b where b.id = l.binder_id and public.binder_visible(b.id)),
    'is_owner', coalesce(l.owner_id = auth.uid(), false),
    'can_moderate', public.is_team()
  )
    from public.listings l
    join public.profiles pr on pr.id = l.owner_id
   where l.id = p_id
     and (l.status::text in ('active', 'reserved')
          or l.owner_id = auth.uid()
          or public.is_team()
          or (l.status::text = 'collection' and public.can_view_profile(l.owner_id) and public.binder_visible(l.binder_id)));
$$;

-- Sammlung eines Profils, jetzt mit Binder und Fach. Karten aus Bindern, die man
-- nicht sehen darf, fehlen.
drop function public.profile_collection(text, int, int);
create function public.profile_collection(p_nickname text, p_limit int default 600, p_offset int default 0)
returns table (
  id uuid,
  title text,
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
  select l.id, l.title, l.tcg, l.kind, l.offer, l.price_cents, l.negotiable, l.status, l.quantity,
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

-- Binder eines Profils, die man sehen darf, mit Anzahl Karten und Titelbild (erstes Fach)
create function public.profile_binders(p_nickname text)
returns table (
  id uuid,
  name text,
  color text,
  visibility text,
  "position" int,
  card_count bigint,
  cover_photo_id uuid,
  owner_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, b.color, b.visibility, b.position,
         (select count(*) from public.listings l
           where l.binder_id = b.id and l.status::text in ('collection', 'active', 'reserved')),
         (select ph.id from public.listings l
            join public.listing_photos ph on ph.listing_id = l.id and ph.position = 0
           where l.binder_id = b.id and l.status::text in ('collection', 'active', 'reserved')
           order by l.pocket limit 1),
         b.owner_id
    from public.profiles p
    join public.binders b on b.owner_id = p.id
   where lower(p.nickname) = lower(p_nickname)
     and public.can_view_profile(p.id)
     and public.binder_visible(b.id)
   order by b.position, b.created_at;
$$;

-- Karte in einen Binder legen (null = Ohne Binder). Ohne Fachangabe kommt sie ins erste freie Fach.
create function public.set_listing_binder(p_listing uuid, p_binder uuid, p_pocket int default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pocket int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.listings where id = p_listing and owner_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_binder is null then
    update public.listings set binder_id = null, pocket = null where id = p_listing;
    return null;
  end if;
  if not exists (select 1 from public.binders where id = p_binder and owner_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Bleibt die Karte im selben Binder, behält sie ihr Fach
  if p_pocket is null
     and exists (select 1 from public.listings where id = p_listing and binder_id = p_binder) then
    return (select pocket from public.listings where id = p_listing);
  end if;
  if p_pocket is not null then
    if p_pocket < 0 or p_pocket > 8999 then
      raise exception 'invalid_action' using errcode = '22023';
    end if;
    if exists (select 1 from public.listings where binder_id = p_binder and pocket = p_pocket and id <> p_listing) then
      raise exception 'pocket_taken' using errcode = '23505';
    end if;
    v_pocket := p_pocket;
  else
    select coalesce(min(s.n), 0) into v_pocket
      from generate_series(0, 8999) s(n)
     where not exists (select 1 from public.listings l where l.binder_id = p_binder and l.pocket = s.n);
  end if;
  update public.listings set binder_id = p_binder, pocket = v_pocket where id = p_listing;
  return v_pocket;
end;
$$;

-- Karte in ein anderes Fach desselben Binders legen. Liegt dort schon eine Karte, tauschen beide.
create function public.move_listing_pocket(p_listing uuid, p_pocket int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_binder uuid;
  v_old int;
  v_other uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_pocket is null or p_pocket < 0 or p_pocket > 8999 then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select binder_id, pocket into v_binder, v_old
    from public.listings where id = p_listing and owner_id = auth.uid();
  if v_binder is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_old = p_pocket then
    return;
  end if;
  select id into v_other from public.listings where binder_id = v_binder and pocket = p_pocket;
  -- Zuerst freimachen, damit die Regel "ein Fach, eine Karte" nicht stört
  update public.listings set pocket = null where id = p_listing;
  if v_other is not null then
    update public.listings set pocket = v_old where id = v_other;
  end if;
  update public.listings set pocket = p_pocket where id = p_listing;
end;
$$;

-- Binder anlegen bzw. ändern (Name, Farbe, Sichtbarkeit). Gibt die ID zurück.
create function public.save_binder(p_id uuid, p_name text, p_color text, p_visibility text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    insert into public.binders (name, color, visibility)
    values (btrim(left(p_name, 41)), coalesce(p_color, 'night'), coalesce(p_visibility, 'public'))
    returning id into v_id;
  else
    update public.binders
       set name = btrim(left(p_name, 41)), color = coalesce(p_color, color), visibility = coalesce(p_visibility, visibility)
     where id = p_id and owner_id = auth.uid()
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Eigene Binder (für die Auswahl im Formular)
create function public.my_binders()
returns table (id uuid, name text, color text, visibility text)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.name, b.color, b.visibility from public.binders b
   where b.owner_id = auth.uid()
   order by b.position, b.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------------
revoke execute on function public.binders_limit() from public, anon, authenticated;
revoke execute on function public.listings_binder_cleanup() from public, anon, authenticated;
revoke execute on function public.binder_visible(uuid) from public;
grant execute on function public.binder_visible(uuid) to anon, authenticated;
revoke execute on function public.profile_collection(text, int, int) from public;
grant execute on function public.profile_collection(text, int, int) to anon, authenticated;
revoke execute on function public.profile_binders(text) from public;
grant execute on function public.profile_binders(text) to anon, authenticated;
revoke execute on function public.set_listing_binder(uuid, uuid, int) from public, anon;
grant execute on function public.set_listing_binder(uuid, uuid, int) to authenticated;
revoke execute on function public.move_listing_pocket(uuid, int) from public, anon;
grant execute on function public.move_listing_pocket(uuid, int) to authenticated;
revoke execute on function public.save_binder(uuid, text, text, text) from public, anon;
grant execute on function public.save_binder(uuid, text, text, text) to authenticated;
revoke execute on function public.my_binders() from public, anon;
grant execute on function public.my_binders() to authenticated;
