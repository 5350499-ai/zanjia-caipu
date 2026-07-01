export async function initCloud() {
  return true
}

export async function loadCloudLibrary() {
  const response = await fetch('/api/recipes', { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Cloud read failed: ${response.status}`)
  const data = await response.json()
  return data.recipes || []
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
  if (!response.ok && response.status !== 404) throw new Error(`Cloud delete failed: ${response.status}`)
  return true
}

export async function downloadCloudImage(imageId, version = '') {
  if (!imageId) return null
  const versionQuery = version ? `&v=${encodeURIComponent(version)}` : ''
  const response = await fetch(`/api/images?imageId=${encodeURIComponent(imageId)}${versionQuery}`, {
    cache: 'force-cache',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`)
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

export async function deleteCloudImage(imageId) {
  if (!imageId) return false
  const response = await fetch(`/api/images?imageId=${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (!response.ok && response.status !== 404) throw new Error(`Image delete failed: ${response.status}`)
  return true
}
