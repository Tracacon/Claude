-- Tracacon App: Bildersammlung für Titelbilder.
-- Hochgeladene Titelbilder bleiben gespeichert und können für andere Binder wiederverwendet werden.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261128030000_profil_highlights.sql).

create table public.image_library (
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  image_id   uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, image_id)
);

alter table public.image_library enable row level security;
create policy "image_library_own" on public.image_library
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.image_library from anon, authenticated;
grant select, delete on public.image_library to authenticated;
grant insert (image_id), update (created_at) on public.image_library to authenticated;

-- Bisherige Titelbilder übernehmen
insert into public.image_library (owner_id, image_id)
select owner_id, cover_image from public.binders where cover_image is not null
on conflict do nothing;

-- Titelbild setzen: neues Bild kommt in die Bildersammlung; das alte bleibt dort (wird nicht gelöscht).
create or replace function public.set_binder_cover(p_binder uuid, p_image uuid)
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
  if p_image is not null then
    insert into public.image_library (image_id) values (p_image)
    on conflict (owner_id, image_id) do update set created_at = now();
  end if;
  -- Nichts mehr zum Löschen zurückgeben: alte Titelbilder bleiben in der Bildersammlung
  return null;
end;
$$;

-- Eigene Bilder zur Auswahl: frühere Titelbilder und Vorderseiten der eigenen Karten
create function public.my_image_library()
returns table (image_id uuid, kind text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  (select il.image_id, 'cover'::text, il.created_at
     from public.image_library il
    where il.owner_id = auth.uid()
    order by il.created_at desc
    limit 60)
  union all
  (select ph.id, 'card'::text, l.created_at
     from public.listings l
     join public.listing_photos ph on ph.listing_id = l.id and ph.position = 0
    where l.owner_id = auth.uid() and l.status::text <> 'removed'
    order by l.created_at desc
    limit 120);
$$;

-- Bild aus der Bildersammlung entfernen. Gibt true zurück, wenn kein Binder es mehr nutzt
-- (dann löscht die App auch die Datei).
create function public.remove_library_image(p_image uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.image_library where owner_id = auth.uid() and image_id = p_image;
  return not exists (select 1 from public.binders where owner_id = auth.uid() and cover_image = p_image);
end;
$$;

revoke execute on function public.my_image_library() from public, anon;
grant execute on function public.my_image_library() to authenticated;
revoke execute on function public.remove_library_image(uuid) from public, anon;
grant execute on function public.remove_library_image(uuid) to authenticated;
