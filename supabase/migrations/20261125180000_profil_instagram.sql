-- Instagram-Name im Profil: Man tippt nur den Namen ein, die App baut den Link.
-- Einmal im SQL Editor von Supabase ausführen.

alter table public.profiles add column instagram text;
alter table public.profiles add constraint profiles_instagram_format
  check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$');
grant update (instagram) on public.profiles to authenticated;

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
    'instagram', case when v_can then p.instagram end,
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
