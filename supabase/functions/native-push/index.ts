// native-push — APNs device registration for the NEXUS iOS app (production).
//
// Actions (POST JSON, signed-in NEXUS customer required):
//   register   { installationId, token, environment, bundleId } → { registered }
//   status     { installationId, token }                        → { enabled }
//   unregister { installationId }                               → { unregistered }
//   test       { installationId, token }                        → { sent }
//
// A customer can only register, read, remove or test their OWN installation.
// Business notifications are delivered by app-push?action=dispatch from the
// shared queue; this function never sends to another user's device.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.117.1'
import postgres from 'npm:postgres@3.4.5'
import { apnsConfig, sendApns, tokenHint } from '../_shared/apns.ts'

const allowedOrigins = new Set(['capacitor://localhost', 'https://nexus.sciencebyhugs.com'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APNS_TOKEN = /^[0-9a-f]{64,200}$/
// status runs whenever Account opens, so reads get their own, higher ceiling.
const LIMITS = { writes: 30, reads: 300, windowMinutes: 60, tests: 5, testMinutes: 10 }

type Body = { action?: unknown; installationId?: unknown; token?: unknown; environment?: unknown; bundleId?: unknown }

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || ''
  const cors = {
    ...(allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
  const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, publishableKeys.default, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'Invalid session' }, 401)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid request body' }, 400) }
  const action = String(body.action || '')
  const installationId = String(body.installationId || '')
  const token = String(body.token || '').trim().toLowerCase()
  if (!['register', 'status', 'unregister', 'test'].includes(action)) return json({ error: 'Unsupported action' }, 400)
  if (!UUID.test(installationId)) return json({ error: 'Invalid installation' }, 400)
  if (action !== 'unregister' && !APNS_TOKEN.test(token)) return json({ error: 'Invalid device token' }, 400)

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1, idle_timeout: 1, connect_timeout: 10 })
  const audit = (outcome: string, deviceId: string | null = null) =>
    sql`insert into private.native_push_audit (user_id, device_id, action, outcome, token_hint)
        values (${user.id}, ${deviceId}, ${action}, ${outcome}, ${token ? tokenHint(token) : null})`
  try {
    const [profile] = await sql`select 1 from public.profiles where auth_user_id = ${user.id} limit 1`
    if (!profile) { await audit('no_profile'); return json({ error: 'Customer profile not found' }, 403) }

    const [{ writes, reads, tests }] = await sql`
      select count(*) filter (where action <> 'status')::int as writes,
             count(*) filter (where action = 'status')::int as reads,
             count(*) filter (where action = 'test' and created_at > now() - make_interval(mins => ${LIMITS.testMinutes}))::int as tests
      from private.native_push_audit
      where user_id = ${user.id} and created_at > now() - make_interval(mins => ${LIMITS.windowMinutes})`
    const limited = action === 'status'
      ? reads >= LIMITS.reads
      : writes >= LIMITS.writes || (action === 'test' && tests >= LIMITS.tests)
    if (limited) {
      await audit('rate_limited')
      return json({ error: 'Too many notification requests. Try again in a few minutes.' }, 429)
    }

    if (action === 'register') {
      const environment = String(body.environment || '')
      const bundleId = String(body.bundleId || '')
      const config = apnsConfig()
      if (environment !== 'development' && environment !== 'production') {
        await audit('bad_environment'); return json({ error: 'Update the NEXUS app to enable notifications.' }, 400)
      }
      if (!config.bundleId || bundleId !== config.bundleId) {
        await audit('bad_bundle'); return json({ error: 'This app build cannot receive NEXUS notifications.' }, 400)
      }
      const [device] = await sql.begin(async tx => {
        // A token moves with the physical device: drop it from any other installation (e.g. reinstall).
        await tx`delete from public.native_push_devices where token = ${token} and installation_id <> ${installationId}`
        // Re-registering an installation under a new account (account switch) takes it over.
        return tx`
          insert into public.native_push_devices (user_id, installation_id, token, apns_environment, bundle_id)
          values (${user.id}, ${installationId}, ${token}, ${environment}, ${bundleId})
          on conflict (app, installation_id) do update
            set user_id = excluded.user_id, token = excluded.token, apns_environment = excluded.apns_environment,
                bundle_id = excluded.bundle_id, invalidated_at = null, updated_at = now()
          returning id`
      })
      await audit('ok', device.id)
      return json({ registered: true })
    }

    if (action === 'unregister') {
      const removed = await sql`
        delete from public.native_push_devices where installation_id = ${installationId} and user_id = ${user.id} returning id`
      await audit(removed.length ? 'ok' : 'not_found', removed[0]?.id ?? null)
      return json({ unregistered: true })
    }

    const [device] = await sql`
      select id, token, apns_environment from public.native_push_devices
      where installation_id = ${installationId} and user_id = ${user.id} and token = ${token} and invalidated_at is null`

    if (action === 'status') {
      await audit(device ? 'enabled' : 'disabled', device?.id ?? null)
      return json({ enabled: Boolean(device) })
    }

    // test
    if (!device) { await audit('not_found'); return json({ sent: false }) }
    if (!apnsConfig().configured) { await audit('not_configured', device.id); return json({ error: 'Notifications are not set up on the server yet.' }, 503) }
    const result = await sendApns(device, {
      title: 'NEXUS · Test notification',
      body: 'Notifications are working on this iPhone.',
      url: '?push=orders',
      tag: 'nexus-test',
    })
    if (!result.ok && result.invalidToken) {
      await sql`update public.native_push_devices set invalidated_at = now(), updated_at = now() where id = ${device.id}`
    }
    await sql`update public.native_push_devices set last_test_at = now() where id = ${device.id}`
    await audit(result.ok ? 'sent' : `failed:${result.reason}`, device.id)
    return json({ sent: result.ok })
  } catch (error) {
    console.error('native-push failed', (error as { code?: string })?.code || 'internal')
    return json({ error: 'Unable to update notifications. Please try again.' }, 500)
  } finally {
    await sql.end({ timeout: 1 })
  }
})
