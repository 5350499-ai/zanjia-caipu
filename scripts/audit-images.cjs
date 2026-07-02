const { request } = require('../lib/supabase-server')
const { downloadStorageImage, listStorageImages } = require('../lib/storage-images')

async function main() {
  const familyId = process.argv[2] || process.env.FAMILY_ID || 'family-main'
  const rows = await request('/rest/v1/recipes', {
    query: `?family_id=eq.${encodeURIComponent(familyId)}&select=id,name,image_id,image_version,cook_records`,
  })
  const stored = new Set(await listStorageImages())
  const results = []

  for (const row of rows || []) {
    if (row.image_id) {
      results.push(await inspectImage({
        recipeId: row.id,
        recipeName: row.name,
        field: 'image_id',
        imageId: row.image_id,
        imageVersion: row.image_version || null,
        stored,
      }))
    }

    for (const record of row.cook_records || []) {
      const imageId = record?.imageId || record?.image_id
      if (!imageId) continue
      results.push(await inspectImage({
        recipeId: row.id,
        recipeName: row.name,
        recordId: record.id || null,
        field: 'cook_records.imageId',
        imageId,
        imageVersion: record.imageVersion || record.image_version || null,
        stored,
      }))
    }
  }

  const broken = results.filter(item => !item.ok)
  console.log(JSON.stringify({
    familyId,
    checked: results.length,
    ok: results.length - broken.length,
    broken,
  }, null, 2))
}

async function inspectImage(item) {
  const existsInList = item.stored.has(item.imageId)
  const response = await downloadStorageImage(item.imageId).catch(error => ({ ok: false, status: 0, error }))
  return {
    recipeId: item.recipeId,
    recipeName: item.recipeName,
    recordId: item.recordId || null,
    field: item.field,
    imageId: item.imageId,
    imageVersion: item.imageVersion,
    existsInStorageList: existsInList,
    ok: Boolean(response.ok),
    status: response.status || 0,
    error: response.ok ? null : (response.error?.message || `Storage returned ${response.status || 0}`),
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
