const { isAuthorized, sendJson } = require('../lib/server-auth')

module.exports = function handler(request, response) {
  // The anon/publishable key is safe to expose to browsers. The service-role
  // key remains server-only and is never returned here.
  return sendJson(response, 200, {
    ok: true,
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    authenticated: isAuthorized(request),
  })
}
