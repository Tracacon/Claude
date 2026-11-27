-- Tracacon App: eigenes Titelbild für Binder-Einbände (statt der ersten Karte).
-- Einmal im SQL Editor von Supabase ausführen (nach 20261128010000_sammlung_vorderseite.sql).
-- Das Bild liegt wie Kartenfotos im Speicher listing-photos: <nutzer-id>/<bild-id>.jpg (+ _t.jpg).

alter table public.binders add column cover_image uuid;
grant update (cover_image) on public.binders to authenticated;

-- Titelbild setzen oder entfernen (null). Gibt das bisherige Bild zurück, damit die App es löscht.
create function public.set_binder_cover(p_binder uuid, p_image uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select cover_image into v_old from public.binders where id = p_binder and owner_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.binders set cover_image = p_image where id = p_binder and owner_id = auth.uid();
  return case when v_old is distinct from p_image then v_old end;
end;
$$;

drop function public.my_binders();
create function public.my_binders()
returns table (id uuid, name text, color text, visibility text, effect text, cover_image uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.name, b.color, b.visibility, b.effect, b.cover_image from public.binders b
   where b.owner_id = auth.uid()
   order by b.position, b.created_at;
$$;

-- Binder eines Profils: ohne Kartenbild, dafür mit eigenem Titelbild
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
  cover_image uuid,
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
         b.cover_image,
         b.owner_id
    from public.profiles p
    join public.binders b on b.owner_id = p.id
   where lower(p.nickname) = lower(p_nickname)
     and public.can_view_profile(p.id)
     and public.binder_visible(b.id)
   order by b.position, b.created_at;
$$;

revoke execute on function public.set_binder_cover(uuid, uuid) from public, anon;
grant execute on function public.set_binder_cover(uuid, uuid) to authenticated;
revoke execute on function public.my_binders() from public, anon;
grant execute on function public.my_binders() to authenticated;
revoke execute on function public.profile_binders(text) from public;
grant execute on function public.profile_binders(text) to anon, authenticated;
