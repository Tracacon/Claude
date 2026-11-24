-- Phase 4: Termine aus Odoo, Karten zum Termin mitbringen, QR-Check-in, Event-Abzeichen.
-- Einmal im SQL Editor von Supabase ausführen (nach den bisherigen Migrationen).

-- ---------------------------------------------------------------------------
-- Termine. Werden vom App-Server aus Odoo übernommen (nur lesend aus Odoo).
-- ---------------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  odoo_id     int not null unique,
  name        text not null,
  subtitle    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  timezone    text,
  venue       text,
  address     text,
  city        text,
  ticket_url  text,
  website_url text,
  published   boolean not null default true,
  synced_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint events_times check (ends_at >= starts_at),
  constraint events_ticket_url check (ticket_url is null or ticket_url ~* '^https://'),
  constraint events_website_url check (website_url is null or website_url ~* '^https://')
);
create index events_starts_at_idx on public.events (starts_at);

alter table public.events enable row level security;
create policy "Veröffentlichte Termine sind öffentlich" on public.events
  for select to anon, authenticated using (published or public.is_team());
grant select on public.events to anon, authenticated;

-- Zeitpunkt und Ergebnis des letzten Abgleichs mit Odoo
create table public.event_sync (
  id         boolean primary key default true check (id),
  synced_at  timestamptz,
  error      text
);
insert into public.event_sync (id) values (true);
alter table public.event_sync enable row level security;
-- kein direkter Zugriff, nur über Funktionen

-- ---------------------------------------------------------------------------
-- Karten zum Termin mitbringen
-- ---------------------------------------------------------------------------
create table public.listing_events (
  listing_id uuid not null references public.listings (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, event_id)
);
create index listing_events_event_idx on public.listing_events (event_id);

alter table public.listing_events enable row level security;
create policy "Mitbringen sichtbar wie das Inserat" on public.listing_events
  for select to anon, authenticated using (
    exists (select 1 from public.listings l
             where l.id = listing_id
               and (l.status in ('active', 'reserved') or l.owner_id = auth.uid() or public.is_team()))
  );
