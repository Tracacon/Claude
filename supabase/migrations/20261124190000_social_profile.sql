-- TRACACON-App: Social-Funktionen
-- Profilbild, Privatsphäre (öffentlich / nur Follower), Folgen mit optionaler Bestätigung,
-- Abzeichen, Fotos im Chat (geschützter Speicher).

-- ---------------------------------------------------------------------------
-- Profile: Profilbild und Privatsphäre
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column avatar_id uuid,
  add column profile_visibility text not null default 'public',
  add column follow_approval boolean not null default false,
  add constraint profiles_visibility_valid check (profile_visibility in ('public', 'followers'));

-- Profile sind nicht mehr direkt lesbar (sonst ließe sich die Privatsphäre umgehen).
-- Fremde Profile gibt es nur über get_profile, das die Sichtbarkeit prüft.
drop policy "profiles_select_own_or_public" on public.profiles;
create policy "profiles_select_own_or_team"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_team());

-- Nachrichten können ein Foto tragen (Details weiter unten)
alter table public.messages add column photo_id uuid;

-- ---------------------------------------------------------------------------
-- Folgen
-- ---------------------------------------------------------------------------
create type public.follow_status as enum ('pending', 'accepted');

create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  status       public.follow_status not null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id, status);

alter table public.follows enable row level security;
create policy "follows_select_involved"
  on public.follows for select
  to authenticated
  using (auth.uid() in (follower_id, following_id));
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;

-- Darf die angemeldete Person (oder ein Besucher) das volle Profil sehen?
create function public.can_view_profile(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           p_owner = auth.uid()
        or exists (select 1 from public.profiles where id = p_owner and profile_visibility = 'public')
        or exists (select 1 from public.follows
                    where follower_id = auth.uid() and following_id = p_owner and status = 'accepted')
        or public.is_team(),
         false);
$$;

-- Abzeichen, die sich aus vorhandenen Daten ergeben. Event-Abzeichen folgen mit dem Check-in.
create function public.profile_badges(p_id uuid)
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
    case when (select count(*) from public.follows f where f.following_id = p.id and f.status = 'accepted') >= 10 then 'popular' end
  ], null)
    from public.profiles p
   where p.id = p_id;
$$;

-- Öffentliche Profilansicht. Nickname, Rolle, Zahlen und Abzeichen sind immer sichtbar,
-- Profilbild, Beschreibung, Ort und Link nur bei Berechtigung.
create function public.get_profile(p_nickname text)
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

