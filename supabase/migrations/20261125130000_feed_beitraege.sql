-- Feed wie bei Instagram: Beiträge mit Fotos, Gefällt mir, Kommentare, Hervorheben durch das Team.
-- Einmal im SQL Editor von Supabase ausführen (nach allen bisherigen Migrationen).

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles (id) on delete cascade,
  caption        text not null default '' check (char_length(caption) <= 2200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  highlighted_at timestamptz,
  highlighted_by uuid references public.profiles (id) on delete set null,
  hidden_at      timestamptz,
  hidden_reason  text check (hidden_reason is null or char_length(hidden_reason) <= 1000)
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc) where hidden_at is null;
create index posts_highlight_idx on public.posts (highlighted_at desc) where highlighted_at is not null;

-- Foto-ID = Dateiname im Speicher post-photos/<autor>/<id>.jpg (+ _t.jpg als Vorschau)
create table public.post_photos (
  id       uuid primary key,
  post_id  uuid not null references public.posts (id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  unique (post_id, position)
);

create table public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id);

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index post_comments_author_idx on public.post_comments (author_id, created_at);

-- Zugriff nur über die Funktionen unten
alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- Meldungen auch für Beiträge und Kommentare
alter table public.reports add column post_id uuid references public.posts (id) on delete cascade;
alter table public.reports add column comment_id uuid references public.post_comments (id) on delete cascade;
alter table public.reports drop constraint reports_one_target;
alter table public.reports add constraint reports_one_target check (
  (listing_id is not null)::int + (profile_id is not null)::int + (conversation_id is not null)::int
  + (post_id is not null)::int + (comment_id is not null)::int = 1
);
create unique index reports_one_open_post on public.reports (reporter_id, post_id)
  where status = 'open' and post_id is not null;
create unique index reports_one_open_comment on public.reports (reporter_id, comment_id)
  where status = 'open' and comment_id is not null;

-- ---------------------------------------------------------------------------
-- Sichtbarkeit: wie das Profil (öffentlich oder nur Follower), nicht ausgeblendet, nicht blockiert
-- ---------------------------------------------------------------------------
create function public.can_view_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (p.hidden_at is null or p.author_id = auth.uid() or public.is_team())
       and public.can_view_profile(p.author_id)
       and (auth.uid() is null or public.is_team() or not public.is_blocked_between(auth.uid(), p.author_id))
      from public.posts p
     where p.id = p_post), false);
$$;

-- Ein Beitrag als Feed-Eintrag
create function public.post_item(p_post uuid)
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
    'highlighted', p.highlighted_at is not null,
    'hidden', p.hidden_at is not null,
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

