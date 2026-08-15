const { encodeFilter, request } = require('./supabase-server')

const FAMILY_TIME_ZONE = 'Europe/Madrid'
const DAILY_COOK_SOURCES = new Set(['manual', 'recipe_created_with_image', 'recipe_first_image_added'])

function madridDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FAMILY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function canViewRecipe(user, recipe) {
  if (!user || !recipe || recipe.family_id !== user.familyId) return false
  if (user.role === 'guest') return Boolean(recipe.is_family_shared)
  return user.role === 'admin' || recipe.author_user_id === user.id || Boolean(recipe.is_family_shared)
}

async function listFamilyEvents(familyId) {
  return request('/rest/v1/recipe_cook_events', {
    query: `?family_id=eq.${encodeFilter(familyId)}&select=id,recipe_id,family_id,user_id,cooked_on,source,created_at&order=cooked_on.desc,created_at.desc`,
  })
}

async function countRecipeEvents(recipeId) {
  const rows = await request('/rest/v1/recipe_cook_events', {
    query: `?recipe_id=eq.${encodeFilter(recipeId)}&select=id,cooked_on,created_at&order=cooked_on.desc,created_at.desc`,
  })
  return {
    count: rows.length,
    lastCookedAt: rows[0]?.cooked_on || null,
  }
}

async function ensureFirstCookEventForImageRecipe(recipe) {
  if (!recipe?.id || !recipe.image_id) return null
  const existing = await request('/rest/v1/recipe_cook_events', {
    query: `?recipe_id=eq.${encodeFilter(recipe.id)}&select=id,source&limit=1`,
  })
  if (existing.length) return existing[0]
  try {
    const rows = await request('/rest/v1/recipe_cook_events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        recipe_id: String(recipe.id),
        family_id: recipe.family_id,
        user_id: recipe.user_id || null,
        cooked_on: madridDate(),
        source: 'recipe_created_with_image',
      }),
    })
    return rows?.[0] || null
  } catch (error) {
    if (error.status === 409) return null
    throw error
  }
}

function buildMonthlyRanking(recipes, events, month) {
  return buildRanking(recipes, events, { period: 'month', year: Number(String(month).slice(0, 4)), month: Number(String(month).slice(5, 7)) })
}

function inPeriod(dateValue, period = 'all', year, month) {
  if (period === 'all') return true
  const value = String(dateValue || '')
  if (period === 'year') return value.startsWith(`${year}-`)
  return value.startsWith(`${year}-${String(month).padStart(2, '0')}-`)
}

function buildRanking(recipes, events, { period = 'all', year, month } = {}) {
  const byId = new Map(recipes.map(recipe => [String(recipe.id), recipe]))
  const grouped = new Map()
  events.filter(event => inPeriod(event.cooked_on, period, year, month)).forEach(event => {
    const recipe = byId.get(String(event.recipe_id))
    if (!recipe) return
    const current = grouped.get(String(event.recipe_id)) || { recipeId: recipe.id, name: recipe.name, count: 0, lastCookedOn: null, lastCreatedAt: null, createdAt: recipe.created_at }
    current.count += 1
    if (!current.lastCookedOn || String(event.cooked_on) > String(current.lastCookedOn) || (String(event.cooked_on) === String(current.lastCookedOn) && String(event.created_at) > String(current.lastCreatedAt || ''))) {
      current.lastCookedOn = event.cooked_on
      current.lastCreatedAt = event.created_at
    }
    grouped.set(String(event.recipe_id), current)
  })
  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || String(b.lastCookedOn || '').localeCompare(String(a.lastCookedOn || '')) || String(b.lastCreatedAt || '').localeCompare(String(a.lastCreatedAt || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(a.name).localeCompare(String(b.name)))
    .slice(0, 10)
}

function buildFamilyStats(members, recipes, events, { period = 'all', year, month } = {}) {
  const memberRows = members.map(member => ({ userId: member.id, name: member.display_name || '家庭成员', cookCount: 0, recipeCount: 0 }))
  const byId = new Map(memberRows.map(member => [String(member.userId), member]))
  recipes.forEach(recipe => {
    const member = byId.get(String(recipe.author_user_id || ''))
    if (member && (period === 'all' || inPeriod(madridDate(recipe.created_at), period, year, month))) member.recipeCount += 1
  })
  events.forEach(event => {
    const recipe = recipes.find(item => String(item.id) === String(event.recipe_id))
    const effectiveUserId = event.source === 'initial_image_baseline' ? recipe?.author_user_id : event.user_id
    const member = byId.get(String(effectiveUserId || ''))
    if (member && inPeriod(event.cooked_on, period, year, month)) member.cookCount += 1
  })
  return memberRows
}

function buildAnnualCookingTrend(members, recipes, events, { year, currentYear, currentMonth } = {}) {
  const targetYear = Number(year)
  const nowYear = Number(currentYear)
  const nowMonth = Number(currentMonth)
  const rows = members.map(member => ({
    userId: member.id,
    name: member.display_name || '家庭成员',
    months: Array.from({ length: 12 }, (_, index) => (targetYear === nowYear && index + 1 > nowMonth) ? null : 0),
  }))
  const byId = new Map(rows.map(row => [String(row.userId), row]))
  const recipeById = new Map(recipes.map(recipe => [String(recipe.id), recipe]))
  events.forEach(event => {
    const cookedOn = String(event.cooked_on || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cookedOn) || Number(cookedOn.slice(0, 4)) !== targetYear) return
    const recipe = recipeById.get(String(event.recipe_id))
    const effectiveUserId = event.source === 'initial_image_baseline' ? recipe?.author_user_id : event.user_id
    const row = byId.get(String(effectiveUserId || ''))
    const month = Number(cookedOn.slice(5, 7))
    if (!row || month < 1 || month > 12 || row.months[month - 1] === null) return
    row.months[month - 1] += 1
  })
  return rows
}

const ensureImageBaseline = ensureFirstCookEventForImageRecipe

module.exports = { DAILY_COOK_SOURCES, FAMILY_TIME_ZONE, madridDate, canViewRecipe, listFamilyEvents, countRecipeEvents, ensureFirstCookEventForImageRecipe, ensureImageBaseline, buildMonthlyRanking, buildRanking, buildFamilyStats, buildAnnualCookingTrend }
