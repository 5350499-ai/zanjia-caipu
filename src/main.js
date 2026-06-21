import { deleteCloudImage, getCloudImageUrl, initCloud, loadCloudLibrary, saveCloudLibrary, uploadCloudImage } from './cloud.js'

const categories = ['全部', '热菜', '凉菜', '汤类', '主食', '粥类', '甜品', '肉菜', '素菜']
const selectableCategories = categories.slice(1)

const starterRecipes = [
  { id: 1, name: '香肠豆腐粉丝烩菜', categories: ['热菜', '肉菜'], ingredients: ['香肠 1根', '北豆腐 1块', '红薯粉丝 1把', '白菜 4片'], seasonings: ['生抽 2勺', '蚝油 1勺', '蒜 3瓣', '盐 少许'], steps: ['粉丝提前用温水泡软，豆腐切块。', '香肠煸出油，放蒜末和白菜炒软。', '加入豆腐、粉丝和一小碗水，调味后炖8分钟。'], tips: '粉丝吸水，汤汁不要收得太干。出锅前尝一下再放盐。', notes: [{ id: 'note-1', date: '2026-06-20', text: '这次水放多了' }, { id: 'note-2', date: '2026-07-03', text: '多放蒜更好吃' }], image: null },
  { id: 2, name: '西红柿炒鸡蛋', categories: ['热菜', '素菜'], ingredients: ['西红柿 2个', '鸡蛋 3个', '小葱 1根'], seasonings: ['盐 适量', '白糖 半勺'], steps: ['鸡蛋加少许盐打散，炒熟盛出。', '西红柿炒出汤汁，放糖和盐。', '倒回鸡蛋翻匀，撒葱花。'], tips: '西红柿选熟一些的，更容易炒出汁。', notes: [{ id: 'note-3', date: '2026-05-12', text: '糖放半勺刚好' }], image: null },
  { id: 3, name: '莲藕排骨汤', categories: ['汤类', '肉菜'], ingredients: ['排骨 500克', '莲藕 2节', '姜 4片'], seasonings: ['盐 适量', '白胡椒 少许'], steps: ['排骨冷水下锅焯水后洗净。', '莲藕切滚刀块，与排骨、姜片一起入锅。', '加足量热水，小火炖90分钟后放盐。'], tips: '盐最后放，汤更鲜。', notes: [], image: null },
  { id: 4, name: '凉拌黄瓜', categories: ['凉菜', '素菜'], ingredients: ['黄瓜 2根', '花生米 1小把'], seasonings: ['蒜 4瓣', '香醋 2勺', '生抽 1勺', '香油 少许'], steps: ['黄瓜拍松切段。', '蒜末与调料拌匀。', '加入黄瓜和花生米拌匀。'], tips: '现拌现吃，放久了会出水。', notes: [], image: null },
  { id: 5, name: '小米南瓜粥', categories: ['粥类', '主食'], ingredients: ['小米 80克', '南瓜 200克'], seasonings: ['清水 900毫升'], steps: ['小米淘洗一次，南瓜切小块。', '水开后下小米和南瓜。', '小火煮30分钟，中途搅动两次。'], tips: '小米不要反复搓洗，以免流失香味。', notes: [], image: null },
]

const STORAGE_KEY = 'family-recipes-v1'
const IMAGE_DB_NAME = 'family-recipes-images'
const IMAGE_STORE = 'images'

function loadRecipes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(saved)) return saved.map(({ image, ...recipe }) => ({ ...recipe, image: null, notes: (recipe.notes || []).map(note => ({ ...note, id: note.id || uniqueId('note') })) }))
  } catch (error) {
    console.warn('本地菜谱读取失败，将使用初始数据。', error)
  }
  return starterRecipes
}

let recipes = loadRecipes()

let activeCategory = '全部'
let query = ''
let selectedId = null
let page = 'home'
let imageMenu = false
let draft = null
let draftDirty = false
let formExitPrompt = false
let searchIsComposing = false
let noteEditor = null
let imagePreview = false
const root = document.getElementById('root')
let appStarted = false
let authBusy = false

const icons = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  add: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 20"/><path d="M17 3v4M15 5h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
}

