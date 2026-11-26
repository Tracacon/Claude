-- Tauschinteresse: Mitglieder markieren ein Inserat mit „Tauschinteresse“.
-- Die Person, der das Inserat gehört, sieht, wer Interesse hat, und direkt deren Tauschkarten.

create table public.listing_interests (
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);
create index listing_interests_user_idx on public.listing_interests (user_id, created_at desc);

alter table public.listing_interests enable row level security;
-- Nur über die Funktionen unten lesbar und änderbar
revoke all on public.listing_interests from anon, authenticated;

-- Benachrichtigung „X hat Tauschinteresse an deinem Inserat“
alter type public.notification_kind add value if not exists 'trade_interest';
alter table public.notifications add column listing_id uuid references public.listings (id) on delete cascade;

-- Interesse an- oder abschalten. Gibt den neuen Zustand zurück (true = Interesse).
create function public.toggle_listing_interest(p_listing uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me and nickname is not null) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select owner_id into v_owner from public.listings where id = p_listing and status in ('active', 'reserved');
  if v_owner is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_owner = v_me then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if public.is_blocked_between(v_me, v_owner) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  if exists (select 1 from public.listing_interests where listing_id = p_listing and user_id = v_me) then
    delete from public.listing_interests where listing_id = p_listing and user_id = v_me;
    -- Noch ungelesene Benachrichtigung wieder einsammeln
    delete from public.notifications
     where user_id = v_owner and actor_id = v_me and listing_id = p_listing
       and kind::text = 'trade_interest' and read_at is null;
    return false;
  end if;

  if (select count(*) from public.listing_interests where user_id = v_me and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.listing_interests (listing_id, user_id) values (p_listing, v_me);
  delete from public.notifications
   where user_id = v_owner and actor_id = v_me and listing_id = p_listing and kind::text = 'trade_interest';
  insert into public.notifications (user_id, actor_id, kind, listing_id)
  values (v_owner, v_me, 'trade_interest', p_listing);
  return true;
end;
$$;

-- Für die Inseratsseite: habe ich Interesse, wie viele haben Interesse?
create function public.listing_interest_state(p_listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mine', exists (select 1 from public.listing_interests i where i.listing_id = p_listing and i.user_id = auth.uid()),
    'count', (select count(*) from public.listing_interests i
               where i.listing_id = p_listing
                 and not public.is_blocked_between(auth.uid(), i.user_id))
  );
$$;

-- Nur für die Person, der das Inserat gehört: wer hat Interesse, und welche Karten bieten diese Leute zum Tausch an?
create function public.listing_interested_people(p_listing uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing and owner_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(x.item order by x.created_at desc), '[]'::jsonb)
    from (
      select i.created_at,
             jsonb_build_object(
               'id', p.id,
               'nickname', p.nickname,
               'avatar_id', case when public.can_view_profile(p.id) then p.avatar_id end,
               'since', i.created_at,
               'trade_count', (select count(*) from public.listings l
                                where l.owner_id = p.id and l.status = 'active' and l.offer in ('trade', 'sell_or_trade')),
               'cards', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', l.id, 'title', l.title, 'tcg', l.tcg, 'owner_id', l.owner_id,
                          'cover_id', (select ph.id from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1)
                        ) order by l.created_at desc), '[]'::jsonb)
                   from (select * from public.listings l2
                          where l2.owner_id = p.id and l2.status = 'active' and l2.offer in ('trade', 'sell_or_trade')
                          order by l2.created_at desc limit 12) l
               )
             ) as item
        from public.listing_interests i
        join public.profiles p on p.id = i.user_id and p.nickname is not null
       where i.listing_id = p_listing
         and not public.is_blocked_between(auth.uid(), p.id)
    ) x
  );
end;
$$;

-- Benachrichtigungen: jetzt auch mit Inserat (Titel und Foto für „Tauschinteresse“)
create or replace function public.my_notifications(p_limit int default 50)
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
               'listing_id', n.listing_id,
               'listing_title', l.title,
               'listing_owner_id', l.owner_id,
               'listing_cover_id', (select lp.id from public.listing_photos lp where lp.listing_id = n.listing_id order by lp.position limit 1),
               'my_follow', (select f.status::text from public.follows f where f.follower_id = auth.uid() and f.following_id = a.id),
               'request_open', n.kind = 'follow_request'
                 and exists (select 1 from public.follows f where f.follower_id = a.id and f.following_id = auth.uid() and f.status = 'pending')
             ) as item
        from public.notifications n
        join public.profiles a on a.id = n.actor_id and a.nickname is not null
        left join public.posts p on p.id = n.post_id
        left join public.post_comments c on c.id = n.comment_id
        left join public.listings l on l.id = n.listing_id
       where n.user_id = auth.uid()
         and not public.is_blocked_between(auth.uid(), n.actor_id)
       order by n.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) x;
$$;

-- Handy-Mitteilungen: Inserat mitgeben, damit der Text „… an „Glurak““ lauten kann
create or replace function public.claim_push(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  with claimed as (
    update public.notifications n
       set pushed_at = now()
     where n.user_id = p_user
       and n.pushed_at is null
       and n.read_at is null
       and n.created_at > now() - interval '15 minutes'
    returning n.id, n.kind, n.actor_id, n.post_id, n.comment_id, n.listing_id, n.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', c.kind,
           'actor', a.nickname,
           'post_id', c.post_id,
           'listing_id', c.listing_id,
           'listing_title', left(l.title, 60),
           'comment', left(pc.body, 100)) order by c.created_at), '[]'::jsonb)
    into v_items
    from claimed c
    join public.profiles a on a.id = c.actor_id
    left join public.post_comments pc on pc.id = c.comment_id
    left join public.listings l on l.id = c.listing_id;

  return jsonb_build_object(
    'items', v_items,
    'locale', (select locale from public.profiles where id = p_user),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                                 from public.push_subscriptions s where s.user_id = p_user), '[]'::jsonb));
end;
$$;

revoke execute on function public.toggle_listing_interest(uuid) from public, anon;
revoke execute on function public.listing_interest_state(uuid) from public;
revoke execute on function public.listing_interested_people(uuid) from public, anon;
grant execute on function public.toggle_listing_interest(uuid) to authenticated;
grant execute on function public.listing_interest_state(uuid) to anon, authenticated;
grant execute on function public.listing_interested_people(uuid) to authenticated;
