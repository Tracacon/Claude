-- Tracacon App: Benachrichtigungen, Online-Status und "Neu dabei"-Balken.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261125200000_verschenken.sql).

-- ---------------------------------------------------------------------------
-- Einstellungen (standardmäßig an, in den Einstellungen abschaltbar)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column show_online boolean not null default true,
  add column show_signup boolean not null default true;

-- ---------------------------------------------------------------------------
-- Benachrichtigungen
-- ---------------------------------------------------------------------------
create type public.notification_kind as enum ('follow', 'follow_request', 'follow_accepted', 'like', 'comment');

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade, -- wer benachrichtigt wird
  actor_id   uuid not null references public.profiles (id) on delete cascade, -- wer etwas getan hat
  kind       public.notification_kind not null,
  post_id    uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.post_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  constraint notifications_not_self check (user_id <> actor_id)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
-- Ein "Gefällt mir" pro Person und Beitrag, auch nach Weg- und Wiederklicken
create unique index notifications_like_once on public.notifications (user_id, actor_id, post_id) where kind = 'like';

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

-- Folgen: neue Follower und Anfragen
create function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, kind)
    values (new.following_id, new.follower_id,
            case when new.status = 'accepted' then 'follow'::public.notification_kind else 'follow_request'::public.notification_kind end);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    -- Anfrage erledigt: Anfrage-Hinweis weg, die Person erfährt, dass sie jetzt folgt
    delete from public.notifications
     where user_id = new.following_id and actor_id = new.follower_id and kind = 'follow_request';
    insert into public.notifications (user_id, actor_id, kind) values (new.follower_id, new.following_id, 'follow_accepted');
  elsif tg_op = 'DELETE' and old.status = 'pending' then
    delete from public.notifications
     where user_id = old.following_id and actor_id = old.follower_id and kind = 'follow_request';
  end if;
  return null;
end;
$$;

create trigger follows_notify
  after insert or update or delete on public.follows
  for each row execute function public.notify_follow();

-- Gefällt mir
create function public.notify_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = coalesce(new.post_id, old.post_id);
  if v_author is null then
    return null;
  end if;
  if tg_op = 'INSERT' and v_author <> new.user_id then
    insert into public.notifications (user_id, actor_id, kind, post_id)
    values (v_author, new.user_id, 'like', new.post_id)
    on conflict do nothing;
  elsif tg_op = 'DELETE' then
    delete from public.notifications
     where user_id = v_author and actor_id = old.user_id and kind = 'like' and post_id = old.post_id and read_at is null;
  end if;
  return null;
end;
$$;

create trigger post_likes_notify
  after insert or delete on public.post_likes
  for each row execute function public.notify_like();

-- Kommentare
create function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is not null and v_author <> new.author_id then
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    values (v_author, new.author_id, 'comment', new.post_id, new.id);
  end if;
  return null;
end;
$$;

create trigger post_comments_notify
  after insert on public.post_comments
  for each row execute function public.notify_comment();

-- Meine Benachrichtigungen (neueste zuerst)
create function public.my_notifications(p_limit int default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.created_at desc), '[]'::jsonb)
    from (
      select n.created_at,
             jsonb_build_object(
               'id', n.id,
               'kind', n.kind,
               'created_at', n.created_at,
               'read', n.read_at is not null,
               'actor', jsonb_build_object(
                 'id', a.id,
                 'nickname', a.nickname,
                 'avatar_id', case when public.can_view_profile(a.id) then a.avatar_id end),
               'post_id', n.post_id,
               'post_author_id', p.author_id,
               'post_cover_id', (select ph.id from public.post_photos ph where ph.post_id = n.post_id order by ph.position limit 1),
               'comment', left(c.body, 120),
               'my_follow', (select f.status::text from public.follows f where f.follower_id = auth.uid() and f.following_id = a.id),
               'request_open', n.kind = 'follow_request'
                 and exists (select 1 from public.follows f where f.follower_id = a.id and f.following_id = auth.uid() and f.status = 'pending')
             ) as item
        from public.notifications n
        join public.profiles a on a.id = n.actor_id and a.nickname is not null
        left join public.posts p on p.id = n.post_id
        left join public.post_comments c on c.id = n.comment_id
       where n.user_id = auth.uid()
         and not public.is_blocked_between(auth.uid(), n.actor_id)
       order by n.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) x;
$$;

create function public.unread_notification_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;

create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Online-Status (nicht über die Profil-Tabelle lesbar, nur über die Funktionen unten)
-- ---------------------------------------------------------------------------
create table public.presence (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.presence enable row level security;
revoke all on public.presence from anon, authenticated;

-- "Ich bin gerade da" (höchstens einmal pro Minute gespeichert)
create function public.touch_presence()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.presence (user_id, last_seen_at)
  select auth.uid(), now()
   where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = now()
   where public.presence.last_seen_at < now() - interval '1 minute';
$$;

-- Wer von meinen Followern und von denen, denen ich folge, ist gerade online (letzte 5 Minuten)?
-- Wer den eigenen Online-Status verbirgt, sieht auch den der anderen nicht (wie bei Instagram).
create function public.online_contacts()
returns table (id uuid, nickname text, avatar_id uuid, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.nickname, case when public.can_view_profile(pr.id) then pr.avatar_id end, ps.last_seen_at
    from public.presence ps
    join public.profiles pr on pr.id = ps.user_id
   where ps.last_seen_at > now() - interval '5 minutes'
     and pr.id <> auth.uid()
     and pr.nickname is not null
     and pr.show_online
     and exists (select 1 from public.profiles me where me.id = auth.uid() and me.show_online)
     and exists (
       select 1 from public.follows f
        where f.status = 'accepted'
          and ((f.follower_id = auth.uid() and f.following_id = pr.id)
            or (f.following_id = auth.uid() and f.follower_id = pr.id)))
     and not public.is_blocked_between(auth.uid(), pr.id)
   order by ps.last_seen_at desc
   limit 50;
$$;

-- ---------------------------------------------------------------------------
-- "Neu dabei": neue Mitglieder der letzten 14 Tage, die das zeigen möchten
-- ---------------------------------------------------------------------------
create function public.new_members(p_limit int default 20)
returns table (id uuid, nickname text, avatar_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.nickname, case when public.can_view_profile(pr.id) then pr.avatar_id end, pr.created_at
    from public.profiles pr
   where pr.nickname is not null
     and pr.show_signup
     and pr.created_at > now() - interval '14 days'
     and (auth.uid() is null or not public.is_blocked_between(auth.uid(), pr.id))
   order by pr.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Einstellungen speichern
create function public.update_presence_settings(p_show_online boolean, p_show_signup boolean)
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
     set show_online = coalesce(p_show_online, true), show_signup = coalesce(p_show_signup, true)
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
revoke execute on function public.notify_follow() from public, anon, authenticated;
revoke execute on function public.notify_like() from public, anon, authenticated;
revoke execute on function public.notify_comment() from public, anon, authenticated;
revoke execute on function public.my_notifications(int) from public, anon;
revoke execute on function public.unread_notification_count() from public, anon;
revoke execute on function public.mark_notifications_read() from public, anon;
revoke execute on function public.touch_presence() from public, anon;
revoke execute on function public.online_contacts() from public, anon;
revoke execute on function public.new_members(int) from public;
revoke execute on function public.update_presence_settings(boolean, boolean) from public, anon;

grant execute on function public.my_notifications(int) to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.touch_presence() to authenticated;
grant execute on function public.online_contacts() to authenticated;
grant execute on function public.new_members(int) to anon, authenticated;
grant execute on function public.update_presence_settings(boolean, boolean) to authenticated;
