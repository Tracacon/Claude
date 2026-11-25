-- Tracacon-App, Phase 2: Marktplatz, Fotos, Meldungen, Moderation
-- Voraussetzung: Phase 1 (profiles, is_team, is_admin).
--
-- Schreibzugriffe laufen über Funktionen mit den Rechten des Aufrufers
-- (security invoker), damit Zugriffsregeln und Spaltenrechte weiter greifen.
-- Nur Suche, Detailansicht und Moderation laufen mit erhöhten Rechten
-- (security definer) und prüfen die Sichtbarkeit selbst.

-- ---------------------------------------------------------------------------
-- Aufzählungen
-- ---------------------------------------------------------------------------
create type public.tcg as enum
  ('pokemon', 'one_piece', 'yugioh', 'magic', 'sports', 'riftbound', 'dragon_ball', 'lorcana', 'other');
create type public.listing_kind as enum ('single', 'sealed', 'lot', 'accessory', 'other');
create type public.listing_offer as enum ('sell', 'trade', 'sell_or_trade');
create type public.card_condition as enum
  ('mint', 'near_mint', 'excellent', 'good', 'light_played', 'played', 'poor');
create type public.listing_status as enum ('active', 'reserved', 'done', 'removed');
create type public.report_reason as enum ('scam', 'counterfeit', 'offensive', 'spam', 'wrong_info', 'other');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Inserate
-- ---------------------------------------------------------------------------
create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title             text not null,
  description       text,
  tcg               public.tcg not null,
  kind              public.listing_kind not null default 'single',
  offer             public.listing_offer not null default 'sell',
  price_cents       integer,
  negotiable        boolean not null default false,
  condition         public.card_condition,
  card_language     text,
  grading           text,
  city              text,
  handover_event    boolean not null default true,
  handover_pickup   boolean not null default false,
  handover_shipping boolean not null default false,
  status            public.listing_status not null default 'active',
  removed_reason    text,
  removed_at        timestamptz,
  removed_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  search            tsvector generated always as (
                      to_tsvector('german', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(grading, ''))
                    ) stored,

  constraint listings_title_length       check (char_length(btrim(title)) between 3 and 100),
  constraint listings_description_length check (description is null or char_length(description) <= 2000),
  constraint listings_price_range        check (price_cents is null or price_cents between 0 and 10000000),
  constraint listings_price_for_sale     check (offer = 'trade' or price_cents is not null),
  constraint listings_card_language      check (card_language is null or card_language in
                                           ('de', 'en', 'ja', 'fr', 'it', 'es', 'pt', 'ko', 'zh', 'other')),
  constraint listings_grading_length     check (grading is null or char_length(grading) <= 40),
  constraint listings_city_length        check (city is null or char_length(city) <= 80),
  constraint listings_handover           check (handover_event or handover_pickup or handover_shipping),
  constraint listings_removed_reason     check (status <> 'removed' or removed_reason is not null)
);

comment on table public.listings is 'Marktplatz-Inserate. Preis in Cent. status removed = durch das Team entfernt.';

create index listings_public_idx on public.listings (created_at desc) where status in ('active', 'reserved');
create index listings_owner_idx on public.listings (owner_id, created_at desc);
create index listings_tcg_idx on public.listings (tcg) where status in ('active', 'reserved');
create index listings_search_idx on public.listings using gin (search);

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fotos (Dateien liegen in Supabase Storage, Bucket listing-photos)
-- Pfad: <nutzer-id>/<foto-id>.jpg, Vorschau: <nutzer-id>/<foto-id>_t.jpg
-- ---------------------------------------------------------------------------
create table public.listing_photos (
  id         uuid primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint listing_photos_position check (position between 0 and 5)
);

create index listing_photos_listing_idx on public.listing_photos (listing_id, position);

