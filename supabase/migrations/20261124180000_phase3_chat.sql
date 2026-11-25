-- Tracacon-App, Phase 3: App-Chat
-- Eine Unterhaltung je Inserat und Interessent. Nur die beiden Beteiligten sehen sie;
-- das Team sieht eine Unterhaltung nur, wenn sie gemeldet wurde.
-- Alle Schreibzugriffe laufen über geprüfte Funktionen.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid references public.listings (id) on delete set null,
  listing_title      text not null,
  seller_id          uuid not null references public.profiles (id) on delete cascade,
  buyer_id           uuid not null references public.profiles (id) on delete cascade,
  created_at         timestamptz not null default now(),
  last_message_at    timestamptz,
  seller_last_read_at timestamptz,
  buyer_last_read_at  timestamptz,
  seller_hidden_at   timestamptz,
  buyer_hidden_at    timestamptz,
  constraint conversations_two_people check (seller_id <> buyer_id)
);

-- Pro Inserat und Interessent nur eine Unterhaltung
create unique index conversations_listing_buyer on public.conversations (listing_id, buyer_id) where listing_id is not null;
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);
create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint messages_body_length check (char_length(btrim(body)) between 1 and 1000)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

-- Meldungen können sich jetzt auch auf eine Unterhaltung beziehen
alter table public.reports add column conversation_id uuid references public.conversations (id) on delete cascade;
alter table public.reports drop constraint reports_one_target;
alter table public.reports add constraint reports_one_target check (
  (listing_id is not null)::int + (profile_id is not null)::int + (conversation_id is not null)::int = 1
);
create unique index reports_one_open_conversation on public.reports (reporter_id, conversation_id)
  where status = 'open' and conversation_id is not null;

-- ---------------------------------------------------------------------------
-- Zugriffsregeln
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;

create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (auth.uid() in (seller_id, buyer_id));

create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (exists (
    select 1 from public.conversations c
     where c.id = conversation_id and auth.uid() in (c.seller_id, c.buyer_id)
  ));

create policy "blocks_select_own"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.blocks from anon, authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.blocks to authenticated;

-- Echtzeit: neue Nachrichten an die Beteiligten ausliefern (Zugriffsregeln gelten auch hier)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------
create function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------------------
-- Unterhaltung beginnen (oder die bestehende zurückgeben)
-- ---------------------------------------------------------------------------
create function public.start_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_listing public.listings;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_me and nickname is not null) then
    raise exception 'profile_incomplete' using errcode = '42501';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null or v_listing.status not in ('active', 'reserved') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_listing.owner_id = v_me then
    raise exception 'cannot_message_self' using errcode = '22023';
  end if;
  if public.is_blocked_between(v_me, v_listing.owner_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  select id into v_id from public.conversations where listing_id = p_listing_id and buyer_id = v_me;
  if v_id is not null then
    update public.conversations set buyer_hidden_at = null where id = v_id;
    return v_id;
  end if;

  if (select count(*) from public.conversations
       where buyer_id = v_me and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.conversations (listing_id, listing_title, seller_id, buyer_id)
  values (v_listing.id, v_listing.title, v_listing.owner_id, v_me)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nachricht senden: nur Beteiligte, nicht bei Sperre, höchstens 20 pro Minute und 500 pro Tag
-- ---------------------------------------------------------------------------
create function public.send_message(p_conversation_id uuid, p_body text)
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

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_me, btrim(left(coalesce(p_body, ''), 1001)))
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

-- ---------------------------------------------------------------------------
-- Gelesen markieren
-- ---------------------------------------------------------------------------
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
     set seller_last_read_at = case when auth.uid() = seller_id then clock_timestamp() else seller_last_read_at end,
         buyer_last_read_at = case when auth.uid() = buyer_id then clock_timestamp() else buyer_last_read_at end
   where id = p_conversation_id and auth.uid() in (seller_id, buyer_id);
$$;

-- ---------------------------------------------------------------------------
-- Unterhaltung für mich ausblenden (kommt mit der nächsten Nachricht zurück)
-- ---------------------------------------------------------------------------
create function public.hide_conversation(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
     set seller_hidden_at = case when auth.uid() = seller_id then now() else seller_hidden_at end,
         buyer_hidden_at = case when auth.uid() = buyer_id then now() else buyer_hidden_at end
   where id = p_conversation_id and auth.uid() in (seller_id, buyer_id);
$$;

-- ---------------------------------------------------------------------------
-- Liste meiner Unterhaltungen
-- ---------------------------------------------------------------------------
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
  i_am_seller boolean,
  last_message_at timestamptz,
  last_body text,
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
         c.seller_id = auth.uid(),
         c.last_message_at,
         lm.body, lm.sender_id = auth.uid(),
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > coalesce(case when c.seller_id = auth.uid() then c.seller_last_read_at else c.buyer_last_read_at end,
                                         '-infinity'::timestamptz)),
         public.is_blocked_between(c.seller_id, c.buyer_id)
    from public.conversations c
    join public.profiles o on o.id = case when c.seller_id = auth.uid() then c.buyer_id else c.seller_id end
    left join public.listings l on l.id = c.listing_id
    left join lateral (
      select m.body, m.sender_id from public.messages m
       where m.conversation_id = c.id order by m.created_at desc limit 1
    ) lm on true
   where auth.uid() in (c.seller_id, c.buyer_id)
     and c.last_message_at is not null
     and (case when c.seller_id = auth.uid() then c.seller_hidden_at else c.buyer_hidden_at end) is null
   order by c.last_message_at desc
   limit 200;
$$;

-- Kopfdaten einer Unterhaltung
create function public.get_conversation(p_conversation_id uuid)
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
    'i_am_seller', c.seller_id = auth.uid(),
    'i_blocked', exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = o.id),
    'blocked_me', exists (select 1 from public.blocks b where b.blocker_id = o.id and b.blocked_id = auth.uid())
  )
    from public.conversations c
    join public.profiles o on o.id = case when c.seller_id = auth.uid() then c.buyer_id else c.seller_id end
    left join public.listings l on l.id = c.listing_id
   where c.id = p_conversation_id and auth.uid() in (c.seller_id, c.buyer_id);
