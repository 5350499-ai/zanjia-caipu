const { request } = require('../lib/supabase-server')
const { getSessionUser, readBuffer, sendJson } = require('../lib/server-auth')
const { deleteStorageImage, downloadStorageImage, listStorageImages, uploadStorageImage } = require('../lib/storage-images')

async function findImageRecipe(imageId) {
  const rows = await request('/rest/v1/recipes', {
    query: `?select=id,image_id,author_user_id,family_id,is_family_shared,cook_records`,
  })
  return (rows || []).find(row => row.image_id === imageId || (row.cook_records || []).some(record => record.imageId === imageId)) || null
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
  const results = await Promise.allSettled(orphanIds.map(deleteStorageImage))
  const failed = results
    .map((result, index) => ({ result, imageId: orphanIds[index] }))
    .filter(item => item.result.status === 'rejected')
    .map(item => ({ imageId: item.imageId, error: item.result.reason?.message || 'delete failed' }))
  return { status: failed.length ? 207 : 200, body: { scanned: stored.length, referenced: referenced.size, deleted: orphanIds.length - failed.length, failed } }
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
    if (!canWrite(user, recipe)) return sendJson(response, 403, { error: '没有权限上传这张图片' })
    const body = await readBuffer(requestMessage)
    await uploadStorageImage(imageId, body, requestMessage.headers['content-type'] || 'image/jpeg')
    return sendJson(response, 200, { ok: true })
  }

  if (requestMessage.method === 'DELETE') {
    if (!canWrite(user, recipe)) return sendJson(response, 403, { error: '没有权限删除这张图片' })
    await deleteStorageImage(imageId)
    return sendJson(response, 200, { ok: true })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
