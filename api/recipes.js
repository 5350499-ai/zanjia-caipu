const { encodeFilter, request } = require('../lib/supabase-server')
const { getSessionUser, readJson, sendJson } = require('../lib/server-auth')

function toClient(row) {
  return {
    id: /^\d+$/.test(row.id) ? Number(row.id) : row.id,
    name: row.name,
    categories: row.categories || [],
    ingredients: row.ingredients || [],
    seasonings: row.seasonings || [],
    steps: row.steps || [],
    tips: row.tips || '',
    notes: row.notes || [],
    image: null,
    imageId: row.image_id || null,
    imageVersion: row.image_version || null,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    familyId: row.family_id,
    isFamilyShared: Boolean(row.is_family_shared),
    createdByRole: row.created_by_role,
    lastViewedAt: row.last_viewed_at || null,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
  }
}

function toRow(recipe, user, existing = null) {
  const ownerId = existing?.author_user_id || recipe.authorUserId || user.id
  const ownerName = existing?.author_name || recipe.authorName || user.displayName
  return {
    id: String(recipe.id),
    name: String(recipe.name || '').trim(),
    categories: recipe.categories || [],
    ingredients: recipe.ingredients || [],
    seasonings: recipe.seasonings || [],
    steps: recipe.steps || [],
    tips: recipe.tips || '',
    notes: recipe.notes || [],
    image_id: recipe.imageId || null,
    image_version: recipe.imageVersion || null,
    author_user_id: ownerId,
    author_name: ownerName,
    family_id: existing?.family_id || recipe.familyId || user.familyId,
    is_family_shared: Boolean(recipe.isFamilyShared),
    created_by_role: existing?.created_by_role || recipe.createdByRole || user.role,
    last_viewed_at: recipe.lastViewedAt || null,
    created_at: existing?.created_at || recipe.createdAt || new Date().toISOString(),
    modified_at: new Date().toISOString(),
  }
}

async function loadVisibleRecipes(user) {
  const select = 'id,name,categories,ingredients,seasonings,steps,tips,notes,image_id,image_version,author_user_id,author_name,family_id,is_family_shared,created_by_role,last_viewed_at,created_at,modified_at'
  let query = `?family_id=eq.${encodeFilter(user.familyId)}&select=${select}&order=last_viewed_at.desc.nullslast&order=created_at.desc`
  if (user.role !== 'admin') {
    query += `&or=(author_user_id.eq.${encodeFilter(user.id)},is_family_shared.eq.true)`
  }
  const rows = await request('/rest/v1/recipes', { query })
  return rows.map(toClient)
}

async function findRecipe(id) {
  const rows = await request('/rest/v1/recipes', {
    query: `?id=eq.${encodeFilter(id)}&select=*`,
  })
  return rows?.[0] || null
}

function canEdit(user, row) {
  return user.role === 'admin' || row.author_user_id === user.id
}

module.exports = async function handler(requestMessage, response) {
  const user = getSessionUser(requestMessage)
  if (!user) return sendJson(response, 401, { error: 'Unauthorized' })

  if (requestMessage.method === 'GET') {
    const recipes = await loadVisibleRecipes(user)
    return sendJson(response, 200, { recipes })
  }

  if (requestMessage.method === 'POST') {
    const { recipe } = await readJson(requestMessage)
    if (!recipe?.id || !recipe?.name) return sendJson(response, 400, { error: '菜谱信息不完整' })
    const existing = await findRecipe(recipe.id)
    if (existing && !canEdit(user, existing)) return sendJson(response, 403, { error: '没有权限修改这个菜谱' })
    const row = toRow(recipe, user, existing)
    await request('/rest/v1/recipes?on_conflict=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(row),
    })
    return sendJson(response, 200, { recipe: toClient(row) })
  }

  if (requestMessage.method === 'DELETE') {
    const id = new URL(requestMessage.url, 'http://local').searchParams.get('id')
    const existing = id ? await findRecipe(id) : null
    if (!existing) return sendJson(response, 404, { error: '菜谱不存在' })
    if (!canEdit(user, existing)) return sendJson(response, 403, { error: '没有权限删除这个菜谱' })
    await request('/rest/v1/recipes', {
      method: 'DELETE',
      query: `?id=eq.${encodeFilter(id)}`,
      headers: { Prefer: 'return=minimal' },
    })
    return sendJson(response, 200, { ok: true })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
