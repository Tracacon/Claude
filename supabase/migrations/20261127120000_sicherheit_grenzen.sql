-- Sicherheit: Grenzen gegen Missbrauch, wo bisher keine waren.
-- Einmal im SQL Editor ausführen.
--
-- 1. Foto-Uploads: höchstens 120 Fotos pro Stunde und 600 pro Tag je Person (alle Fotoarten zusammen).
--    Bisher konnte ein angemeldetes Konto beliebig viele Dateien hochladen und den Speicher füllen.
-- 2. Likes: höchstens 300 pro Stunde je Person (gegen Benachrichtigungs-Spam durch an/aus/an).
-- 3. Meldungen: höchstens 20 pro Stunde je Person (gegen Fluten der Moderation).

-- ---------- 1. Foto-Uploads ----------
create or replace function public.storage_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from storage.objects o
           where o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 hour') < 120
     and (select count(*) from storage.objects o
           where o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 day') < 600;
$$;

revoke execute on function public.storage_upload_allowed() from public, anon;
grant execute on function public.storage_upload_allowed() to authenticated;

-- Zusätzliche, einschränkende Regel: gilt neben den bestehenden Upload-Regeln aller Foto-Ordner
drop policy if exists "upload_limit" on storage.objects;
create policy "upload_limit"
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (public.storage_upload_allowed());

-- ---------- 2. Likes ----------
create or replace function public.post_likes_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.post_likes
       where user_id = new.user_id and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists post_likes_limit on public.post_likes;
create trigger post_likes_limit before insert on public.post_likes
  for each row execute function public.post_likes_limit();

-- ---------- 3. Meldungen ----------
create or replace function public.reports_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reporter_id is not null and (select count(*) from public.reports
       where reporter_id = new.reporter_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_limit on public.reports;
create trigger reports_limit before insert on public.reports
  for each row execute function public.reports_limit();

revoke execute on function public.post_likes_limit() from public, anon, authenticated;
revoke execute on function public.reports_limit() from public, anon, authenticated;
