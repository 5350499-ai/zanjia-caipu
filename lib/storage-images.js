const { SUPABASE_URL, request } = require('./supabase-server')
const fs = require('fs/promises')
const path = require('path')

const BUCKET = 'recipe-images'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
const LOCAL_ROOT = process.env.STORAGE_ROOT || ''
const localPath = imageId => path.join(LOCAL_ROOT, String(imageId).replace(/[^A-Za-z0-9._-]/g, '_'))

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
  if (LOCAL_ROOT) { try { await fs.unlink(localPath(imageId)); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
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
  if (LOCAL_ROOT) {
    await fs.mkdir(LOCAL_ROOT, { recursive: true })
    const target = localPath(imageId); const temp = `${target}.${process.pid}.tmp`
    await fs.writeFile(temp, body); await fs.rename(temp, target); return true
  }
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
  if (LOCAL_ROOT) {
    try {
      const body = await fs.readFile(localPath(imageId))
      return { ok: true, status: 200, headers: { get: key => key.toLowerCase() === 'content-type' ? 'image/jpeg' : null }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) }
    } catch (error) { if (error.code === 'ENOENT') return { ok: false, status: 404, headers: { get: () => null } }; throw error }
  }
  const response = await fetch(`${SUPABASE_URL}${objectPath(imageId)}`, {
    headers: storageHeaders(),
  })
  return response
}

async function listStorageImages() {
  if (LOCAL_ROOT) return (await fs.readdir(LOCAL_ROOT, { withFileTypes: true })).filter(item => item.isFile()).map(item => item.name)
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
  if (LOCAL_ROOT) {
    const entries = await fs.readdir(LOCAL_ROOT, { withFileTypes: true }); const details = []
    for (const entry of entries) if (entry.isFile()) { const stat = await fs.stat(path.join(LOCAL_ROOT, entry.name)); details.push({ name: entry.name, size: stat.size, metadata: { size: String(stat.size) } }) }
    return details
  }
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

async function imageReferenceCount(imageId) {
  if (!imageId) return 0
  const rows = await request('/rest/v1/recipes', { query: '?select=image_id,cook_records' })
  let count = 0
  for (const row of rows || []) {
    if (row.image_id === imageId) count += 1
    for (const record of row.cook_records || []) {
      if ((record?.imageId || record?.image_id) === imageId) count += 1
    }
  }
  return count
}

async function deleteImageIfUnreferenced(imageId) {
  const references = await imageReferenceCount(imageId)
  if (references > 0) return { deleted: false, referenced: true, references }
  const deleted = await deleteStorageImage(imageId)
  return { deleted, referenced: false, references: 0 }
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
  deleteImageIfUnreferenced,
  deleteStorageImage,
  downloadStorageImage,
  imageReferenceCount,
  listStorageImages,
  listStorageImageDetails,
  uploadStorageImage,
}
