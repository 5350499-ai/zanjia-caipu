const { SUPABASE_URL } = require('./supabase-server')

const BUCKET = 'recipe-images'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

function storageHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra,
  }
}

function objectPath(imageId) {
  return `/storage/v1/object/${BUCKET}/${encodeURIComponent(imageId)}`
}

async function deleteStorageImage(imageId) {
  if (!imageId) return false
  const response = await fetch(`${SUPABASE_URL}${objectPath(imageId)}`, {
    method: 'DELETE',
    headers: storageHeaders(),
  })
  if (!response.ok && response.status !== 404) {
    const error = new Error(`Storage image delete failed: ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.ok
}

async function uploadStorageImage(imageId, body, contentType = 'image/jpeg') {
  const response = await fetch(`${SUPABASE_URL}${objectPath(imageId)}`, {
    method: 'POST',
    headers: storageHeaders({
      'Content-Type': contentType || 'image/jpeg',
      'x-upsert': 'true',
    }),
    body,
  })
  if (!response.ok) {
    const error = new Error(`Storage image upload failed: ${response.status}`)
    error.status = response.status
    throw error
  }
  return true
}

async function downloadStorageImage(imageId) {
  const response = await fetch(`${SUPABASE_URL}${objectPath(imageId)}`, {
    headers: storageHeaders(),
  })
  return response
}

async function listStorageImages() {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  })
  if (!response.ok) {
    const error = new Error(`Storage image list failed: ${response.status}`)
    error.status = response.status
    throw error
  }
  const objects = await response.json()
  return (objects || []).filter(item => item?.name && item.name !== '.emptyFolderPlaceholder').map(item => item.name)
}

async function listStorageImageDetails() {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  })
  if (!response.ok) {
    const error = new Error(`Storage image list failed: ${response.status}`)
    error.status = response.status
    throw error
  }
  const objects = await response.json()
  return (objects || []).filter(item => item?.name && item.name !== '.emptyFolderPlaceholder')
}

function collectRecipeImageIds(recipe) {
  return [
    recipe?.image_id,
    ...((recipe?.cook_records || []).map(record => record?.imageId || record?.image_id)),
  ].filter(Boolean)
}

function collectClientRecipeImageIds(recipe) {
  return [
    recipe?.imageId,
    ...((recipe?.cookRecords || []).map(record => record?.imageId)),
  ].filter(Boolean)
}

module.exports = {
  BUCKET,
  collectClientRecipeImageIds,
  collectRecipeImageIds,
  deleteStorageImage,
  downloadStorageImage,
  listStorageImages,
  listStorageImageDetails,
  uploadStorageImage,
}
