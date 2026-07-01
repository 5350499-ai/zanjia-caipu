const { encodeFilter, request } = require('../lib/supabase-server')
const { getSessionUser, readJson, sendJson } = require('../lib/server-auth')
const { hashSecret } = require('../lib/pin')

function publicMember(row) {
  return {
    id: row.id,
    loginCode: row.login_code,
    displayName: row.display_name,
    role: row.role,
    familyId: row.family_id,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  }
}

function requireAdmin(requestMessage, response) {
  const user = getSessionUser(requestMessage)
  if (!user) {
    sendJson(response, 401, { error: 'Unauthorized' })
    return null
  }
  if (user.role !== 'admin') {
    sendJson(response, 403, { error: '只有管理员可以管理家庭成员账号' })
    return null
  }
  return user
}

async function findMember(id, familyId) {
  const rows = await request('/rest/v1/family_profiles', {
    query: `?id=eq.${encodeFilter(id)}&family_id=eq.${encodeFilter(familyId)}&select=*`,
  })
  return rows?.[0] || null
}

module.exports = async function handler(requestMessage, response) {
  const user = requireAdmin(requestMessage, response)
  if (!user) return

  if (requestMessage.method === 'GET') {
    const rows = await request('/rest/v1/family_profiles', {
      query: `?family_id=eq.${encodeFilter(user.familyId)}&select=id,login_code,display_name,role,family_id,is_active,created_at&order=created_at.asc`,
    })
    return sendJson(response, 200, { members: rows.map(publicMember) })
  }

  if (requestMessage.method === 'POST') {
    const body = await readJson(requestMessage)
    const loginCode = String(body.loginCode || '').trim()
    const displayName = String(body.displayName || '').trim()
    const pin = String(body.pin || '')
    if (!loginCode || !displayName || pin.length < 4) return sendJson(response, 400, { error: '账号编号、名称和至少 4 位 PIN 必填' })
    const rows = await request('/rest/v1/family_profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        login_code: loginCode,
        display_name: displayName,
        role: 'member',
        family_id: user.familyId,
        pin_hash: hashSecret(pin),
        is_active: true,
      }),
    })
    return sendJson(response, 200, { member: publicMember(rows[0]) })
  }

  if (requestMessage.method === 'PATCH') {
    const body = await readJson(requestMessage)
    const id = String(body.id || '')
    const existing = id ? await findMember(id, user.familyId) : null
    if (!existing) return sendJson(response, 404, { error: '成员账号不存在' })
    const updates = {}
    if (body.displayName !== undefined) updates.display_name = String(body.displayName || '').trim()
    if (body.pin) updates.pin_hash = hashSecret(String(body.pin))
    if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive)
    const rows = await request('/rest/v1/family_profiles', {
      method: 'PATCH',
      query: `?id=eq.${encodeFilter(id)}&family_id=eq.${encodeFilter(user.familyId)}`,
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    })
    return sendJson(response, 200, { member: publicMember(rows[0]) })
  }

  if (requestMessage.method === 'DELETE') {
    const id = new URL(requestMessage.url, 'http://local').searchParams.get('id')
    const existing = id ? await findMember(id, user.familyId) : null
    if (!existing) return sendJson(response, 404, { error: '成员账号不存在' })
    if (existing.role === 'admin') return sendJson(response, 400, { error: '不能删除管理员账号' })
    await request('/rest/v1/family_profiles', {
      method: 'DELETE',
      query: `?id=eq.${encodeFilter(id)}&family_id=eq.${encodeFilter(user.familyId)}`,
      headers: { Prefer: 'return=minimal' },
    })
    return sendJson(response, 200, { ok: true })
  }

  response.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
