const { encodeFilter, request } = require('./supabase-server')

const FAMILY_TIME_ZONE = 'Europe/Madrid'

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

async function ensureImageBaseline(recipe) {
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
        user_id: null,
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
  const byId = new Map(recipes.map(recipe => [String(recipe.id), recipe]))
  const grouped = new Map()
  events.filter(event => String(event.cooked_on || '').startsWith(month)).forEach(event => {
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
    .slice(0, 5)
}

module.exports = { FAMILY_TIME_ZONE, madridDate, canViewRecipe, listFamilyEvents, countRecipeEvents, ensureImageBaseline, buildMonthlyRanking }
