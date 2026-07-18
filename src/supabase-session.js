// Optional browser Supabase Auth session bridge. The recipe API continues to
// use the existing signed HttpOnly app cookie, while this client gives the
// PWA the same durable Supabase session behavior as the other 咱家 apps.
// Do not set `storageKey`: Supabase's default key is intentionally preserved.
let clientPromise = null

export const SUPABASE_AUTH_OPTIONS = Object.freeze({
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
})

export function initSupabaseSessionBridge() {
  if (clientPromise) return clientPromise
  clientPromise = (async () => {
    try {
      const configResponse = await fetch('/api/config', { credentials: 'same-origin', cache: 'no-store' })
      if (!configResponse.ok) return null
      const config = await configResponse.json()
      if (!config.supabaseUrl || !config.supabaseAnonKey) return null

      // Keep the static app dependency-free. The module is loaded lazily so a
      // CDN/network outage can never block the recipe UI or custom login.
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.52.0')
      const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: SUPABASE_AUTH_OPTIONS,
      })
      client.auth.onAuthStateChange((event) => {
        window.__zanjiaSupabaseAuthEvent = event
        if (event === 'SIGNED_OUT') window.dispatchEvent(new CustomEvent('zanjia-supabase-signed-out'))
      })
      // Initialization may briefly report null while localStorage is being
      // read. It is deliberately not used as an app logout signal.
      await client.auth.getSession().catch(() => null)
      return client
    } catch (error) {
      console.info('[supabase] persistent session bridge unavailable', error)
      return null
    }
  })()
  return clientPromise
}
