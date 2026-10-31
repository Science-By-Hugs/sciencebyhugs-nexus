-- Tighten NEXUS customer order notifications (CORE admin alerts unchanged).
--
-- Before: one purchase sent up to four customer notifications — "received" when
-- checkout merely started, a "payment status changed" for the internal
-- paypal_pending step, a vague "order status changed" when payment was captured,
-- and so on — each with no order number.
--
-- After: customers are notified only about meaningful milestones, each message
-- names the order, internal steps are silent, and an identical message for the
-- same order within 10 minutes is not queued again.

create or replace function private.order_push_customer_body(
  op text,
  old_status text, new_status text,
  old_payment text, new_payment text,
  old_eta date, new_eta date,
  order_number text
) returns text
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  label text := case when coalesce(order_number, '') <> '' then 'Order ' || order_number else 'Your order' end;
  internal_statuses text[] := array['checkout_pending', 'checkout_error'];
begin
  if op = 'INSERT' then
    -- Checkout creates the order before payment; customers hear about it once paid.
    if new_status = any(internal_statuses) then return null; end if;
    return 'We received ' || lower(left(label, 1)) || substr(label, 2) || '. Open NEXUS for details.';
  end if;

  -- Payment milestones (internal *_pending steps are silent).
  if new_payment is distinct from old_payment then
    if new_payment = 'paid' then
      return 'Payment received — ' || lower(left(label, 1)) || substr(label, 2) || ' is confirmed.';
    elsif new_payment = 'refunded' then
      return 'Your refund for ' || lower(left(label, 1)) || substr(label, 2) || ' has been issued.';
    elsif new_payment = 'failed' then
      return 'Payment for ' || lower(left(label, 1)) || substr(label, 2) || ' did not go through. Open NEXUS to try again.';
    end if;
  end if;

  -- Fulfillment milestones.
  if new_status is distinct from old_status and not (new_status = any(internal_statuses)) then
    -- checkout_pending -> processing happens together with payment; already covered above.
    if old_status = 'checkout_pending' and new_status = 'processing' then return null; end if;
    return case new_status
      when 'processing' then label || ' is being prepared.'
      when 'shipped' then label || ' is on its way.'
      when 'delivered' then label || ' has been delivered.'
      when 'cancelled' then label || ' has been cancelled.'
      else label || ' was updated. Open NEXUS for details.'
    end;
  end if;

  if new_eta is distinct from old_eta then
    return case when new_eta is null
      then label || ' has a new delivery estimate coming. Check NEXUS for details.'
      else label || ' is now expected ' || to_char(new_eta, 'Mon FMDD') || '.' end;
  end if;

  return null;
end;
$function$;

create or replace function private.queue_order_push()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  customer_auth uuid;
  event_key text := gen_random_uuid()::text;
  nexus_body text;
  core_body text;
begin
  -- CORE admin alerts: unchanged.
  if TG_OP='INSERT' then
    core_body := 'A new order is ready to review in CORE.';
  elsif NEW.payment_status is distinct from OLD.payment_status then
    core_body := 'An order payment status has changed. Open CORE to review.';
  end if;

  nexus_body := private.order_push_customer_body(
    TG_OP,
    case when TG_OP='INSERT' then null else OLD.status end, NEW.status,
    case when TG_OP='INSERT' then null else OLD.payment_status end, NEW.payment_status,
    case when TG_OP='INSERT' then null else OLD.estimated_delivery_date end, NEW.estimated_delivery_date,
    NEW.order_number
  );

  if nexus_body is not null then
    select auth_user_id into customer_auth from public.profiles where id=NEW.customer_id;
    if customer_auth is not null
      and (
        exists (select 1 from public.app_push_subscriptions s where s.app='nexus' and s.user_id=customer_auth)
        or exists (select 1 from public.native_push_devices d where d.app='nexus' and d.user_id=customer_auth and d.invalidated_at is null)
      )
      -- Same message for the same order within 10 minutes (e.g. an admin saving twice): skip.
      and not exists (
        select 1 from private.app_push_queue q
        where q.user_id=customer_auth and q.app='nexus'
          and q.payload->>'tag' = 'order-'||NEW.id
          and q.payload->>'body' = nexus_body
          and q.created_at > now() - interval '10 minutes'
      )
    then
      insert into private.app_push_queue(event_key,user_id,app,payload)
      values (event_key, customer_auth, 'nexus',
        jsonb_build_object('title','NEXUS · Order update','body',nexus_body,'url','?push=orders','tag','order-'||NEW.id))
      on conflict do nothing;
    end if;
  end if;

  if core_body is not null then
    insert into private.app_push_queue(event_key,user_id,app,payload)
      select event_key,s.user_id,'core',jsonb_build_object('title','CORE · Order alert','body',core_body,'url','#orders','tag','order-'||NEW.id)
      from public.app_push_subscriptions s join auth.users u on u.id=s.user_id
      where s.app='core' and lower(u.raw_app_meta_data->>'role') in ('owner','admin') group by s.user_id
      on conflict do nothing;
  end if;
  return NEW;
end;
$function$;
