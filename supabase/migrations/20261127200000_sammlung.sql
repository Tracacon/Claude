-- Tracacon App: Sammlung als Grundlage, Inserate sind markierte Sammlungsstücke.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261127120000_sicherheit_grenzen.sql).
--
-- Jedes Stück liegt in der Tabelle listings. Neu ist der Status "collection" (nur Sammlung):
-- Solche Stücke erscheinen nicht im Marktplatz, im Feed, bei Terminen oder im Chat, weil alle
-- diese Stellen nur aktive und reservierte Stücke zeigen. Sichtbar sind sie im Profil
-- (Reiter Sammlung) für alle, die das Profil sehen dürfen.
-- Markieren zum Tauschen, Verkaufen oder Verschenken = Status "active".
-- Vergleiche mit dem neuen Wert laufen als Text, damit alles in einer Ausführung klappt.

alter type public.listing_status add value if not exists 'collection' before 'active';

alter table public.listings
  add column quantity smallint not null default 1
  constraint listings_quantity_range check (quantity between 1 and 999);

comment on table public.listings is
  'Sammlungsstücke und Marktplatz-Inserate. status collection = nur Sammlung, active/reserved = im Marktplatz, '
  'done = erledigt, removed = durch das Team entfernt. Preis in Cent.';

-- Für die Sammlung eines Profils reicht der vorhandene Index listings_owner_idx (owner_id, created_at).

-- ---------------------------------------------------------------------------
-- Anlegen: create_listing meldet über eine Einstellung nur für diese Transaktion,
-- dass ein Sammlungsstück angelegt wird. Alles andere wird wie bisher "active".
-- (Den Status selbst darf beim Anlegen weiterhin niemand direkt setzen.)
-- Grenzen: 30 Marktplatz-Inserate und 500 Stücke insgesamt je 24 Stunden.
-- ---------------------------------------------------------------------------
create or replace function public.listings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.owner_id and nickname is not null) then
    raise exception 'profile_incomplete' using errcode = '42501';
  end if;
  if current_setting('tracacon.collection', true) = 'on' then
    new.status := 'collection';
    if (select count(*) from public.listings
         where owner_id = new.owner_id and created_at > now() - interval '24 hours') >= 500 then
      raise exception 'rate_limited' using errcode = '54000';
    end if;
  else
    new.status := 'active';
    if (select count(*) from public.listings
         where owner_id = new.owner_id and created_at > now() - interval '24 hours'
           and status::text <> 'collection') >= 30 then
      raise exception 'rate_limited' using errcode = '54000';
    end if;
  end if;
  new.removed_reason := null;
  new.removed_at := null;
  new.removed_by := null;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pflichtfotos (Vorder- und Rückseite) nur für Einzelkarten und Slabs im Marktplatz.
-- In der reinen Sammlung reicht das Kartenbild aus der Kartendatenbank.
-- Die Prüfung läuft jetzt auch, wenn der Status wechselt (z. B. Sammlung → Tauschen).
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
       and l.status::text in ('active', 'reserved')
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
       and l.status::text in ('active', 'reserved')
       and (select count(*) from public.listing_photos ph where ph.listing_id = l.id) < 2
  ) then
    raise exception 'front_back_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger listings_photos_required on public.listings;
create constraint trigger listings_photos_required
  after insert or update of kind, status on public.listings
  deferrable initially deferred
  for each row execute function public.listings_check_photos();

-- ---------------------------------------------------------------------------
-- Zugriff: Sammlungsstücke sehen alle, die das Profil sehen dürfen.
-- Fotos folgen automatisch (ihre Regel prüft, ob das Stück sichtbar ist).
-- ---------------------------------------------------------------------------
drop policy "listings_select_visible" on public.listings;
create policy "listings_select_visible"
  on public.listings for select
  to anon, authenticated
  using (
    status in ('active', 'reserved')
    or owner_id = auth.uid()
    or public.is_team()
    or (status::text = 'collection' and public.can_view_profile(owner_id))
  );

grant insert (quantity) on public.listings to authenticated;
grant update (quantity) on public.listings to authenticated;

