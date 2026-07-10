const { encodeFilter, request } = require('../lib/supabase-server')
const { getSessionUser, readJson, sendJson } = require('../lib/server-auth')
const crypto = require('crypto')

async function findRecipe(recipeId) {
  const rows = await request('/rest/v1/recipes', {
    query: `?id=eq.${encodeFilter(recipeId)}&select=id,name,author_user_id,family_id,is_family_shared`,
  })
  return rows?.[0] || null
}

function canReadRecipe(user, recipe) {
  if (!recipe) return false
  if (recipe.family_id !== user.familyId) return false
  if (user.role === 'admin') return true
  if (user.role === 'guest') return Boolean(recipe.is_family_shared)
  return recipe.author_user_id === user.id || recipe.is_family_shared
}

function canManageComments(user, recipe) {
  return user.role === 'admin' || recipe.author_user_id === user.id
}

async function loadComments(recipeId) {
  const rows = await request('/rest/v1/guest_comments', {
    query: `?recipe_id=eq.${encodeFilter(recipeId)}&select=id,recipe_id,guest_name,content,created_at,ip_hash,user_agent_hash&order=created_at.desc`,
  })
  return rows || []
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

module.exports = async function handler(requestMessage, response) {
  const user = getSessionUser(requestMessage)
  if (!user) return sendJson(response, 401, { error: 'Unauthorized' })

  const url = new URL(requestMessage.url, 'http://local')
  const recipeId = String(url.searchParams.get('recipeId') || '').trim()
  if (!recipeId) return sendJson(response, 400, { error: 'Missing recipeId' })

  const recipe = await findRecipe(recipeId)
  if (!canReadRecipe(user, recipe)) return sendJson(response, 403, { error: 'No access to this recipe' })

  if (requestMessage.method === 'GET') {
    const comments = await loadComments(recipeId)
    return sendJson(response, 200, { comments })
  }

  if (requestMessage.method === 'POST') {
    const body = await readJson(requestMessage)
    const guestName = String(body.guestName || '').trim()
    const content = String(body.content || '').trim()
    if (!guestName || !content) return sendJson(response, 400, { error: '昵称和留言不能为空' })
    if (content.length > 300) return sendJson(response, 400, { error: '留言最多 300 字' })
    const rows = await request('/rest/v1/guest_comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        recipe_id: recipeId,
        guest_name: guestName.slice(0, 60),
        content: content.slice(0, 300),
        ip_hash: hashValue(requestMessage.headers['x-forwarded-for'] || requestMessage.socket?.remoteAddress || ''),
        user_agent_hash: hashValue(requestMessage.headers['user-agent'] || ''),
      }),
    })
    return sendJson(response, 200, { comment: rows?.[0] || null })
  }

  if (requestMessage.method === 'DELETE') {
    if (!canManageComments(user, recipe)) return sendJson(response, 403, { error: 'No permission to delete comments' })
    const commentId = String(url.searchParams.get('id') || '').trim()
    if (!commentId) return sendJson(response, 400, { error: 'Missing comment id' })
    await request('/rest/v1/guest_comments', {
      method: 'DELETE',
      query: `?id=eq.${encodeFilter(commentId)}&recipe_id=eq.${encodeFilter(recipeId)}`,
      headers: { Prefer: 'return=minimal' },
    })
    return sendJson(response, 200, { ok: true })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
