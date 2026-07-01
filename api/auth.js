const { encodeFilter, hasDatabaseConfig, request } = require('../lib/supabase-server')
const { clearSessionCookie, createSessionCookie, getSessionUser, hasAuthConfig, passwordMatches, publicUser, readJson, sendJson } = require('../lib/server-auth')
const { verifySecret } = require('../lib/pin')

const FAMILY_ID = process.env.FAMILY_ID || 'family-main'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '5350499@qq.com').toLowerCase()
const ADMIN_NAME = process.env.ADMIN_NAME || '爸爸'

async function findProfileByLogin(loginCode) {
  const rows = await request('/rest/v1/family_profiles', {
    query: `?login_code=eq.${encodeFilter(loginCode)}&select=*`,
    headers: { Accept: 'application/json' },
  })
  return rows?.[0] || null
}

async function ensureAdminProfile() {
  let profile = await findProfileByLogin(ADMIN_EMAIL)
  if (profile) return profile
  const rows = await request('/rest/v1/family_profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      login_code: ADMIN_EMAIL,
      display_name: ADMIN_NAME,
      role: 'admin',
      family_id: FAMILY_ID,
      pin_hash: null,
      is_active: true,
    }),
  })
  return rows?.[0] || null
}

module.exports = async function handler(requestMessage, response) {
  if (!hasAuthConfig()) return sendJson(response, 503, { error: '管理员密码尚未配置' })
  if (!hasDatabaseConfig()) return sendJson(response, 503, { error: 'Supabase 服务端密钥尚未配置' })

  if (requestMessage.method === 'GET') {
    const user = getSessionUser(requestMessage)
    return sendJson(response, 200, { authenticated: Boolean(user), user: publicUser(user) })
  }

  if (requestMessage.method === 'POST') {
    const body = await readJson(requestMessage)
    const mode = body.mode || 'member'

    if (mode === 'admin') {
      const email = String(body.email || '').trim().toLowerCase()
      if (email !== ADMIN_EMAIL || !passwordMatches(body.password || '')) {
        return sendJson(response, 401, { error: '邮箱或密码不正确' })
      }
      const profile = await ensureAdminProfile()
      response.setHeader('Set-Cookie', createSessionCookie(requestMessage, profile))
      return sendJson(response, 200, { authenticated: true, user: publicUser(profile) })
    }

    const loginCode = String(body.loginCode || '').trim()
    const pin = String(body.pin || '')
    const profile = loginCode ? await findProfileByLogin(loginCode) : null
    if (!profile || profile.role !== 'member' || !profile.is_active || !verifySecret(pin, profile.pin_hash)) {
      return sendJson(response, 401, { error: '账号编号或 PIN 不正确' })
    }
    response.setHeader('Set-Cookie', createSessionCookie(requestMessage, profile))
    return sendJson(response, 200, { authenticated: true, user: publicUser(profile) })
  }

  if (requestMessage.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearSessionCookie(requestMessage))
    return sendJson(response, 200, { authenticated: false })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
