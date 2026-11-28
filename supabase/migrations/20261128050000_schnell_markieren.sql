-- Tracacon App: Karte im Binder schnell markieren (Tausch, Verkauf, …) oder zurück in die Sammlung.
-- Einmal im SQL Editor von Supabase ausführen (nach 20261128040000_bildersammlung.sql).
-- Die bestehenden Regeln gelten weiter: Tausch und Verkauf brauchen Vorder- und Rückseite und einen
-- echten Titel (sonst Fehler front_back_required bzw. title_required).

create function public.quick_mark(p_id uuid, p_offer text, p_price_cents int default null, p_negotiable boolean default false)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_offer = 'collection' then
    update public.listings set status = 'collection'
     where id = p_id and owner_id = auth.uid() and status::text in ('collection', 'active', 'reserved');
  else
    if p_offer not in ('sell', 'trade', 'sell_or_trade', 'gift') then
      raise exception 'invalid_action' using errcode = '22023';
    end if;
    if p_offer in ('sell', 'sell_or_trade') and (p_price_cents is null or p_price_cents < 0 or p_price_cents > 10000000) then
      raise exception 'price_required' using errcode = '22023';
    end if;
    update public.listings
       set offer = p_offer::public.listing_offer,
           price_cents = case when p_offer in ('sell', 'sell_or_trade') then p_price_cents end,
           negotiable = case when p_offer in ('sell', 'sell_or_trade') then coalesce(p_negotiable, false) else false end,
           status = case when status::text = 'collection' then 'active'::public.listing_status else status end
     where id = p_id and owner_id = auth.uid() and status::text in ('collection', 'active', 'reserved');
  end if;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.quick_mark(uuid, text, int, boolean) from public, anon;
grant execute on function public.quick_mark(uuid, text, int, boolean) to authenticated;
