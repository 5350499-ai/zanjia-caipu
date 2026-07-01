const { encodeFilter, request, SUPABASE_URL } = require('../lib/supabase-server')
const { getSessionUser, readBuffer, sendJson } = require('../lib/server-auth')

const BUCKET = 'recipe-images'

function objectPath(imageId) {
  return `/storage/v1/object/${BUCKET}/${encodeURIComponent(imageId)}`
}

async function findImageRecipe(imageId) {
  const rows = await request('/rest/v1/recipes', {
    query: `?image_id=eq.${encodeFilter(imageId)}&select=id,author_user_id,family_id,is_family_shared`,
  })
  return rows?.[0] || null
}

function canRead(user, recipe) {
  if (!recipe) return true
  if (recipe.family_id !== user.familyId) return false
  return user.role === 'admin' || recipe.author_user_id === user.id || recipe.is_family_shared
}

function canWrite(user, recipe) {
  if (!recipe) return true
  if (recipe.family_id !== user.familyId) return false
  return user.role === 'admin' || recipe.author_user_id === user.id
}

module.exports = async function handler(requestMessage, response) {
  const user = getSessionUser(requestMessage)
  if (!user) return sendJson(response, 401, { error: 'Unauthorized' })

  const imageId = new URL(requestMessage.url, 'http://local').searchParams.get('imageId')
  if (!imageId) return sendJson(response, 400, { error: '缺少图片 ID' })

  const recipe = await findImageRecipe(imageId)

  if (requestMessage.method === 'GET') {
    if (!canRead(user, recipe)) return sendJson(response, 403, { error: '没有权限查看这张图片' })
    const fileResponse = await fetch(`${SUPABASE_URL}${objectPath(imageId)}`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY}`,
      },
    })
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
    const uploadResponse = await fetch(`${SUPABASE_URL}${objectPath(imageId)}`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': requestMessage.headers['content-type'] || 'image/jpeg',
        'x-upsert': 'true',
      },
      body,
    })
    if (!uploadResponse.ok) return sendJson(response, uploadResponse.status, { error: '图片上传失败' })
    return sendJson(response, 200, { ok: true })
  }

  if (requestMessage.method === 'DELETE') {
    if (!canWrite(user, recipe)) return sendJson(response, 403, { error: '没有权限删除这张图片' })
    const deleteResponse = await fetch(`${SUPABASE_URL}${objectPath(imageId)}`, {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY}`,
      },
    })
    if (!deleteResponse.ok && deleteResponse.status !== 404) return sendJson(response, deleteResponse.status, { error: '图片删除失败' })
    return sendJson(response, 200, { ok: true })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
