-- Native APNs push for the NEXUS iOS app (production project tkhcvmkejzaoervocnzk).
-- Review before applying. Not applied automatically.
--
-- 1. public.native_push_devices — one row per app installation. RLS is enabled with
--    NO client policies: browsers/apps can never read device tokens. All access is
--    through the native-push edge function (service role) after it verifies the user.
-- 2. private.native_push_audit — audit trail and rate limiting. Stores a short token
--    hash only, never the token.
-- 3. private.queue_order_push — also enqueue order events for customers who only
--    have native devices (previously only web-push subscribers were queued).

create table if not exists public.native_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null default 'nexus' check (app = 'nexus'),
  platform text not null default 'ios' check (platform = 'ios'),
  installation_id uuid not null,
  token text not null check (token ~ '^[0-9a-f]{64,200}$'),
  apns_environment text not null check (apns_environment in ('development', 'production')),
  bundle_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_test_at timestamptz,
  invalidated_at timestamptz,
  constraint native_push_devices_installation_key unique (app, installation_id),
  constraint native_push_devices_token_key unique (token)
);

create index if not exists native_push_devices_user_idx
  on public.native_push_devices (user_id) where invalidated_at is null;

alter table public.native_push_devices enable row level security;
revoke all on public.native_push_devices from anon, authenticated;

create table if not exists private.native_push_audit (
  id bigint generated always as identity primary key,
  user_id uuid,
  device_id uuid,
  action text not null,
  outcome text not null,
  token_hint text,
  created_at timestamptz not null default now()
);

create index if not exists native_push_audit_rate_idx
  on private.native_push_audit (user_id, action, created_at desc);

-- Keep 90 days of audit history.
select cron.schedule(
  'native-push-audit-cleanup', '35 4 * * *',
  $$ delete from private.native_push_audit where created_at < now() - interval '90 days'; $$
);

-- Order events: same messages and queue as before, but a NEXUS customer is queued
-- if they have a web subscription OR an active native device.
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
  if TG_OP='INSERT' then
    core_body := 'A new order is ready to review in CORE.';
    nexus_body := 'Your order has been received. Open NEXUS for details.';
  else
    if NEW.status is distinct from OLD.status then
      nexus_body := 'Your order status has changed. Open NEXUS for details.';
    elsif NEW.payment_status is distinct from OLD.payment_status then
      nexus_body := 'Your payment status has changed. Open NEXUS for details.';
    elsif NEW.estimated_delivery_date is distinct from OLD.estimated_delivery_date then
      nexus_body := case when NEW.estimated_delivery_date is null then 'Your estimated delivery date is being updated. Check NEXUS for details.'
        else 'Your estimated delivery date is now ' || to_char(NEW.estimated_delivery_date,'Mon DD, YYYY') || '.' end;
    end if;
    if NEW.payment_status is distinct from OLD.payment_status then
      core_body := 'An order payment status has changed. Open CORE to review.';
    end if;
  end if;
  if nexus_body is not null then
    select auth_user_id into customer_auth from public.profiles where id=NEW.customer_id;
    if customer_auth is not null and (
      exists (select 1 from public.app_push_subscriptions s where s.app='nexus' and s.user_id=customer_auth)
      or exists (select 1 from public.native_push_devices d where d.app='nexus' and d.user_id=customer_auth and d.invalidated_at is null)
    ) then
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
