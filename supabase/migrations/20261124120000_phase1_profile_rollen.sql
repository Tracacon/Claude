-- Tracacon-App, Phase 1: Profile und Rollen
-- Läuft in Supabase (Postgres 15+). Voraussetzung: Schema "auth" von Supabase.
--
-- Grundsätze:
--  * Jede Tabelle hat Row Level Security.
--  * Rollen stehen in der Datenbank, nicht in einer E-Mail-Liste.
--  * Rolle und Zeitstempel kann ein Nutzer nicht selbst setzen; das geht nur über
--    geprüfte Funktionen (security definer).

-- ---------------------------------------------------------------------------
-- Rollen
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('member', 'team', 'admin');

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nickname          text,
  city              text,
  bio               text,
  website           text,
  locale            text not null default 'de',
  role              public.app_role not null default 'member',
  age_confirmed_at  timestamptz,
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint profiles_nickname_format
    check (nickname is null or nickname ~ '^[A-Za-z0-9_.-]{3,24}$'),
  constraint profiles_city_length    check (city is null or char_length(city) <= 80),
  constraint profiles_bio_length     check (bio is null or char_length(bio) <= 500),
  constraint profiles_website_format
    check (website is null or (char_length(website) <= 200 and website ~ '^https://')),
  constraint profiles_locale_valid   check (locale in ('de', 'en')),
  -- Ein Nickname gibt es erst nach abgeschlossener Begrüßung (Alter und Regeln bestätigt).
  constraint profiles_onboarding_complete
    check (nickname is null or (age_confirmed_at is not null and terms_accepted_at is not null))
);

comment on table public.profiles is 'Öffentliches Profil je Login-Konto. Rolle: member, team, admin.';

-- Nickname eindeutig ohne Rücksicht auf Groß- und Kleinschreibung
create unique index profiles_nickname_unique on public.profiles (lower(nickname));
create index profiles_role_idx on public.profiles (role) where role <> 'member';

-- updated_at automatisch pflegen
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profil automatisch bei Registrierung anlegen
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'de');
begin
  if v_locale not in ('de', 'en') then
    v_locale := 'de';
  end if;
  insert into public.profiles (id, locale) values (new.id, v_locale);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen für Rollen
-- ---------------------------------------------------------------------------
create function public.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role in ('team', 'admin') from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Zugriffsregeln (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Angemeldete sehen ihr eigenes Profil und alle fertigen Profile.
create policy "profiles_select_own_or_public"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or nickname is not null);

-- Nur das eigene Profil bearbeiten. Welche Spalten, regeln die Rechte unten.
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Rechte auf Spaltenebene: Rolle und Zeitstempel sind für Nutzer tabu.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nickname, city, bio, website, locale) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Begrüßung abschließen: Nickname, Mindestalter 16, Community-Regeln
-- ---------------------------------------------------------------------------
create function public.complete_onboarding(p_nickname text, p_confirm_age boolean, p_accept_terms boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not coalesce(p_confirm_age, false) then
    raise exception 'age_not_confirmed' using errcode = '22023';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'terms_not_accepted' using errcode = '22023';
  end if;

  update public.profiles
     set nickname          = p_nickname,
         age_confirmed_at  = coalesce(age_confirmed_at, now()),
         terms_accepted_at = coalesce(terms_accepted_at, now())
   where id = auth.uid()
  returning * into v_profile;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rollen vergeben (nur Admin). Der letzte Admin kann sich nicht selbst entfernen.
-- ---------------------------------------------------------------------------
create function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_role <> 'admin'
     and exists (select 1 from public.profiles where id = p_user_id and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last_admin' using errcode = '22023';
  end if;

  update public.profiles set role = p_role where id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nutzerliste für Admins (mit E-Mail aus auth.users)
-- ---------------------------------------------------------------------------
create function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid,
  email text,
  nickname text,
  role public.app_role,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select p.id, u.email::text, p.nickname, p.role, p.created_at, u.last_sign_in_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p_search is null
        or p_search = ''
        or u.email ilike '%' || p_search || '%'
        or p.nickname ilike '%' || p_search || '%'
     order by p.created_at desc
     limit least(greatest(p_limit, 1), 200)
    offset greatest(p_offset, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Eigenes Konto löschen (DSGVO). Profil fällt per Fremdschlüssel mit weg.
-- ---------------------------------------------------------------------------
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.is_admin() and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last_admin' using errcode = '22023';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte: Funktionen nur für angemeldete Nutzer
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_team() from public, anon;
revoke execute on function public.complete_onboarding(text, boolean, boolean) from public, anon;
revoke execute on function public.set_user_role(uuid, public.app_role) from public, anon;
revoke execute on function public.admin_list_users(text, int, int) from public, anon;
revoke execute on function public.delete_own_account() from public, anon;

grant execute on function public.my_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_team() to authenticated;
grant execute on function public.complete_onboarding(text, boolean, boolean) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.delete_own_account() to authenticated;
