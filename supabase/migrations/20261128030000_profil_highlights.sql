-- Tracacon App: Profil wie bei Instagram.
-- Zweiter Link, "Gefolgt von …", Direktnachrichten ohne Inserat, Highlights (Binder als runde Kreise).
-- Einmal im SQL Editor von Supabase ausführen (nach 20261128020000_binder_titelbild.sql).

-- ---------------------------------------------------------------------------
-- 1. Zweiter Link im Profil
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column website2 text
  constraint profiles_website2_format check (website2 is null or (char_length(website2) <= 200 and website2 ~ '^https://'));
grant update (website2) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profilansicht: zweiter Link und "Gefolgt von" (Leute, denen ich folge und die dieser Person folgen)
-- ---------------------------------------------------------------------------
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
    'website2', case when v_can then p.website2 end,
    'instagram', case when v_can then p.instagram end,
    'post_count', (select count(*) from public.posts po where po.author_id = p.id and po.hidden_at is null),
    'listing_count', (select count(*) from public.listings l where l.owner_id = p.id and l.status in ('active', 'reserved')),
    'follower_count', (select count(*) from public.follows f where f.following_id = p.id and f.status = 'accepted'),
    'following_count', (select count(*) from public.follows f where f.follower_id = p.id and f.status = 'accepted'),
    'my_follow', coalesce((select f.status::text from public.follows f where f.follower_id = v_me and f.following_id = p.id), 'none'),
    'follows_me', exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = v_me and f.status = 'accepted'),
    'blocked', v_me is not null and public.is_blocked_between(v_me, p.id),
    'badges', to_jsonb(public.profile_badges(p.id)),
    'followed_by', case when v_me is null or v_me = p.id then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('nickname', x.nickname, 'id', x.id,
                                          'avatar_id', case when public.can_view_profile(x.id) then x.avatar_id end))
        from (select o.id, o.nickname, o.avatar_id
                from public.follows mine
                join public.follows theirs on theirs.follower_id = mine.following_id
                                          and theirs.following_id = p.id and theirs.status = 'accepted'
                join public.profiles o on o.id = mine.following_id
               where mine.follower_id = v_me and mine.status = 'accepted'
               order by theirs.accepted_at desc nulls last
               limit 3) x), '[]'::jsonb) end,
    'followed_by_count', case when v_me is null or v_me = p.id then 0 else (
      select count(*) from public.follows mine
        join public.follows theirs on theirs.follower_id = mine.following_id
                                  and theirs.following_id = p.id and theirs.status = 'accepted'
       where mine.follower_id = v_me and mine.status = 'accepted') end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Direktnachrichten: Unterhaltung ohne Inserat (listing_title leer)
-- ---------------------------------------------------------------------------
alter table public.conversations add column direct boolean not null default false;
create unique index conversations_direct_pair
  on public.conversations (least(seller_id, buyer_id), greatest(seller_id, buyer_id)) where direct;

create function public.start_direct_conversation(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_me and nickname is not null) then
    raise exception 'profile_incomplete' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'cannot_message_self' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and nickname is not null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(v_me, p_user) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  select id into v_id from public.conversations
   where direct and least(seller_id, buyer_id) = least(v_me, p_user) and greatest(seller_id, buyer_id) = greatest(v_me, p_user);
  if v_id is not null then
    update public.conversations
       set seller_hidden_at = case when seller_id = v_me then null else seller_hidden_at end,
           buyer_hidden_at  = case when buyer_id = v_me then null else buyer_hidden_at end
     where id = v_id;
    return v_id;
  end if;

  if (select count(*) from public.conversations
       where buyer_id = v_me and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.conversations (listing_id, listing_title, seller_id, buyer_id, direct)
  values (null, '', p_user, v_me, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Highlights: Binder als runde Kreise oben im Profil (wie Instagram-Highlights)
-- ---------------------------------------------------------------------------
create table public.profile_highlights (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  binder_id  uuid not null references public.binders (id) on delete cascade,
  title      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  constraint profile_highlights_title_length check (char_length(btrim(title)) between 1 and 20),
  constraint profile_highlights_one_per_binder unique (binder_id)
);
create index profile_highlights_owner_idx on public.profile_highlights (owner_id, position);

alter table public.profile_highlights enable row level security;
create policy "profile_highlights_own" on public.profile_highlights
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.profile_highlights from anon, authenticated;
grant select, delete on public.profile_highlights to authenticated;

-- Highlight anlegen bzw. Titel ändern (nur eigene Binder, höchstens 20)
create function public.save_highlight(p_binder uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_title text := btrim(left(coalesce(p_title, ''), 21));
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.binders where id = p_binder and owner_id = v_me) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_title = '' then
    select left(name, 20) into v_title from public.binders where id = p_binder;
  end if;
  select id into v_id from public.profile_highlights where binder_id = p_binder;
  if v_id is not null then
    update public.profile_highlights set title = v_title where id = v_id;
    return v_id;
  end if;
  if (select count(*) from public.profile_highlights where owner_id = v_me) >= 20 then
    raise exception 'too_many_highlights' using errcode = '54000';
  end if;
  insert into public.profile_highlights (owner_id, binder_id, title, position)
  values (v_me, p_binder, v_title,
          coalesce((select max(position) + 1 from public.profile_highlights where owner_id = v_me), 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- Highlights eines Profils (nur Binder, die man sehen darf), mit Bild für den Kreis:
-- eigenes Titelbild des Binders, sonst Vorderseite der ersten Karte
create function public.profile_highlights(p_nickname text)
returns table (id uuid, binder_id uuid, title text, color text, cover_image uuid, card_photo uuid, owner_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, b.id, h.title, b.color, b.cover_image,
         (select ph.id from public.listings l
            join public.listing_photos ph on ph.listing_id = l.id and ph.position = 0
           where l.binder_id = b.id and l.status::text in ('collection', 'active', 'reserved')
           order by l.pocket limit 1),
         b.owner_id
    from public.profiles p
    join public.profile_highlights h on h.owner_id = p.id
    join public.binders b on b.id = h.binder_id
   where lower(p.nickname) = lower(p_nickname)
     and public.can_view_profile(p.id)
     and public.binder_visible(b.id)
   order by h.position, h.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------------
revoke execute on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
revoke execute on function public.save_highlight(uuid, text) from public, anon;
grant execute on function public.save_highlight(uuid, text) to authenticated;
revoke execute on function public.profile_highlights(text) from public;
grant execute on function public.profile_highlights(text) to anon, authenticated;