function imageArea(recipe, compact = false) {
  if (compact) {
    if (recipe.image) return `<div class="image-area has-image compact"><img src="${recipe.image}" alt="${escapeHtml(recipe.name)}"></div>`
    return `<div class="image-area placeholder compact"><span class="placeholder-plus" aria-hidden="true">+</span><strong>添加图片</strong></div>`
  }
  if (recipe.image) return `<button class="image-area has-image" data-action="view-image"><img src="${recipe.image}" alt="${escapeHtml(recipe.name)}"></button>`
  return `<button class="image-area placeholder" data-action="add-image"><span class="camera-ring">${icons.add}</span><strong>点击加图</strong><small>上传这道菜的成品照片</small></button>`
}

function getFilteredRecipes() {
  const keyword = query.trim().toLowerCase()
  return recipes.filter(recipe => {
    const categoryMatch = activeCategory === '全部' || recipe.categories.includes(activeCategory)
    const searchableText = [
      recipe.name,
      ...(recipe.ingredients || []),
      ...(recipe.seasonings || []),
      ...(recipe.steps || []),
      recipe.tips || '',
      ...(recipe.notes || []).map(note => note.text || ''),
    ].join(' ').toLowerCase()
    return categoryMatch && (!keyword || searchableText.includes(keyword))
  }).sort((a, b) => {
    const recent = String(b.lastViewedAt || '').localeCompare(String(a.lastViewedAt || ''))
    if (recent) return recent
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
}

function authTemplate(message = '') {
  return `<main class="auth-screen"><section class="auth-card"><div class="auth-mark">家</div><div class="eyebrow">OUR FAMILY TABLE</div><h1>咱家菜谱</h1><p>家庭私房菜谱</p><form id="auth-form"><label for="app-password">访问密码</label><input id="app-password" name="password" type="password" inputmode="text" autocomplete="current-password" placeholder="请输入密码" required><div class="auth-error" role="alert">${escapeHtml(message)}</div><button type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? '正在进入…' : '进入菜谱'}</button></form><small>登录后 30 天内无需再次输入</small></section></main>`
}

function authLoadingTemplate() {
  return `<main class="auth-screen"><section class="auth-card auth-loading"><div class="auth-mark">家</div><p>正在打开咱家菜谱…</p></section></main>`
}

function recipePanelTemplate() {
  const filtered = getFilteredRecipes()
  return `<div class="list-heading"><h2>${query ? `“${escapeHtml(query)}”` : activeCategory}</h2><span>${filtered.length} 道</span></div><div class="recipe-list">
    ${filtered.map(recipe => `<article class="recipe-card" data-recipe="${recipe.id}">${imageArea(recipe, true)}<div class="card-content"><h3>${escapeHtml(recipe.name)}</h3></div></article>`).join('')}
    ${filtered.length ? '' : `<div class="empty-state">${icons.search}<h3>没有找到相关菜谱</h3><p>换个菜名或材料试试</p></div>`}</div>`
}

function homeTemplate() {
  return `<div class="app-shell home-shell">
    <header class="home-header"><div class="brand-row"><div><div class="eyebrow">OUR FAMILY TABLE</div><h1>咱家菜谱</h1></div><div class="header-actions"><div class="recipe-count"><strong>${recipes.length}</strong><span>道家常味</span></div><button class="top-add-button" data-action="new-recipe">${icons.plus}<span>新增</span></button></div></div>
      <label class="search-box">${icons.search}<input id="search" value="${escapeHtml(query)}" placeholder="搜菜名或材料" autocomplete="off" enterkeyhint="search"><button class="clear-search ${query ? '' : 'hidden'}" data-action="clear" aria-label="清空搜索">${icons.close}</button></label>
      <nav class="category-nav" aria-label="菜谱分类">${categories.map(category => `<button data-category="${category}" class="${category === activeCategory ? 'active' : ''}"><span>${category}</span></button>`).join('')}</nav></header>
    <div class="home-body"><main class="recipe-panel">${recipePanelTemplate()}</main></div>
    </div>`
}

function section(number, title, body) {
  return `<section class="recipe-section"><div class="recipe-section-title"><span>${number}</span><h2>${title}</h2></div><div class="recipe-section-body">${body}</div></section>`
}

function detailTemplate(recipe) {
  return `<div class="app-shell detail-shell"><header class="detail-header"><button class="icon-button" data-action="back-home" aria-label="返回">${icons.back}</button><div class="detail-header-title">菜谱详情</div><button class="header-edit" data-action="edit-recipe">编辑菜谱</button></header>
    <main class="detail-content"><div class="detail-title-row"><div><div class="eyebrow">咱家的拿手菜</div><h1>${escapeHtml(recipe.name)}</h1></div><div class="title-mark">⌄</div></div>
      ${imageArea(recipe)}<input id="file-input" class="hidden-input" type="file" accept="image/*">
      ${section('01', '材料', `<ul class="simple-list">${recipe.ingredients.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      ${section('02', '调料', `<ul class="simple-list">${recipe.seasonings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      ${section('03', '制作步骤', `<ol class="steps">${recipe.steps.map((step,index) => `<li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join('')}</ol>`)}
      ${section('04', '注意事项', `<p class="body-copy">${escapeHtml(recipe.tips || '暂无')}</p>`)}
      ${notesSection(recipe)}
    </main>${imageMenu ? actionSheet() : ''}${imagePreview && recipe.image ? imageLightbox(recipe) : ''}</div>`
}

function newRecipeTemplate() {
  const isEditing = page === 'edit'
  return `<div class="app-shell form-shell"><header class="detail-header"><button class="icon-button" data-action="cancel-form" aria-label="取消${isEditing ? '编辑' : '新增'}">${icons.back}</button><div class="detail-header-title">${isEditing ? '编辑菜谱' : '新增菜谱'}</div><button class="header-save" data-action="save-recipe">保存</button></header>
    <main class="recipe-form">
      <section class="form-section photo-section"><div class="form-label"><strong>成品照片</strong><span>可选</span></div>
        ${draft.image ? `<button class="form-photo has-image" data-action="choose-draft-image"><img src="${draft.image}" alt="待保存的菜谱图片"><span>更换图片</span></button><button class="remove-form-photo" data-action="remove-draft-image">删除图片</button>` : `<button class="form-photo placeholder" data-action="choose-draft-image"><span class="camera-ring">${icons.add}</span><strong>点击加图</strong><small>建议使用横向 4:3 照片</small></button>`}
        <input id="draft-file-input" class="hidden-input" type="file" accept="image/*">
      </section>
      <section class="form-section"><label class="form-label" for="draft-name"><strong>菜名</strong><em>必填</em></label><input class="form-control" id="draft-name" data-draft="name" value="${escapeHtml(draft.name)}" placeholder="例如：香肠豆腐粉丝烩菜"></section>
      <section class="form-section"><div class="form-label"><strong>分类</strong><span>可多选</span></div><div class="category-picker">${selectableCategories.map(category => `<button type="button" data-draft-category="${category}" class="${draft.categories.includes(category) ? 'selected' : ''}">${category}</button>`).join('')}</div></section>
      ${formTextarea('ingredients', '材料', '每行一种材料，例如：\n豆腐 1块\n香肠 1根')}
      ${formTextarea('seasonings', '调料', '每行一种调料，例如：\n生抽 2勺\n盐 少许')}
      ${formTextarea('steps', '制作步骤', '每行一个步骤，保存后自动编号', true)}
      ${formTextarea('tips', '注意事项', '例如：粉丝吸水，汤汁不要收得太干。')}
      ${isEditing ? '' : formTextarea('note', '备注', '记录这次做菜的心得，保存时会自动加入日期。')}
      <div class="form-bottom-actions"><button class="secondary-button" data-action="cancel-form">取消</button><button class="primary-button" data-action="save-recipe">${isEditing ? '保存修改' : '保存'}</button></div>
    </main>${formExitPrompt ? unsavedChangesDialog() : ''}</div>`
}

function formTextarea(key, title, placeholder, tall = false) {
  return `<section class="form-section"><label class="form-label" for="draft-${key}"><strong>${title}</strong><span>${key === 'ingredients' || key === 'seasonings' || key === 'steps' ? '一行一项' : '可选'}</span></label><textarea class="form-control ${tall ? 'tall' : ''}" id="draft-${key}" data-draft="${key}" placeholder="${placeholder}">${escapeHtml(draft[key])}</textarea></section>`
}

function actionSheet() { return `<div class="sheet-backdrop" data-action="close-menu"><div class="action-sheet"><div class="sheet-handle"></div><h2>图片操作</h2><button data-action="view-image">查看大图</button><button data-action="replace-image">更换图片</button><button class="danger" data-action="delete-image">删除图片</button><button class="cancel" data-action="close-menu">取消</button></div></div>` }
function imageLightbox(recipe) { return `<div class="image-lightbox"><button data-action="close-preview" aria-label="关闭大图">${icons.close}</button><div class="image-stage"><img id="preview-image" src="${recipe.image}" alt="${escapeHtml(recipe.name)}大图"></div><p>双击或双指缩放</p></div>` }
function unsavedChangesDialog() { return `<div class="confirm-backdrop"><div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">是否保存修改？</h2><p>你刚才修改的内容还没有保存。</p><div class="confirm-actions"><button class="discard" data-action="discard-changes">不保存</button><button class="continue" data-action="continue-editing">继续编辑</button><button class="save" data-action="save-and-exit">保存</button></div></div></div>` }

function notesSection(recipe) {
  const notes = [...recipe.notes].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)))
  const form = noteEditor ? `<div class="note-editor">
    <label for="note-date"><span>日期</span><input id="note-date" type="date" value="${noteEditor.date}"></label>
    <label for="note-text"><span>备注内容</span><textarea id="note-text" placeholder="记录这次做菜的心得……">${escapeHtml(noteEditor.text)}</textarea></label>
    <div class="note-editor-actions"><button class="secondary-button" data-action="cancel-note">取消</button><button class="primary-button" data-action="save-note">保存备注</button></div>
  </div>` : ''
  const list = notes.length ? `<div class="note-list">${notes.map(note => `<article class="note"><div class="note-top"><time>${note.date}</time><div class="note-actions"><button data-edit-note="${note.id}">编辑</button><button class="danger-text" data-delete-note="${note.id}">删除</button></div></div><p>${escapeHtml(note.text)}</p></article>`).join('')}</div>` : '<p class="empty-copy">还没有备注，做完这道菜后记一笔吧。</p>'
  return `<section class="recipe-section notes-section"><div class="recipe-section-title"><span>05</span><h2>历史备注</h2></div><div class="recipe-section-body"><div class="notes-toolbar"><button data-action="add-note">+ 增加备注</button></div>${form}${list}</div></section>`
}
function escapeHtml(text = '') { return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])) }
function splitLines(text) { return text.split('\n').map(item => item.trim()).filter(Boolean) }
function uniqueId(prefix = 'id') { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }

