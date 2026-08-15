const { request } = require('../lib/supabase-server')
const { getSessionUser, readBuffer, sendJson } = require('../lib/server-auth')
const { deleteImageIfUnreferenced, downloadStorageImage, listStorageImageDetails, listStorageImages, uploadStorageImage } = require('../lib/storage-images')

async function findImageRecipe(imageId) {
  const rows = await request('/rest/v1/recipes', {
    query: `?select=id,image_id,author_user_id,family_id,is_family_shared,cook_records`,
  })
  return (rows || []).find(row => row.image_id === imageId || (row.cook_records || []).some(record => record.imageId === imageId)) || null
}

function requestIdOf(requestMessage) {
  return String(requestMessage.headers['x-request-id'] || '').slice(0, 120) || null
}

function logImageStage(stage, details = {}) {
  console.info(JSON.stringify({ stage, ...details }))
}

function canRead(user, recipe) {
  if (!recipe) return false
  if (recipe.family_id !== user.familyId) return false
  return user.role === 'admin' || recipe.author_user_id === user.id || recipe.is_family_shared
}

function canWrite(user, recipe) {
  if (!recipe) return true
  if (recipe.family_id !== user.familyId) return false
  return user.role === 'admin' || recipe.author_user_id === user.id
}

async function referencedImageIds(familyId) {
  const rows = await request('/rest/v1/recipes', {
    query: `?family_id=eq.${encodeURIComponent(familyId)}&select=image_id,cook_records`,
  })
  const ids = new Set()
  for (const row of rows || []) {
    if (row.image_id) ids.add(row.image_id)
    for (const record of row.cook_records || []) {
      const id = record?.imageId || record?.image_id
      if (id) ids.add(id)
    }
  }
  return ids
}

async function cleanupOrphanImages(user) {
  if (user.role !== 'admin') return { status: 403, body: { error: '只有管理员可以清理图片' } }
  const [stored, referenced] = await Promise.all([listStorageImages(), referencedImageIds(user.familyId)])
  const orphanIds = stored.filter(imageId => !referenced.has(imageId))
  return {
    status: 200,
    body: {
      dryRun: true,
      scanned: stored.length,
      referenced: referenced.size,
      deleteCandidates: orphanIds,
      deleted: 0,
      message: 'Storage 删除已暂停。当前接口只做 dry-run，不会真实删除图片。',
    },
  }
}

async function diagnoseImages(user) {
  if (user.role !== 'admin') return { status: 403, body: { error: '只有管理员可以诊断图片' } }
  const rows = await request('/rest/v1/recipes', {
    query: `?family_id=eq.${encodeURIComponent(user.familyId)}&select=id,name,image_id,image_version,cook_records`,
  })
  const checked = []
  for (const row of rows || []) {
    if (row.image_id) {
      const fileResponse = await downloadStorageImage(row.image_id).catch(error => ({ ok: false, status: 0, error }))
      checked.push({
        recipeId: row.id,
        recipeName: row.name,
        field: 'image_id',
        imageId: row.image_id,
        imageVersion: row.image_version || null,
        ok: Boolean(fileResponse.ok),
        status: fileResponse.status || 0,
        error: fileResponse.ok ? null : (fileResponse.error?.message || `Storage returned ${fileResponse.status || 0}`),
      })
    }
    for (const record of row.cook_records || []) {
      const recordImageId = record?.imageId || record?.image_id
      if (!recordImageId) continue
      const fileResponse = await downloadStorageImage(recordImageId).catch(error => ({ ok: false, status: 0, error }))
      checked.push({
        recipeId: row.id,
        recipeName: row.name,
        field: 'cook_records.imageId',
        recordId: record.id || null,
        imageId: recordImageId,
        imageVersion: record.imageVersion || record.image_version || null,
        ok: Boolean(fileResponse.ok),
        status: fileResponse.status || 0,
        error: fileResponse.ok ? null : (fileResponse.error?.message || `Storage returned ${fileResponse.status || 0}`),
      })
    }
  }
  return {
    status: 200,
    body: {
      checked: checked.length,
      ok: checked.filter(item => item.ok).length,
      broken: checked.filter(item => !item.ok),
    },
  }
}

async function storageStats(user) {
  if (user.role !== 'admin') return { status: 403, body: { error: '只有管理员可以查看 Storage 统计' } }
  const objects = await listStorageImageDetails()
  const totalBytes = objects.reduce((sum, item) => sum + Number(item.metadata?.size || item.size || 0), 0)
  const capacityBytes = Number(process.env.SUPABASE_STORAGE_CAPACITY_BYTES || 0)
  return {
    status: 200,
    body: {
      imageCount: objects.length,
      totalBytes,
      capacityBytes,
      usageRatio: capacityBytes > 0 ? totalBytes / capacityBytes : null,
      scanned: objects.length,
      source: 'Supabase Storage recipe-images bucket',
    },
  }
}