-- ---------------------------------------------------------------------------
-- Meldungen
-- ---------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  listing_id  uuid references public.listings (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete cascade,
  reason      public.report_reason not null,
  details     text,
  status      public.report_status not null default 'open',
  resolution  text,
  handled_by  uuid references public.profiles (id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint reports_one_target     check ((listing_id is null) <> (profile_id is null)),
  constraint reports_details_length check (details is null or char_length(details) <= 1000),
  constraint reports_resolution_len check (resolution is null or char_length(resolution) <= 1000)
);

create index reports_open_idx on public.reports (created_at) where status = 'open';
-- Pro Person nur eine offene Meldung je Inhalt
create unique index reports_one_open_listing on public.reports (reporter_id, listing_id)
  where status = 'open' and listing_id is not null;
create unique index reports_one_open_profile on public.reports (reporter_id, profile_id)
  where status = 'open' and profile_id is not null;

-- ---------------------------------------------------------------------------
-- Schutzregeln per Trigger
-- ---------------------------------------------------------------------------

-- Nur fertige Profile (Begrüßung abgeschlossen) dürfen inserieren; höchstens 30 Inserate pro Tag.
create function public.listings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.owner_id and nickname is not null) then
    raise exception 'profile_incomplete' using errcode = '42501';
  end if;
  if (select count(*) from public.listings
       where owner_id = new.owner_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  new.status := 'active';
  new.removed_reason := null;
  new.removed_at := null;
  new.removed_by := null;
  return new;
end;
$$;

create trigger listings_before_insert
  before insert on public.listings
  for each row execute function public.listings_before_insert();

-- Entfernte Inserate kann nur das Team (über moderate_listing) wieder freigeben.
create function public.listings_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('tracacon.moderation', true) = 'on' then
    return new;
  end if;
  if old.status = 'removed' then
    raise exception 'listing_removed' using errcode = '42501';
  end if;
  if new.status = 'removed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger listings_guard_status
  before update on public.listings
  for each row execute function public.listings_guard_status();

-- Höchstens 6 Fotos je Inserat
create function public.listing_photos_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_photos where listing_id = new.listing_id) >= 6 then
    raise exception 'too_many_photos' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger listing_photos_limit
  before insert on public.listing_photos
  for each row execute function public.listing_photos_limit();

-- ---------------------------------------------------------------------------
-- Zugriffsregeln
-- ---------------------------------------------------------------------------
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.reports enable row level security;

-- Inserate: öffentlich, solange aktiv oder reserviert; Eigentümer und Team sehen alle eigenen bzw. alle.
create policy "listings_select_visible"
  on public.listings for select
  to anon, authenticated
  using (status in ('active', 'reserved') or owner_id = auth.uid() or public.is_team());

create policy "listings_insert_own"
  on public.listings for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "listings_update_own"
  on public.listings for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "listings_delete_own"
  on public.listings for delete
  to authenticated
  using (owner_id = auth.uid());

revoke all on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert (title, description, tcg, kind, offer, price_cents, negotiable, condition, card_language,
              grading, city, handover_event, handover_pickup, handover_shipping)
  on public.listings to authenticated;
grant update (title, description, tcg, kind, offer, price_cents, negotiable, condition, card_language,
              grading, city, handover_event, handover_pickup, handover_shipping, status)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;

-- Fotos: sichtbar, wenn das Inserat sichtbar ist; anlegen und löschen nur durch den Eigentümer.
create policy "listing_photos_select_visible"
  on public.listing_photos for select
  to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "listing_photos_insert_own"
  on public.listing_photos for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  );

create policy "listing_photos_delete_own"
  on public.listing_photos for delete
  to authenticated
  using (owner_id = auth.uid());

create policy "listing_photos_update_own"
  on public.listing_photos for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke all on public.listing_photos from anon, authenticated;
grant select on public.listing_photos to anon, authenticated;
grant insert (id, listing_id, position) on public.listing_photos to authenticated;
grant update (position) on public.listing_photos to authenticated;
grant delete on public.listing_photos to authenticated;

-- Meldungen: jeder Angemeldete darf melden und sieht seine eigenen; das Team sieht alle.
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy "reports_select_own_or_team"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_team());

revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (listing_id, profile_id, reason, details) on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: Inseratsdaten aus JSON in Spalten (für Anlegen und Bearbeiten)
-- ---------------------------------------------------------------------------
create function public._listing_text(p jsonb, k text, maxlen int)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(left(p ->> k, maxlen + 1)), '');
$$;

