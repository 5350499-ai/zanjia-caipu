const { encodeFilter, request } = require('../lib/supabase-server')
const { getSessionUser, readJson, sendJson } = require('../lib/server-auth')
const { buildMonthlyRanking, countRecipeEvents, ensureImageBaseline, listFamilyEvents, madridDate } = require('../lib/cook-events')
const { deleteImageIfUnreferenced } = require('../lib/storage-images')

function mergeMaterialLines(...values) {
  const seen = new Set()
  const merged = []
  values.flatMap(value => {
    if (Array.isArray(value)) return value.flatMap(item => String(item ?? '').split(/\r?\n/))
    return String(value ?? '').split(/\r?\n/)
  }).forEach(value => {
    const line = String(value || '').trim()
    if (!line || seen.has(line)) return
    seen.add(line)
    merged.push(line)
  })
  return merged
}

function toClient(row, summary = null) {
  return {
    id: /^\d+$/.test(row.id) ? Number(row.id) : row.id,
    name: row.name,
    categories: row.categories || [],
    ingredients: mergeMaterialLines(row.ingredients, row.seasonings),
    // Retain the legacy response field for old clients, but keep it empty so
    // the new UI has one canonical materials list and cannot render a second
    // 调料 section.
    seasonings: [],
    steps: row.steps || [],
    tips: row.tips || '',
    notes: row.notes || [],
    tags: row.tags || [],
    favoriteUserIds: row.favorite_user_ids || [],
    cookRecords: row.cook_records || [],
    cookCount: summary ? summary.count : (row.cook_count || 0),
    lastCookedAt: summary ? summary.lastCookedAt : (row.last_cooked_at || null),
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
  const ownerId = existing?.author_user_id || user.id
  const ownerName = existing?.author_name || user.displayName
  return {
    id: String(recipe.id),
    name: String(recipe.name || '').trim(),
    categories: recipe.categories || [],
    ingredients: mergeMaterialLines(recipe.ingredients, recipe.seasonings, existing?.seasonings),
    // Keep the column for backwards-compatible database/API payloads. New
    // writes always clear it after folding its values into ingredients.
    seasonings: [],
    steps: recipe.steps || [],
    tips: recipe.tips || '',
    notes: recipe.notes || [],
    tags: recipe.tags || [],
    favorite_user_ids: recipe.favoriteUserIds || [],
    cook_records: recipe.cookRecords || [],
    cook_count: existing ? Number(existing.cook_count || 0) : Number(recipe.cookCount || 0),
    last_cooked_at: existing ? (existing.last_cooked_at || null) : (recipe.lastCookedAt || null),
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
  const select = 'id,name,categories,ingredients,seasonings,steps,tips,notes,tags,favorite_user_ids,cook_records,cook_count,last_cooked_at,image_id,image_version,author_user_id,author_name,family_id,is_family_shared,created_by_role,last_viewed_at,created_at,modified_at'
  // UI sorting is per-device and per-user; do not use the legacy global last_viewed_at field.
  let query = `?family_id=eq.${encodeFilter(user.familyId)}&select=${select}&order=created_at.desc`
  if (user.role === 'guest') {
    query += `&is_family_shared=eq.true`
  } else if (user.role !== 'admin') {
    query += `&or=(author_user_id.eq.${encodeFilter(user.id)},is_family_shared.eq.true)`
  }
  const rows = await request('/rest/v1/recipes', { query })
  const events = await listFamilyEvents(user.familyId)
  const visibleIds = new Set(rows.map(row => String(row.id)))
  const visibleEvents = events.filter(event => visibleIds.has(String(event.recipe_id)))
  const summaries = new Map()
  visibleEvents.forEach(event => {
    const summary = summaries.get(String(event.recipe_id)) || { count: 0, lastCookedAt: null }
    summary.count += 1
    if (!summary.lastCookedAt || String(event.cooked_on) > String(summary.lastCookedAt)) summary.lastCookedAt = event.cooked_on
    summaries.set(String(event.recipe_id), summary)
  })
  const month = madridDate().slice(0, 7)
  return {
    recipes: rows.map(row => toClient(row, summaries.get(String(row.id)) || { count: 0, lastCookedAt: null })),
    monthlyRanking: buildMonthlyRanking(rows, visibleEvents, month),
  }
}

async function loadFamilyStats(user) {
  if (user.role === 'guest') return { memberCount: 0 }
  const members = await request('/rest/v1/family_profiles', {
    query: `?family_id=eq.${encodeFilter(user.familyId)}&select=id`,
  })
  return { memberCount: members.length }
}

async function findRecipe(id) {
  const rows = await request('/rest/v1/recipes', {
    query: `?id=eq.${encodeFilter(id)}&select=*`,
  })
  return rows?.[0] || null
}

function canEdit(user, row) {
  return user.role === 'admin' || (user.role !== 'guest' && row.author_user_id === user.id)
}

function requestIdOf(requestMessage) {
  return String(requestMessage.headers['x-request-id'] || '').slice(0, 120) || null
}

function logRecipeStage(stage, details = {}) {
  console.info(JSON.stringify({ stage, ...details }))
}

module.exports = async function handler(requestMessage, response) {
  const user = getSessionUser(requestMessage)
  if (!user) return sendJson(response, 401, { error: 'Unauthorized' })

  if (requestMessage.method === 'GET') {
    const { recipes, monthlyRanking } = await loadVisibleRecipes(user)
    const stats = await loadFamilyStats(user)
    return sendJson(response, 200, { recipes, stats, monthlyRanking })
  }

  if (user.role === 'guest') {
    return sendJson(response, 403, { error: 'Guest users cannot modify recipes' })
  }

  if (requestMessage.method === 'POST') {
    const requestId = requestIdOf(requestMessage)
    const { recipe } = await readJson(requestMessage)
    if (!recipe?.id || !recipe?.name) return sendJson(response, 400, { error: 'Recipe payload is incomplete' })
    const existing = await findRecipe(recipe.id)
    if (existing && !canEdit(user, existing)) return sendJson(response, 403, { error: '没有权限修改这个菜谱' })
    const row = toRow(recipe, user, existing)
    logRecipeStage('RECIPE_SAVE_START', { requestId, recipeId: row.id, imageId: row.image_id || null })
    try {
      await request('/rest/v1/recipes?on_conflict=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(row),
      })
    } catch (error) {
      logRecipeStage('RECIPE_SAVE_FAILED', { requestId, recipeId: row.id, imageId: row.image_id || null, status: error.status || null, error: error.message })
      return sendJson(response, 503, { error: '菜谱保存失败，请重试', stage: 'RECIPE_SAVE_FAILED', requestId })
    }
    if (row.image_id) {
      let bound
      try {
        bound = (await request('/rest/v1/recipes', { query: `?id=eq.${encodeFilter(row.id)}&select=id,image_id,image_version` }))?.[0]
      } catch (error) {
        logRecipeStage('IMAGE_BIND_FAILED', { requestId, recipeId: row.id, imageId: row.image_id, status: error.status || null, error: error.message })
        return sendJson(response, 503, { error: '菜谱已提交，但图片绑定状态待确认，请刷新后检查。', imageBindUnknown: true, requestId })
      }
      if (!bound || bound.image_id !== row.image_id) {
        logRecipeStage('IMAGE_BIND_FAILED', { requestId, recipeId: row.id, imageId: row.image_id, status: 409, error: 'image_id binding mismatch' })
        return sendJson(response, 409, { error: '图片绑定未确认，请刷新后重试。', imageBindUnknown: true, requestId })
      }
      logRecipeStage('IMAGE_BIND_CONFIRMED', { requestId, recipeId: row.id, imageId: row.image_id, status: 200 })
    }
    if (row.image_id) {
      logRecipeStage('FIRST_COOK_EVENT_ENSURE', { requestId, recipeId: row.id, imageId: row.image_id })
      let cookEventPending = false
      try {
        await ensureImageBaseline({ id: row.id, image_id: row.image_id, family_id: row.family_id, user_id: user.id })
      } catch (error) {
        cookEventPending = true
        logRecipeStage('COOK_EVENT_SYNC_FAILED', { requestId, recipeId: row.id, imageId: row.image_id, status: error.status || null, error: error.message })
      }
      let summary = { count: Number(row.cook_count || 0), lastCookedAt: row.last_cooked_at || null }
      try {
        summary = await countRecipeEvents(row.id)
        row.cook_count = summary.count
        row.last_cooked_at = summary.lastCookedAt
        await request(`/rest/v1/recipes?id=eq.${encodeFilter(row.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ cook_count: summary.count, last_cooked_at: summary.lastCookedAt }),
        })
      } catch (error) {
        cookEventPending = true
        logRecipeStage('COOK_EVENT_SYNC_FAILED', { requestId, recipeId: row.id, imageId: row.image_id, status: error.status || null, error: error.message })
      }
      logRecipeStage('RECIPE_SAVE_SUCCESS', { requestId, recipeId: row.id, imageId: row.image_id, status: 200, cookEventPending })
      return sendJson(response, 200, { recipe: toClient(row, summary), cookEventPending })
    }
    return sendJson(response, 200, { recipe: toClient(row, { count: 0, lastCookedAt: null }) })
  }

  if (requestMessage.method === 'DELETE') {
    const id = new URL(requestMessage.url, 'http://local').searchParams.get('id')
    const existing = id ? await findRecipe(id) : null
    if (!existing) return sendJson(response, 404, { error: 'Recipe not found' })
    if (!canEdit(user, existing)) return sendJson(response, 403, { error: '没有权限删除这个菜谱' })
    const imageIds = [existing.image_id, ...(existing.cook_records || []).map(record => record?.imageId || record?.image_id)].filter(Boolean)
    await request('/rest/v1/recipes', {
      method: 'DELETE',
      query: `?id=eq.${encodeFilter(id)}`,
      headers: { Prefer: 'return=minimal' },
    })
    const cleanupErrors = []
    for (const imageId of imageIds) {
      try { await deleteImageIfUnreferenced(imageId) } catch (error) {
        console.error('recipe delete image cleanup failed', { recipeId: id, imageId, error: error.message })
        cleanupErrors.push(imageId)
      }
    }
    return sendJson(response, 200, { ok: true, cleanupPending: cleanupErrors.length > 0, cleanupErrors: cleanupErrors.length })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
