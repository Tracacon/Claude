-- Zahlen-Übersicht fürs Team: nur Summen, keine Namen oder Inhalte.
-- Jede Kennzahl für die letzten 7 Tage und die 7 Tage davor (Vergleich zur Vorwoche).

create function public.team_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now  timestamptz := now();
  v_w1   timestamptz := now() - interval '7 days';
  v_w2   timestamptz := now() - interval '14 days';
begin
  if not public.is_team() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'members', jsonb_build_object(
      'total', (select count(*) from public.profiles where nickname is not null),
      'week',  (select count(*) from public.profiles where nickname is not null and created_at >= v_w1),
      'prev',  (select count(*) from public.profiles where nickname is not null and created_at >= v_w2 and created_at < v_w1)
    ),
    'active', jsonb_build_object(
      'week',  (select count(*) from public.presence where last_seen_at >= v_w1),
      'today', (select count(*) from public.presence where last_seen_at >= v_now - interval '24 hours'),
      'now',   (select count(*) from public.presence where last_seen_at >= v_now - interval '5 minutes')
    ),
    'listings', jsonb_build_object(
      'active', (select count(*) from public.listings where status = 'active'),
      'week',   (select count(*) from public.listings where created_at >= v_w1),
      'prev',   (select count(*) from public.listings where created_at >= v_w2 and created_at < v_w1),
      'done',   (select count(*) from public.listings where status = 'done' and updated_at >= v_w1)
    ),
    'posts', jsonb_build_object(
      'week', (select count(*) from public.posts where created_at >= v_w1),
      'prev', (select count(*) from public.posts where created_at >= v_w2 and created_at < v_w1)
    ),
    'comments', jsonb_build_object(
      'week', (select count(*) from public.post_comments where created_at >= v_w1),
      'prev', (select count(*) from public.post_comments where created_at >= v_w2 and created_at < v_w1)
    ),
    'likes', jsonb_build_object(
      'week', (select count(*) from public.post_likes where created_at >= v_w1),
      'prev', (select count(*) from public.post_likes where created_at >= v_w2 and created_at < v_w1)
    ),
    'messages', jsonb_build_object(
      'week', (select count(*) from public.messages where created_at >= v_w1),
      'prev', (select count(*) from public.messages where created_at >= v_w2 and created_at < v_w1)
    ),
    'chats', jsonb_build_object(
      'week', (select count(*) from public.conversations where created_at >= v_w1),
      'prev', (select count(*) from public.conversations where created_at >= v_w2 and created_at < v_w1)
    ),
    'follows', jsonb_build_object(
      'week', (select count(*) from public.follows where status = 'accepted' and coalesce(accepted_at, created_at) >= v_w1),
      'prev', (select count(*) from public.follows where status = 'accepted' and coalesce(accepted_at, created_at) >= v_w2
                 and coalesce(accepted_at, created_at) < v_w1)
    ),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'push_users', (select count(distinct user_id) from public.push_subscriptions),
    -- Neue Mitglieder je Woche, die letzten 12 Wochen (älteste zuerst)
    'members_weekly', (
      select coalesce(jsonb_agg(jsonb_build_object('week', w.start, 'count', w.n) order by w.start), '[]'::jsonb)
      from (
        select s.start::date as start,
               (select count(*) from public.profiles p
                 where p.nickname is not null and p.created_at >= s.start and p.created_at < s.start + interval '7 days') as n
        from generate_series(date_trunc('week', v_now) - interval '11 weeks', date_trunc('week', v_now), interval '1 week') as s(start)
      ) w
    ),
    -- Aktive Inserate je Spiel, meiste zuerst
    'games', (
      select coalesce(jsonb_agg(jsonb_build_object('tcg', g.tcg, 'count', g.n) order by g.n desc), '[]'::jsonb)
      from (select tcg::text as tcg, count(*) as n from public.listings where status = 'active' group by tcg) g
    ),
    -- Aktive Inserate je Angebotsart
    'offers', (
      select coalesce(jsonb_object_agg(o.offer, o.n), '{}'::jsonb)
      from (select offer::text as offer, count(*) as n from public.listings where status = 'active' group by offer) o
    ),
    -- Check-ins der letzten 5 vergangenen bzw. laufenden Termine
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'starts_at', e.starts_at, 'checkins', e.n) order by e.starts_at desc), '[]'::jsonb)
      from (
        select ev.name, ev.starts_at, (select count(*) from public.checkins c where c.event_id = ev.id) as n
        from public.events ev
        where ev.starts_at <= v_now
        order by ev.starts_at desc
        limit 5
      ) e
    )
  );
end;
$$;

revoke execute on function public.team_stats() from public, anon;
grant execute on function public.team_stats() to authenticated;
