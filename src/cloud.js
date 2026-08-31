export async function initCloud() {
  return true
}

const IMAGE_UPLOAD_TIMEOUT_MS = 30_000
const RECIPE_SAVE_TIMEOUT_MS = 25_000

function stageError(stage, message = stage) {
  const error = new Error(message)
  error.stage = stage
  return error
}

async function fetchWithTimeout(input, options = {}, timeoutMs, timeoutStage) {
  if (typeof AbortController === 'undefined') return fetch(input, options)
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([
      fetch(input, { ...options, signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(stageError(timeoutStage, timeoutStage))
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    if (error?.name === 'AbortError') throw stageError(timeoutStage, timeoutStage)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function isRetryableUploadError(error) {
  if (error?.stage || [400, 401, 403, 404, 409, 413, 422].includes(error?.status)) return false
  return !error?.status || [502, 503, 504].includes(error.status)
}

async function withOneSafeRetry(operation) {
  try {
    return await operation()
  } catch (error) {
    if (!isRetryableUploadError(error)) throw error
    return operation()
  }
}

export async function loadCloudLibrary({ memberKey = '' } = {}) {
  const suffix = memberKey === '' ? '' : `?member=${encodeURIComponent(memberKey)}`
  const response = await fetch(`/api/recipes${suffix}`, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Cloud read failed: ${response.status}`)
  const data = await response.json()
  window.__familyRecipeStats = data.stats || null
  window.__familyGuestMembers = Array.isArray(data.guestMembers) ? data.guestMembers : []
  return data.recipes || []
}

export async function loadCloudRanking({ period = 'all', year, month } = {}) {
  const params = new URLSearchParams({ action: 'ranking', period })
  if (year) params.set('year', String(year))
  if (month) params.set('month', String(month))
  const response = await fetch(`/api/cook-events?${params}`, { credentials: 'same-origin', cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Ranking failed: ${response.status}`)
  return data
}

export async function loadCloudFamilyStats({ period = 'month', year, month } = {}) {
  const params = new URLSearchParams({ action: 'family-stats', period })
  if (year) params.set('year', String(year))
  if (month) params.set('month', String(month))
  const response = await fetch(`/api/cook-events?${params}`, { credentials: 'same-origin', cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Family stats failed: ${response.status}`)
  return data
}

export async function loadCloudAnnualTrend(year) {
  const params = new URLSearchParams({ action: 'family-trend', year: String(year) })
  const response = await fetch(`/api/cook-events?${params}`, { credentials: 'same-origin', cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Annual trend failed: ${response.status}`)
  return data
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

export async function saveCloudRecipe(recipe, requestId = '') {
  const response = await fetchWithTimeout('/api/recipes', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(requestId ? { 'x-request-id': requestId } : {}) },
    body: JSON.stringify({ recipe }),
  }, RECIPE_SAVE_TIMEOUT_MS, 'RECIPE_SAVE_TIMEOUT')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || `Cloud save failed: ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data.recipe || null
}

export async function confirmCloudRecipeImageBinding(recipeId, imageId, imageVersion = '', requestId = '') {
  const response = await fetchWithTimeout('/api/recipes', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: requestId ? { 'x-request-id': requestId } : {},
  }, RECIPE_SAVE_TIMEOUT_MS, 'RECIPE_BIND_CONFIRM_TIMEOUT')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || `Recipe binding confirmation failed: ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  const recipe = (data.recipes || []).find(item => String(item.id) === String(recipeId))
  return { confirmed: Boolean(recipe && recipe.imageId === imageId && (!imageVersion || recipe.imageVersion === imageVersion)), recipe }
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

export async function uploadCloudImage(imageId, file, requestId = '', recipeId = '') {
  if (!imageId || !file) return false
  const recipeQuery = recipeId ? `&recipeId=${encodeURIComponent(recipeId)}` : ''
  const response = await withOneSafeRetry(async () => {
    const result = await fetchWithTimeout(`/api/images?imageId=${encodeURIComponent(imageId)}${recipeQuery}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'image/jpeg', ...(requestId ? { 'x-request-id': requestId } : {}) },
      body: file,
    }, IMAGE_UPLOAD_TIMEOUT_MS, 'IMAGE_UPLOAD_TIMEOUT')
    if ([502, 503, 504].includes(result.status)) {
      const retryError = new Error(`Image upload failed: ${result.status}`)
      retryError.status = result.status
      throw retryError
    }
    return result
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const error = new Error(data.error || `Image upload failed: ${response.status}`)
    error.stage = 'IMAGE_UPLOAD_FAILED'
    error.status = response.status
    error.data = data
    throw error
  }
  return true
}

export async function deleteCloudImage(imageId, recipeId = '', requestId = '', rollback = false) {
  if (!imageId) return false
  const recipeQuery = recipeId ? `&recipeId=${encodeURIComponent(recipeId)}` : ''
  const rollbackQuery = rollback ? '&rollback=1' : ''
  const response = await fetch(`/api/images?imageId=${encodeURIComponent(imageId)}${recipeQuery}${rollbackQuery}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: requestId ? { 'x-request-id': requestId } : {},
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