-- Ein Inserat als Feed-Eintrag
create function public.listing_item(p_listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'listing',
    'id', l.id,
    'created_at', l.created_at,
    'sort_at', l.created_at,
    'title', l.title,
    'tcg', l.tcg,
    'kind', l.kind,
    'offer', l.offer,
    'price_cents', l.price_cents,
    'negotiable', l.negotiable,
    'city', l.city,
    'author', jsonb_build_object('id', a.id, 'nickname', a.nickname, 'avatar_id',
                                 case when public.can_view_profile(a.id) then a.avatar_id end, 'role', a.role),
    'photos', coalesce((select jsonb_agg(ph.id order by ph.position) from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb),
    'is_mine', l.owner_id = auth.uid()
  )
    from public.listings l
    join public.profiles a on a.id = l.owner_id
   where l.id = p_listing;
$$;

-- ---------------------------------------------------------------------------
-- Feed: Beiträge von Leuten, denen man folgt, eigene, vom Team hervorgehobene,
-- dazu neue Inserate von Leuten, denen man folgt.
-- Wer noch niemandem folgt (oder nicht angemeldet ist), sieht öffentliche Beiträge und neue Inserate.
-- Weiterblättern mit p_before = sort_at des letzten Eintrags.
-- ---------------------------------------------------------------------------
create function public.feed(p_before timestamptz default null, p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_before timestamptz := coalesce(p_before, 'infinity'::timestamptz);
  v_follows boolean;
begin
  v_follows := v_me is not null and exists (
    select 1 from public.follows f where f.follower_id = v_me and f.status = 'accepted');

  return coalesce((
    select jsonb_agg(item order by sort_at desc)
      from (
        select x.item, x.sort_at
          from (
            select public.post_item(p.id) as item,
                   greatest(p.created_at, coalesce(p.highlighted_at, p.created_at)) as sort_at
              from public.posts p
              join public.profiles a on a.id = p.author_id
             where p.hidden_at is null
               and (v_me is null or not public.is_blocked_between(v_me, p.author_id))
               and (
                     p.author_id = v_me
                  or p.highlighted_at is not null
                  or exists (select 1 from public.follows f
                              where f.follower_id = v_me and f.following_id = p.author_id and f.status = 'accepted')
                  or (not v_follows and a.profile_visibility = 'public')
               )
               and public.can_view_profile(p.author_id)
            union all
            select public.listing_item(l.id), l.created_at
              from public.listings l
              join public.profiles o on o.id = l.owner_id
             where l.status = 'active'
               and o.nickname is not null
               and l.owner_id is distinct from v_me
               and (v_me is null or not public.is_blocked_between(v_me, l.owner_id))
               and (
                     not v_follows
                  or exists (select 1 from public.follows f
                              where f.follower_id = v_me and f.following_id = l.owner_id and f.status = 'accepted')
               )
          ) x
         where x.sort_at < v_before
         order by x.sort_at desc
         limit v_limit
      ) page
  ), '[]'::jsonb);
end;
$$;

-- Einzelner Beitrag
create function public.get_post(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.can_view_post(p_id) then public.post_item(p_id) end;
$$;

-- Beiträge-Raster im Profil
create function public.profile_posts(p_nickname text, p_limit int default 60, p_offset int default 0)
returns table (id uuid, author_id uuid, cover_photo_id uuid, photo_count bigint, like_count bigint, comment_count bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.author_id,
         (select ph.id from public.post_photos ph where ph.post_id = p.id order by ph.position limit 1),
         (select count(*) from public.post_photos ph where ph.post_id = p.id),
         (select count(*) from public.post_likes l where l.post_id = p.id),
         (select count(*) from public.post_comments c where c.post_id = p.id),
         p.created_at
    from public.profiles pr
    join public.posts p on p.author_id = pr.id
   where lower(pr.nickname) = lower(p_nickname)
     and public.can_view_profile(pr.id)
     and (p.hidden_at is null or p.author_id = auth.uid() or public.is_team())
     and (auth.uid() is null or public.is_team() or not public.is_blocked_between(auth.uid(), pr.id))
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 60), 1), 120)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Entdecken (Suche ohne Eingabe): öffentliche und hervorgehobene Beiträge
create function public.explore_posts(p_limit int default 30, p_offset int default 0)
returns table (id uuid, author_id uuid, cover_photo_id uuid, photo_count bigint, like_count bigint, comment_count bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.author_id,
         (select ph.id from public.post_photos ph where ph.post_id = p.id order by ph.position limit 1),
         (select count(*) from public.post_photos ph where ph.post_id = p.id),
         (select count(*) from public.post_likes l where l.post_id = p.id),
         (select count(*) from public.post_comments c where c.post_id = p.id),
         p.created_at
    from public.posts p
    join public.profiles a on a.id = p.author_id
   where p.hidden_at is null
     and (a.profile_visibility = 'public' or p.highlighted_at is not null)
     and public.can_view_profile(p.author_id)
     and (auth.uid() is null or not public.is_blocked_between(auth.uid(), p.author_id))
   order by (p.highlighted_at is not null) desc, p.created_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Personen suchen (Nickname)
create function public.search_profiles(p_query text, p_limit int default 20)
returns table (id uuid, nickname text, avatar_id uuid, role public.app_role, follower_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.nickname, case when public.can_view_profile(pr.id) then pr.avatar_id end, pr.role,
         (select count(*) from public.follows f where f.following_id = pr.id and f.status = 'accepted')
    from public.profiles pr
   where pr.nickname is not null
     and char_length(btrim(coalesce(p_query, ''))) >= 1
     and pr.nickname ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     and (auth.uid() is null or not public.is_blocked_between(auth.uid(), pr.id))
   order by (lower(pr.nickname) = lower(btrim(p_query))) desc,
            (lower(pr.nickname) like lower(btrim(p_query)) || '%') desc,
            pr.nickname
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Beiträge anlegen, bearbeiten, löschen
-- ---------------------------------------------------------------------------
create function public.create_post(p_caption text, p_photos uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_n int := coalesce(array_length(p_photos, 1), 0);
  i int;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_me and nickname is not null) then
    raise exception 'onboarding_required' using errcode = '42501';
  end if;
  if v_n < 1 then
    raise exception 'photo_required' using errcode = '22023';
  end if;
  if v_n > 10 or (select count(distinct x) from unnest(p_photos) x) <> v_n then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;
  if char_length(coalesce(p_caption, '')) > 2200 then
    raise exception 'caption_too_long' using errcode = '22023';
  end if;
  if (select count(*) from public.posts where author_id = v_me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  for i in 1 .. v_n loop
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'post-photos'
         and o.name = v_me::text || '/' || p_photos[i]::text || '.jpg'
         and (o.owner = v_me or o.owner_id = v_me::text)
    ) or exists (select 1 from public.post_photos where id = p_photos[i]) then
      raise exception 'photo_missing' using errcode = '22023';
    end if;
  end loop;

  insert into public.posts (author_id, caption) values (v_me, btrim(coalesce(p_caption, ''))) returning id into v_id;
  insert into public.post_photos (id, post_id, position)
  select p_photos[g], v_id, g - 1 from generate_series(1, v_n) g;
  return v_id;
end;
$$;

create function public.update_post(p_id uuid, p_caption text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(p_caption, '')) > 2200 then
    raise exception 'caption_too_long' using errcode = '22023';
  end if;
  update public.posts set caption = btrim(coalesce(p_caption, '')), updated_at = now()
   where id = p_id and author_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Löscht den eigenen Beitrag und gibt die Foto-IDs zurück (die App entfernt dann die Dateien)
create function public.delete_post(p_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photos uuid[];
begin
  select array_agg(ph.id) into v_photos
    from public.post_photos ph join public.posts p on p.id = ph.post_id
   where p.id = p_id and p.author_id = auth.uid();
  delete from public.posts where id = p_id and author_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return coalesce(v_photos, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Gefällt mir und Kommentare
-- ---------------------------------------------------------------------------
create function public.toggle_like(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_liked boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.can_view_post(p_post) or exists (select 1 from public.posts where id = p_post and hidden_at is not null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  delete from public.post_likes where post_id = p_post and user_id = v_me;
  v_liked := not found;
  if v_liked then
    insert into public.post_likes (post_id, user_id) values (p_post, v_me);
  end if;
  return jsonb_build_object('liked', v_liked,
                            'like_count', (select count(*) from public.post_likes where post_id = p_post));
end;
$$;

create function public.post_comments(p_post uuid, p_limit int default 100)
returns table (id uuid, body text, created_at timestamptz, author_id uuid, author_nickname text, author_avatar_id uuid, can_delete boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.body, c.created_at, a.id, a.nickname,
         case when public.can_view_profile(a.id) then a.avatar_id end,
         c.author_id = auth.uid() or p.author_id = auth.uid() or public.is_team()
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    join public.profiles a on a.id = c.author_id
   where c.post_id = p_post
     and public.can_view_post(p_post)
     and (auth.uid() is null or not public.is_blocked_between(auth.uid(), c.author_id))
   order by c.created_at
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;

create function public.add_comment(p_post uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_me and nickname is not null) then
    raise exception 'onboarding_required' using errcode = '42501';
  end if;
  select author_id into v_author from public.posts where id = p_post and hidden_at is null;
  if v_author is null or not public.can_view_post(p_post) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(v_me, v_author) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception 'comment_invalid' using errcode = '22023';
  end if;
  if (select count(*) from public.post_comments where author_id = v_me and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.post_comments (post_id, author_id, body) values (p_post, v_me, btrim(p_body)) returning id into v_id;
  return v_id;
end;
$$;

-- Löschen dürfen: wer kommentiert hat, wem der Beitrag gehört, und das Team
create function public.delete_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_comments c
   using public.posts p
   where c.id = p_id and p.id = c.post_id
     and (c.author_id = auth.uid() or p.author_id = auth.uid() or public.is_team());
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Melden und Moderation
-- ---------------------------------------------------------------------------
create function public.report_post(p_post uuid, p_reason public.report_reason, p_details text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.can_view_post(p_post) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.reports (reporter_id, post_id, reason, details)
  values (auth.uid(), p_post, p_reason, nullif(btrim(left(p_details, 1000)), ''));
exception
  when unique_violation then
    raise exception 'already_reported' using errcode = '23505';
end;
$$;

create function public.report_comment(p_comment uuid, p_reason public.report_reason, p_details text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select post_id into v_post from public.post_comments where id = p_comment;
  if v_post is null or not public.can_view_post(v_post) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.reports (reporter_id, comment_id, reason, details)
  values (auth.uid(), p_comment, p_reason, nullif(btrim(left(p_details, 1000)), ''));
exception
  when unique_violation then
    raise exception 'already_reported' using errcode = '23505';
end;
$$;

-- Team: Beitrag hervorheben (erscheint bei allen im Feed) oder zurücknehmen
create function public.set_post_highlight(p_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.posts
     set highlighted_at = case when p_on then now() end,
         highlighted_by = case when p_on then auth.uid() end
   where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Team: Beitrag ausblenden oder wieder einblenden; schließt offene Meldungen dazu
create function public.moderate_post(p_id uuid, p_hide boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_hide and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.posts
     set hidden_at = case when p_hide then now() end,
         hidden_reason = case when p_hide then left(btrim(p_reason), 1000) end,
         highlighted_at = case when p_hide then null else highlighted_at end
   where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_hide then
    update public.reports
       set status = 'resolved', resolution = left(btrim(p_reason), 1000), handled_by = auth.uid(), handled_at = now()
     where post_id = p_id and status = 'open';
  end if;
end;
$$;

-- Team: gemeldeten Kommentar entfernen
create function public.moderate_comment(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  -- Meldungen bleiben als Nachweis mit Text erhalten, der Kommentar wird gelöscht
  update public.reports
     set status = 'resolved',
         resolution = left(btrim(p_reason), 1000),
         details = coalesce(details || E'\n', '') || 'Kommentar: ' || left((select body from public.post_comments where id = p_id), 500),
         handled_by = auth.uid(), handled_at = now(),
         comment_id = null,
         post_id = (select post_id from public.post_comments where id = p_id)
   where comment_id = p_id and status = 'open';
  delete from public.post_comments where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Moderationsliste um Beiträge und Kommentare erweitern
drop function public.list_open_reports(int, int);
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
  conversation_id uuid,
  conversation_title text,
  post_id uuid,
  post_caption text,
  post_author_nickname text,
  post_hidden boolean,
  comment_id uuid,
  comment_body text,
  comment_author_nickname text,
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
           cv.id, cv.listing_title,
           po.id, po.caption, pa.nickname, po.hidden_at is not null,
           cm.id, cm.body, ca.nickname,
           count(*) over ()
      from public.reports r
      left join public.profiles rp on rp.id = r.reporter_id
      left join public.listings l on l.id = r.listing_id
      left join public.profiles lo on lo.id = l.owner_id
      left join public.profiles pp on pp.id = r.profile_id
      left join public.conversations cv on cv.id = r.conversation_id
      left join public.posts po on po.id = r.post_id
      left join public.profiles pa on pa.id = po.author_id
      left join public.post_comments cm on cm.id = r.comment_id
      left join public.profiles ca on ca.id = cm.author_id
     where r.status = 'open'
     order by r.created_at asc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Profil zeigt die Zahl der Beiträge
create or replace function public.get_profile(p_nickname text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  v_can boolean;
  v_me uuid := auth.uid();
begin
  select * into p from public.profiles where lower(nickname) = lower(p_nickname) and nickname is not null;
  if p.id is null then
    return null;
  end if;
  v_can := public.can_view_profile(p.id);
  return jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'role', p.role,
    'member_since', p.created_at,
    'is_me', p.id = v_me,
    'can_view', v_can,
    'visibility', p.profile_visibility,
    'avatar_id', case when v_can then p.avatar_id end,
    'bio', case when v_can then p.bio end,
    'city', case when v_can then p.city end,
    'website', case when v_can then p.website end,
    'post_count', (select count(*) from public.posts po where po.author_id = p.id and po.hidden_at is null),
    'listing_count', (select count(*) from public.listings l where l.owner_id = p.id and l.status in ('active', 'reserved')),
    'follower_count', (select count(*) from public.follows f where f.following_id = p.id and f.status = 'accepted'),
    'following_count', (select count(*) from public.follows f where f.follower_id = p.id and f.status = 'accepted'),
    'my_follow', coalesce((select f.status::text from public.follows f where f.follower_id = v_me and f.following_id = p.id), 'none'),
    'follows_me', exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = v_me and f.status = 'accepted'),
    'blocked', v_me is not null and public.is_blocked_between(v_me, p.id),
    'badges', to_jsonb(public.profile_badges(p.id))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Speicher für Beitragsfotos: öffentlich lesbar, Hochladen nur in den eigenen Ordner
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-photos', 'post-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "post_photos_upload_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.jpg$'
  );

create policy "post_photos_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
revoke execute on function public.can_view_post(uuid) from public;
revoke execute on function public.post_item(uuid) from public, anon, authenticated;
revoke execute on function public.listing_item(uuid) from public, anon, authenticated;
revoke execute on function public.feed(timestamptz, int) from public;
revoke execute on function public.get_post(uuid) from public;
revoke execute on function public.profile_posts(text, int, int) from public;
revoke execute on function public.explore_posts(int, int) from public;
revoke execute on function public.search_profiles(text, int) from public;
revoke execute on function public.create_post(text, uuid[]) from public, anon;
revoke execute on function public.update_post(uuid, text) from public, anon;
revoke execute on function public.delete_post(uuid) from public, anon;
revoke execute on function public.toggle_like(uuid) from public, anon;
revoke execute on function public.post_comments(uuid, int) from public;
revoke execute on function public.add_comment(uuid, text) from public, anon;
revoke execute on function public.delete_comment(uuid) from public, anon;
revoke execute on function public.report_post(uuid, public.report_reason, text) from public, anon;
revoke execute on function public.report_comment(uuid, public.report_reason, text) from public, anon;
revoke execute on function public.set_post_highlight(uuid, boolean) from public, anon;
revoke execute on function public.moderate_post(uuid, boolean, text) from public, anon;
revoke execute on function public.moderate_comment(uuid, text) from public, anon;
revoke execute on function public.list_open_reports(int, int) from public, anon;

grant execute on function public.can_view_post(uuid) to anon, authenticated;
grant execute on function public.feed(timestamptz, int) to anon, authenticated;
grant execute on function public.get_post(uuid) to anon, authenticated;
grant execute on function public.profile_posts(text, int, int) to anon, authenticated;
grant execute on function public.explore_posts(int, int) to anon, authenticated;
grant execute on function public.search_profiles(text, int) to anon, authenticated;
grant execute on function public.create_post(text, uuid[]) to authenticated;
grant execute on function public.update_post(uuid, text) to authenticated;
grant execute on function public.delete_post(uuid) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;
grant execute on function public.post_comments(uuid, int) to anon, authenticated;
grant execute on function public.add_comment(uuid, text) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.report_post(uuid, public.report_reason, text) to authenticated;
grant execute on function public.report_comment(uuid, public.report_reason, text) to authenticated;
grant execute on function public.set_post_highlight(uuid, boolean) to authenticated;
grant execute on function public.moderate_post(uuid, boolean, text) to authenticated;
grant execute on function public.moderate_comment(uuid, text) to authenticated;
grant execute on function public.list_open_reports(int, int) to authenticated;
grant execute on function public.get_profile(text) to anon, authenticated;