grant select on public.listing_events to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Check-in: ein Code je Termin (QR-Aushang), ein Check-in je Person und Termin
-- ---------------------------------------------------------------------------
create table public.checkin_codes (
  event_id   uuid primary key references public.events (id) on delete cascade,
  code       text not null unique check (code ~ '^[a-z0-9]{24,64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.checkin_codes enable row level security;
-- kein direkter Zugriff, nur über Funktionen (Team)

create table public.checkins (
  event_id      uuid not null references public.events (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index checkins_user_idx on public.checkins (user_id);

alter table public.checkins enable row level security;
create policy "Eigene Check-ins und Team" on public.checkins
  for select to authenticated using (user_id = auth.uid() or public.is_team());
grant select on public.checkins to authenticated;

-- ---------------------------------------------------------------------------
-- Abgleich: übernimmt die Termine aus Odoo. Nur mit dem geheimen Server-Schlüssel.
-- p = { since: Zeitpunkt, events: [{ odoo_id, name, subtitle, starts_at, ends_at, timezone,
--       venue, address, city, ticket_url, website_url, published }] }
-- Termine ab "since", die Odoo nicht mehr liefert, werden ausgeblendet.
-- ---------------------------------------------------------------------------
create function public.sync_events(p jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_ids int[] := '{}';
  v_count int := 0;
  v_url text;
begin
  for e in select * from jsonb_array_elements(coalesce(p -> 'events', '[]'::jsonb)) loop
    v_ids := v_ids || (e ->> 'odoo_id')::int;
    insert into public.events as ev (odoo_id, name, subtitle, starts_at, ends_at, timezone, venue, address, city,
                                     ticket_url, website_url, published, synced_at)
    values (
      (e ->> 'odoo_id')::int,
      left(btrim(e ->> 'name'), 200),
      nullif(left(btrim(e ->> 'subtitle'), 300), ''),
      (e ->> 'starts_at')::timestamptz,
      greatest((e ->> 'ends_at')::timestamptz, (e ->> 'starts_at')::timestamptz),
      nullif(left(e ->> 'timezone', 64), ''),
      nullif(left(btrim(e ->> 'venue'), 200), ''),
      nullif(left(btrim(e ->> 'address'), 300), ''),
      nullif(left(btrim(e ->> 'city'), 100), ''),
      case when e ->> 'ticket_url' ~* '^https://' then left(e ->> 'ticket_url', 500) end,
      case when e ->> 'website_url' ~* '^https://' then left(e ->> 'website_url', 500) end,
      coalesce((e ->> 'published')::boolean, true),
      now()
    )
    on conflict (odoo_id) do update set
      name = excluded.name, subtitle = excluded.subtitle, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      timezone = excluded.timezone, venue = excluded.venue, address = excluded.address, city = excluded.city,
      ticket_url = excluded.ticket_url, website_url = excluded.website_url, published = excluded.published,
      synced_at = now();
    v_count := v_count + 1;
  end loop;

  update public.events
     set published = false, synced_at = now()
   where published
     and ends_at >= coalesce((p ->> 'since')::timestamptz, now())
     and not (odoo_id = any (v_ids));

  update public.event_sync set synced_at = now(), error = null;
  return v_count;
end;
$$;

-- Fehler beim Abgleich festhalten (Zeitpunkt zählt, damit nicht jede Anfrage Odoo erneut fragt)
create function public.sync_events_failed(p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.event_sync set synced_at = now(), error = left(p_error, 500);
$$;

-- Stand des Abgleichs (für alle lesbar; Fehlertext nur fürs Team)
create function public.event_sync_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('synced_at', s.synced_at, 'error', case when public.is_team() then s.error end)
    from public.event_sync s;
$$;

-- ---------------------------------------------------------------------------
-- Terminlisten
-- ---------------------------------------------------------------------------
create function public.list_events(p_past boolean default false, p_limit int default 30)
returns table (
  id uuid,
  name text,
  subtitle text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue text,
  city text,
  ticket_url text,
  listing_count bigint,
  checkin_count bigint,
  checked_in boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.subtitle, e.starts_at, e.ends_at, e.timezone, e.venue, e.city, e.ticket_url,
         (select count(*) from public.listing_events le join public.listings l on l.id = le.listing_id
           where le.event_id = e.id and l.status in ('active', 'reserved')),
         (select count(*) from public.checkins c where c.event_id = e.id),
         exists (select 1 from public.checkins c where c.event_id = e.id and c.user_id = auth.uid())
    from public.events e
   where e.published
     and case when p_past then e.ends_at < now() else e.ends_at >= now() end
   order by case when p_past then null else e.starts_at end asc,
            case when p_past then e.starts_at end desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create function public.get_event(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(e) - 'synced_at' - 'created_at' - 'odoo_id' || jsonb_build_object(
    'listing_count', (select count(*) from public.listing_events le join public.listings l on l.id = le.listing_id
                       where le.event_id = e.id and l.status in ('active', 'reserved')),
    'checkin_count', (select count(*) from public.checkins c where c.event_id = e.id),
    'checked_in', exists (select 1 from public.checkins c where c.event_id = e.id and c.user_id = auth.uid()),
    'is_past', e.ends_at < now(),
    'checkin_open', now() between e.starts_at - interval '2 hours' and e.ends_at + interval '2 hours'
  )
    from public.events e
   where e.id = p_id and (e.published or public.is_team());
$$;

-- Inserate, die zum Termin mitgebracht werden (gleiche Spalten wie die Marktplatz-Suche)
create function public.event_listings(p_event uuid, p_limit int default 24, p_offset int default 0)
returns table (
  id uuid,
  title text,
  tcg public.tcg,
  kind public.listing_kind,
  offer public.listing_offer,
  price_cents int,
  negotiable boolean,
  condition public.card_condition,
  city text,
  status public.listing_status,
  created_at timestamptz,
  owner_nickname text,
  cover_photo_id uuid,
  owner_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.tcg, l.kind, l.offer, l.price_cents, l.negotiable, l.condition, l.city, l.status,
         l.created_at, pr.nickname,
         (select ph.id from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
         l.owner_id,
         count(*) over ()
    from public.listing_events le
    join public.listings l on l.id = le.listing_id
    join public.profiles pr on pr.id = l.owner_id
   where le.event_id = p_event
     and l.status in ('active', 'reserved')
     and pr.nickname is not null
   order by l.created_at desc
   limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Termine, zu denen ein Inserat mitgebracht wird (kommende zuerst)
create function public.listing_event_list(p_listing uuid)
returns table (id uuid, name text, starts_at timestamptz, ends_at timestamptz, city text)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.name, e.starts_at, e.ends_at, e.city
    from public.listing_events le
    join public.events e on e.id = le.event_id
   where le.listing_id = p_listing and e.published and e.ends_at >= now()
   order by e.starts_at;
$$;

-- Mitbringen festlegen. Ersetzt die Auswahl für kommende Termine, vergangene bleiben stehen.
create function public.set_listing_events(p_listing uuid, p_events uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.listings where id = p_listing and owner_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if coalesce(array_length(p_events, 1), 0) > 10 then
    raise exception 'too_many_events' using errcode = '22023';
  end if;

  delete from public.listing_events le
   using public.events e
   where le.listing_id = p_listing and e.id = le.event_id and e.ends_at >= now()
     and not (le.event_id = any (coalesce(p_events, '{}')));

  insert into public.listing_events (listing_id, event_id)
  select p_listing, e.id
    from public.events e
   where e.id = any (coalesce(p_events, '{}')) and e.published and e.ends_at >= now()
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check-in
-- ---------------------------------------------------------------------------
-- Code für den Aushang (Team). Legt ihn beim ersten Mal an; p_renew erzeugt einen neuen
-- und macht den alten ungültig.
create function public.team_checkin_code(p_event uuid, p_renew boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select code into v_code from public.checkin_codes where event_id = p_event;
  if v_code is null or p_renew then
    v_code := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    insert into public.checkin_codes (event_id, code, created_by) values (p_event, v_code, auth.uid())
    on conflict (event_id) do update set code = excluded.code, created_by = excluded.created_by, created_at = now();
  end if;
  return v_code;
end;
$$;

-- Einchecken mit dem Code vom Aushang. Nur rund um die Eventzeit gültig.
create function public.check_in(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_me uuid := auth.uid();
  v_new boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_me and nickname is not null) then
    raise exception 'onboarding_required' using errcode = '42501';
  end if;

  select ev.* into e
    from public.checkin_codes c join public.events ev on ev.id = c.event_id
   where c.code = lower(btrim(p_code));
  if e.id is null then
    raise exception 'checkin_invalid' using errcode = 'P0002';
  end if;
  if now() < e.starts_at - interval '2 hours' then
    raise exception 'checkin_not_open' using errcode = '22023';
  end if;
  if now() > e.ends_at + interval '2 hours' then
    raise exception 'checkin_closed' using errcode = '22023';
  end if;

  insert into public.checkins (event_id, user_id) values (e.id, v_me) on conflict do nothing;
  v_new := found;

  return jsonb_build_object(
    'event_id', e.id,
    'name', e.name,
    'starts_at', e.starts_at,
    'new', v_new,
    'visits', (select count(*) from public.checkins where user_id = v_me)
  );
end;
$$;

-- Übersicht fürs Team: Check-ins je Termin
create function public.team_event_overview()
returns table (id uuid, name text, starts_at timestamptz, ends_at timestamptz, city text,
               published boolean, has_code boolean, checkin_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select e.id, e.name, e.starts_at, e.ends_at, e.city, e.published,
         exists (select 1 from public.checkin_codes c where c.event_id = e.id),
         (select count(*) from public.checkins c where c.event_id = e.id)
    from public.events e
   where e.ends_at >= now() - interval '60 days'
   order by e.starts_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Abzeichen: Stammgast-Stufen, besuchte Events im Profil
-- ---------------------------------------------------------------------------
create or replace function public.profile_badges(p_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when p.role in ('team', 'admin') then 'team' end,
    case when p.created_at < timestamptz '2027-07-01 00:00:00+02' then 'founder' end,
    case when (select count(*) from public.listings l where l.owner_id = p.id) >= 1 then 'first_listing' end,
    case when (select count(*) from public.listings l where l.owner_id = p.id) >= 10 then 'seller_10' end,
    case when (select count(*) from public.follows f where f.following_id = p.id and f.status = 'accepted') >= 10 then 'popular' end,
    case when v.visits >= 25 then 'regular_25'
         when v.visits >= 10 then 'regular_10'
         when v.visits >= 3 then 'regular_3' end
  ], null)
    from public.profiles p
   cross join lateral (select count(*) as visits from public.checkins c where c.user_id = p.id) v
   where p.id = p_id;
$$;

-- Besuchte Events eines Profils (nur bei Berechtigung, wie Bio und Ort)
create function public.profile_events(p_nickname text)
returns table (id uuid, name text, starts_at timestamptz, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.starts_at, e.city
    from public.profiles p
    join public.checkins c on c.user_id = p.id
    join public.events e on e.id = c.event_id
   where lower(p.nickname) = lower(p_nickname)
     and public.can_view_profile(p.id)
   order by e.starts_at desc
   limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
revoke execute on function public.sync_events(jsonb) from public, anon, authenticated;
revoke execute on function public.sync_events_failed(text) from public, anon, authenticated;
revoke execute on function public.event_sync_state() from public;
revoke execute on function public.list_events(boolean, int) from public;
revoke execute on function public.get_event(uuid) from public;
revoke execute on function public.event_listings(uuid, int, int) from public;
revoke execute on function public.listing_event_list(uuid) from public;
revoke execute on function public.set_listing_events(uuid, uuid[]) from public, anon;
revoke execute on function public.team_checkin_code(uuid, boolean) from public, anon;
revoke execute on function public.check_in(text) from public, anon;
revoke execute on function public.team_event_overview() from public, anon;
revoke execute on function public.profile_events(text) from public;

grant execute on function public.sync_events(jsonb) to service_role;
grant execute on function public.sync_events_failed(text) to service_role;
grant execute on function public.event_sync_state() to anon, authenticated, service_role;
grant execute on function public.list_events(boolean, int) to anon, authenticated;
grant execute on function public.get_event(uuid) to anon, authenticated;
grant execute on function public.event_listings(uuid, int, int) to anon, authenticated;
grant execute on function public.listing_event_list(uuid) to anon, authenticated;
grant execute on function public.set_listing_events(uuid, uuid[]) to authenticated;
grant execute on function public.team_checkin_code(uuid, boolean) to authenticated;
grant execute on function public.check_in(text) to authenticated;
grant execute on function public.team_event_overview() to authenticated;
grant execute on function public.profile_events(text) to anon, authenticated;