$$;

-- Nachrichten einer Unterhaltung (Zugriffsregeln gelten). p_after für Nachladen.
create function public.get_messages(p_conversation_id uuid, p_after timestamptz default null, p_limit int default 200)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  select * from (
    select m.* from public.messages m
     where m.conversation_id = p_conversation_id
       and (p_after is null or m.created_at > p_after)
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) s
  order by s.created_at asc;
$$;

-- Zahl ungelesener Nachrichten für das Abzeichen in der Navigation
create function public.unread_message_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(n), 0)::int from (
    select (select count(*) from public.messages m
             where m.conversation_id = c.id and m.sender_id <> auth.uid()
               and m.created_at > coalesce(case when c.seller_id = auth.uid() then c.seller_last_read_at else c.buyer_last_read_at end,
                                           '-infinity'::timestamptz)) as n
      from public.conversations c
     where auth.uid() in (c.seller_id, c.buyer_id)
       and (case when c.seller_id = auth.uid() then c.seller_hidden_at else c.buyer_hidden_at end) is null
  ) s;
$$;

-- Für ein Inserat: meine bestehende Unterhaltung (als Interessent)
create function public.my_conversation_for_listing(p_listing_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.conversations where listing_id = p_listing_id and buyer_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Blockieren
-- ---------------------------------------------------------------------------
create function public.block_user(p_user_id uuid)
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
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Unterhaltung melden; das Team sieht sie danach
-- ---------------------------------------------------------------------------
create function public.report_conversation(p_conversation_id uuid, p_reason public.report_reason, p_details text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.conversations c
                  where c.id = p_conversation_id and auth.uid() in (c.seller_id, c.buyer_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.reports (reporter_id, conversation_id, reason, details)
  values (auth.uid(), p_conversation_id, p_reason, nullif(btrim(left(p_details, 1000)), ''));
exception
  when unique_violation then
    raise exception 'already_reported' using errcode = '23505';
end;
$$;

-- Für das Team: gemeldete Unterhaltung lesen (nur wenn es eine Meldung dazu gibt)
create function public.moderation_conversation(p_conversation_id uuid)
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
           'listing_title', c.listing_title,
           'seller', s.nickname,
           'buyer', b.nickname,
           'messages', coalesce((select jsonb_agg(jsonb_build_object(
                                   'from', p.nickname, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
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

-- Moderationsliste um Unterhaltungen erweitern (Rückgabetyp ändert sich, daher neu anlegen)
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
           count(*) over ()
      from public.reports r
      left join public.profiles rp on rp.id = r.reporter_id
      left join public.listings l on l.id = r.listing_id
      left join public.profiles lo on lo.id = l.owner_id
      left join public.profiles pp on pp.id = r.profile_id
      left join public.conversations cv on cv.id = r.conversation_id
     where r.status = 'open'
     order by r.created_at asc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Unterhaltungen werden nur über report_conversation gemeldet (prüft die Beteiligung).
-- Kein direktes Einfügen mit conversation_id, sonst könnte jemand fremde Chats für das Team freischalten.

-- ---------------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------------
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke execute on function public.start_conversation(uuid) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.hide_conversation(uuid) from public, anon;
revoke execute on function public.list_conversations() from public, anon;
revoke execute on function public.get_conversation(uuid) from public, anon;
revoke execute on function public.get_messages(uuid, timestamptz, int) from public, anon;
revoke execute on function public.unread_message_count() from public, anon;
revoke execute on function public.my_conversation_for_listing(uuid) from public, anon;
revoke execute on function public.block_user(uuid) from public, anon;
revoke execute on function public.unblock_user(uuid) from public, anon;
revoke execute on function public.report_conversation(uuid, public.report_reason, text) from public, anon;
revoke execute on function public.moderation_conversation(uuid) from public, anon;
revoke execute on function public.list_open_reports(int, int) from public, anon;

grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.hide_conversation(uuid) to authenticated;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.get_conversation(uuid) to authenticated;
grant execute on function public.get_messages(uuid, timestamptz, int) to authenticated;
grant execute on function public.unread_message_count() to authenticated;
grant execute on function public.my_conversation_for_listing(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.report_conversation(uuid, public.report_reason, text) to authenticated;
grant execute on function public.moderation_conversation(uuid) to authenticated;
grant execute on function public.list_open_reports(int, int) to authenticated;