module.exports = async function handler(requestMessage, response) {
  const user = getSessionUser(requestMessage)
  if (!user) return sendJson(response, 401, { error: 'Unauthorized' })

  const url = new URL(requestMessage.url, 'http://local')
  if (url.searchParams.get('action') === 'cleanup') {
    if (requestMessage.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      return sendJson(response, 405, { error: 'Method not allowed' })
    }
    const result = await cleanupOrphanImages(user)
    return sendJson(response, result.status, result.body)
  }

  if (url.searchParams.get('action') === 'diagnose') {
    if (requestMessage.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      return sendJson(response, 405, { error: 'Method not allowed' })
    }
    const result = await diagnoseImages(user)
    return sendJson(response, result.status, result.body)
  }

  if (url.searchParams.get('action') === 'stats') {
    if (requestMessage.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      return sendJson(response, 405, { error: 'Method not allowed' })
    }
    const result = await storageStats(user)
    return sendJson(response, result.status, result.body)
  }

  const imageId = url.searchParams.get('imageId')
  if (!imageId) return sendJson(response, 400, { error: '缺少图片 ID' })

  const recipe = await findImageRecipe(imageId)

  if (requestMessage.method === 'GET') {
    if (!canRead(user, recipe)) return sendJson(response, 403, { error: '没有权限查看这张图片' })
    const fileResponse = await downloadStorageImage(imageId)
    if (!fileResponse.ok) return sendJson(response, fileResponse.status, { error: '图片不存在' })
    const arrayBuffer = await fileResponse.arrayBuffer()
    response.statusCode = 200
    response.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'image/jpeg')
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    response.end(Buffer.from(arrayBuffer))
    return
  }

  if (requestMessage.method === 'POST') {
    const uploadRecipeId = url.searchParams.get('recipeId')
    if (user.role === 'guest' || (!recipe && uploadRecipeId && !imageId.startsWith(`recipe-${uploadRecipeId}-`))) return sendJson(response, 403, { error: '无权上传这张图片' })
    if (!canWrite(user, recipe)) return sendJson(response, 403, { error: '没有权限上传这张图片' })
    const requestId = requestIdOf(requestMessage)
    logImageStage('IMAGE_UPLOAD_START', { requestId, recipeId: uploadRecipeId || null, imageId })
    const body = await readBuffer(requestMessage)
    try {
      await uploadStorageImage(imageId, body, requestMessage.headers['content-type'] || 'image/jpeg')
    } catch (error) {
      logImageStage('IMAGE_UPLOAD_FAILED', { requestId, recipeId: uploadRecipeId || null, imageId, status: error.status || null, error: error.message })
      return sendJson(response, 502, { error: '图片上传失败，请重试', stage: 'IMAGE_UPLOAD_FAILED', requestId })
    }
    logImageStage('IMAGE_UPLOAD_SUCCESS', { requestId, recipeId: uploadRecipeId || null, imageId, status: 200 })
    return sendJson(response, 200, { ok: true })
  }

  if (requestMessage.method === 'DELETE') {
    const requestId = requestIdOf(requestMessage)
    const recipeId = url.searchParams.get('recipeId')
    const rollback = url.searchParams.get('rollback') === '1'
    const authorizedRecipe = recipeId
      ? (await request('/rest/v1/recipes', { query: `?id=eq.${encodeURIComponent(recipeId)}&select=id,author_user_id,family_id,is_family_shared,cook_records` }))?.[0]
      : recipe
    if (!authorizedRecipe && !(rollback && recipeId && user.role !== 'guest' && imageId.startsWith(`recipe-${recipeId}-`))) return sendJson(response, 403, { error: '无权删除这张图片' })
    if (authorizedRecipe && !canWrite(user, authorizedRecipe)) return sendJson(response, 403, { error: '无权删除这张图片' })
    try {
      logImageStage('ROLLBACK_START', { requestId, recipeId, imageId })
      const result = await deleteImageIfUnreferenced(imageId)
      logImageStage('ROLLBACK_SUCCESS', { requestId, recipeId, imageId, status: 200, deleted: Boolean(result.deleted) })
      return sendJson(response, 200, { ok: true, ...result, message: result.deleted ? '图片已从服务器删除' : '图片仍被其他记录引用，未删除服务器文件' })
    } catch (error) {
      console.error('recipe image storage cleanup failed', { imageId, recipeId, error: error.message })
      logImageStage('ROLLBACK_FAILED', { requestId, recipeId, imageId, status: error.status || null, error: error.message })
      return sendJson(response, 503, { ok: false, cleanupPending: true, error: '图片已从菜谱移除，但服务器旧文件清理失败，稍后可再次清理。' })
    }
    if (!canWrite(user, recipe)) return sendJson(response, 403, { error: '没有权限删除这张图片' })
    return sendJson(response, 200, { ok: true, skipped: true, message: 'Storage 删除已暂停，未删除图片。' })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
