-- Tracacon App: Mitteilungen aufs Handy (Web Push).
-- Einmal im SQL Editor von Supabase ausführen (nach 20261125210000_benachrichtigungen_online_neu.sql).

-- Welche Benachrichtigungen schon aufs Handy geschickt wurden
alter table public.notifications add column pushed_at timestamptz;

-- Angemeldete Geräte (ein Eintrag je Handy/Browser)
create table public.push_subscriptions (
  endpoint   text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) between 20 and 200),
  auth       text not null check (char_length(auth) between 10 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Gerät anmelden (höchstens 10 je Person; das älteste fällt weg)
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  delete from public.push_subscriptions
   where user_id = auth.uid()
     and endpoint not in (select endpoint from public.push_subscriptions where user_id = auth.uid() order by created_at desc limit 10);
end;
$$;

-- Gerät abmelden
create function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Nur für den Server: neue Benachrichtigungen einer Person abholen (und als verschickt markieren)
-- samt ihrer Geräte und Sprache.
create function public.claim_push(p_user uuid)
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
    returning n.id, n.kind, n.actor_id, n.post_id, n.comment_id, n.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', c.kind,
           'actor', a.nickname,
           'post_id', c.post_id,
           'comment', left(pc.body, 100)) order by c.created_at), '[]'::jsonb)
    into v_items
    from claimed c
    join public.profiles a on a.id = c.actor_id
    left join public.post_comments pc on pc.id = c.comment_id;

  return jsonb_build_object(
    'items', v_items,
    'locale', (select locale from public.profiles where id = p_user),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                                 from public.push_subscriptions s where s.user_id = p_user), '[]'::jsonb));
end;
$$;

-- Nur für den Server: Geräte einer Person (für die Test-Mitteilung)
create function public.push_targets(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'locale', (select locale from public.profiles where id = p_user),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                                 from public.push_subscriptions s where s.user_id = p_user), '[]'::jsonb));
$$;

-- Nur für den Server: abgelaufene Geräte entfernen
create function public.drop_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
revoke execute on function public.claim_push(uuid) from public, anon, authenticated;
revoke execute on function public.push_targets(uuid) from public, anon, authenticated;
revoke execute on function public.drop_push_subscription(text) from public, anon, authenticated;

grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.claim_push(uuid) to service_role;
grant execute on function public.push_targets(uuid) to service_role;
grant execute on function public.drop_push_subscription(text) to service_role;
