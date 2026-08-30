const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
let pgPool = null

function directDatabase() { return process.env.DATABASE_URL || '' }
function pg() {
  if (!pgPool) {
    const { Pool } = require('pg')
    pgPool = new Pool({ connectionString: directDatabase(), max: 5, idleTimeoutMillis: 10000 })
  }
  return pgPool
}

function hasDatabaseConfig() {
  return Boolean(directDatabase() || (SUPABASE_URL && SUPABASE_KEY))
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
  if (directDatabase()) return requestDirect(path, options)
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

function ident(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('Invalid database identifier')
  return `"${value}"`
}

function parseDirectPath(path, query = '') {
  const [rawPath, inlineQuery = ''] = String(path).split('?')
  const table = rawPath.replace(/^\/rest\/v1\//, '')
  if (!table || table.includes('/')) throw new Error('Invalid database path')
  return { table: ident(table), params: new URLSearchParams(`${inlineQuery}${inlineQuery && query ? '&' : ''}${query.replace(/^\?/, '')}`) }
}

function whereClause(params, values) {
  const clauses = []
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'or'].includes(key)) continue
    const match = String(value).match(/^eq\.(.*)$/)
    if (!match) continue
    const field = ident(key); values.push(decodeURIComponent(match[1])); clauses.push(`${field} = $${values.length}`)
  }
  if (params.has('or')) {
    const raw = params.get('or') || ''
    const ors = [...raw.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\.eq\.([^,\)]+)/g)]
      .map(([, key, value]) => { values.push(decodeURIComponent(value)); return `${ident(key)} = $${values.length}` })
    if (ors.length) clauses.push(`(${ors.join(' OR ')})`)
  }
  return clauses.length ? ` where ${clauses.join(' and ')}` : ''
}

async function requestDirect(path, options = {}) {
  const { table, params } = parseDirectPath(path, options.query || '')
  const method = String(options.method || 'GET').toUpperCase()
  const values = []
  const where = whereClause(params, values)
  if (method === 'GET') {
    const select = (params.get('select') || '*').split(',').map(item => item.trim() === '*' ? '*' : ident(item.trim())).join(',')
    const order = params.get('order') ? ` order by ${params.get('order').split(',').map(part => { const [field, dir] = part.split('.'); return `${ident(field)} ${dir === 'desc' ? 'desc' : 'asc'}` }).join(', ')}` : ''
    const limit = params.get('limit') ? ` limit ${Math.max(0, Number(params.get('limit')) || 0)}` : ''
    const offset = params.get('offset') ? ` offset ${Math.max(0, Number(params.get('offset')) || 0)}` : ''
    return (await pg().query(`select ${select} from public.${table}${where}${order}${limit}${offset}`, values)).rows
  }
  let body = options.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const rows = Array.isArray(body) ? body : [body || {}]
  if (method === 'POST') {
    if (!rows.length) return []
    const columns = Object.keys(rows[0]).map(ident)
    const tuples = []; const bind = []
    rows.forEach(row => { tuples.push(`(${columns.map(col => { const key = col.slice(1, -1); bind.push(row[key] ?? null); return `$${bind.length}` }).join(',')})`) })
    const conflict = params.get('on_conflict') || 'id'
    const sql = `insert into public.${table} (${columns.join(',')}) values ${tuples.join(',')} on conflict (${ident(conflict)}) do update set ${columns.filter(col => col !== ident(conflict)).map(col => `${col}=excluded.${col}`).join(', ')}${String(options.headers?.Prefer || '').includes('representation') || String(options.headers?.Prefer || '').includes('resolution') ? ' returning *' : ''}`
    return (await pg().query(sql, bind)).rows
  }
  if (method === 'PATCH') {
    const entries = Object.entries(rows[0] || {}); const sets = entries.map(([key, value]) => { values.push(value); return `${ident(key)} = $${values.length}` })
    const result = await pg().query(`update public.${table} set ${sets.join(', ')}${where}${String(options.headers?.Prefer || '').includes('representation') ? ' returning *' : ''}`, values)
    return result.rows
  }
  if (method === 'DELETE') { await pg().query(`delete from public.${table}${where}`, values); return [] }
  throw new Error(`Unsupported direct database method: ${method}`)
}

function encodeFilter(value) {
  return encodeURIComponent(String(value))
}

module.exports = { encodeFilter, hasDatabaseConfig, request, SUPABASE_URL }