function persistRecipes() {
  const serializable = recipes.map(({ image, ...recipe }) => recipe)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
  saveCloudLibrary(serializable).catch(error => console.warn('云端同步失败，数据已保存在本机。', error))
}

function openImageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(IMAGE_STORE)) database.createObjectStore(IMAGE_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storeImage(imageId, file) {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE, 'readwrite')
    transaction.objectStore(IMAGE_STORE).put(file, imageId)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function readImage(imageId) {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).get(imageId)
    request.onsuccess = () => { database.close(); resolve(request.result || null) }
    request.onerror = () => { database.close(); reject(request.error) }
  })
}

async function removeStoredImage(imageId) {
  if (!imageId) return
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE, 'readwrite')
    transaction.objectStore(IMAGE_STORE).delete(imageId)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function hydrateRecipeImages() {
  await Promise.all(recipes.map(async recipe => {
    if (!recipe.imageId) return
    try {
      const blob = await readImage(recipe.imageId)
      if (blob) recipe.image = URL.createObjectURL(blob)
    } catch (error) {
      console.warn('图片读取失败。', error)
    }
  }))
  render()
}

async function bootstrapCloudSync() {
  const enabled = await initCloud()
  if (!enabled) return
  try {
    const cloudRecipes = await loadCloudLibrary()
    const cloudLibraryExists = Array.isArray(cloudRecipes)
    const syncedRecipes = cloudLibraryExists ? cloudRecipes : recipes
    await Promise.all(syncedRecipes.map(async recipe => {
      if (!recipe.imageId) return
      const localBlob = await readImage(recipe.imageId).catch(() => null)
      if (!cloudLibraryExists && localBlob) await uploadCloudImage(recipe.imageId, localBlob).catch(() => null)
      recipe.image = localBlob ? URL.createObjectURL(localBlob) : getCloudImageUrl(recipe.imageId)
    }))
    recipes = syncedRecipes
    const serializable = recipes.map(({ image, ...recipe }) => recipe)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
    if (!cloudLibraryExists) await saveCloudLibrary(serializable)
    render()
  } catch (error) {
    console.warn('云端菜谱读取失败，继续使用本机数据。', error)
  }
}