-- ---------------------------------------------------------------------------
-- Anlegen mit Status (collection oder active) und Anzahl
-- ---------------------------------------------------------------------------
create or replace function public.create_listing(p jsonb)
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

  perform set_config('tracacon.collection', case when p ->> 'status' = 'collection' then 'on' else 'off' end, true);

  insert into public.listings (title, description, tcg, kind, offer, price_cents, negotiable, condition,
                               card_language, grading, city, handover_event, handover_pickup, handover_shipping,
                               quantity)
  values (
    public._listing_text(p, 'title', 100),
    public._listing_text(p, 'description', 2000),
    (p ->> 'tcg')::public.tcg,
    coalesce((p ->> 'kind')::public.listing_kind, 'single'),
    coalesce((p ->> 'offer')::public.listing_offer, 'sell'),
    case when p ->> 'offer' in ('trade', 'gift') then null else (p ->> 'price_cents')::int end,
    coalesce((p ->> 'negotiable')::boolean, false),
    (nullif(p ->> 'condition', ''))::public.card_condition,
    nullif(p ->> 'card_language', ''),
    public._listing_text(p, 'grading', 40),
    public._listing_text(p, 'city', 80),
    coalesce((p ->> 'handover_event')::boolean, false),
    coalesce((p ->> 'handover_pickup')::boolean, false),
    coalesce((p ->> 'handover_shipping')::boolean, false),
    coalesce((p ->> 'quantity')::smallint, 1)
  )
  returning id into v_id;

  perform set_config('tracacon.collection', 'off', true);

  for v_photo in select jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) loop
    insert into public.listing_photos (id, listing_id, position) values (v_photo::uuid, v_id, v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bearbeiten: p.status = "collection" legt das Stück in die Sammlung zurück,
-- p.status = "active" markiert ein Sammlungsstück (reserviert und erledigt bleiben).
-- ---------------------------------------------------------------------------
create or replace function public.update_listing(p_id uuid, p jsonb)
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
    price_cents       = case when p ->> 'offer' in ('trade', 'gift') then null else (p ->> 'price_cents')::int end,
    negotiable        = coalesce((p ->> 'negotiable')::boolean, false),
    condition         = (nullif(p ->> 'condition', ''))::public.card_condition,
    card_language     = nullif(p ->> 'card_language', ''),
    grading           = public._listing_text(p, 'grading', 40),
    city              = public._listing_text(p, 'city', 80),
    handover_event    = coalesce((p ->> 'handover_event')::boolean, false),
    handover_pickup   = coalesce((p ->> 'handover_pickup')::boolean, false),
    handover_shipping = coalesce((p ->> 'handover_shipping')::boolean, false),
    quantity          = coalesce((p ->> 'quantity')::smallint, quantity),
    status            = (case
                           when p ->> 'status' = 'collection' then 'collection'
                           when p ->> 'status' = 'active' and status::text = 'collection' then 'active'
                           else status::text
                         end)::public.listing_status
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
-- Detailansicht: zusätzlich Sammlungsstücke, wenn das Profil sichtbar ist
-- ---------------------------------------------------------------------------
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
    'is_owner', coalesce(l.owner_id = auth.uid(), false),
    'can_moderate', public.is_team()
  )
    from public.listings l
    join public.profiles pr on pr.id = l.owner_id
   where l.id = p_id
     and (l.status::text in ('active', 'reserved')
          or l.owner_id = auth.uid()
          or public.is_team()
          or (l.status::text = 'collection' and public.can_view_profile(l.owner_id)));
$$;

-- ---------------------------------------------------------------------------
-- Sammlung eines Profils: alle Stücke in der Sammlung und im Marktplatz
-- (nicht erledigt, nicht entfernt). Prüft die Privatsphäre selbst.
-- ---------------------------------------------------------------------------
create function public.profile_collection(p_nickname text, p_limit int default 300, p_offset int default 0)
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
  card_image text,
  cover_photo_id uuid,
  owner_id uuid,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.tcg, l.kind, l.offer, l.price_cents, l.negotiable, l.status, l.quantity,
         l.card_name, l.card_image,
         (select ph.id from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
         l.owner_id, l.created_at,
         count(*) over ()
    from public.profiles p
    join public.listings l on l.owner_id = p.id
   where lower(p.nickname) = lower(p_nickname)
     and l.status::text in ('collection', 'active', 'reserved')
     and public.can_view_profile(p.id)
   order by l.created_at desc
   limit least(greatest(coalesce(p_limit, 300), 1), 600)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Aus der Sammlung entfernen mit Grund (für Zahlen: wie viel wird getauscht, verkauft …).
-- Gespeichert werden nur Grund, Spiel und Art, keine Kartendaten.
-- ---------------------------------------------------------------------------
create table public.collection_removals (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason     text not null check (reason in ('traded', 'sold', 'gifted', 'other')),
  tcg        public.tcg not null,
  kind       public.listing_kind not null,
  created_at timestamptz not null default now()
);

create index collection_removals_created_idx on public.collection_removals (created_at);

alter table public.collection_removals enable row level security;
create policy "collection_removals_insert_own"
  on public.collection_removals for insert
  to authenticated
  with check (owner_id = auth.uid());
create policy "collection_removals_select_team"
  on public.collection_removals for select
  to authenticated
  using (public.is_team());
revoke all on public.collection_removals from anon, authenticated;
grant insert (reason, tcg, kind) on public.collection_removals to authenticated;
grant select on public.collection_removals to authenticated;

create function public.remove_listing(p_id uuid, p_reason text)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_photos uuid[];
  v_tcg public.tcg;
  v_kind public.listing_kind;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_reason not in ('traded', 'sold', 'gifted', 'other') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select tcg, kind into v_tcg, v_kind from public.listings where id = p_id and owner_id = auth.uid();
  if v_tcg is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(id), '{}') into v_photos from public.listing_photos where listing_id = p_id;
  delete from public.listings where id = p_id and owner_id = auth.uid();
  insert into public.collection_removals (reason, tcg, kind) values (p_reason, v_tcg, v_kind);
  return v_photos;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------------
revoke execute on function public.profile_collection(text, int, int) from public;
grant execute on function public.profile_collection(text, int, int) to anon, authenticated;
revoke execute on function public.remove_listing(uuid, text) from public, anon;
grant execute on function public.remove_listing(uuid, text) to authenticated;