-- ---------------------------------------------------------------------------
-- Inserat anlegen. p = { title, description, tcg, kind, offer, price_cents, negotiable,
--   condition, card_language, grading, city, handover_event, handover_pickup,
--   handover_shipping, photos: [foto-id, ...] }
-- ---------------------------------------------------------------------------
create function public.create_listing(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_photo text;
  v_pos int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.listings (title, description, tcg, kind, offer, price_cents, negotiable, condition,
                               card_language, grading, city, handover_event, handover_pickup, handover_shipping)
  values (
    public._listing_text(p, 'title', 100),
    public._listing_text(p, 'description', 2000),
    (p ->> 'tcg')::public.tcg,
    coalesce((p ->> 'kind')::public.listing_kind, 'single'),
    coalesce((p ->> 'offer')::public.listing_offer, 'sell'),
    case when p ->> 'offer' = 'trade' then null else (p ->> 'price_cents')::int end,
    coalesce((p ->> 'negotiable')::boolean, false),
    (nullif(p ->> 'condition', ''))::public.card_condition,
    nullif(p ->> 'card_language', ''),
    public._listing_text(p, 'grading', 40),
    public._listing_text(p, 'city', 80),
    coalesce((p ->> 'handover_event')::boolean, false),
    coalesce((p ->> 'handover_pickup')::boolean, false),
    coalesce((p ->> 'handover_shipping')::boolean, false)
  )
  returning id into v_id;

  for v_photo in select jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) loop
    insert into public.listing_photos (id, listing_id, position) values (v_photo::uuid, v_id, v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inserat bearbeiten. Gibt die IDs der entfernten Fotos zurück (Dateien löscht die App).
-- ---------------------------------------------------------------------------
create function public.update_listing(p_id uuid, p jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removed uuid[];
  v_photos uuid[];
  v_photo uuid;
  v_pos int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.listings set
    title             = public._listing_text(p, 'title', 100),
    description       = public._listing_text(p, 'description', 2000),
    tcg               = (p ->> 'tcg')::public.tcg,
    kind              = coalesce((p ->> 'kind')::public.listing_kind, 'single'),
    offer             = coalesce((p ->> 'offer')::public.listing_offer, 'sell'),
    price_cents       = case when p ->> 'offer' = 'trade' then null else (p ->> 'price_cents')::int end,
    negotiable        = coalesce((p ->> 'negotiable')::boolean, false),
    condition         = (nullif(p ->> 'condition', ''))::public.card_condition,
    card_language     = nullif(p ->> 'card_language', ''),
    grading           = public._listing_text(p, 'grading', 40),
    city              = public._listing_text(p, 'city', 80),
    handover_event    = coalesce((p ->> 'handover_event')::boolean, false),
    handover_pickup   = coalesce((p ->> 'handover_pickup')::boolean, false),
    handover_shipping = coalesce((p ->> 'handover_shipping')::boolean, false)
  where id = p_id and owner_id = auth.uid();

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(x::uuid), '{}') into v_photos
    from jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) as x;

  with d as (
    delete from public.listing_photos
     where listing_id = p_id and not (id = any (v_photos))
    returning id
  )
  select coalesce(array_agg(d.id), '{}') into v_removed from d;

  -- Reihenfolge neu setzen und neue Fotos anhängen
  foreach v_photo in array v_photos loop
    if exists (select 1 from public.listing_photos where id = v_photo and listing_id = p_id) then
      update public.listing_photos set position = v_pos where id = v_photo;
    else
      insert into public.listing_photos (id, listing_id, position) values (v_photo, p_id, v_pos);
    end if;
    v_pos := v_pos + 1;
  end loop;

  return v_removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status ändern (aktiv, reserviert, erledigt)
-- ---------------------------------------------------------------------------
create function public.set_listing_status(p_id uuid, p_status public.listing_status)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status = 'removed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.listings set status = p_status where id = p_id and owner_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inserat löschen. Gibt die Foto-IDs zurück, damit die App die Dateien löscht.
-- ---------------------------------------------------------------------------
create function public.delete_listing(p_id uuid)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_photos uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_photos from public.listing_photos where listing_id = p_id;
  delete from public.listings where id = p_id and owner_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_photos;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suche (öffentlich). Liefert nur aktive und reservierte Inserate.