function setupImagePreviewInteractions() {
  const image = document.getElementById('preview-image')
  if (!image) return
  const pointers = new Map()
  let scale = 1
  let translateX = 0
  let translateY = 0
  let startDistance = 0
  let startScale = 1
  let lastPoint = null
  let gestureStart = null
  let lastTap = null
  let touchDoubleTapAt = 0

  const applyTransform = () => {
    image.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`
  }
  const clampScale = value => Math.min(4, Math.max(1, value))
  const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y)

  const toggleZoom = () => {
    if (scale > 1) { scale = 1; translateX = 0; translateY = 0 }
    else scale = 2.5
    image.classList.toggle('zoomed', scale > 1)
    applyTransform()
  }

  image.addEventListener('dblclick', event => {
    event.preventDefault()
    if (Date.now() - touchDoubleTapAt < 500) return
    toggleZoom()
  })

  image.addEventListener('pointerdown', event => {
    image.setPointerCapture?.(event.pointerId)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) {
      lastPoint = { x: event.clientX, y: event.clientY }
      gestureStart = { x: event.clientX, y: event.clientY }
    }
    if (pointers.size === 2) {
      startDistance = distance([...pointers.values()])
      startScale = scale
      lastPoint = null
    }
  })

  image.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 2 && startDistance) {
      scale = clampScale(startScale * distance([...pointers.values()]) / startDistance)
      image.classList.toggle('zoomed', scale > 1)
      applyTransform()
    } else if (pointers.size === 1 && scale > 1 && lastPoint) {
      translateX += event.clientX - lastPoint.x
      translateY += event.clientY - lastPoint.y
      lastPoint = { x: event.clientX, y: event.clientY }
      applyTransform()
    }
  })

  const releasePointer = event => {
    const wasTap = pointers.size === 1 && gestureStart && Math.hypot(event.clientX - gestureStart.x, event.clientY - gestureStart.y) < 10
    if (wasTap && event.pointerType === 'touch') {
      const now = Date.now()
      if (lastTap && now - lastTap.time < 320 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 40) {
        touchDoubleTapAt = now
        toggleZoom()
        lastTap = null
      } else lastTap = { time: now, x: event.clientX, y: event.clientY }
    }
    pointers.delete(event.pointerId)
    startDistance = 0
    gestureStart = null
    if (pointers.size === 1) lastPoint = [...pointers.values()][0]
    if (scale === 1) { translateX = 0; translateY = 0; applyTransform() }
  }
  image.addEventListener('pointerup', releasePointer)
  image.addEventListener('pointercancel', releasePointer)
}

function startNewRecipe() {
  draft = { name: '', categories: [], ingredients: '', seasonings: '', steps: '', tips: '', note: '', image: null, imageFile: null, imageId: null, removeImage: false }
  page = 'new'
  draftDirty = false
  formExitPrompt = false
  render()
}

function startEditRecipe() {
  const recipe = recipes.find(item => item.id === selectedId)
  draft = {
    id: recipe.id,
    name: recipe.name,
    categories: [...recipe.categories],
    ingredients: recipe.ingredients.join('\n'),
    seasonings: recipe.seasonings.join('\n'),
    steps: recipe.steps.join('\n'),
    tips: recipe.tips || '',
    image: recipe.image,
    imageFile: null,
    imageId: recipe.imageId || null,
    removeImage: false,
  }
  page = 'edit'
  draftDirty = false
  formExitPrompt = false
  render()
}

async function saveRecipe() {
  syncDraftFields()
  if (!draft.name.trim()) {
    document.getElementById('draft-name')?.classList.add('invalid')
    document.getElementById('draft-name')?.focus()
    return
  }
  const now = new Date()
  const date = now.toLocaleDateString('sv-SE')
  const isEditing = page === 'edit'
  const current = isEditing ? recipes.find(recipe => recipe.id === draft.id) : null
  const id = isEditing ? current.id : Date.now()
  let imageId = draft.imageId || null
  if (draft.imageFile) {
    imageId = imageId || uniqueId(`recipe-${id}`)
    try {
      await storeImage(imageId, draft.imageFile)
      await uploadCloudImage(imageId, draft.imageFile).catch(error => console.warn('图片云端上传失败。', error))
      if (current?.image?.startsWith('blob:') && current.image !== draft.image) URL.revokeObjectURL(current.image)
    } catch (error) {
      window.alert('图片保存失败，请重新选择图片。')
      return
    }
  }
  if (draft.removeImage && imageId) {
    try {
      await removeStoredImage(imageId)
      await deleteCloudImage(imageId).catch(error => console.warn('云端图片删除失败。', error))
      if (current?.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
      imageId = null
    } catch (error) {
      window.alert('图片删除失败，请稍后重试。')
      return
    }
  }
  const recipe = {
    id, name: draft.name.trim(), categories: [...draft.categories],
    ingredients: splitLines(draft.ingredients), seasonings: splitLines(draft.seasonings), steps: splitLines(draft.steps),
    tips: draft.tips.trim(),
    notes: isEditing ? current.notes : (draft.note.trim() ? [{ id: uniqueId('note'), date, text: draft.note.trim() }] : []),
    image: draft.removeImage ? null : draft.image,
    imageId,
    createdAt: current?.createdAt || now.toISOString(), modifiedAt: now.toISOString(),
  }
  recipes = isEditing ? recipes.map(item => item.id === id ? recipe : item) : [recipe, ...recipes]
  persistRecipes()
  activeCategory = '全部'
  query = ''
  page = isEditing ? 'detail' : 'home'
  selectedId = isEditing ? id : selectedId
  draft = null
  draftDirty = false
  formExitPrompt = false
  render()
}

function leaveFormWithoutSaving() {
  if (draft?.imageFile && draft.image?.startsWith('blob:')) URL.revokeObjectURL(draft.image)
  page = draft?.id ? 'detail' : 'home'
  draft = null
  draftDirty = false
  formExitPrompt = false
  render()
}

function syncDraftFields() {
  document.querySelectorAll('[data-draft]').forEach(field => { draft[field.dataset.draft] = field.value })
}

function updateSearchResults() {
  const panel = document.querySelector('.recipe-panel')
  if (panel) panel.innerHTML = recipePanelTemplate()
  document.querySelector('.clear-search')?.classList.toggle('hidden', !query)
}

function centerActiveCategory() {
  const navigation = document.querySelector('.category-nav')
  const active = navigation?.querySelector('.active')
  if (!navigation || !active) return
  navigation.scrollLeft = Math.max(0, active.offsetLeft - (navigation.clientWidth - active.offsetWidth) / 2)
}

function openNoteEditor(noteId = null) {
  const recipe = recipes.find(item => item.id === selectedId)
  const note = noteId ? recipe.notes.find(item => String(item.id) === String(noteId)) : null
  noteEditor = note ? { id: note.id, date: note.date, text: note.text } : { id: null, date: new Date().toLocaleDateString('sv-SE'), text: '' }
  render()
  setTimeout(() => document.getElementById(note ? 'note-text' : 'note-date')?.focus())
}

function saveNote() {
  const dateInput = document.getElementById('note-date')
  const textInput = document.getElementById('note-text')
  const date = dateInput?.value
  const text = textInput?.value.trim()
  if (!date) { dateInput?.focus(); return }
  if (!text) { textInput?.classList.add('invalid'); textInput?.focus(); return }
  recipes = recipes.map(recipe => {
    if (recipe.id !== selectedId) return recipe
    const notes = noteEditor.id
      ? recipe.notes.map(note => String(note.id) === String(noteEditor.id) ? { ...note, date, text } : note)
      : [{ id: `note-${Date.now()}`, date, text }, ...recipe.notes]
    notes.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)))
    return { ...recipe, notes, modifiedAt: new Date().toISOString() }
  })
  noteEditor = null
  persistRecipes()
  render()
}

function deleteNote(noteId) {
  if (!window.confirm('确定删除这条备注吗？')) return
  recipes = recipes.map(recipe => recipe.id === selectedId ? { ...recipe, notes: recipe.notes.filter(note => String(note.id) !== String(noteId)), modifiedAt: new Date().toISOString() } : recipe)
  noteEditor = null
  persistRecipes()
  render()
}

function openRecipe(recipeId) {
  const viewedAt = new Date().toISOString()
  recipes = recipes.map(recipe => recipe.id === recipeId ? { ...recipe, lastViewedAt: viewedAt } : recipe)
  persistRecipes()
  selectedId = recipeId
  page = 'detail'
  history.pushState({ appPage: 'detail', recipeId }, '')
  render()
}

function goHome(fromHistory = false) {
  if (!fromHistory && history.state?.appPage === 'detail') {
    history.back()
    return
  }
  selectedId = null
  imageMenu = false
  imagePreview = false
  noteEditor = null
  page = 'home'
  render()
}

function setupEdgeSwipeBack() {
  const shell = document.querySelector('.detail-shell')
  if (!shell || imageMenu || imagePreview) return
  let tracking = false
  let horizontal = false
  let startX = 0
  let startY = 0
  let currentX = 0
  let startedAt = 0

  shell.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || event.touches[0].clientX > 28) return
    const touch = event.touches[0]
    tracking = true
    horizontal = false
    startX = currentX = touch.clientX
    startY = touch.clientY
    startedAt = performance.now()
    shell.classList.add('edge-swipe-active')
  }, { passive: true })

  shell.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = Math.max(0, touch.clientX - startX)
    const dy = touch.clientY - startY
    if (!horizontal && Math.abs(dy) > 12 && Math.abs(dy) > dx) {
      tracking = false
      shell.classList.remove('edge-swipe-active')
      return
    }
    if (dx > 8 && dx > Math.abs(dy) * 1.15) horizontal = true
    if (!horizontal) return
    event.preventDefault()
    currentX = touch.clientX
    shell.style.transform = `translate3d(${Math.min(dx, innerWidth)}px,0,0)`
  }, { passive: false })

  const finish = () => {
    if (!tracking) return
    const distance = Math.max(0, currentX - startX)
    const velocity = distance / Math.max(1, performance.now() - startedAt)
    const shouldReturn = horizontal && (distance > Math.min(96, innerWidth * .25) || (distance > 45 && velocity > .45))
    tracking = false
    shell.classList.remove('edge-swipe-active')
    shell.style.transition = 'transform 180ms cubic-bezier(.22,.75,.25,1)'
    shell.style.transform = shouldReturn ? `translate3d(${innerWidth}px,0,0)` : 'translate3d(0,0,0)'
    if (shouldReturn) setTimeout(goHome, 175)
    else setTimeout(() => { shell.style.transition = ''; shell.style.transform = '' }, 190)
  }
  shell.addEventListener('touchend', finish, { passive: true })
  shell.addEventListener('touchcancel', finish, { passive: true })
}

function render(preserveFocus = false) {
  if (page === 'new' || page === 'edit') root.innerHTML = newRecipeTemplate()
  else if (page === 'detail') root.innerHTML = detailTemplate(recipes.find(recipe => recipe.id === selectedId))
  else root.innerHTML = homeTemplate()
  if (preserveFocus) { const input = document.getElementById('search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length) }
  if (imagePreview) setupImagePreviewInteractions()
  if (page === 'detail') setupEdgeSwipeBack()
  if (page === 'home') requestAnimationFrame(centerActiveCategory)
}

async function startApplication() {
  if (appStarted) return
  appStarted = true
  history.replaceState({ appPage: 'home' }, '')
  render()
  await hydrateRecipeImages()
  await bootstrapCloudSync()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(error => console.warn('离线服务启动失败。', error))
}

window.addEventListener('popstate', event => {
  if (!appStarted) return
  const recipeId = Number(event.state?.recipeId)
  if (event.state?.appPage === 'detail' && recipes.some(recipe => recipe.id === recipeId)) {
    selectedId = recipeId
    page = 'detail'
    render()
    return
  }
  goHome(true)
})

async function checkAccess() {
  root.innerHTML = authLoadingTemplate()
  try {
    const response = await fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
    const result = await response.json()
    if (response.ok && result.authenticated) return startApplication()
    root.innerHTML = authTemplate(response.status === 503 ? result.error : '')
  } catch {
    root.innerHTML = authTemplate('暂时无法验证访问，请检查网络后重试')
  }
}

root.addEventListener('input', event => {
  if (event.target.id === 'search') {
    query = event.target.value
    if (!searchIsComposing && !event.isComposing) updateSearchResults()
  }
  if (event.target.dataset.draft && draft) {
    draft[event.target.dataset.draft] = event.target.value
    draftDirty = true
  }
})

root.addEventListener('submit', async event => {
  if (event.target.id !== 'auth-form') return
  event.preventDefault()
  if (authBusy) return
  const password = new FormData(event.target).get('password')
  authBusy = true
  root.innerHTML = authTemplate()
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const result = await response.json()
    authBusy = false
    if (response.ok) return startApplication()
    root.innerHTML = authTemplate(result.error || '密码不正确')
    document.getElementById('app-password')?.focus()
  } catch {
    authBusy = false
    root.innerHTML = authTemplate('网络连接失败，请稍后重试')
  }
})

root.addEventListener('compositionstart', event => {
  if (event.target.id === 'search') searchIsComposing = true
})

root.addEventListener('compositionupdate', event => {
  if (event.target.id === 'search') query = event.target.value
})

root.addEventListener('compositionend', event => {
  if (event.target.id !== 'search') return
  query = event.target.value
  searchIsComposing = false
  updateSearchResults()
})

root.addEventListener('change', async event => {
  const file = event.target.files?.[0]
  if (!file) return
  if (event.target.id === 'draft-file-input') {
    if (draft.imageFile && draft.image?.startsWith('blob:')) URL.revokeObjectURL(draft.image)
    draft.imageFile = file
    draft.image = URL.createObjectURL(file)
    draft.removeImage = false
    draftDirty = true
    render()
  }
  if (event.target.id === 'file-input') {
    const current = recipes.find(recipe => recipe.id === selectedId)
    const imageId = current.imageId || uniqueId(`recipe-${current.id}`)
    try {
      await storeImage(imageId, file)
      await uploadCloudImage(imageId, file).catch(error => console.warn('图片云端上传失败。', error))
      if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
      recipes = recipes.map(recipe => recipe.id === selectedId ? { ...recipe, image: URL.createObjectURL(file), imageId, modifiedAt: new Date().toISOString() } : recipe)
      persistRecipes()
      render()
    } catch (error) {
      window.alert('图片保存失败，请重新选择图片。')
    }
  }
})

root.addEventListener('click', event => {
  const target = event.target.closest('[data-action], [data-category], [data-recipe], [data-draft-category], [data-edit-note], [data-delete-note]')
  if (!target) return
  const action = target.dataset.action
  if (target.dataset.category) { activeCategory = target.dataset.category; render(); return }
  if (target.dataset.recipe) { openRecipe(Number(target.dataset.recipe)); return }
  if (target.dataset.draftCategory) { syncDraftFields(); const category = target.dataset.draftCategory; draft.categories = draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category]; draftDirty = true; render(); return }
  if (target.dataset.editNote) { openNoteEditor(target.dataset.editNote); return }
  if (target.dataset.deleteNote) { deleteNote(target.dataset.deleteNote); return }
  if (action === 'add-note') { openNoteEditor(); return }
  if (action === 'cancel-note') { noteEditor = null; render(); return }
  if (action === 'save-note') { saveNote(); return }
  if (action === 'new-recipe') { startNewRecipe(); return }
  if (action === 'edit-recipe') { startEditRecipe(); return }
  if (action === 'save-recipe') { saveRecipe(); return }
  if (action === 'cancel-form') {
    syncDraftFields()
    if (page === 'edit' && draftDirty) { formExitPrompt = true; render(); return }
    leaveFormWithoutSaving()
    return
  }
  if (action === 'discard-changes') { leaveFormWithoutSaving(); return }
  if (action === 'continue-editing') { formExitPrompt = false; render(); return }
  if (action === 'save-and-exit') { saveRecipe(); return }
  if (action === 'choose-draft-image') { document.getElementById('draft-file-input')?.click(); return }
  if (action === 'remove-draft-image') {
    if (draft.imageFile && draft.image?.startsWith('blob:')) URL.revokeObjectURL(draft.image)
    draft.image = null
    draft.imageFile = null
    draft.removeImage = true
    draftDirty = true
    render()
    return
  }
  if (action === 'clear') { query = ''; const search = document.getElementById('search'); if (search) { search.value = ''; search.focus() } updateSearchResults(); return }
  if (action === 'back-home') { goHome(); return }
  if (action === 'add-image' && page === 'detail') { document.getElementById('file-input')?.click(); return }
  if (action === 'add-image') { openRecipe(Number(target.closest('[data-recipe]')?.dataset.recipe)); return }
  if (action === 'image-menu' && page === 'detail') { event.stopPropagation(); imageMenu = true; render(); return }
  if (action === 'close-menu' && (target === event.target || target.classList.contains('cancel'))) { imageMenu = false; render(); return }
  if (action === 'replace-image') { imageMenu = false; render(); setTimeout(() => document.getElementById('file-input')?.click()); return }
  if (action === 'delete-image') {
    const current = recipes.find(recipe => recipe.id === selectedId)
    removeStoredImage(current.imageId).catch(error => console.warn('图片删除失败。', error))
    deleteCloudImage(current.imageId).catch(error => console.warn('云端图片删除失败。', error))
    if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
    recipes = recipes.map(recipe => recipe.id === selectedId ? { ...recipe, image: null, imageId: null, modifiedAt: new Date().toISOString() } : recipe)
    persistRecipes()
    imageMenu = false
    render()
    return
  }
  if (action === 'view-image') { imageMenu = false; imagePreview = true; render(); return }
  if (action === 'close-preview') { imagePreview = false; render() }
})

checkAccess()