-- Inserate auf der Profilseite (nur bei Berechtigung; im Marktplatz bleiben sie öffentlich)
create function public.profile_listings(p_nickname text, p_limit int default 60, p_offset int default 0)
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
  owner_id uuid,
  cover_photo_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.tcg, l.kind, l.offer, l.price_cents, l.negotiable, l.condition, l.city, l.status,
         l.created_at, p.nickname, l.owner_id,
         (select ph.id from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
         count(*) over ()
    from public.profiles p
    join public.listings l on l.owner_id = p.id
   where lower(p.nickname) = lower(p_nickname)
     and l.status in ('active', 'reserved')
     and public.can_view_profile(p.id)
   order by l.created_at desc
   limit least(greatest(coalesce(p_limit, 60), 1), 120)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Follower bzw. gefolgte Personen eines Profils (nur bei Berechtigung, nur bestätigte)
create function public.list_follows(p_nickname text, p_kind text)
returns table (id uuid, nickname text, avatar_id uuid, my_follow text, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select id from public.profiles where lower(nickname) = lower(p_nickname) and nickname is not null
  ),
  people as (
    select case when p_kind = 'followers' then f.follower_id else f.following_id end as pid, f.accepted_at
      from public.follows f, target t
     where f.status = 'accepted'
       and ((p_kind = 'followers' and f.following_id = t.id) or (p_kind = 'following' and f.follower_id = t.id))
       and public.can_view_profile(t.id)
  )
  select pr.id, pr.nickname,
         case when public.can_view_profile(pr.id) then pr.avatar_id end,
         coalesce((select f.status::text from public.follows f where f.follower_id = auth.uid() and f.following_id = pr.id), 'none'),
         pr.id = auth.uid()
    from people pe
    join public.profiles pr on pr.id = pe.pid
   order by pe.accepted_at desc nulls last
   limit 500;
$$;

-- Offene Anfragen an mich
create function public.my_follow_requests()
returns table (id uuid, nickname text, avatar_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.nickname, case when public.can_view_profile(pr.id) then pr.avatar_id end, f.created_at
    from public.follows f
    join public.profiles pr on pr.id = f.follower_id
   where f.following_id = auth.uid() and f.status = 'pending'
   order by f.created_at desc;
$$;

create function public.pending_follow_request_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.follows where following_id = auth.uid() and status = 'pending';
$$;

-- Folgen (mit Anfrage, falls die Person Bestätigung verlangt). Gibt den Status zurück.
create function public.follow_user(p_target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target public.profiles;
  v_status public.follow_status;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_me and nickname is not null) then
    raise exception 'profile_incomplete' using errcode = '42501';
  end if;
  select * into v_target from public.profiles where id = p_target and nickname is not null;
  if v_target.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_target.id = v_me then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if public.is_blocked_between(v_me, v_target.id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if (select count(*) from public.follows where follower_id = v_me and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  v_status := case when v_target.follow_approval then 'pending'::public.follow_status else 'accepted'::public.follow_status end;
  insert into public.follows (follower_id, following_id, status, accepted_at)
  values (v_me, v_target.id, v_status, case when v_status = 'accepted' then now() end)
  on conflict (follower_id, following_id) do nothing;

  return (select status::text from public.follows where follower_id = v_me and following_id = v_target.id);
end;
$$;

-- Entfolgen bzw. Anfrage zurückziehen
create function public.unfollow_user(p_target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows where follower_id = auth.uid() and following_id = p_target;
$$;

-- Anfrage annehmen oder ablehnen
create function public.respond_follow_request(p_follower uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.follows set status = 'accepted', accepted_at = now()
     where follower_id = p_follower and following_id = auth.uid() and status = 'pending';
  else
    delete from public.follows where follower_id = p_follower and following_id = auth.uid() and status = 'pending';
  end if;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Follower entfernen
create function public.remove_follower(p_follower uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows where follower_id = p_follower and following_id = auth.uid();
$$;

-- Privatsphäre einstellen. Wird die Bestätigung abgeschaltet, gelten offene Anfragen als angenommen.
create function public.update_privacy(p_visibility text, p_follow_approval boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.profiles
     set profile_visibility = p_visibility, follow_approval = coalesce(p_follow_approval, false)
   where id = auth.uid();
  if not coalesce(p_follow_approval, false) then
    update public.follows set status = 'accepted', accepted_at = now()
     where following_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Profilbild setzen oder entfernen. Gibt die alte Bild-ID zurück, damit die App die Datei löscht.
create function public.set_avatar(p_avatar_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select avatar_id into v_old from public.profiles where id = auth.uid();
  update public.profiles set avatar_id = p_avatar_id where id = auth.uid();
  return v_old;
end;
$$;

-- Blockieren entfernt auch das gegenseitige Folgen
create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user_id) on conflict do nothing;
  delete from public.follows
   where (follower_id = auth.uid() and following_id = p_user_id)
      or (follower_id = p_user_id and following_id = auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Profilbilder in Inseraten und im Chat (nur bei Berechtigung)
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
     and (l.status in ('active', 'reserved') or l.owner_id = auth.uid() or public.is_team());
$$;

create or replace function public.get_conversation(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'listing_id', c.listing_id,
    'listing_title', c.listing_title,
    'listing_status', l.status,
    'listing_owner_id', l.owner_id,
    'cover_photo_id', (select ph.id from public.listing_photos ph where ph.listing_id = c.listing_id order by ph.position limit 1),
    'listing_price_cents', l.price_cents,
    'listing_offer', l.offer,
    'other_id', o.id,
    'other_nickname', o.nickname,
    'other_avatar_id', case when public.can_view_profile(o.id) then o.avatar_id end,
    'i_am_seller', c.seller_id = auth.uid(),
    'i_blocked', exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = o.id),
    'blocked_me', exists (select 1 from public.blocks b where b.blocker_id = o.id and b.blocked_id = auth.uid())
  )
    from public.conversations c
    join public.profiles o on o.id = case when c.seller_id = auth.uid() then c.buyer_id else c.seller_id end
    left join public.listings l on l.id = c.listing_id
   where c.id = p_conversation_id and auth.uid() in (c.seller_id, c.buyer_id);
$$;

drop function public.list_conversations();
create function public.list_conversations()
returns table (
  id uuid,
  listing_id uuid,
  listing_title text,
  listing_status public.listing_status,
  listing_owner_id uuid,
  cover_photo_id uuid,
  other_id uuid,
  other_nickname text,
  other_avatar_id uuid,
  i_am_seller boolean,
  last_message_at timestamptz,
  last_body text,
  last_has_photo boolean,
  last_from_me boolean,
  unread int,
  blocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.listing_id, c.listing_title, l.status, l.owner_id,
         (select ph.id from public.listing_photos ph where ph.listing_id = c.listing_id order by ph.position limit 1),
         o.id, o.nickname,
         case when public.can_view_profile(o.id) then o.avatar_id end,
         c.seller_id = auth.uid(),
         c.last_message_at,
         lm.body, lm.photo_id is not null, lm.sender_id = auth.uid(),
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > coalesce(case when c.seller_id = auth.uid() then c.seller_last_read_at else c.buyer_last_read_at end,
                                         '-infinity'::timestamptz)),
         public.is_blocked_between(c.seller_id, c.buyer_id)
    from public.conversations c
    join public.profiles o on o.id = case when c.seller_id = auth.uid() then c.buyer_id else c.seller_id end
    left join public.listings l on l.id = c.listing_id
    left join lateral (
      select m.body, m.sender_id, m.photo_id from public.messages m
       where m.conversation_id = c.id order by m.created_at desc limit 1
    ) lm on true
   where auth.uid() in (c.seller_id, c.buyer_id)
     and c.last_message_at is not null
     and (case when c.seller_id = auth.uid() then c.seller_hidden_at else c.buyer_hidden_at end) is null
   order by c.last_message_at desc
   limit 200;
$$;

-- ---------------------------------------------------------------------------
-- Fotos im Chat
-- ---------------------------------------------------------------------------
alter table public.messages drop constraint messages_body_length;
alter table public.messages add constraint messages_content check (
  (photo_id is not null and char_length(body) <= 1000)
  or char_length(btrim(body)) between 1 and 1000
);

-- Geschützter Speicher: nur die Beteiligten (und das Team bei gemeldeten Unterhaltungen) können lesen.
-- Pfad: <unterhaltungs-id>/<foto-id>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Prüft ohne Umweg über andere Zugriffsregeln, ob jemand Fotos einer Unterhaltung lesen darf
create function public.can_access_chat_folder(p_folder text, p_for_upload boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
     where c.id::text = p_folder
       and (auth.uid() in (c.seller_id, c.buyer_id)
            or (not p_for_upload and public.is_team()
                and exists (select 1 from public.reports r where r.conversation_id = c.id)))
  );
$$;
revoke execute on function public.can_access_chat_folder(text, boolean) from public, anon;
grant execute on function public.can_access_chat_folder(text, boolean) to authenticated;

create policy "chat_photos_upload_participant"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and public.can_access_chat_folder((storage.foldername(name))[1], true)
  );

create policy "chat_photos_read_participant_or_team"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-photos'
    and public.can_access_chat_folder((storage.foldername(name))[1], false)
  );

-- Senden mit optionalem Foto (ersetzt die bisherige Funktion)
drop function public.send_message(uuid, text);
create function public.send_message(p_conversation_id uuid, p_body text, p_photo_id uuid default null)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_conv public.conversations;
  v_other uuid;
  v_msg public.messages;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null or v_me not in (v_conv.seller_id, v_conv.buyer_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_other := case when v_me = v_conv.seller_id then v_conv.buyer_id else v_conv.seller_id end;
  if public.is_blocked_between(v_me, v_other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if (select count(*) from public.messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.messages where sender_id = v_me and created_at > now() - interval '1 day') >= 500 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  if p_photo_id is not null and not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'chat-photos'
       and o.name = p_conversation_id::text || '/' || p_photo_id::text || '.jpg'
       and (o.owner = v_me or o.owner_id = v_me::text)
  ) then
    raise exception 'photo_missing' using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, sender_id, body, photo_id)
  values (p_conversation_id, v_me, btrim(left(coalesce(p_body, ''), 1001)), p_photo_id)
  returning * into v_msg;

  update public.conversations
     set last_message_at = v_msg.created_at,
         seller_hidden_at = null,
         buyer_hidden_at = null,
         seller_last_read_at = case when v_me = seller_id then v_msg.created_at else seller_last_read_at end,
         buyer_last_read_at = case when v_me = buyer_id then v_msg.created_at else buyer_last_read_at end
   where id = p_conversation_id;

  return v_msg;
end;
$$;

-- Moderation: Fotos mit ausgeben
create or replace function public.moderation_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.conversation_id = p_conversation_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
           'id', c.id,
           'listing_title', c.listing_title,
           'seller', s.nickname,
           'buyer', b.nickname,
           'messages', coalesce((select jsonb_agg(jsonb_build_object(
                                   'from', p.nickname, 'body', m.body, 'photo_id', m.photo_id, 'created_at', m.created_at)
                                   order by m.created_at)
                                 from public.messages m join public.profiles p on p.id = m.sender_id
                                where m.conversation_id = c.id), '[]'::jsonb))
    into v
    from public.conversations c
    join public.profiles s on s.id = c.seller_id
    join public.profiles b on b.id = c.buyer_id
   where c.id = p_conversation_id;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Speicher für Profilbilder: öffentlich lesbar (zufällige Dateinamen), nur eigener Ordner
-- Pfad: <nutzer-id>/<bild-id>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars_upload_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );

create policy "avatars_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------------
revoke execute on function public.can_view_profile(uuid) from public;
revoke execute on function public.profile_badges(uuid) from public;
revoke execute on function public.get_profile(text) from public;
revoke execute on function public.profile_listings(text, int, int) from public;
revoke execute on function public.list_follows(text, text) from public;
revoke execute on function public.my_follow_requests() from public, anon;
revoke execute on function public.pending_follow_request_count() from public, anon;
revoke execute on function public.follow_user(uuid) from public, anon;
revoke execute on function public.unfollow_user(uuid) from public, anon;
revoke execute on function public.respond_follow_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_follower(uuid) from public, anon;
revoke execute on function public.update_privacy(text, boolean) from public, anon;
revoke execute on function public.set_avatar(uuid) from public, anon;
revoke execute on function public.list_conversations() from public, anon;
revoke execute on function public.send_message(uuid, text, uuid) from public, anon;

-- Öffentliche Profile sind auch ohne Anmeldung sichtbar
grant execute on function public.can_view_profile(uuid) to anon, authenticated;
grant execute on function public.profile_badges(uuid) to anon, authenticated;
grant execute on function public.get_profile(text) to anon, authenticated;
grant execute on function public.profile_listings(text, int, int) to anon, authenticated;
grant execute on function public.list_follows(text, text) to anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to anon;
grant execute on function public.my_follow_requests() to authenticated;
grant execute on function public.pending_follow_request_count() to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;
grant execute on function public.remove_follower(uuid) to authenticated;
grant execute on function public.update_privacy(text, boolean) to authenticated;
grant execute on function public.set_avatar(uuid) to authenticated;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
