import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.117.1'
import postgres from 'npm:postgres@3.4.5'
import webpush from 'npm:web-push@3.6.7'
import { ensureKeys, deliver, handleSubscription } from '../_shared/web-push.ts'
import { apnsConfig, sendApns } from '../_shared/apns.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
const admin = createClient(Deno.env.get('SUPABASE_URL')!, keys.nexus_rotation_20261023 || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
function createHandler(sql: any) {

async function dispatch() {
  const { publicKey, privateKey } = await ensureKeys(sql, 'ecosystem')
  webpush.setVapidDetails('mailto:notifications@sciencebyhugs.com', publicKey, privateKey)
  const events = await sql`
    update private.app_push_queue set locked_at=now(), attempts=attempts+1
    where id in (
      select id from private.app_push_queue
      where delivered_at is null and attempts < 5 and created_at > now()-interval '24 hours'
        and (locked_at is null or locked_at < now()-interval '5 minutes')
      order by created_at limit 20 for update skip locked
    ) returning *`
  let sent = 0
  for (const event of events) {
    if (event.app === 'core') {
      const users = await sql`select id from auth.users where id=${event.user_id} and lower(raw_app_meta_data->>'role') in ('owner','admin')`
      if (!users.length) { await sql`update private.app_push_queue set delivered_at=now() where id=${event.id}`; continue }
    }
    const subscriptions=await sql`select * from public.app_push_subscriptions where user_id=${event.user_id} and app=${event.app}`
    let failed = false
    for (const sub of subscriptions || []) {
      if ((event.delivered_endpoints || []).includes(sub.id)) continue
      try {
        if (await deliver(admin, 'app_push_subscriptions', sub, event.payload, sql)) sent++
        await sql`update private.app_push_queue set delivered_endpoints=array_append(delivered_endpoints,${sub.id}::uuid) where id=${event.id}`
      } catch (error: any) { failed = true; console.error('Push delivery failed', error?.statusCode || 'network') }
    }
    // Native iPhone (APNs) devices for NEXUS customers. Each device id is recorded in
    // delivered_endpoints like a web subscription, so a retried event never re-sends.
    if (event.app === 'nexus' && apnsConfig().configured) {
      const devices = await sql`select id, token, apns_environment from public.native_push_devices
        where user_id=${event.user_id} and app='nexus' and invalidated_at is null`
      for (const device of devices) {
        if ((event.delivered_endpoints || []).includes(device.id)) continue
        // A signing/config error is contained to this device so web pushes in the batch still go out.
        const result = await sendApns(device, event.payload).catch(() => ({ ok: false as const, status: 0, reason: 'SendError', invalidToken: false }))
        if (result.ok) sent++
        else if (result.invalidToken) await sql`update public.native_push_devices set invalidated_at=now(), updated_at=now() where id=${device.id}`
        else { failed = true; console.error('APNs delivery failed', result.status, result.reason); continue }
        await sql`update private.app_push_queue set delivered_endpoints=array_append(delivered_endpoints,${device.id}::uuid) where id=${event.id}`
      }
    }
    if (!failed) await sql`update private.app_push_queue set delivered_at=now() where id=${event.id}`
  }
  return { sent, processed: events.length }
}

return async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (new URL(req.url).searchParams.get('action') === 'dispatch') {
      const secrets = await sql`select decrypted_secret from vault.decrypted_secrets where name='ecosystem_push_cron_secret' limit 1`
      if (!secrets[0]?.decrypted_secret || req.headers.get('x-cron-key') !== secrets[0].decrypted_secret) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      return Response.json(await dispatch())
    }
    return await handleSubscription(req, admin, sql, 'ecosystem', 'app_push_subscriptions', cors)
  } catch (error: any) {
    console.error('Push request failed', error?.statusCode || error?.code || 'internal')
    return Response.json({ error: 'Unable to process notifications. Please try again.' }, { status: 500, headers: cors })
  }
}
}
Deno.serve(async (req: Request) => {
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1, idle_timeout: 1, connect_timeout: 10 })
  try { return await createHandler(sql)(req) }
  finally { await sql.end({ timeout: 1 }) }
})
