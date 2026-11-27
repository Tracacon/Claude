-- Tracacon App: Effekte für Binder-Einbände (Glitzer, Goldglitzer, Holo, Regenbogen-Holo, Kosmos).
-- Einmal im SQL Editor von Supabase ausführen (nach 20261127230000_binder.sql).

alter table public.binders
  add column effect text not null default 'none'
  constraint binders_effect check (effect in ('none', 'glitter', 'gold', 'holo', 'rainbow', 'cosmos'));

grant insert (effect) on public.binders to authenticated;
grant update (effect) on public.binders to authenticated;

-- Anlegen bzw. ändern, jetzt mit Effekt
drop function public.save_binder(uuid, text, text, text);
create function public.save_binder(p_id uuid, p_name text, p_color text, p_visibility text, p_effect text default 'none')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_id is null then
    insert into public.binders (name, color, visibility, effect)
    values (btrim(left(p_name, 41)), coalesce(p_color, 'night'), coalesce(p_visibility, 'public'), coalesce(p_effect, 'none'))
    returning id into v_id;
  else
    update public.binders
       set name = btrim(left(p_name, 41)),
           color = coalesce(p_color, color),
           visibility = coalesce(p_visibility, visibility),
           effect = coalesce(p_effect, effect)
     where id = p_id and owner_id = auth.uid()
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

drop function public.my_binders();
create function public.my_binders()
returns table (id uuid, name text, color text, visibility text, effect text)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.name, b.color, b.visibility, b.effect from public.binders b
   where b.owner_id = auth.uid()
   order by b.position, b.created_at;
$$;

drop function public.profile_binders(text);
create function public.profile_binders(p_nickname text)
returns table (
  id uuid,
  name text,
  color text,
  effect text,
  visibility text,
  "position" int,
  card_count bigint,
  cover_photo_id uuid,
  owner_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, b.color, b.effect, b.visibility, b.position,
         (select count(*) from public.listings l
           where l.binder_id = b.id and l.status::text in ('collection', 'active', 'reserved')),
         (select ph.id from public.listings l
            join public.listing_photos ph on ph.listing_id = l.id and ph.position = 0
           where l.binder_id = b.id and l.status::text in ('collection', 'active', 'reserved')
           order by l.pocket limit 1),
         b.owner_id
    from public.profiles p
    join public.binders b on b.owner_id = p.id
   where lower(p.nickname) = lower(p_nickname)
     and public.can_view_profile(p.id)
     and public.binder_visible(b.id)
   order by b.position, b.created_at;
$$;

revoke execute on function public.save_binder(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_binder(uuid, text, text, text, text) to authenticated;
revoke execute on function public.my_binders() from public, anon;
grant execute on function public.my_binders() to authenticated;
revoke execute on function public.profile_binders(text) from public;
grant execute on function public.profile_binders(text) to anon, authenticated;
