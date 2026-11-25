-- Instagram-Beiträge von TRACACON automatisch im Feed.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261125130000_feed_beitraege.sql).

-- Herkunft eines Beitrags
alter table public.posts add column source text not null default 'app' check (source in ('app', 'instagram'));
alter table public.posts add column external_id text;
alter table public.posts add column external_url text check (external_url is null or external_url ~* '^https://');
alter table public.posts add column is_video boolean not null default false;
create unique index posts_external_idx on public.posts (source, external_id) where external_id is not null;

-- Stand des Abgleichs und der verlängerte Zugangsschlüssel (nur für den Server lesbar)
create table public.instagram_sync (
  id                 boolean primary key default true check (id),
  token              text,
  token_refreshed_at timestamptz,
  synced_at          timestamptz,
  error              text,
  imported_count     int not null default 0
);
insert into public.instagram_sync (id) values (true);
alter table public.instagram_sync enable row level security;

-- Feed-Eintrag mit Herkunft
create or replace function public.post_item(p_post uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'post',
    'id', p.id,
    'created_at', p.created_at,
    'sort_at', greatest(p.created_at, coalesce(p.highlighted_at, p.created_at)),
    'caption', p.caption,
    'highlighted', p.highlighted_at is not null and p.source = 'app',
    'hidden', p.hidden_at is not null,
    'source', p.source,
    'external_url', p.external_url,
    'is_video', p.is_video,
    'author', jsonb_build_object('id', a.id, 'nickname', a.nickname, 'avatar_id', a.avatar_id, 'role', a.role),
    'photos', coalesce((select jsonb_agg(ph.id order by ph.position) from public.post_photos ph where ph.post_id = p.id), '[]'::jsonb),
    'like_count', (select count(*) from public.post_likes l where l.post_id = p.id),
    'comment_count', (select count(*) from public.post_comments c where c.post_id = p.id),
    'liked', exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'is_mine', p.author_id = auth.uid()
  )
    from public.posts p
    join public.profiles a on a.id = p.author_id
   where p.id = p_post;
$$;

-- Für den Server: welches Profil postet, welche Instagram-Beiträge sind schon da
create function public.instagram_state(p_author_nickname text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'token', s.token,
    'token_refreshed_at', s.token_refreshed_at,
    'synced_at', s.synced_at,
    'author_id', coalesce(
      (select id from public.profiles where lower(nickname) = lower(nullif(btrim(p_author_nickname), '')) and nickname is not null),
      (select id from public.profiles where role = 'admin' and nickname is not null order by created_at limit 1)),
    'known', coalesce((select jsonb_agg(external_id) from public.posts where source = 'instagram'), '[]'::jsonb)
  )
    from public.instagram_sync s;
$$;

-- Für den Server: Instagram-Beitrag übernehmen (Fotos liegen schon im Speicher).
-- p = { author_id, external_id, external_url, caption, created_at, is_video, photos: [uuid, ...] }
create function public.import_instagram_post(p jsonb)
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
  update public.instagram_sync set imported_count = imported_count + 1;
  return v_id;
end;
$$;

-- Für den Server: Ergebnis des Abgleichs und verlängerten Schlüssel speichern
create function public.instagram_sync_done(p_error text, p_token text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.instagram_sync
     set synced_at = now(),
         error = left(p_error, 500),
         token = coalesce(p_token, token),
         token_refreshed_at = case when p_token is not null then now() else token_refreshed_at end;
$$;

-- Für das Team: Stand des Abgleichs (ohne Schlüssel)
create function public.instagram_sync_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select jsonb_build_object('synced_at', synced_at, 'error', error, 'imported_count', imported_count,
                                    'token_refreshed_at', token_refreshed_at)
            from public.instagram_sync);
end;
$$;

revoke execute on function public.instagram_state(text) from public, anon, authenticated;
revoke execute on function public.import_instagram_post(jsonb) from public, anon, authenticated;
revoke execute on function public.instagram_sync_done(text, text) from public, anon, authenticated;
revoke execute on function public.instagram_sync_status() from public, anon;
grant execute on function public.instagram_state(text) to service_role;
grant execute on function public.import_instagram_post(jsonb) to service_role;
grant execute on function public.instagram_sync_done(text, text) to service_role;
grant execute on function public.instagram_sync_status() to authenticated;
