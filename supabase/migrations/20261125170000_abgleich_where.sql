-- Korrektur: Supabase erlaubt UPDATE nur mit WHERE (Schutz "safeupdate").
-- Betrifft den Abgleich von Terminen (Odoo) und Instagram. Einmal im SQL Editor ausführen.

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

  update public.event_sync set synced_at = now(), error = null where id;
  return v_count;
end;
$$;

create or replace function public.sync_events_failed(p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.event_sync set synced_at = now(), error = left(p_error, 500) where id;
$$;

create or replace function public.import_instagram_post(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_photos uuid[] := array(select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'photos', '[]'::jsonb)) x);
  v_at timestamptz := least(coalesce((p ->> 'created_at')::timestamptz, now()), now());
  g int;
begin
  if coalesce(array_length(v_photos, 1), 0) not between 1 and 10 then
    raise exception 'photo_required' using errcode = '22023';
  end if;
  select id into v_id from public.posts where source = 'instagram' and external_id = p ->> 'external_id';
  if v_id is not null then
    return v_id;
  end if;
  insert into public.posts (author_id, caption, created_at, updated_at, highlighted_at, source, external_id, external_url, is_video)
  values ((p ->> 'author_id')::uuid, left(coalesce(p ->> 'caption', ''), 2200), v_at, v_at, v_at, 'instagram',
          p ->> 'external_id',
          case when p ->> 'external_url' ~* '^https://' then left(p ->> 'external_url', 500) end,
          coalesce((p ->> 'is_video')::boolean, false))
  returning id into v_id;
  for g in 1 .. array_length(v_photos, 1) loop
    insert into public.post_photos (id, post_id, position) values (v_photos[g], v_id, g - 1);
  end loop;
  update public.instagram_sync set imported_count = imported_count + 1 where id;
  return v_id;
end;
$$;

create or replace function public.instagram_sync_done(p_error text, p_token text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.instagram_sync
     set synced_at = now(),
         error = left(p_error, 500),
         token = coalesce(p_token, token),
         token_refreshed_at = case when p_token is not null then now() else token_refreshed_at end
   where id;
$$;
