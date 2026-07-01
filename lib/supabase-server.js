const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

function hasDatabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY)
}

function endpoint(path, query = '') {
  return `${SUPABASE_URL}${path}${query}`
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  }
}

async function request(path, options = {}) {
  if (!hasDatabaseConfig()) throw new Error('Supabase service role key is not configured')
  const response = await fetch(endpoint(path, options.query || ''), {
    ...options,
    headers: headers(options.headers || {}),
  })
  const text = await response.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!response.ok) {
    const error = new Error(`Supabase request failed: ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

function encodeFilter(value) {
  return encodeURIComponent(String(value))
}

module.exports = { encodeFilter, hasDatabaseConfig, request, SUPABASE_URL }