-- ---------------------------------------------------------------------------
create function public.search_listings(
  p_query     text default null,
  p_tcg       public.tcg default null,
  p_kind      public.listing_kind default null,
  p_offer     public.listing_offer default null,
  p_min_cents int default null,
  p_max_cents int default null,
  p_sort      text default 'newest',
  p_limit     int default 24,
  p_offset    int default 0
)
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
  with q as (
    select nullif(btrim(left(p_query, 100)), '') as text
  )
  select l.id, l.title, l.tcg, l.kind, l.offer, l.price_cents, l.negotiable, l.condition, l.city, l.status,
         l.created_at, pr.nickname,
         (select ph.id from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
         l.owner_id,
         count(*) over ()
    from public.listings l
    join public.profiles pr on pr.id = l.owner_id
    cross join q
   where l.status in ('active', 'reserved')
     and pr.nickname is not null
     and (p_tcg is null or l.tcg = p_tcg)
     and (p_kind is null or l.kind = p_kind)
     and (p_offer is null
          or l.offer = p_offer
          or (p_offer in ('sell', 'trade') and l.offer = 'sell_or_trade'))
     and (p_min_cents is null or l.price_cents >= p_min_cents)
     and (p_max_cents is null or l.price_cents <= p_max_cents)
     and (q.text is null
          or l.search @@ websearch_to_tsquery('german', q.text)
          or l.title ilike '%' || replace(replace(replace(q.text, '\', '\\'), '%', '\%'), '_', '\_') || '%')
   order by
     case when p_sort = 'price_asc' then l.price_cents end asc nulls last,
     case when p_sort = 'price_desc' then l.price_cents end desc nulls last,
     l.created_at desc
   limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Detailansicht (öffentlich, prüft Sichtbarkeit selbst)
-- ---------------------------------------------------------------------------
create function public.get_listing(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'listing', to_jsonb(l) - 'search' - 'removed_by',
    'owner', jsonb_build_object('nickname', pr.nickname, 'role', pr.role, 'member_since', pr.created_at),
    'photos', coalesce((select jsonb_agg(ph.id order by ph.position)
                          from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb),
    'is_owner', coalesce(l.owner_id = auth.uid(), false),
    'can_moderate', public.is_team()
  )
    from public.listings l
    join public.profiles pr on pr.id = l.owner_id
   where l.id = p_id
     and (l.status in ('active', 'reserved') or l.owner_id = auth.uid() or public.is_team());
$$;

-- ---------------------------------------------------------------------------
-- Eigene Inserate (alle Status)
-- ---------------------------------------------------------------------------
create function public.my_listings()
returns table (
  id uuid,
  title text,
  tcg public.tcg,
  offer public.listing_offer,
  price_cents int,
  status public.listing_status,
  removed_reason text,
  created_at timestamptz,
  cover_photo_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.title, l.tcg, l.offer, l.price_cents, l.status, l.removed_reason, l.created_at,
         (select ph.id from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1)
    from public.listings l
   where l.owner_id = auth.uid()
   order by l.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Melden
-- ---------------------------------------------------------------------------
create function public.report_content(
  p_listing_id uuid,
  p_profile_id uuid,
  p_reason public.report_reason,
  p_details text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_listing_id is not null
     and exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'cannot_report_own' using errcode = '22023';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'cannot_report_own' using errcode = '22023';
  end if;
  insert into public.reports (listing_id, profile_id, reason, details)
  values (p_listing_id, p_profile_id, p_reason, nullif(btrim(left(p_details, 1000)), ''));
exception
  when unique_violation then
    raise exception 'already_reported' using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation (Team und Admin)
-- ---------------------------------------------------------------------------
create function public.list_open_reports(p_limit int default 50, p_offset int default 0)
returns table (
  id uuid,
  reason public.report_reason,
  details text,
  created_at timestamptz,
  reporter_nickname text,
  listing_id uuid,
  listing_title text,
  listing_status public.listing_status,
  listing_owner_nickname text,
  profile_id uuid,
  profile_nickname text,
  total_count bigint
)
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
    select r.id, r.reason, r.details, r.created_at, rp.nickname,
           l.id, l.title, l.status, lo.nickname,
           pp.id, pp.nickname,
           count(*) over ()
      from public.reports r
      left join public.profiles rp on rp.id = r.reporter_id
      left join public.listings l on l.id = r.listing_id
      left join public.profiles lo on lo.id = l.owner_id
      left join public.profiles pp on pp.id = r.profile_id
     where r.status = 'open'
     order by r.created_at asc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.open_report_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_team() then (select count(*) from public.reports where status = 'open') else 0 end;
$$;

-- Inserat entfernen (mit Begründung für den Eigentümer) oder wieder freigeben.
-- Beim Entfernen werden alle offenen Meldungen zu diesem Inserat erledigt.
create function public.moderate_listing(p_id uuid, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('tracacon.moderation', 'on', true);

  if p_action = 'remove' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    update public.listings
       set status = 'removed', removed_reason = left(btrim(p_reason), 1000),
           removed_at = now(), removed_by = auth.uid()
     where id = p_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    update public.reports
       set status = 'resolved', resolution = left(btrim(p_reason), 1000),
           handled_by = auth.uid(), handled_at = now()
     where listing_id = p_id and status = 'open';
  elsif p_action = 'restore' then
    update public.listings
       set status = 'active', removed_reason = null, removed_at = null, removed_by = null
     where id = p_id and status = 'removed';
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  perform set_config('tracacon.moderation', 'off', true);
end;
$$;

-- Meldung abschließen, ohne den Inhalt zu entfernen
create function public.close_report(p_id uuid, p_status public.report_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status = 'open' then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  update public.reports
     set status = p_status, resolution = nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
         handled_by = auth.uid(), handled_at = now()
   where id = p_id and status = 'open';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------------
revoke execute on function public.listings_before_insert() from public, anon, authenticated;
revoke execute on function public.listings_guard_status() from public, anon, authenticated;
revoke execute on function public.listing_photos_limit() from public, anon, authenticated;
revoke execute on function public._listing_text(jsonb, text, int) from public, anon;
revoke execute on function public.create_listing(jsonb) from public, anon;
revoke execute on function public.update_listing(uuid, jsonb) from public, anon;
revoke execute on function public.set_listing_status(uuid, public.listing_status) from public, anon;
revoke execute on function public.delete_listing(uuid) from public, anon;
revoke execute on function public.my_listings() from public, anon;
revoke execute on function public.report_content(uuid, uuid, public.report_reason, text) from public, anon;
revoke execute on function public.list_open_reports(int, int) from public, anon;
revoke execute on function public.open_report_count() from public, anon;
revoke execute on function public.moderate_listing(uuid, text, text) from public, anon;
revoke execute on function public.close_report(uuid, public.report_status, text) from public, anon;
revoke execute on function public.search_listings(text, public.tcg, public.listing_kind, public.listing_offer, int, int, text, int, int) from public;
revoke execute on function public.get_listing(uuid) from public;

-- is_team wird in Zugriffsregeln auch für Besucher ohne Anmeldung ausgewertet
grant execute on function public.is_team() to anon;

grant execute on function public._listing_text(jsonb, text, int) to authenticated;
grant execute on function public.create_listing(jsonb) to authenticated;
grant execute on function public.update_listing(uuid, jsonb) to authenticated;
grant execute on function public.set_listing_status(uuid, public.listing_status) to authenticated;
grant execute on function public.delete_listing(uuid) to authenticated;
grant execute on function public.my_listings() to authenticated;
grant execute on function public.report_content(uuid, uuid, public.report_reason, text) to authenticated;
grant execute on function public.list_open_reports(int, int) to authenticated;
grant execute on function public.open_report_count() to authenticated;
grant execute on function public.moderate_listing(uuid, text, text) to authenticated;
grant execute on function public.close_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.search_listings(text, public.tcg, public.listing_kind, public.listing_offer, int, int, text, int, int) to anon, authenticated;
grant execute on function public.get_listing(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Speicher für Fotos (Supabase Storage)
-- Öffentlich lesbar, damit Bilder schnell ausgeliefert werden.
-- Hochladen nur in den eigenen Ordner, nur JPEG/WebP, höchstens 2 MB je Datei.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "listing_photos_upload_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.jpg$'
  );

create policy "listing_photos_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
