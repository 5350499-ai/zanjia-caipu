export async function initCloud() {
  return true
}

export async function loadCloudLibrary() {
  const response = await fetch('/api/recipes', { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Cloud read failed: ${response.status}`)
  const data = await response.json()
  window.__familyRecipeStats = data.stats || null
  window.__familyRecipeMonthlyRanking = Array.isArray(data.monthlyRanking) ? data.monthlyRanking : []
  return data.recipes || []
}

export async function createCloudCookEvent(recipeId, cookedOn) {
  const response = await fetch(`/api/cook-events?recipeId=${encodeURIComponent(recipeId)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookedOn }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || `Cook event failed: ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export async function loadCloudCookStatus(recipeId) {
  const response = await fetch(`/api/cook-events?recipeId=${encodeURIComponent(recipeId)}`, { credentials: 'same-origin', cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Cook status failed: ${response.status}`)
  return data
}

export async function deleteCloudCookEvent(eventId) {
  const response = await fetch(`/api/cook-events?eventId=${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`Cook event delete failed: ${response.status}`)
  return response.json().catch(() => ({}))
}

export async function saveCloudLibrary(recipes) {
  const results = await Promise.allSettled(recipes.map(recipe => saveCloudRecipe(recipe)))
  if (results.every(result => result.status === 'rejected')) throw results[0].reason
  return true
}

export async function saveCloudRecipe(recipe) {
  const response = await fetch('/api/recipes', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe }),
  })
  if (!response.ok) throw new Error(`Cloud save failed: ${response.status}`)
  return true
}

export async function deleteCloudRecipe(recipeId) {
  const response = await fetch(`/api/recipes?id=${encodeURIComponent(recipeId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok && response.status !== 404) throw new Error(data.error || `Cloud delete failed: ${response.status}`)
  return data
}

export async function downloadCloudImage(imageId, version = '') {
  if (!imageId) return null
  const versionQuery = version ? `&v=${encodeURIComponent(version)}` : ''
  const request = new Request(`/api/images?imageId=${encodeURIComponent(imageId)}${versionQuery}`, {
    credentials: 'same-origin',
  })
  const cache = await openImageResponseCache()
  const cached = cache ? await cache.match(request).catch(() => null) : null
  if (cached?.ok) return cached.blob()
  const response = await fetch(request, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`)
  if (cache) cache.put(request, response.clone()).catch(() => null)
  return response.blob()
}

export async function uploadCloudImage(imageId, file) {
  if (!imageId || !file) return false
  const response = await fetch(`/api/images?imageId=${encodeURIComponent(imageId)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': file.type || 'image/jpeg' },
    body: file,
  })
  if (!response.ok) throw new Error(`Image upload failed: ${response.status}`)
  return true
}

export async function deleteCloudImage(imageId, recipeId = '') {
  if (!imageId) return false
  const recipeQuery = recipeId ? `&recipeId=${encodeURIComponent(recipeId)}` : ''
  const response = await fetch(`/api/images?imageId=${encodeURIComponent(imageId)}${recipeQuery}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok && response.status !== 404) throw new Error(data.error || `Image delete failed: ${response.status}`)
  return data
}

export async function cleanupCloudImages() {
  const response = await fetch('/api/images?action=cleanup', {
    method: 'POST',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`Image cleanup failed: ${response.status}`)
  return response.json()
}

export async function clearCloudImageResponseCache() {
  if (typeof caches === 'undefined') return false
  return caches.delete('family-recipes-image-responses-v1')
}

export async function clearCloudStaticResponseCache() {
  if (typeof caches === 'undefined') return false
  const imageCache = 'family-recipes-image-responses-v1'
  const keys = await caches.keys()
  await Promise.all(keys.filter(key => key !== imageCache).map(key => caches.delete(key)))
  return true
}

export async function loadCloudStorageStats() {
  const response = await fetch('/api/images?action=stats', { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new Error(`Storage stats failed: ${response.status}`)
  return response.json()
}

async function openImageResponseCache() {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open('family-recipes-image-responses-v1')
  } catch {
    return null
  }
}
