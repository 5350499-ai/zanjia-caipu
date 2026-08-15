const { encodeFilter, request } = require('../lib/supabase-server')
const { getSessionUser, readJson, sendJson } = require('../lib/server-auth')
const { DAILY_COOK_SOURCES, canViewRecipe, countRecipeEvents, listFamilyEvents, madridDate, buildMonthlyRanking, buildRanking, buildFamilyStats, buildAnnualCookingTrend } = require('../lib/cook-events')

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

async function findRecipe(recipeId) {
  const rows = await request('/rest/v1/recipes', {
    query: `?id=eq.${encodeFilter(recipeId)}&select=id,name,author_user_id,family_id,is_family_shared,created_at`,
  })
  return rows?.[0] || null
}

async function visibleRecipes(user) {
  const rows = await request('/rest/v1/recipes', {
    query: `?family_id=eq.${encodeFilter(user.familyId)}&select=id,name,author_user_id,family_id,is_family_shared,created_at`,
  })
  return rows.filter(recipe => canViewRecipe(user, recipe))
}

module.exports = async function handler(requestMessage, response) {
  const user = getSessionUser(requestMessage)
  if (!user) return sendJson(response, 401, { error: 'Unauthorized' })

  const url = new URL(requestMessage.url, 'http://local')
  const recipeId = url.searchParams.get('recipeId')
  const action = url.searchParams.get('action')
  const period = ['all', 'year', 'month'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'month'
  const now = madridDate()
  const requestedYear = Number(url.searchParams.get('year') || now.slice(0, 4))
  const requestedMonth = Number(url.searchParams.get('month') || now.slice(5, 7))
  const currentYear = Number(now.slice(0, 4))
  const currentMonth = Number(now.slice(5, 7))
  const year = Math.min(Math.max(requestedYear, 2000), currentYear)
  const month = Math.min(Math.max(requestedMonth, 1), year === currentYear ? currentMonth : 12)

  if (requestMessage.method === 'GET') {
    const recipes = await visibleRecipes(user)
    const events = await listFamilyEvents(user.familyId)
    const visibleIds = new Set(recipes.map(recipe => String(recipe.id)))
    const visibleEvents = events.filter(event => visibleIds.has(String(event.recipe_id)))
    if (action === 'ranking') {
      return sendJson(response, 200, { rankings: buildRanking(recipes, visibleEvents, { period, year, month }), period, year: period === 'all' ? null : year, month: period === 'month' ? month : null })
    }
    if (action === 'family-trend') {
      if (user.role === 'guest') return sendJson(response, 200, { visible: false, year, members: [] })
      const members = await request('/rest/v1/family_profiles', { query: `?family_id=eq.${encodeFilter(user.familyId)}&is_active=eq.true&select=id,display_name&order=created_at.asc` })
      const familyRecipes = await request('/rest/v1/recipes', { query: `?family_id=eq.${encodeFilter(user.familyId)}&select=id,author_user_id` })
      return sendJson(response, 200, { visible: true, year, members: buildAnnualCookingTrend(members, familyRecipes, events, { year, currentYear, currentMonth }) })
    }
    if (action === 'family-stats') {
      if (user.role === 'guest') return sendJson(response, 200, { visible: false, period, year: period === 'all' ? null : year, month: period === 'month' ? month : null, members: [] })
      const members = await request('/rest/v1/family_profiles', { query: `?family_id=eq.${encodeFilter(user.familyId)}&is_active=eq.true&select=id,display_name&order=created_at.asc` })
      const familyRecipes = await request('/rest/v1/recipes', { query: `?family_id=eq.${encodeFilter(user.familyId)}&select=id,author_user_id,created_at` })
      return sendJson(response, 200, { visible: true, period, year: period === 'all' ? null : year, month: period === 'month' ? month : null, members: buildFamilyStats(members, familyRecipes, events, { period, year, month }) })
    }
    if (recipeId) {
      const recipe = recipes.find(item => String(item.id) === String(recipeId))
      if (!recipe) return sendJson(response, 403, { error: '无权查看这道菜的做菜记录' })
      const detailEvents = visibleEvents.filter(event => String(event.recipe_id) === String(recipeId))
      const today = madridDate()
      return sendJson(response, 200, { events: detailEvents, count: detailEvents.length, lastCookedOn: detailEvents[0]?.cooked_on || null, todayRecorded: detailEvents.some(event => event.cooked_on === today && DAILY_COOK_SOURCES.has(event.source)) })
    }
    const current = madridDate().slice(0, 7)
    const rankings = buildMonthlyRanking(recipes, visibleEvents, current)
    return sendJson(response, 200, { rankings, month: current })
  }

  if (user.role === 'guest') return sendJson(response, 403, { error: '游客不能记录做菜' })

  if (requestMessage.method === 'POST') {
    const body = await readJson(requestMessage)
    const recipe = recipeId ? await findRecipe(recipeId) : null
    if (!recipe || !canViewRecipe(user, recipe)) return sendJson(response, 403, { error: '无权记录这道菜' })
    const cookedOn = body?.cookedOn || madridDate()
    if (!validDate(cookedOn)) return sendJson(response, 400, { error: '做菜日期格式不正确' })
    const existing = await request('/rest/v1/recipe_cook_events', {
      query: `?recipe_id=eq.${encodeFilter(recipeId)}&cooked_on=eq.${encodeFilter(cookedOn)}&source=eq.manual&select=id&limit=1`,
    })
    if (existing.length) return sendJson(response, 200, { duplicate: true, message: '今天已经记录过这道菜了', eventId: existing[0].id, ...(await countRecipeEvents(recipeId)) })
    let rows
    try {
      rows = await request('/rest/v1/recipe_cook_events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ recipe_id: String(recipeId), family_id: recipe.family_id, user_id: user.id, cooked_on: cookedOn, source: 'manual' }),
      })
    } catch (error) {
      if (error.status === 409) return sendJson(response, 200, { duplicate: true, message: '今天已经记录过这道菜了', ...(await countRecipeEvents(recipeId)) })
      throw error
    }
    const summary = await countRecipeEvents(recipeId)
    await request(`/rest/v1/recipes?id=eq.${encodeFilter(recipeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ cook_count: summary.count, last_cooked_at: summary.lastCookedAt }),
    })
    return sendJson(response, 200, { duplicate: false, event: rows?.[0] || null, ...summary })
  }

  if (requestMessage.method === 'DELETE') {
    const eventId = url.searchParams.get('eventId')
    if (!eventId) return sendJson(response, 400, { error: '缺少做菜记录编号' })
    const rows = await request('/rest/v1/recipe_cook_events', {
      query: `?id=eq.${encodeFilter(eventId)}&select=id,recipe_id,user_id,source`,
    })
    const event = rows?.[0]
    const recipe = event ? await findRecipe(event.recipe_id) : null
    if (!event || !recipe || !canViewRecipe(user, recipe) || (event.source === 'manual' && user.role !== 'admin' && event.user_id !== user.id)) return sendJson(response, 403, { error: '无权删除这条做菜记录' })
    await request(`/rest/v1/recipe_cook_events?id=eq.${encodeFilter(eventId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    const summary = await countRecipeEvents(event.recipe_id)
    await request(`/rest/v1/recipes?id=eq.${encodeFilter(event.recipe_id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ cook_count: summary.count, last_cooked_at: summary.lastCookedAt }) })
    return sendJson(response, 200, { ok: true, ...summary })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
