let cloudConfig = null

export async function initCloud() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' })
    if (!response.ok) return false
    const config = await response.json()
    if (!config.supabaseUrl || !config.supabaseAnonKey) return false
    cloudConfig = config
    return true
  } catch {
    return false
  }
}

function headers(extra = {}) {
  return {
    apikey: cloudConfig.supabaseAnonKey,
    Authorization: `Bearer ${cloudConfig.supabaseAnonKey}`,
    ...extra,
  }
}

export async function loadCloudLibrary() {
  if (!cloudConfig) return null
  const response = await fetch(`${cloudConfig.supabaseUrl}/rest/v1/family_recipe_library?id=eq.main&select=recipes`, { headers: headers() })
  if (!response.ok) throw new Error(`Cloud read failed: ${response.status}`)
  const rows = await response.json()
  return rows[0]?.recipes || null
}

export async function saveCloudLibrary(recipes) {
  if (!cloudConfig) return false
  const response = await fetch(`${cloudConfig.supabaseUrl}/rest/v1/family_recipe_library?on_conflict=id`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ id: 'main', recipes, updated_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(`Cloud save failed: ${response.status}`)
  return true
}

export function getCloudImageUrl(imageId) {
  if (!cloudConfig || !imageId) return null
  return `${cloudConfig.supabaseUrl}/storage/v1/object/public/recipe-images/${encodeURIComponent(imageId)}`
}

export async function uploadCloudImage(imageId, file) {
  if (!cloudConfig || !imageId || !file) return false
  const response = await fetch(`${cloudConfig.supabaseUrl}/storage/v1/object/recipe-images/${encodeURIComponent(imageId)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' }),
    body: file,
  })
  if (!response.ok) throw new Error(`Image upload failed: ${response.status}`)
  return true
}

export async function deleteCloudImage(imageId) {
  if (!cloudConfig || !imageId) return false
  const response = await fetch(`${cloudConfig.supabaseUrl}/storage/v1/object/recipe-images/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!response.ok && response.status !== 404) throw new Error(`Image delete failed: ${response.status}`)
  return true
}
