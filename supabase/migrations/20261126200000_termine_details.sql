-- Eventseite wie auf tracacon.de: Titelbild, Beschreibung, Händler mit Logo und Händlertisch-Status.
-- Die Angaben kommen beim Abgleich aus Odoo und liegen gesammelt im Feld "details".
-- Einmal im SQL Editor ausführen.

alter table public.events
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.events
  drop constraint if exists events_details_check;
alter table public.events
  add constraint events_details_check check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 300000);

create or replace function public.sync_events(p jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_ids int[] := '{}';
  v_count int := 0;
  v_details jsonb;
begin
  for e in select * from jsonb_array_elements(coalesce(p -> 'events', '[]'::jsonb)) loop
    v_ids := v_ids || (e ->> 'odoo_id')::int;
    -- Fehlen die Zusatzangaben (z. B. vergangene Termine oder Odoo-Fehler), bleiben die gespeicherten erhalten
    v_details := case
      when jsonb_typeof(e -> 'details') = 'object' and octet_length((e -> 'details')::text) <= 300000 then e -> 'details'
    end;
    insert into public.events as ev (odoo_id, name, subtitle, starts_at, ends_at, timezone, venue, address, city,
                                     ticket_url, website_url, published, details, synced_at)
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
      coalesce(v_details, '{}'::jsonb),
      now()
    )
    on conflict (odoo_id) do update set
      name = excluded.name, subtitle = excluded.subtitle, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      timezone = excluded.timezone, venue = excluded.venue, address = excluded.address, city = excluded.city,
      ticket_url = excluded.ticket_url, website_url = excluded.website_url, published = excluded.published,
      details = case when v_details is not null then excluded.details else ev.details end,
      synced_at = now();
    v_count := v_count + 1;
  end loop;

  update public.events
     set published = false, synced_at = now()
   where published
     and ends_at >= coalesce((p ->> 'since')::timestamptz, now())
     and not (odoo_id = any (v_ids));

  update public.event_sync set synced_at = now(), error = null where id;
  return v_count;
end;
$$;

-- Terminliste zusätzlich mit Titelbild, Anzahl Händler und Händlertisch-Status
drop function if exists public.list_events(boolean, int);
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
  checked_in boolean,
  cover_url text,
  dealer_count int,
  tables jsonb
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
         exists (select 1 from public.checkins c where c.event_id = e.id and c.user_id = auth.uid()),
         case when e.details ->> 'cover_url' ~* '^https://' then e.details ->> 'cover_url' end,
         case when jsonb_typeof(e.details -> 'dealers') = 'array' then jsonb_array_length(e.details -> 'dealers') else 0 end,
         case when jsonb_typeof(e.details -> 'tables') = 'object' then e.details -> 'tables' end
    from public.events e
   where e.published
     and case when p_past then e.ends_at < now() else e.ends_at >= now() end
   order by case when p_past then null else e.starts_at end asc,
            case when p_past then e.starts_at end desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke execute on function public.list_events(boolean, int) from public;
grant execute on function public.list_events(boolean, int) to anon, authenticated;
