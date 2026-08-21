import { cleanupCloudImages, clearCloudImageResponseCache, clearCloudStaticResponseCache, confirmCloudRecipeImageBinding, createCloudCookEvent, deleteCloudCookEvent, deleteCloudRecipe, deleteCloudImage, downloadCloudImage, initCloud, loadCloudCookStatus, loadCloudLibrary, loadCloudFamilyStats, loadCloudAnnualTrend, loadCloudRanking, loadCloudStorageStats, saveCloudLibrary, saveCloudRecipe, uploadCloudImage } from './cloud.js'
import { initSupabaseSessionBridge } from './supabase-session.js'

const categories = ['全部', '热菜', '凉菜', '汤类', '主食', '粥类', '甜品', '肉菜', '素菜']
const homeCategories = categories.filter(category => category !== '粥类')
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
const IMAGE_META_STORE = 'image-meta'
const RECIPE_META_STORE = 'recipe-meta'
const STATS_CACHE_STORE = 'stats-cache'
const HOME_PRELOAD_LIMIT = 20
const STATS_REVALIDATE_INTERVAL_MS = 45_000
const YEARLY_TREND_Y_MAX = 40
const YEARLY_TREND_Y_TICKS = [0, 10, 20, 30, 40]
const USER_CACHE_KEY = 'family-recipes-last-user'
const OPEN_ORDER_KEY = 'family-recipes-open-order'
const APP_VERSION = 'v1.0.14'
const THEME_KEY = 'zanjia-theme'
const IMAGE_DECODE_TIMEOUT_MS = 12_000
const IMAGE_ENCODE_TIMEOUT_MS = 12_000

function getSafeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const probeKey = '__zanjia_storage_probe__'
    window.localStorage.setItem(probeKey, '1')
    window.localStorage.removeItem(probeKey)
    return window.localStorage
  } catch {
    return null
  }
}

function storageGet(key) {
  try {
    return getSafeStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function storageSet(key, value) {
  try {
    getSafeStorage()?.setItem(key, value)
  } catch {
    // Storage can be unavailable in private mode or damaged PWA containers.
  }
}

function storageRemove(key) {
  try {
    getSafeStorage()?.removeItem(key)
  } catch {
    // Storage removal is best-effort; app state still resets in memory.
  }
}

function userStorageKey() {
  return currentUser?.id ? `${STORAGE_KEY}:${currentUser.id}` : STORAGE_KEY
}

function userOpenOrderKey() {
  return currentUser?.id ? `${OPEN_ORDER_KEY}:${currentUser.id}` : OPEN_ORDER_KEY
}

function loadOpenOrder() {
  try {
    const value = JSON.parse(storageGet(userOpenOrderKey()) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function touchRecipeOpen(recipeId) {
  const order = loadOpenOrder()
  const nextSequence = Object.values(order).reduce((max, value) => Math.max(max, Number(value) || 0), 0) + 1
  order[String(recipeId)] = nextSequence
  storageSet(userOpenOrderKey(), JSON.stringify(order))
}

function saveCachedUser(user) {
  if (!user?.id) return
  storageSet(USER_CACHE_KEY, JSON.stringify(user))
}

function loadCachedUser() {
  try {
    const user = JSON.parse(storageGet(USER_CACHE_KEY))
    return user?.id ? user : null
  } catch {
    return null
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = themeMode
}

function toggleTheme() {
  themeMode = themeMode === 'dark' ? 'light' : 'dark'
  storageSet(THEME_KEY, themeMode)
  applyTheme()
  render()
}

function loadRecipes() {
  try {
    const saved = JSON.parse(storageGet(userStorageKey()))
    if (Array.isArray(saved)) return saved.map(normalizeRecipe)
  } catch (error) {
    console.warn('本地菜谱读取失败，将使用初始数据。', error)
  }
  return currentUser ? [] : starterRecipes
}

async function hydrateRecipesFromIndexedDB({ renderCached = true } = {}) {
  try {
    const cached = await readRecipeCache()
    if (!Array.isArray(cached) || !cached.length) return false
    const nextRecipes = cached.map(normalizeRecipe)
    if (recipesChanged(nextRecipes)) {
      recipes = nextRecipes
      if (renderCached) render()
      hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), renderCached).catch(() => null)
    }
    return true
  } catch (error) {
    console.warn('IndexedDB 菜谱缓存读取失败。', error)
    return false
  }
}

function normalizeRecipe(recipe) {
  const { image, ...rest } = recipe
  const ingredients = mergeMaterialLines(rest.ingredients, rest.seasonings)
  return {
    ...rest,
    image: null,
    ingredients,
    seasonings: [],
    categories: rest.categories || [],
    tags: [],
    notes: (rest.notes || []).map(note => ({ ...note, id: note.id || uniqueId('note') })),
    favoriteUserIds: rest.favoriteUserIds || [],
    cookRecords: (rest.cookRecords || []).map(record => ({ ...record, id: record.id || uniqueId('cook') })),
    cookCount: Number(rest.cookCount || (rest.cookRecords || []).length || 0),
    lastCookedAt: rest.lastCookedAt || null,
  }
}

function materialLines(value) {
  if (Array.isArray(value)) return value.flatMap(item => String(item ?? '').split(/\r?\n/))
  return String(value ?? '').split(/\r?\n/)
}

function mergeMaterialLines(...values) {
  const seen = new Set()
  const merged = []
  values.flatMap(materialLines).forEach(value => {
    const line = String(value || '').trim()
    if (!line || seen.has(line)) return
    seen.add(line)
    merged.push(line)
  })
  return merged
}

let recipes = []

let activeCategory = '全部'
let activeScope = 'mine'
let homeView = 'home'
let query = ''
let monthlyRanking = []
let rankingPeriod = 'all'
let rankingYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(new Date()))
let rankingMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', month: 'numeric' }).format(new Date()))
let familyStatsPeriod = 'all'
let familyStatsYear = rankingYear
let familyStatsMonth = rankingMonth
let familyStats = { visible: false, members: [] }
let familyStatsLoading = false
let familyStatsDataState = 'unknown'
let familyStatsRequestGeneration = 0
let annualTrend = { visible: false, year: rankingYear, members: [] }
let annualTrendYear = rankingYear
let annualTrendDataState = 'unknown'
let annualTrendRequestGeneration = 0
let annualTrendPoint = null
let rankingRequestGeneration = 0
let rankingDataState = 'unknown'
const statsMemoryCache = new Map()
let cookStatus = { recipeId: null, count: 0, todayRecorded: false, loading: false, busy: false }
let selectedId = null
let page = 'home'
let members = []
let memberDraft = { loginCode: '', displayName: '', pin: '' }
let imageMenu = false
let draft = null
let draftDirty = false
let draftGeneration = 0
let draftBusy = false
let draftImageBusy = false
let recipeImageBusy = false
let suppressHomeClickUntil = 0
let recipeImageUploadGeneration = 0
let activeRecipeImageOperation = null
let recipeImageStatus = null
let formExitPrompt = false
let deleteRecipePrompt = false
let searchIsComposing = false
let noteEditor = null
let cookEditor = null
let imagePreview = false
const root = document.getElementById('root')
let appStarted = false
let authBusy = false
let cloudReady = false
let refreshing = false
let preloadingImages = false
let currentUser = null
let sessionWatchStarted = false
let familyMemberCount = 0
let viewingMember = null
let settingsMenuOpen = false
let themeMode = storageGet(THEME_KEY) || 'light'
const imageObjectUrls = new Map()
const imageRetrying = new Set()
const imageLoadPromises = new Map()
const imageBlobPromises = new Map()

function syncMenuScrollLock() {
  const locked = Boolean(settingsMenuOpen)
  document.documentElement.classList.toggle('menu-open', locked)
  document.body.classList.toggle('menu-open', locked)
}

const icons = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  add: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 20"/><path d="M17 3v4M15 5h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
}

function recipeImageStageLabel(stage) {
  return ({ processing: '正在处理图片…', uploading: '正在上传图片…', saving: '正在保存…' })[stage] || ''
}

function recipeImageStatusFor(recipe) {
  if (!recipeImageStatus || !sameId(recipeImageStatus.recipeId, recipe?.id)) return ''
  return `<span class="image-upload-status" role="status" aria-live="polite">${recipeImageStageLabel(recipeImageStatus.stage)}</span>`
}

function logRecipeImageStage(stage, details = {}) {
  console.info(JSON.stringify({ stage, ...details }))
}

function beginRecipeImageOperation(recipeId) {
  const operation = { recipeId, generation: ++recipeImageUploadGeneration, previousRecipes: recipes }
  activeRecipeImageOperation = operation
  recipeImageBusy = true
  recipeImageStatus = { recipeId, generation: operation.generation, stage: 'processing' }
  return operation
}

function isCurrentRecipeImageOperation(operation) {
  return activeRecipeImageOperation === operation
    && operation.generation === recipeImageUploadGeneration
    && page === 'detail'
    && sameId(selectedId, operation.recipeId)
}

function setRecipeImageStage(operation, stage) {
  if (!isCurrentRecipeImageOperation(operation)) {
    logRecipeImageStage('UPLOAD_OPERATION_STALE', { recipeId: operation.recipeId, generation: operation.generation })
    return false
  }
  recipeImageStatus = { recipeId: operation.recipeId, generation: operation.generation, stage }
  render()
  return true
}

function invalidateRecipeImageOperation() {
  if (activeRecipeImageOperation?.previousRecipes) recipes = activeRecipeImageOperation.previousRecipes
  recipeImageUploadGeneration += 1
  activeRecipeImageOperation = null
  recipeImageBusy = false
  recipeImageStatus = null
}

function finishRecipeImageOperation(operation) {
  if (activeRecipeImageOperation !== operation || operation.generation !== recipeImageUploadGeneration) return
  activeRecipeImageOperation = null
  recipeImageBusy = false
  recipeImageStatus = null
}

function imageArea(recipe, compact = false) {
  const status = recipeImageStatusFor(recipe)
  const busy = Boolean(status)
  if (busy && !recipe.image && page === 'detail') return `<button class="image-area placeholder" disabled aria-busy="true"><span class="camera-ring">${icons.add}</span>${status}</button>`
  if (compact) {
    if (recipe.image) return `<div class="image-area has-image compact"><img src="${recipe.image}" data-image-id="${escapeHtml(recipe.imageId || '')}" alt="${escapeHtml(recipe.name)}"></div>`
    return `<div class="image-area placeholder compact"><span class="placeholder-plus" aria-hidden="true">+</span><strong>添加图片</strong></div>`
  }
  if (recipe.image) return `<button class="image-area has-image" data-action="view-image"${busy ? ' disabled aria-busy="true"' : ''}><img src="${recipe.image}" data-image-id="${escapeHtml(recipe.imageId || '')}" alt="${escapeHtml(recipe.name)}">${status}</button>`
  if (page === 'detail' && !canEditRecipe(recipe)) return `<div class="image-area placeholder"><span class="placeholder-plus" aria-hidden="true">+</span><strong>暂无图片</strong></div>`
  return `<button class="image-area placeholder" data-action="add-image"><span class="camera-ring">${icons.add}</span><strong>点击加图</strong><small>上传这道菜的成品照片</small></button>`
}

function getFilteredRecipes() {
  const keyword = query.trim().toLowerCase()
  const openOrder = loadOpenOrder()
  return recipes.filter(recipe => {
    const scopeMatch = matchScope(recipe)
    const categoryMatch = activeCategory === '全部' || recipe.categories.includes(activeCategory)
    const searchableText = [
      recipe.name,
      ...(recipe.ingredients || []),
      ...(recipe.steps || []),
      recipe.tips || '',
      ...(recipe.notes || []).map(note => note.text || ''),
      ...(recipe.cookRecords || []).map(record => `${record.note || ''} ${record.date || ''}`),
    ].join(' ').toLowerCase()
    return scopeMatch && categoryMatch && (!keyword || searchableText.includes(keyword))
  }).sort((a, b) => {
    if (activeScope === 'recentCooked') return String(b.lastCookedAt || '').localeCompare(String(a.lastCookedAt || ''))
    if (activeScope === 'mostCooked') return Number(b.cookCount || 0) - Number(a.cookCount || 0)
    const opened = Number(openOrder[String(b.id)] || 0) - Number(openOrder[String(a.id)] || 0)
    if (opened) return opened
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
}

function sameId(left, right) {
  return String(left ?? '') === String(right ?? '')
}

function findRecipeById(id) {
  return recipes.find(recipe => sameId(recipe.id, id))
}

function isAdmin() {
  return currentUser?.role === 'admin'
}

function isFavorite(recipe) {
  return Boolean(currentUser?.id && (recipe?.favoriteUserIds || []).includes(currentUser.id))
}

function relativeDate(dateText) {
  if (!dateText) return ''
  const today = new Date()
  const date = new Date(dateText)
  const diff = Math.round((new Date(today.toDateString()) - new Date(date.toDateString())) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff > 1) return `${diff}天前`
  return dateText.slice(0, 10)
}

function authLoadingTemplate() {
  return `<main class="auth-screen"><section class="auth-card auth-loading"><div class="auth-mark">家</div><p>正在打开咱家菜谱…</p></section></main>`
}

function startupFailureTemplate(error = '未知错误') {
  const rawMessage = error?.message || error?.reason?.message || String(error || '未知错误')
  return `<main class="auth-screen"><section class="auth-card auth-loading"><div class="auth-mark">家</div><p class="startup-failure-title">页面加载失败</p><p class="startup-failure-message">错误信息：${escapeHtml(rawMessage)}</p><button class="primary-button" type="button" data-action="reload-only">重新加载</button><button class="secondary-button" type="button" data-action="reload-app">清除缓存并重试</button></section></main>`
}

async function clearStartupShellCache() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    }
    if (typeof caches !== 'undefined') {
      const cacheKeys = await caches.keys()
      await Promise.all(cacheKeys.filter(key => !key.startsWith('family-recipes-image-responses')).map(key => caches.delete(key)))
    }
  } catch (error) {
    console.warn('启动缓存清理失败。', error)
  }
}

async function reloadLatestVersion() {
  await clearStartupShellCache()
  window.location.reload()
}

function showStartupFailure(error) {
  console.error('应用启动失败。', error)
  const target = root || document.getElementById('root')
  const html = startupFailureTemplate(error)
  if (target) target.innerHTML = html
  else document.body.innerHTML = html
}

function installGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    if (!appStarted) showStartupFailure(error || `${message} at ${source}:${lineno}:${colno}`)
    else console.error('Runtime error', error || message, { source, lineno, colno })
    return false
  }
  window.onunhandledrejection = event => {
    if (appStarted) {
      console.error('Unhandled Promise rejection', event.reason)
      return
    }
    showStartupFailure(event.reason || '未捕获 Promise 错误')
  }
}

function periodLabel(period, year, month) {
  if (period === 'all') return '总计'
  return period === 'year' ? `${year}年` : `${year}年${month}月`
}

function shortMemberName(name) {
  return String(name || '').replace(/菜谱$/, '')
}

function sortFamilyMembers(rows) {
  const order = ['爸爸', '妈妈', '晓晰', '晓婉']
  return [...rows].sort((a, b) => {
    const ai = order.indexOf(shortMemberName(a.name))
    const bi = order.indexOf(shortMemberName(b.name))
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
}

const MIN_NONZERO_BAR_HEIGHT = 4

function visualBarHeight(value, sharedMax) {
  const amount = Number(value) || 0
  const maximum = Math.max(1, Number(sharedMax) || 0)
  if (!amount) return 0
  const ratio = Math.min(1, Math.max(0, amount / maximum))
  if (ratio >= 1) return '100%'
  const percentage = (ratio * 100).toFixed(3)
  const basePixels = (MIN_NONZERO_BAR_HEIGHT * (1 - ratio)).toFixed(3)
  return `calc(${percentage}% + ${basePixels}px)`
}

function familyStatsTemplate() {
  if (currentUser?.role === 'guest' || !familyStats.visible) return ''
  const rows = sortFamilyMembers(Array.isArray(familyStats.members) ? familyStats.members : [])
  const sharedMax = Math.max(1, ...rows.flatMap(row => [Number(row.cookCount) || 0, Number(row.recipeCount) || 0]))
  const tabs = [['all', '总计'], ['year', '本年'], ['month', '本月']].map(([value, label]) => `<button type="button" class="stats-period-tab ${familyStatsPeriod === value ? 'active' : ''}" data-stats-period="${value}">${label}</button>`).join('')
  const now = currentMadridParts()
  const canNext = familyStatsPeriod === 'month' ? !(familyStatsYear > now.year || (familyStatsYear === now.year && familyStatsMonth >= now.month)) : !(familyStatsPeriod === 'year' && familyStatsYear >= now.year)
  const periodNav = familyStatsPeriod === 'all' ? '' : `<div class="stats-period-nav"><button type="button" data-action="family-stats-prev" aria-label="上一个">‹</button><strong>${periodLabel(familyStatsPeriod, familyStatsYear, familyStatsMonth)}</strong><button type="button" data-action="family-stats-next" aria-label="下一个" ${canNext ? '' : 'disabled'}>›</button></div>`
  const bars = rows.map((row, index) => {
    const cook = Number(row.cookCount) || 0
    const recipe = Number(row.recipeCount) || 0
    const cookHeight = visualBarHeight(cook, sharedMax)
    const recipeHeight = visualBarHeight(recipe, sharedMax)
    return `<div class="member-stat" data-member-index="${index}"><div class="member-stat-values"><span><b>${cook}</b>次</span><span><b>${recipe}</b>道</span></div><div class="member-stat-bars"><i class="member-bar cook" style="--bar-height:${cookHeight}"></i><i class="member-bar recipe" style="--bar-height:${recipeHeight}"></i></div><strong>${escapeHtml(shortMemberName(row.name))}</strong></div>`
  }).join('')
  return `<section class="family-stats-panel" aria-label="咱家做饭记录"><div class="family-stats-heading"><h2>咱家做饭记录</h2>${periodNav}</div><div class="stats-period-tabs">${tabs}</div><div class="member-stat-chart">${bars}</div><div class="member-stat-legend"><span><i class="legend-dot cook"></i>做菜次数</span><span><i class="legend-dot recipe"></i>新增菜谱</span></div></section>`
}

function annualTrendTemplate() {
  if (currentUser?.role === 'guest' || !annualTrend.visible) return ''
  const rows = sortFamilyMembers(Array.isArray(annualTrend.members) ? annualTrend.members : [])
  const now = currentMadridParts()
  const canNext = annualTrendYear < now.year
  const plot = { left: 34, right: 350, top: 16, bottom: 174 }
  const plotWidth = plot.right - plot.left
  const plotHeight = plot.bottom - plot.top
  const xFor = month => plot.left + ((month - 1) / 11) * plotWidth
  const yFor = value => plot.bottom - (Math.min(YEARLY_TREND_Y_MAX, Math.max(0, Number(value) || 0)) / YEARLY_TREND_Y_MAX) * plotHeight
  const grid = YEARLY_TREND_Y_TICKS.filter(value => value > 0).map(value => {
    const y = plot.bottom - (value / YEARLY_TREND_Y_MAX) * plotHeight
    return `<line class="annual-trend-grid" x1="${plot.left}" x2="${plot.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="annual-trend-axis-label" x="${plot.left - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${value}次</text>`
  }).join('')
  const monthLabels = Array.from({ length: 12 }, (_, index) => `<text class="annual-trend-month" x="${xFor(index + 1).toFixed(1)}" y="${plot.bottom + 20}" text-anchor="middle">${index + 1}月</text>`).join('')
  const lines = rows.map((row, rowIndex) => {
    const values = Array.isArray(row.months) ? row.months : []
    const segments = []
    let currentSegment = []
    values.forEach((value, index) => {
      if (value === null || value === undefined) {
        if (currentSegment.length) segments.push(currentSegment)
        currentSegment = []
        return
      }
      currentSegment.push({ x: xFor(index + 1), y: yFor(value), month: index + 1, count: Number(value) || 0 })
    })
    if (currentSegment.length) segments.push(currentSegment)
    const paths = segments.map(segment => `<path class="annual-trend-line" d="${segment.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}"></path>`).join('')
    const points = values.map((value, index) => {
      if (value === null || value === undefined || Number(value) === 0) return ''
      const x = xFor(index + 1)
      const y = yFor(value)
      const active = annualTrendPoint?.year === annualTrendYear && annualTrendPoint.memberIndex === rowIndex && annualTrendPoint.month === index + 1
      const attrs = `data-action="annual-trend-point" data-member-index="${rowIndex}" data-month="${index + 1}" data-count="${Number(value) || 0}" aria-label="${escapeHtml(shortMemberName(row.name))} ${annualTrendYear}年${index + 1}月 ${Number(value) || 0}次"`
      return `<circle class="annual-trend-point${active ? ' is-active' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" aria-hidden="true"></circle><circle class="annual-trend-point-hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" ${attrs}></circle>`
    }).join('')
    return `<g class="annual-trend-series member-${rowIndex + 1}">${paths}${points}</g>`
  }).join('')
  const tooltipRow = annualTrendPoint ? rows[annualTrendPoint.memberIndex] : null
  const tooltip = tooltipRow && annualTrendPoint.year === annualTrendYear ? `<div class="annual-trend-tooltip" role="status"><strong>${escapeHtml(shortMemberName(tooltipRow.name))}</strong><span>${annualTrendYear}年${annualTrendPoint.month}月 · ${annualTrendPoint.count}次</span></div>` : ''
  const legend = rows.map((row, index) => `<span class="member-${index + 1}"><i></i>${escapeHtml(shortMemberName(row.name))}</span>`).join('')
  return `<section class="annual-trend-panel" aria-label="今年做饭趋势"><div class="annual-trend-heading"><h2>今年做饭趋势</h2><div class="annual-trend-nav"><button type="button" data-action="annual-trend-prev" aria-label="上一个年份">‹</button><strong>${annualTrendYear}年</strong><button type="button" data-action="annual-trend-next" aria-label="下一个年份" ${canNext ? '' : 'disabled'}>›</button></div></div><div class="annual-trend-chart-wrap"><svg class="annual-trend-chart" viewBox="0 0 360 210" role="img" aria-label="${annualTrendYear}年四位家庭成员每月做菜次数趋势"><line class="annual-trend-axis" x1="${plot.left}" x2="${plot.left}" y1="${plot.top}" y2="${plot.bottom}"></line><line class="annual-trend-axis" x1="${plot.left}" x2="${plot.right}" y1="${plot.bottom}" y2="${plot.bottom}"></line>${grid}${lines}${monthLabels}</svg>${tooltip}</div><div class="annual-trend-legend">${legend}</div></section>`
}

function rankingTemplate() {
  const rankingMax = Math.max(1, ...monthlyRanking.map(item => Number(item.count) || 0))
  const label = periodLabel(rankingPeriod, rankingYear, rankingMonth)
  const now = currentMadridParts()
  const canNext = rankingPeriod === 'month' ? !(rankingYear > now.year || (rankingYear === now.year && rankingMonth >= now.month)) : !(rankingPeriod === 'year' && rankingYear >= now.year)
  const nav = rankingPeriod === 'all' ? '' : `<div class="ranking-period-nav"><button type="button" data-action="ranking-prev" aria-label="上一个">‹</button><strong>${label}</strong><button type="button" data-action="ranking-next" aria-label="下一个" ${canNext ? '' : 'disabled'}>›</button></div>`
  const tabs = [['all', '总计'], ['year', '本年'], ['month', '本月']].map(([value, text]) => `<button type="button" class="ranking-period-tab ${rankingPeriod === value ? 'active' : ''}" data-ranking-period="${value}">${text}</button>`).join('')
  const rankingRows = monthlyRanking.slice(0, 10).map((item, index) => `<button class="home-ranking-row" type="button" data-action="open-recipe" data-recipe-id="${escapeHtml(item.recipeId)}"><span class="home-ranking-position">${index + 1}</span><span class="home-ranking-name">${escapeHtml(item.name)}</span><span class="home-ranking-count">${Number(item.count) || 0}次</span><span class="home-ranking-bar" aria-hidden="true"><i style="width:${Math.round(((Number(item.count) || 0) / rankingMax) * 100)}%"></i></span></button>`).join('')
  const emptyState = rankingDataState === 'confirmed' || rankingDataState === 'cached' ? '<p class="home-leaderboard-empty">暂无做菜记录</p>' : '<p class="home-leaderboard-loading" aria-live="polite">正在加载统计…</p>'
  return `<section class="home-leaderboard" aria-label="家里最常做"><div class="home-leaderboard-heading"><h2>家里最常做</h2>${nav}</div><div class="ranking-period-tabs">${tabs}</div>${rankingRows || emptyState}</section>`
}

function recipePanelTemplate() {
  const filtered = getFilteredRecipes()
  const emptyTitle = activeScope === 'favorites' ? '还没有收藏菜谱' : '没有找到相关菜谱'
  const emptyHint = activeScope === 'favorites' ? '打开菜谱详情，点击收藏即可加入这里。' : '换个菜名或材料试试'
  const compactScope = currentUser?.role === 'guest' ? activeScope === 'shared' : activeScope === 'mine'
  const isCompactHome = page === 'home' && homeView === 'home' && !viewingMember && compactScope && activeCategory === '全部' && !query.trim()
  const visibleRecipes = isCompactHome ? filtered.slice(0, 6) : filtered
  const leaderboard = isCompactHome ? `${familyStatsTemplate()}${annualTrendTemplate()}${rankingTemplate()}` : ''
  return `<div class="recipe-list">
    ${visibleRecipes.map(recipe => `<article class="recipe-card" data-action="open-recipe" data-recipe-id="${escapeHtml(recipe.id)}" role="button" tabindex="0">${imageArea(recipe, true)}<div class="card-content"><h3>${escapeHtml(recipe.name)}</h3></div></article>`).join('')}
    ${visibleRecipes.length ? leaderboard : `<div class="empty-state">${icons.search}<h3>${emptyTitle}</h3><p>${emptyHint}</p></div>`}</div>`
}

const HOME_SCOPE_ORDER = ['mine', 'shared', 'favorites']

function setHomeScope(nextScope) {
  if (!HOME_SCOPE_ORDER.includes(nextScope)) return
  if (nextScope === 'mine' && activeScope === 'mine' && homeView === 'library' && !query.trim() && activeCategory === '全部') homeView = 'home'
  else {
    activeScope = nextScope
    homeView = 'library'
  }
  viewingMember = null
  settingsMenuOpen = false
  activeCategory = '全部'
  render()
}

function homeTemplate() {
  if (!homeCategories.includes(activeCategory)) activeCategory = '全部'
  return `<div class="app-shell home-shell">
    <header class="home-header"><div class="brand-row"><div><div class="eyebrow">OUR FAMILY TABLE</div><h1>咱家菜谱</h1><p class="account-subtitle">${escapeHtml(homeSubtitle())}</p></div><div class="header-actions">${globalActionsTemplate()}</div></div>
      <div class="home-action-row">
        ${viewingMember ? '<button class="secondary-mini-button" data-action="stop-view-member">返回我的首页</button>' : ''}
      </div>
      ${settingsMenuTemplate()}
      <div class="home-scope-controls">${statsTemplate()}</div>
      <div class="home-search-row"><label class="search-box">${icons.search}<input id="search" value="${escapeHtml(query)}" placeholder="搜索" autocomplete="off" enterkeyhint="search"><button class="clear-search ${query ? '' : 'hidden'}" data-action="clear" aria-label="清空搜索">${icons.close}</button></label>
      <nav class="category-nav" aria-label="菜谱分类">${homeCategories.map(category => `<button data-category="${category}" class="${category === activeCategory ? 'active' : ''}"><span>${category}</span></button>`).join('')}</nav></div></header>
    <div class="home-body"><main class="recipe-panel"><div class="pull-refresh-indicator ${refreshing ? 'visible' : ''}">${refreshing ? '正在同步最新菜谱…' : '下拉刷新'}</div>${recipePanelTemplate()}</main></div>
    </div>`
}

function membersTemplate() {
  return `<div class="app-shell form-shell"><header class="detail-header"><button class="icon-button" data-action="back-home" aria-label="返回">${icons.back}</button><div class="detail-header-title">家庭成员</div>${globalActionsTemplate()}</header>
    ${settingsMenuTemplate()}
    <main class="recipe-form">
      <section class="form-section">
        <div class="form-label"><strong>新增成员账号</strong><span>仅管理员可创建</span></div>
        <input class="form-control" id="member-login-code" placeholder="账号编号，例如 001" value="${escapeHtml(memberDraft.loginCode)}">
        <input class="form-control member-field" id="member-display-name" placeholder="显示名称，例如 孩子1" value="${escapeHtml(memberDraft.displayName)}">
        <input class="form-control member-field" id="member-pin-new" type="password" placeholder="PIN / 密码，至少 4 位" value="${escapeHtml(memberDraft.pin)}">
        <button class="primary-button member-create-button" data-action="create-member">创建账号</button>
      </section>
      <section class="form-section">
        <div class="form-label"><strong>已有成员</strong><span>${members.length} 个账号</span></div>
        <div class="member-list">${members.map(member => `<article class="member-card" data-member-view="${member.id}">
          <div><strong>${escapeHtml(member.displayName)}</strong><span>${escapeHtml(member.loginCode)} · ${member.role === 'admin' ? '管理员' : '成员'} · ${member.isActive ? '正常' : '已停用'}</span></div>
          <div class="member-actions">
            <button data-member-view="${member.id}">查看菜谱</button>
            ${member.role === 'admin' ? '' : `
            <button data-member-toggle="${member.id}">${member.isActive ? '停用' : '启用'}</button>
            <button data-member-pin="${member.id}">改 PIN</button>
            <button data-member-rename="${member.id}">改名</button>
            <button class="danger-text" data-member-delete="${member.id}">删除</button>
            `}
          </div>
        </article>`).join('') || '<p class="empty-copy">还没有家庭成员账号。</p>'}</div>
      </section>
    </main></div>`
}

function section(number, title, body) {
  return `<section class="recipe-section"><div class="recipe-section-title"><span>${number}</span><h2>${title}</h2></div><div class="recipe-section-body">${body}</div></section>`
}

function newRecipeTemplate() {
  const isEditing = page === 'edit'
  return `<div class="app-shell form-shell"><header class="detail-header"><button class="icon-button" data-action="cancel-form" aria-label="取消${isEditing ? '编辑' : '新增'}">${icons.back}</button><div class="detail-header-title">${isEditing ? '编辑菜谱' : '新增菜谱'}</div>${globalActionsTemplate()}</header>
    ${settingsMenuTemplate()}
    <main class="recipe-form">
      <section class="form-section photo-section"><div class="form-label"><strong>成品照片</strong><span>可选</span></div>
        ${draft.image ? `<button class="form-photo has-image" data-action="choose-draft-image" ${draftImageBusy || draftBusy ? 'disabled' : ''}><img src="${draft.image}" alt="待保存的菜谱图片"><span>更换图片</span></button><button class="remove-form-photo" data-action="remove-draft-image" ${draftImageBusy || draftBusy ? 'disabled' : ''}>删除图片</button>` : `<button class="form-photo placeholder" data-action="choose-draft-image" ${draftImageBusy || draftBusy ? 'disabled' : ''}><span class="camera-ring">${icons.add}</span><strong>点击加图</strong><small>建议使用横向 4:3 照片</small></button>`}
        <input id="draft-file-input" class="hidden-input" type="file" accept="image/*">
      </section>
      <section class="form-section"><label class="form-label" for="draft-name"><strong>菜名</strong><em>必填</em></label><input class="form-control" id="draft-name" data-draft="name" value="${escapeHtml(draft.name)}" placeholder="例如：香肠豆腐粉丝烩菜"></section>
      <section class="form-section"><div class="form-label"><strong>分类</strong><span>可多选</span></div><div class="category-picker">${selectableCategories.map(category => `<button type="button" data-draft-category="${category}" class="${draft.categories.includes(category) ? 'selected' : ''}">${category}</button>`).join('')}</div></section>
      <section class="form-section"><label class="share-toggle"><input type="checkbox" id="draft-family-shared" ${draft.isFamilyShared ? 'checked' : ''}><span><strong>家庭共享</strong><small>开启后，家人都能看到；只有创建者和管理员可以修改。</small></span></label></section>
      ${formTextarea('ingredients', '材料', '每行一种材料或调料，例如：\n鸡蛋 2个\n西红柿 1个\n生抽 2勺\n盐 少许')}
      ${formTextarea('steps', '制作步骤', '每行一个步骤，保存后自动编号', true)}
      ${formTextarea('tips', '注意事项', '例如：粉丝吸水，汤汁不要收得太干。')}
      ${isEditing ? '' : formTextarea('note', '备注', '记录这次做菜的心得，保存时会自动加入日期。')}
      <div class="form-bottom-actions"><button class="secondary-button" data-action="cancel-form" ${draftBusy ? 'disabled' : ''}>取消</button><button class="primary-button" data-action="save-recipe" ${draftBusy || draftImageBusy ? 'disabled' : ''}>${draftBusy ? '正在保存…' : (isEditing ? '保存修改' : '保存')}</button></div>
      ${isEditing ? '<button class="delete-recipe-button" data-action="request-delete-recipe">删除菜谱</button>' : ''}
    </main>${formExitPrompt ? unsavedChangesDialog() : ''}${deleteRecipePrompt ? deleteRecipeDialog() : ''}</div>`
}

function formTextarea(key, title, placeholder, tall = false) {
  return `<section class="form-section"><label class="form-label" for="draft-${key}"><strong>${title}</strong><span>${key === 'ingredients' || key === 'steps' ? '一行一项' : '可选'}</span></label><textarea class="form-control ${tall ? 'tall' : ''}" id="draft-${key}" data-draft="${key}" placeholder="${placeholder}">${escapeHtml(draft[key] || '')}</textarea></section>`
}

function actionSheet() { return `<div class="sheet-backdrop" data-action="close-menu"><div class="action-sheet"><div class="sheet-handle"></div><h2>图片操作</h2><button data-action="view-image">查看大图</button><button data-action="replace-image">更换图片</button><button class="danger" data-action="delete-image">删除图片</button><button class="cancel" data-action="close-menu">取消</button></div></div>` }
function imageLightbox(recipe) { return `<div class="image-lightbox"><button data-action="close-preview" aria-label="关闭大图">${icons.close}</button><div class="image-stage"><img id="preview-image" src="${recipe.image}" alt="${escapeHtml(recipe.name)}大图"></div><p>双击或双指缩放</p></div>` }
function unsavedChangesDialog() { return `<div class="confirm-backdrop"><div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">是否保存修改？</h2><p>你刚才修改的内容还没有保存。</p><div class="confirm-actions"><button class="discard" data-action="discard-changes">不保存</button><button class="continue" data-action="continue-editing">继续编辑</button><button class="save" data-action="save-and-exit">保存</button></div></div></div>` }
function deleteRecipeDialog() { return `<div class="confirm-backdrop"><div class="confirm-dialog delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-recipe-title"><h2 id="delete-recipe-title">确定要删除这个菜谱吗？</h2><p>删除后无法恢复。</p><div class="delete-confirm-actions"><button class="secondary-button" data-action="cancel-delete-recipe">取消</button><button class="confirm-delete-button" data-action="confirm-delete-recipe">确认删除</button></div></div></div>` }

function notesSection(recipe) {
  const notes = [...recipe.notes].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)))
  const editable = canEditRecipe(recipe)
  const form = noteEditor ? `<div class="note-editor">
    <label for="note-date"><span>日期</span><input id="note-date" type="date" value="${noteEditor.date}"></label>
    <label for="note-text"><span>备注内容</span><textarea id="note-text" placeholder="记录这次做菜的心得……">${escapeHtml(noteEditor.text)}</textarea></label>
    <div class="note-editor-actions"><button class="secondary-button" data-action="cancel-note">取消</button><button class="primary-button" data-action="save-note">保存备注</button></div>
  </div>` : ''
  const list = notes.length ? `<div class="note-list">${notes.map(note => `<article class="note"><div class="note-top"><time>${note.date}</time>${editable ? `<div class="note-actions"><button data-edit-note="${note.id}">编辑</button><button class="danger-text" data-delete-note="${note.id}">删除</button></div>` : ''}</div><p>${escapeHtml(note.text)}</p></article>`).join('')}</div>` : '<p class="empty-copy">还没有备注，做完这道菜后记一笔吧。</p>'
  return `<section class="recipe-section notes-section"><div class="recipe-section-title"><span>05</span><h2>历史备注</h2></div><div class="recipe-section-body">${editable ? '<div class="notes-toolbar"><button data-action="add-note">+ 增加备注</button></div>' : ''}${form}${list}</div></section>`
}

function cookRecordsSection(recipe) {
  const recordable = canRecordRecipe(recipe)
  const status = cookStatus.recipeId && sameId(cookStatus.recipeId, recipe.id) ? cookStatus : { count: Number(recipe.cookCount || 0), todayRecorded: false, loading: true, busy: false }
  const completed = Boolean(status.todayRecorded)
  const button = recordable
    ? `<button class="cook-complete-button ${completed ? 'completed' : ''}" data-action="quick-cook" ${completed || status.busy ? 'disabled' : ''}>${completed ? '今天已记录 ✓' : (status.busy ? '正在记录…' : '今天做了这道菜 +1')}</button>`
    : ''
  return `<section class="recipe-section cook-section cook-completion-section"><div class="recipe-section-title"><span>04</span><h2>做过次数</h2></div><div class="recipe-section-body"><div class="cook-completion-card"><strong>已做 ${Number(status.count || 0)} 次</strong>${status.loading ? '<small>正在确认今天的记录状态…</small>' : ''}${button}</div></div></section>`
}

function escapeHtml(text = '') { return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])) }
function splitLines(text) { return text.split('\n').map(item => item.trim()).filter(Boolean) }
function uniqueId(prefix = 'id') { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }

async function copyCurrentUrl() {
  const url = window.location.origin
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url)
    return true
  }
  const textarea = document.createElement('textarea')
  textarea.value = url
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  return ok
}

async function shareCurrentUrl() {
  const url = window.location.origin
  if (navigator.share) {
    await navigator.share({
      title: '咱家菜谱',
      text: '咱家菜谱',
      url,
    })
    return 'shared'
  }
  await copyCurrentUrl()
  return 'copied'
}

function persistRecipes() {
  const serializable = serializeRecipes()
  storageSet(userStorageKey(), JSON.stringify(serializable))
  writeRecipeCache(serializable).catch(error => console.warn('IndexedDB 菜谱缓存写入失败。', error))
  saveCloudLibrary(serializable).catch(error => console.warn('云端同步失败，数据已保存在本机。', error))
}

async function persistSingleRecipe(recipe, requestId = '') {
  const saved = await saveCloudRecipe(serializeRecipes([recipe])[0], requestId)
  const serializable = serializeRecipes()
  storageSet(userStorageKey(), JSON.stringify(serializable))
  writeRecipeCache(serializable).catch(error => console.warn('IndexedDB 菜谱缓存写入失败。', error))
  return saved
}

function createRecipeSaveRequestId() {
  const id = globalThis.crypto?.randomUUID?.() || uniqueId('request')
  return `recipe-save-${id}`
}

function logRecipeSave(stage, details = {}) {
  console.info(JSON.stringify({ stage, ...details }))
}

function serializeRecipes(list = recipes) {
  return list.map(({ image, ...recipe }) => ({
    ...recipe,
    cookRecords: (recipe.cookRecords || []).map(({ image: recordImage, imageFile, ...record }) => record),
  }))
}

function recipeImageCacheKey(recipeOrImageId, version = '') {
  if (!recipeOrImageId) return null
  if (typeof recipeOrImageId === 'object') {
    if (!recipeOrImageId.imageId) return null
    return recipeOrImageId.imageVersion ? `${recipeOrImageId.imageId}@${recipeOrImageId.imageVersion}` : recipeOrImageId.imageId
  }
  return version ? `${recipeOrImageId}@${version}` : recipeOrImageId
}

function withImageTimeout(promise, timeoutMs, stage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(stage)
      error.stage = stage
      reject(error)
    }, timeoutMs)
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function isHeicFile(file) {
  return /heic|heif/i.test(`${file?.type || ''} ${file?.name || ''}`)
}

async function decodeImageWithFallback(image) {
  try {
    await withImageTimeout(image.decode(), IMAGE_DECODE_TIMEOUT_MS, 'IMAGE_DECODE_TIMEOUT')
  } catch (error) {
    if (error.stage === 'IMAGE_DECODE_TIMEOUT') throw error
    if (image.complete && (image.naturalWidth || image.width)) return
    await withImageTimeout(new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(Object.assign(new Error('Image decode failed'), { stage: 'IMAGE_DECODE_FAILED' }))
    }), IMAGE_DECODE_TIMEOUT_MS, 'IMAGE_DECODE_TIMEOUT')
  }
}

async function normalizeImageFile(file, { maxSize = 1600, quality = 0.82 } = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('请选择图片文件')
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = sourceUrl
    if (image.decode) await decodeImageWithFallback(image)
    else await withImageTimeout(new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('图片解码失败'))
    }), IMAGE_DECODE_TIMEOUT_MS, 'IMAGE_DECODE_TIMEOUT')
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (!sourceWidth || !sourceHeight) throw new Error('图片尺寸读取失败')
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { colorSpace: 'srgb', alpha: false }) || canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('浏览器无法处理图片')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const blobPromise = new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片转码失败')), 'image/jpeg', quality)
    })
    const blob = await withImageTimeout(blobPromise, IMAGE_ENCODE_TIMEOUT_MS, 'IMAGE_ENCODE_TIMEOUT')
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'recipe-image'}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

async function cacheUploadedImageBestEffort(imageId, blob, imageVersion, operation, requestId) {
  logRecipeImageStage('CACHE_WRITE_START', { requestId, recipeId: operation.recipeId, imageId })
  try {
    await storeImage(imageId, blob, imageVersion)
    logRecipeImageStage('CACHE_WRITE_SUCCESS', { requestId, recipeId: operation.recipeId, imageId })
  } catch (error) {
    console.warn(JSON.stringify({ stage: 'CACHE_WRITE_FAILED', requestId, recipeId: operation.recipeId, imageId, error: error?.message || String(error) }))
  }
}

function recipeImageFailureMessage(error, file) {
  if (error?.stage === 'IMAGE_DECODE_TIMEOUT' || error?.stage === 'IMAGE_ENCODE_TIMEOUT') return '处理时间过长，请重试。'
  if (error?.stage === 'IMAGE_DECODE_FAILED' || error?.stage === 'IMAGE_ENCODE_FAILED') return isHeicFile(file) ? '这张照片当前无法处理，请在相册中转换/截图后再上传。' : '图片处理失败，请重新选择照片。'
  if (error?.stage === 'IMAGE_UPLOAD_TIMEOUT') return '处理时间过长，请重试。'
  if (error?.stage === 'RECIPE_SAVE_TIMEOUT') return '处理时间过长，请重试。'
  if (error?.stage === 'IMAGE_BIND_UNCERTAIN' || error?.stage === 'RECIPE_BIND_CONFIRM_TIMEOUT') return '图片保存状态暂时无法确认，请稍后重试。'
  if (error?.stage === 'RECIPE_SAVE_FAILED' || error?.stage === 'IMAGE_BIND_FAILED') return '图片已上传，但菜谱保存失败，请重试。'
  if (error?.stage === 'IMAGE_UPLOAD_FAILED' || error?.status) return '图片上传失败，请检查网络后重试。'
  return '图片处理失败，请重新选择照片。'
}

async function handleRecipeImageUpload(event, file) {
  if (recipeImageBusy) {
    event.target.value = ''
    window.alert('图片正在处理中，请稍候。')
    return
  }
  const uploadRecipeId = selectedId
  const current = findRecipeById(uploadRecipeId)
  if (!current) { event.target.value = ''; return }
  const operation = beginRecipeImageOperation(uploadRecipeId)
  const requestId = createRecipeSaveRequestId()
  const oldImageId = current.imageId || null
  const oldImageVersion = current.imageVersion || null
  const imageId = uniqueId(`recipe-${current.id}`)
  const imageVersion = new Date().toISOString()
  let normalizedFile = null
  let uploaded = false
  const previousRecipes = recipes
  try {
    logRecipeImageStage('IMAGE_PROCESS_START', { requestId, recipeId: uploadRecipeId, imageId, generation: operation.generation })
    if (!setRecipeImageStage(operation, 'processing')) return
    normalizedFile = await normalizeImageFile(file)
    if (!isCurrentRecipeImageOperation(operation)) return
    logRecipeImageStage('IMAGE_PROCESS_SUCCESS', { requestId, recipeId: uploadRecipeId, imageId })
    const previewRecipe = { ...current, imageId, imageVersion }
    setRecipeImageFromBlob(previewRecipe, normalizedFile)
    recipes = recipes.map(recipe => sameId(recipe.id, uploadRecipeId) ? previewRecipe : recipe)
    render()
    if (!setRecipeImageStage(operation, 'uploading')) {
      await removeStoredImage(imageId, imageVersion).catch(() => null)
      return
    }
    logRecipeImageStage('IMAGE_UPLOAD_START', { requestId, recipeId: uploadRecipeId, imageId })
    await uploadCloudImage(imageId, normalizedFile, requestId, uploadRecipeId)
    uploaded = true
    logRecipeImageStage('IMAGE_UPLOAD_SUCCESS', { requestId, recipeId: uploadRecipeId, imageId })
    if (!isCurrentRecipeImageOperation(operation)) {
      await removeRemoteImageIfSafe(imageId, uploadRecipeId, imageVersion, requestId)
      return
    }
    const updatedRecipe = { ...current, imageId, imageVersion, modifiedAt: new Date().toISOString() }
    setRecipeImageFromBlob(updatedRecipe, normalizedFile)
    recipes = recipes.map(recipe => sameId(recipe.id, uploadRecipeId) ? updatedRecipe : recipe)
    setRecipeImageStage(operation, 'saving')
    logRecipeImageStage('RECIPE_SAVE_START', { requestId, recipeId: uploadRecipeId, imageId })
    let savedRecipe
    try {
      savedRecipe = await persistSingleRecipe(updatedRecipe, requestId)
      if (savedRecipe?.imageId !== imageId) throw Object.assign(new Error('Image binding failed'), { stage: 'IMAGE_BIND_FAILED' })
    } catch (error) {
      const needsConfirmation = error?.stage === 'RECIPE_SAVE_TIMEOUT' || error?.data?.imageBindUnknown || error?.stage === 'IMAGE_BIND_FAILED' || [502, 503, 504].includes(error?.status)
      if (!needsConfirmation) throw Object.assign(error, { stage: error.stage || 'RECIPE_SAVE_FAILED' })
      try {
        const confirmation = await confirmCloudRecipeImageBinding(uploadRecipeId, imageId, imageVersion, requestId)
        if (!confirmation.confirmed) throw Object.assign(new Error('Image binding not confirmed'), { stage: 'IMAGE_BIND_FAILED' })
        savedRecipe = confirmation.recipe || updatedRecipe
      } catch (confirmationError) {
        if (confirmationError?.stage === 'RECIPE_BIND_CONFIRM_TIMEOUT') throw Object.assign(confirmationError, { stage: 'IMAGE_BIND_UNCERTAIN' })
        throw confirmationError
      }
    }
    logRecipeImageStage('RECIPE_SAVE_SUCCESS', { requestId, recipeId: uploadRecipeId, imageId })
    logRecipeImageStage('IMAGE_BIND_CONFIRMED', { requestId, recipeId: uploadRecipeId, imageId })
    recipes = recipes.map(recipe => sameId(recipe.id, uploadRecipeId) ? { ...updatedRecipe, ...savedRecipe, image: updatedRecipe.image } : recipe)
    const oldImageCleanup = oldImageId && oldImageId !== imageId
      ? removeRemoteImageIfSafe(oldImageId, uploadRecipeId, oldImageVersion, requestId).catch(() => null)
      : null
    if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
    finishRecipeImageOperation(operation)
    render()
    void cacheUploadedImageBestEffort(imageId, normalizedFile, imageVersion, operation, requestId)
    void oldImageCleanup
    logRecipeImageStage('UI_IMAGE_SYNC_SUCCESS', { requestId, recipeId: uploadRecipeId, imageId })
  } catch (error) {
    if (!isCurrentRecipeImageOperation(operation)) {
      logRecipeImageStage('UPLOAD_OPERATION_STALE', { requestId, recipeId: uploadRecipeId, imageId, generation: operation.generation })
      if (uploaded) await removeRemoteImageIfSafe(imageId, uploadRecipeId, imageVersion, requestId).catch(() => null)
      await removeStoredImage(imageId, imageVersion).catch(() => null)
      return
    }
    logRecipeImageStage(error?.stage || 'IMAGE_PROCESS_FAILED', { requestId, recipeId: uploadRecipeId, imageId, error: error?.message || String(error) })
    if (error?.stage === 'IMAGE_DECODE_TIMEOUT' || error?.stage === 'IMAGE_ENCODE_TIMEOUT') logRecipeImageStage('IMAGE_PROCESS_TIMEOUT', { requestId, recipeId: uploadRecipeId, imageId })
    if (error?.stage === 'IMAGE_DECODE_FAILED' || error?.stage === 'IMAGE_ENCODE_FAILED') logRecipeImageStage('IMAGE_PROCESS_FAILED', { requestId, recipeId: uploadRecipeId, imageId })
    if (uploaded && (error?.stage === 'IMAGE_BIND_FAILED' || error?.stage === 'RECIPE_SAVE_FAILED')) await removeRemoteImageIfSafe(imageId, uploadRecipeId, imageVersion, requestId).catch(() => null)
    recipes = previousRecipes
    finishRecipeImageOperation(operation)
    render()
    window.alert(recipeImageFailureMessage(error, file))
  } finally {
    event.target.value = ''
    finishRecipeImageOperation(operation)
  }
}

function setRecipeImageFromBlob(recipe, blob) {
  if (!recipe || !isUsableImageBlob(blob)) return
  const key = recipeImageCacheKey(recipe)
  if (!key) return
  const existing = imageObjectUrls.get(key)
  if (existing) {
    recipe.image = existing
    return
  }
  if (recipe.image?.startsWith('blob:')) URL.revokeObjectURL(recipe.image)
  const objectUrl = URL.createObjectURL(blob)
  imageObjectUrls.set(key, objectUrl)
  recipe.image = objectUrl
}

function clearRecipeImage(recipe) {
  if (!recipe) return
  if (recipe.image?.startsWith('blob:')) URL.revokeObjectURL(recipe.image)
  recipe.image = null
}

function openImageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, 4)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(IMAGE_STORE)) database.createObjectStore(IMAGE_STORE)
      if (!database.objectStoreNames.contains(IMAGE_META_STORE)) database.createObjectStore(IMAGE_META_STORE)
      if (!database.objectStoreNames.contains(RECIPE_META_STORE)) database.createObjectStore(RECIPE_META_STORE)
      if (!database.objectStoreNames.contains(STATS_CACHE_STORE)) database.createObjectStore(STATS_CACHE_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function currentFamilyId() {
  return currentUser?.familyId ? String(currentUser.familyId) : null
}

function statsCacheKey(scope, { period = 'all', year, month } = {}) {
  const familyId = currentFamilyId()
  if (!familyId) return null
  if (scope === 'annual-trend') return `annual-trend:${familyId}:${Number(year)}`
  const prefix = `${scope}:${familyId}`
  if (period === 'year') return `${prefix}:year:${Number(year)}`
  if (period === 'month') return `${prefix}:month:${Number(year)}-${String(month).padStart(2, '0')}`
  return `${prefix}:all`
}

async function readStatsCache(scope, params = {}) {
  const key = statsCacheKey(scope, params)
  if (!key) return null
  const hitStage = scope === 'annual-trend' ? 'ANNUAL_TREND_CACHE_HIT' : 'STATS_CACHE_HIT'
  const missStage = scope === 'annual-trend' ? 'ANNUAL_TREND_CACHE_MISS' : 'STATS_CACHE_MISS'
  const memory = statsMemoryCache.get(key)
  if (memory && memory.familyId === currentFamilyId()) {
    console.info(JSON.stringify({ stage: hitStage, scope, key, source: 'memory' }))
    return memory
  }
  try {
    const database = await openImageDatabase()
    const entry = await new Promise((resolve, reject) => {
      const request = database.transaction(STATS_CACHE_STORE, 'readonly').objectStore(STATS_CACHE_STORE).get(key)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
    database.close()
    if (entry?.familyId === currentFamilyId()) {
      statsMemoryCache.set(key, entry)
      console.info(JSON.stringify({ stage: hitStage, scope, key, source: 'indexeddb' }))
      return entry
    }
  } catch (error) {
    console.info(JSON.stringify({ stage: missStage, scope, key, reason: 'indexeddb_unavailable' }))
  }
  console.info(JSON.stringify({ stage: missStage, scope, key }))
  return null
}

async function writeStatsCache(scope, params, data) {
  const key = statsCacheKey(scope, params)
  const familyId = currentFamilyId()
  if (!key || !familyId || !data) return
  const entry = { key, familyId, scope, period: params.period || (scope === 'annual-trend' ? 'year' : 'all'), year: params.year || null, month: params.month || null, data, updatedAt: Date.now(), schemaVersion: 1 }
  statsMemoryCache.set(key, entry)
  try {
    const database = await openImageDatabase()
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STATS_CACHE_STORE, 'readwrite')
      transaction.objectStore(STATS_CACHE_STORE).put(entry)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  } catch {
    // Cache writes are best-effort and must never block server truth.
  }
}

async function invalidateStatsCacheForMutation({ familyStats = false, ranking = false, annualTrend = false } = {}) {
  const familyId = currentFamilyId()
  if (!familyId) return
  const scopes = new Set([...(familyStats ? ['family-stats'] : []), ...(ranking ? ['ranking'] : []), ...(annualTrend ? ['annual-trend'] : [])])
  if (!scopes.size) return
  for (const [key, entry] of statsMemoryCache) {
    if (entry.familyId === familyId && scopes.has(entry.scope)) statsMemoryCache.delete(key)
  }
  try {
    const database = await openImageDatabase()
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STATS_CACHE_STORE, 'readwrite')
      const store = transaction.objectStore(STATS_CACHE_STORE)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (cursor.value?.familyId === familyId && scopes.has(cursor.value.scope)) cursor.delete()
        cursor.continue()
      }
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
    console.info(JSON.stringify({ stage: 'STATS_CACHE_INVALIDATE', familyId, scopes: [...scopes] }))
  } catch {
    // Cache invalidation is best-effort; the next freshness check revalidates.
  }
}

async function hydrateVisibleStatsFromCache() {
  if (currentUser?.role === 'guest' || !currentFamilyId()) return false
  const familyParams = { period: familyStatsPeriod, year: familyStatsYear, month: familyStatsMonth }
  const rankingParams = { period: rankingPeriod, year: rankingYear, month: rankingMonth }
  const annualParams = { period: 'year', year: annualTrendYear }
  const [familyEntry, rankingEntry, annualEntry] = await Promise.all([
    readStatsCache('family-stats', familyParams),
    readStatsCache('ranking', rankingParams),
    readStatsCache('annual-trend', annualParams),
  ])
  let applied = false
  if (familyEntry?.data) {
    familyStats = familyEntry.data
    familyStatsLoading = false
    familyStatsDataState = 'cached'
    console.info(JSON.stringify({ stage: 'STATS_CACHE_APPLIED', scope: 'family-stats', key: familyEntry.key }))
    applied = true
  }
  if (rankingEntry?.data) {
    monthlyRanking = Array.isArray(rankingEntry.data.rankings) ? rankingEntry.data.rankings : []
    rankingDataState = 'cached'
    console.info(JSON.stringify({ stage: 'RANKING_CACHE_HIT', key: rankingEntry.key }))
    console.info(JSON.stringify({ stage: 'RANKING_CACHE_APPLIED', key: rankingEntry.key }))
    applied = true
  }
  if (annualEntry?.data) {
    annualTrend = annualEntry.data
    annualTrendDataState = 'cached'
    console.info(JSON.stringify({ stage: 'ANNUAL_TREND_CACHE_APPLIED', key: annualEntry.key }))
    applied = true
  }
  if (applied) console.info(JSON.stringify({ stage: 'HOME_STATS_RENDER_FROM_CACHE' }))
  return applied
}

async function writeRecipeCache(serializableRecipes) {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECIPE_META_STORE, 'readwrite')
    transaction.objectStore(RECIPE_META_STORE).put({
      recipes: serializableRecipes,
      savedAt: Date.now(),
    }, userStorageKey())
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function readRecipeCache() {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(RECIPE_META_STORE, 'readonly').objectStore(RECIPE_META_STORE).get(userStorageKey())
    request.onsuccess = () => { database.close(); resolve(request.result?.recipes || null) }
    request.onerror = () => { database.close(); reject(request.error) }
  })
}

async function storeImage(imageId, file, version = '') {
  const cacheKey = recipeImageCacheKey(imageId, version)
  if (!cacheKey || !isUsableImageBlob(file)) return
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE, 'readwrite')
    transaction.objectStore(IMAGE_STORE).put(file, cacheKey)
    transaction.oncomplete = async () => {
      database.close()
      await writeImageMeta(cacheKey, file).catch(error => console.warn('图片缓存元数据写入失败。', error))
      resolve()
    }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function writeImageMeta(cacheKey, blob) {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_META_STORE, 'readwrite')
    transaction.objectStore(IMAGE_META_STORE).put({
      size: blob?.size || 0,
      type: blob?.type || 'image/jpeg',
      lastAccessed: Date.now(),
    }, cacheKey)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function touchImageMeta(cacheKey, blob) {
  if (!cacheKey || !blob) return
  await writeImageMeta(cacheKey, blob)
}

async function readImage(imageId, version = '') {
  const cacheKey = recipeImageCacheKey(imageId, version)
  if (!cacheKey) return null
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).get(cacheKey)
    request.onsuccess = () => {
      const blob = request.result || null
      database.close()
      if (blob && !isUsableImageBlob(blob)) {
        removeStoredImage(imageId, version).catch(() => null)
        resolve(null)
        return
      }
      if (blob) touchImageMeta(cacheKey, blob).catch(() => null)
      resolve(blob)
    }
    request.onerror = () => { database.close(); reject(request.error) }
  })
}

async function removeStoredImage(imageId, version = '') {
  const cacheKey = recipeImageCacheKey(imageId, version)
  if (!cacheKey) return
  imageBlobPromises.delete(cacheKey)
  const objectUrl = imageObjectUrls.get(cacheKey)
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    imageObjectUrls.delete(cacheKey)
  }
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([IMAGE_STORE, IMAGE_META_STORE], 'readwrite')
    transaction.objectStore(IMAGE_STORE).delete(cacheKey)
    transaction.objectStore(IMAGE_META_STORE).delete(cacheKey)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function removeRemoteImageIfSafe(imageId, recipeId, version = '', requestId = '', rollback = false) {
  if (!imageId) return { deleted: false }
  try {
    logRecipeSave('ROLLBACK_START', { requestId, recipeId, imageId })
    const result = await deleteCloudImage(imageId, recipeId, requestId, rollback)
    if (result?.deleted) await removeStoredImage(imageId, version)
    logRecipeSave('ROLLBACK_SUCCESS', { requestId, recipeId, imageId, status: 200, deleted: Boolean(result?.deleted) })
    return result
  } catch (error) {
    console.error('recipe image cleanup failed', { imageId, recipeId, error: error.message })
    logRecipeSave('ROLLBACK_FAILED', { requestId, recipeId, imageId, status: error.status || null, error: error.message })
    window.alert('图片已从菜谱移除，但服务器旧文件清理失败，稍后可再次清理。')
    return { cleanupPending: true }
  }
}

async function clearIndexedDBCache() {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([IMAGE_STORE, IMAGE_META_STORE, RECIPE_META_STORE, STATS_CACHE_STORE], 'readwrite')
    transaction.objectStore(IMAGE_STORE).clear()
    transaction.objectStore(IMAGE_META_STORE).clear()
    transaction.objectStore(RECIPE_META_STORE).delete(userStorageKey())
    transaction.objectStore(STATS_CACHE_STORE).clear()
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function clearLocalCacheAndReload() {
  storageRemove(userStorageKey())
  storageRemove(userOpenOrderKey())
  for (const objectUrl of imageObjectUrls.values()) URL.revokeObjectURL(objectUrl)
  imageObjectUrls.clear()
  imageLoadPromises.clear()
  imageBlobPromises.clear()
  statsMemoryCache.clear()
  await Promise.allSettled([clearIndexedDBCache(), clearCloudImageResponseCache(), clearCloudStaticResponseCache()])
  recipes = []
  render()
  if (!cloudReady) cloudReady = await initCloud()
  await syncCloudLibrary({ force: true })
  await hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), true).catch(() => null)
  preloadHomeImages().catch(() => null)
}

async function listImageMeta() {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(IMAGE_META_STORE, 'readonly').objectStore(IMAGE_META_STORE).getAllKeys()
    request.onsuccess = () => {
      const keys = request.result || []
      const transaction = database.transaction(IMAGE_META_STORE, 'readonly')
      const store = transaction.objectStore(IMAGE_META_STORE)
      const items = []
      if (!keys.length) {
        database.close()
        resolve(items)
        return
      }
      let pending = keys.length
      keys.forEach(key => {
        const metaRequest = store.get(key)
        metaRequest.onsuccess = () => {
          items.push({ key, ...(metaRequest.result || {}) })
          pending -= 1
          if (!pending) {
            database.close()
            resolve(items)
          }
        }
        metaRequest.onerror = () => {
          pending -= 1
          if (!pending) {
            database.close()
            resolve(items)
          }
        }
      })
    }
    request.onerror = () => { database.close(); reject(request.error) }
  })
}

async function hydrateRecipeImages(targetRecipes = recipes, shouldRender = true) {
  await Promise.all(targetRecipes.map(async recipe => {
    try {
      if (recipe.imageId) {
        const blob = await readCachedImageOnce(recipe.imageId, recipe.imageVersion)
        if (blob) setRecipeImageFromBlob(recipe, blob)
      }
      await Promise.all((recipe.cookRecords || []).map(async record => {
        if (!record.imageId) return
        const blob = await readCachedImageOnce(record.imageId, record.imageVersion)
        if (blob) setRecordImageFromBlob(record, blob)
      }))
    } catch (error) {
      console.warn('图片读取失败。', error)
    }
  }))
  if (shouldRender) render()
}

function readCachedImageOnce(imageId, version = '') {
  const cacheKey = recipeImageCacheKey(imageId, version)
  if (!cacheKey) return Promise.resolve(null)
  let load = imageBlobPromises.get(cacheKey)
  if (!load) {
    load = readImage(imageId, version).then(blob => {
      console.info(JSON.stringify({ stage: blob ? 'IMAGE_IDB_HIT' : 'IMAGE_IDB_MISS', imageId }))
      return blob
    }).catch(() => null)
    imageBlobPromises.set(cacheKey, load)
  }
  return load
}

function setRecordImageFromBlob(record, blob) {
  if (!record || !record.imageId || !isUsableImageBlob(blob)) return
  const key = recipeImageCacheKey(record.imageId, record.imageVersion)
  const existing = imageObjectUrls.get(key)
  if (existing) {
    record.image = existing
    return
  }
  if (record.image?.startsWith('blob:')) URL.revokeObjectURL(record.image)
  const objectUrl = URL.createObjectURL(blob)
  imageObjectUrls.set(key, objectUrl)
  record.image = objectUrl
}

function recipesChanged(nextRecipes) {
  return JSON.stringify(serializeRecipes(recipes)) !== JSON.stringify(serializeRecipes(nextRecipes))
}

async function cacheRecipeImage(recipe) {
  if (!recipe || !cloudReady) return false
  let changed = false
  if (recipe.imageId && !recipe.image) {
    const cacheKey = recipeImageCacheKey(recipe)
    let load = imageLoadPromises.get(cacheKey)
    if (!load) {
      load = (async () => {
        const cached = await readCachedImageOnce(recipe.imageId, recipe.imageVersion)
        if (cached) return cached
        console.info(JSON.stringify({ stage: 'IMAGE_REMOTE_FETCH', imageId: recipe.imageId }))
        const blob = await downloadCloudImage(recipe.imageId, recipe.imageVersion)
        if (blob) {
          await storeImage(recipe.imageId, blob, recipe.imageVersion)
          imageBlobPromises.set(cacheKey, Promise.resolve(blob))
        } else imageBlobPromises.delete(cacheKey)
        return blob
      })().finally(() => imageLoadPromises.delete(cacheKey))
      imageLoadPromises.set(cacheKey, load)
    }
    const blob = await load
    if (blob) setRecipeImageFromBlob(recipe, blob)
    changed = true
  }
  for (const record of (recipe.cookRecords || [])) {
    if (!record.imageId || record.image) continue
    const cacheKey = recipeImageCacheKey(record.imageId, record.imageVersion)
    let load = imageLoadPromises.get(cacheKey)
    if (!load) {
      load = (async () => {
        const cached = await readCachedImageOnce(record.imageId, record.imageVersion)
        if (cached) return cached
        console.info(JSON.stringify({ stage: 'IMAGE_REMOTE_FETCH', imageId: record.imageId }))
        const blob = await downloadCloudImage(record.imageId, record.imageVersion)
        if (blob) {
          await storeImage(record.imageId, blob, record.imageVersion)
          imageBlobPromises.set(cacheKey, Promise.resolve(blob))
        } else imageBlobPromises.delete(cacheKey)
        return blob
      })().finally(() => imageLoadPromises.delete(cacheKey))
      imageLoadPromises.set(cacheKey, load)
    }
    const blob = await load
    if (blob) setRecordImageFromBlob(record, blob)
    changed = true
  }
  return changed
}

async function preloadHomeImages(limit = HOME_PRELOAD_LIMIT) {
  if (!cloudReady || preloadingImages) return
  preloadingImages = true
  const targets = getFilteredRecipes().filter(recipe => recipe.imageId && !recipe.image).slice(0, limit)
  let changed = false
  try {
    for (const recipe of targets) {
      try {
        changed = await cacheRecipeImage(recipe) || changed
      } catch (error) {
        console.warn('图片预加载失败。', error)
      }
    }
  } finally {
    preloadingImages = false
  }
  if (changed && page === 'home') updateSearchResults()
}

async function syncCloudLibrary({ force = false } = {}) {
  if (!cloudReady) return
  try {
    const cloudRecipes = await loadCloudLibrary()
    const cloudLibraryExists = Array.isArray(cloudRecipes)
    const syncedRecipes = cloudLibraryExists ? cloudRecipes.map(({ image, ...recipe }) => ({ ...recipe, image: null })) : serializeRecipes(recipes).map(recipe => ({ ...recipe, image: null }))
    const currentRecipeImages = new Map(recipes.map(recipe => [String(recipe.id), { imageId: recipe.imageId, imageVersion: recipe.imageVersion, image: recipe.image }]))
    syncedRecipes.forEach(recipe => {
      const currentImage = currentRecipeImages.get(String(recipe.id))
      if (currentImage?.image && currentImage.imageId === recipe.imageId && currentImage.imageVersion === recipe.imageVersion) recipe.image = currentImage.image
    })
    const shouldRender = force || recipesChanged(syncedRecipes)
    recipes = syncedRecipes
    const serializable = serializeRecipes()
    storageSet(userStorageKey(), JSON.stringify(serializable))
    writeRecipeCache(serializable).catch(error => console.warn('IndexedDB 菜谱缓存写入失败。', error))
    if (!cloudLibraryExists) await saveCloudLibrary(serializable)
    if (shouldRender) render()
    hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), true).catch(error => console.warn('本地图片缓存读取失败。', error))
    preloadHomeImages().catch(error => console.warn('首页图片预加载失败。', error))
    await Promise.allSettled([refreshFamilyStatsOnly({ force }), refreshRankingOnly({ force }), refreshAnnualTrendOnly({ force })])
  } catch (error) {
    console.warn('云端菜谱读取失败，继续使用本机数据。', error)
    if (!navigator.onLine) window.alert('当前离线，已显示本地缓存。联网后会自动同步。')
  }
}

async function bootstrapCloudSync() {
  cloudReady = await initCloud()
  if (!cloudReady) return
  await syncCloudLibrary()
}

async function refreshFromCloud() {
  if (refreshing) return
  refreshing = true
  render()
  if (!cloudReady) cloudReady = await initCloud()
  await syncCloudLibrary({ force: true })
  refreshing = false
  render()
  preloadHomeImages().catch(error => console.warn('刷新后图片预加载失败。', error))
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
  draftGeneration += 1
  draftBusy = false
  draftImageBusy = false
  draft = { name: '', categories: [], ingredients: '', steps: '', tips: '', note: '', image: null, imageFile: null, imageId: null, removeImage: false, isFamilyShared: false }
  page = 'new'
  viewingMember = null
  settingsMenuOpen = false
  draftDirty = false
  formExitPrompt = false
  deleteRecipePrompt = false
  render()
}

function startEditRecipe() {
  const recipe = findRecipeById(selectedId)
  if (!recipe) { goHome(); return }
  draftGeneration += 1
  draftBusy = false
  draftImageBusy = false
  draft = {
    id: recipe.id,
    name: recipe.name,
    categories: [...recipe.categories],
    ingredients: mergeMaterialLines(recipe.ingredients, recipe.seasonings).join('\n'),
    steps: recipe.steps.join('\n'),
    tips: recipe.tips || '',
    image: recipe.image,
    imageFile: null,
    imageId: recipe.imageId || null,
    removeImage: false,
    isFamilyShared: Boolean(recipe.isFamilyShared),
  }
  page = 'edit'
  draftDirty = false
  formExitPrompt = false
  deleteRecipePrompt = false
  render()
}

async function saveRecipe() {
  if (draftBusy || draftImageBusy || !draft || (page !== 'new' && page !== 'edit')) return
  const draftRef = draft
  const generation = draftGeneration
  draftBusy = true
  syncDraftFields()
  if (!draftRef.name.trim()) {
    draftBusy = false
    document.getElementById('draft-name')?.classList.add('invalid')
    document.getElementById('draft-name')?.focus()
    return
  }
  const now = new Date()
  const requestId = createRecipeSaveRequestId()
  const date = now.toLocaleDateString('sv-SE')
  const isEditing = page === 'edit'
  const current = isEditing ? findRecipeById(draftRef.id) : null
  if (isEditing && !current) { draftBusy = false; return }
  const id = isEditing ? current.id : Date.now()
  const previousRecipes = recipes
  const oldImageId = current?.imageId || null
  const oldImageVersion = current?.imageVersion || null
  const imageFile = draftRef.imageFile
  let imageId = draftRef.imageId || null
  let imageVersion = current?.imageVersion || null
  let uploadedImageId = null
  let uploadedImageVersion = null
  if (imageFile) {
    imageId = uniqueId(`recipe-${id}`)
    imageVersion = now.toISOString()
    try {
      logRecipeSave('IMAGE_NORMALIZE_START', { requestId, recipeId: id, imageId })
      logRecipeSave('IMAGE_UPLOAD_START', { requestId, recipeId: id, imageId })
      await storeImage(imageId, imageFile, imageVersion)
      await uploadCloudImage(imageId, imageFile, requestId, id)
      uploadedImageId = imageId
      uploadedImageVersion = imageVersion
      logRecipeSave('IMAGE_UPLOAD_SUCCESS', { requestId, recipeId: id, imageId, status: 200 })
    } catch (error) {
      logRecipeSave('IMAGE_UPLOAD_FAILED', { requestId, recipeId: id, imageId, status: error.status || null, error: error.message })
      window.alert('图片保存失败，请重新选择图片。')
      if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
      draftBusy = false
      return
    }
  }
  if (draft !== draftRef || draftGeneration !== generation || (page !== 'new' && page !== 'edit')) {
    if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
    draftBusy = false
    return
  }
  if (draftRef.removeImage && imageId) {
    imageId = null
    imageVersion = null
  }
  const recipe = {
    id, name: draftRef.name.trim(), categories: [...draftRef.categories],
    tags: [],
    ingredients: mergeMaterialLines(draftRef.ingredients), seasonings: [], steps: splitLines(draftRef.steps),
    tips: draftRef.tips.trim(),
    notes: isEditing ? current.notes : (draftRef.note.trim() ? [{ id: uniqueId('note'), date, text: draftRef.note.trim() }] : []),
    favoriteUserIds: current?.favoriteUserIds || [],
    cookRecords: current?.cookRecords || [],
    cookCount: current?.cookCount || 0,
    lastCookedAt: current?.lastCookedAt || null,
    image: draftRef.removeImage ? null : draftRef.image,
    imageId,
    imageVersion,
    authorUserId: current?.authorUserId || currentUser?.id,
    authorName: current?.authorName || currentUser?.displayName || '家人',
    familyId: current?.familyId || currentUser?.familyId,
    isFamilyShared: Boolean(draftRef.isFamilyShared),
    createdByRole: current?.createdByRole || currentUser?.role || 'member',
    createdAt: current?.createdAt || now.toISOString(), modifiedAt: now.toISOString(),
  }
  const nextRecipes = isEditing ? recipes.map(item => sameId(item.id, id) ? recipe : item) : [recipe, ...recipes]
  recipes = nextRecipes
  try {
    logRecipeSave('RECIPE_SAVE_START', { requestId, recipeId: id, imageId: imageId || null })
    const savedRecipe = await persistSingleRecipe(recipe, requestId)
    logRecipeSave('RECIPE_SAVE_SUCCESS', { requestId, recipeId: id, imageId: savedRecipe?.imageId || imageId || null, status: 200 })
    if (imageId && savedRecipe?.imageId !== imageId) {
      const error = new Error('Recipe image binding could not be confirmed')
      error.stage = 'IMAGE_BIND_FAILED'
      throw error
    }
    if (imageId) logRecipeSave('IMAGE_BIND_CONFIRMED', { requestId, recipeId: id, imageId })
  } catch (error) {
    logRecipeSave(error.stage || 'RECIPE_SAVE_FAILED', { requestId, recipeId: id, imageId: imageId || null, status: error.status || null, error: error.message })
    const bindingUnknown = Boolean(error.data?.imageBindUnknown)
    recipes = bindingUnknown ? nextRecipes : previousRecipes
    if (uploadedImageId && !bindingUnknown) {
      if (isEditing) await removeRemoteImageIfSafe(uploadedImageId, id, uploadedImageVersion, requestId)
      else await removeRemoteImageIfSafe(uploadedImageId, id, uploadedImageVersion, requestId, true)
    }
    window.alert('菜谱保存失败，原图片已保留。')
    if (bindingUnknown) logRecipeSave('UI_SYNC_FAILED', { requestId, recipeId: id, imageId: imageId || null, status: error.status || null, error: 'image binding status unknown' })
    draftBusy = false
    render()
    return
  }
  if ((imageFile || draftRef.removeImage) && oldImageId && oldImageId !== imageId) {
    await removeRemoteImageIfSafe(oldImageId, id, oldImageVersion, requestId)
    if (current?.image?.startsWith('blob:') && current.image !== draftRef.image) URL.revokeObjectURL(current.image)
  }
  await invalidateStatsCacheForMutation({ familyStats: true, ranking: Boolean(imageId && (!oldImageId || !isEditing)), annualTrend: Boolean(imageId && (!oldImageId || !isEditing)) })
  if (!isEditing) touchRecipeOpen(id)
  activeCategory = '全部'
  query = ''
  page = isEditing ? 'detail' : 'home'
  selectedId = isEditing ? id : selectedId
  if (draft === draftRef && draftGeneration === generation) draft = null
  draftDirty = false
  formExitPrompt = false
  draftBusy = false
  logRecipeSave('UI_SYNC_SUCCESS', { requestId, recipeId: id, imageId: imageId || null, status: 200 })
  render()
}

async function deleteCurrentRecipe() {
  const recipeId = draft?.id ?? selectedId
  const current = findRecipeById(recipeId)
  if (!current) return
  try {
    const result = await deleteCloudRecipe(recipeId)
    if (result?.cleanupPending) window.alert('菜谱已删除，但服务器旧图片清理失败，稍后可再次清理。')
  } catch (error) {
    window.alert('菜谱删除失败，图片和数据已保留。')
    return
  }
  const imageIds = [
    current.imageId ? { id: current.imageId, version: current.imageVersion } : null,
    ...(current.cookRecords || []).map(record => record.imageId ? { id: record.imageId, version: record.imageVersion } : null),
  ].filter(Boolean)
  await Promise.allSettled(imageIds.map(item => removeStoredImage(item.id, item.version)))
  if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
  recipes = recipes.filter(recipe => !sameId(recipe.id, recipeId))
  storageSet(userStorageKey(), JSON.stringify(serializeRecipes()))
  selectedId = null
  draft = null
  draftDirty = false
  formExitPrompt = false
  deleteRecipePrompt = false
  page = 'home'
  history.replaceState({ appPage: 'home' }, '')
  await invalidateStatsCacheForMutation({ familyStats: true, ranking: true, annualTrend: true })
  await syncCloudLibrary({ force: true })
  render()
}

function leaveFormWithoutSaving() {
  if (draft?.imageFile && draft.image?.startsWith('blob:')) URL.revokeObjectURL(draft.image)
  draftGeneration += 1
  draftBusy = false
  draftImageBusy = false
  page = draft?.id ? 'detail' : 'home'
  draft = null
  draftDirty = false
  formExitPrompt = false
  render()
}

function syncDraftFields() {
  if (!draft) return
  document.querySelectorAll('[data-draft]').forEach(field => { draft[field.dataset.draft] = field.value })
  const shared = document.getElementById('draft-family-shared')
  if (shared) draft.isFamilyShared = shared.checked
}

function updateSearchResults() {
  const panel = document.querySelector('.recipe-panel')
  if (panel) panel.innerHTML = `<div class="pull-refresh-indicator ${refreshing ? 'visible' : ''}">${refreshing ? '正在同步最新菜谱…' : '下拉刷新'}</div>${recipePanelTemplate()}`
  document.querySelector('.clear-search')?.classList.toggle('hidden', !query)
  requestAnimationFrame(setupPullToRefresh)
  preloadHomeImages().catch(() => null)
}

function syncActiveCategoryPosition() {
  const navigation = document.querySelector('.category-nav')
  const active = navigation?.querySelector('.active')
  if (!navigation || !active) return
  if (activeCategory === '全部') {
    navigation.scrollLeft = 0
    return
  }
  active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function openNoteEditor(noteId = null) {
  const recipe = findRecipeById(selectedId)
  if (!recipe) { goHome(); return }
  const note = noteId ? recipe.notes.find(item => String(item.id) === String(noteId)) : null
  noteEditor = note ? { id: note.id, date: note.date, text: note.text } : { id: null, date: new Date().toLocaleDateString('sv-SE'), text: '' }
  render()
  setTimeout(() => document.getElementById(note ? 'note-text' : 'note-date')?.focus())
}

function saveNote() {
  if (!canEditRecipe(findRecipeById(selectedId))) return
  const dateInput = document.getElementById('note-date')
  const textInput = document.getElementById('note-text')
  const date = dateInput?.value
  const text = textInput?.value.trim()
  if (!date) { dateInput?.focus(); return }
  if (!text) { textInput?.classList.add('invalid'); textInput?.focus(); return }
  recipes = recipes.map(recipe => {
    if (!sameId(recipe.id, selectedId)) return recipe
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
  if (!canEditRecipe(findRecipeById(selectedId))) return
  if (!window.confirm('确定删除这条备注吗？')) return
  recipes = recipes.map(recipe => sameId(recipe.id, selectedId) ? { ...recipe, notes: recipe.notes.filter(note => String(note.id) !== String(noteId)), modifiedAt: new Date().toISOString() } : recipe)
  noteEditor = null
  persistRecipes()
  render()
}

async function loadMembers() {
  if (!isAdmin()) return
  try {
    const response = await fetch('/api/members', { credentials: 'same-origin', cache: 'no-store' })
    const data = await response.json()
    if (response.ok) {
      members = data.members || []
      familyMemberCount = members.length
    }
  } catch (error) {
    console.warn('成员列表读取失败。', error)
  }
}

async function openMembersPage() {
  if (!isAdmin()) return
  await loadMembers()
  page = 'members'
  render()
}

function syncMemberDraft() {
  memberDraft = {
    loginCode: document.getElementById('member-login-code')?.value.trim() || '',
    displayName: document.getElementById('member-display-name')?.value.trim() || '',
    pin: document.getElementById('member-pin-new')?.value || '',
  }
}

async function createMember() {
  syncMemberDraft()
  const response = await fetch('/api/members', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memberDraft),
  })
  const data = await response.json()
  if (!response.ok) {
    window.alert(data.error || '创建成员失败')
    return
  }
  memberDraft = { loginCode: '', displayName: '', pin: '' }
  await loadMembers()
  render()
}

async function updateMember(id, changes) {
  const response = await fetch('/api/members', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...changes }),
  })
  const data = await response.json()
  if (!response.ok) {
    window.alert(data.error || '保存成员失败')
    return
  }
  await loadMembers()
  render()
}

async function deleteMember(id) {
  if (!window.confirm('确定删除这个成员账号吗？删除后该账号不能再登录。')) return
  const response = await fetch(`/api/members?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
  const data = await response.json()
  if (!response.ok) {
    window.alert(data.error || '删除成员失败')
    return
  }
  await loadMembers()
  render()
}

function toggleFavorite() {
  recipes = recipes.map(recipe => {
    if (!sameId(recipe.id, selectedId)) return recipe
    const set = new Set(recipe.favoriteUserIds || [])
    if (set.has(currentUser.id)) set.delete(currentUser.id)
    else set.add(currentUser.id)
    return { ...recipe, favoriteUserIds: [...set], modifiedAt: new Date().toISOString() }
  })
  persistRecipes()
  render()
}

function toggleFamilyShare() {
  const current = findRecipeById(selectedId)
  if (!canEditRecipe(current)) return
  recipes = recipes.map(recipe => {
    if (!sameId(recipe.id, selectedId)) return recipe
    return { ...recipe, isFamilyShared: !recipe.isFamilyShared, modifiedAt: new Date().toISOString() }
  })
  persistRecipes()
  render()
}

function copySelectedRecipe() {
  const source = findRecipeById(selectedId)
  if (!source) return
  const now = new Date().toISOString()
  const copy = {
    ...source,
    id: Date.now(),
    name: `${source.name}（改良版）`,
    image: null,
    imageId: null,
    imageVersion: null,
    authorUserId: currentUser.id,
    authorName: currentUser.displayName || '家人',
    familyId: currentUser.familyId,
    isFamilyShared: false,
    createdByRole: currentUser.role,
    favoriteUserIds: [],
    cookRecords: [],
    cookCount: 0,
    lastCookedAt: null,
    lastViewedAt: now,
    createdAt: now,
    modifiedAt: now,
  }
  recipes = [copy, ...recipes]
  persistRecipes()
  selectedId = copy.id
  page = 'detail'
  render()
}

function openCookEditor(recordId = null) {
  const current = findRecipeById(selectedId)
  const record = recordId ? (current?.cookRecords || []).find(item => sameId(item.id, recordId)) : null
  cookEditor = record
    ? { id: record.id, date: record.date || new Date().toLocaleDateString('sv-SE'), note: record.note || '', rating: Number(record.rating || 0), image: record.image || null, imageFile: null, imageId: record.imageId || null, imageVersion: record.imageVersion || null }
    : { id: null, date: new Date().toLocaleDateString('sv-SE'), note: '', rating: 0, image: null, imageFile: null, imageId: null, imageVersion: null }
  render()
  setTimeout(() => document.getElementById('cook-note')?.focus())
}

async function saveCookRecord() {
  const current = findRecipeById(selectedId)
  const isNewRecord = !cookEditor?.id
  if (!current || (isNewRecord ? !canRecordRecipe(current) : !canEditRecipe(current))) return
  const previousRecipes = recipes
  const date = document.getElementById('cook-date')?.value || new Date().toLocaleDateString('sv-SE')
  const note = document.getElementById('cook-note')?.value.trim() || ''
  const rating = Number(document.getElementById('cook-rating')?.value || 0)
  const existingRecord = cookEditor.id ? (current.cookRecords || []).find(record => sameId(record.id, cookEditor.id)) : null
  const oldImageId = existingRecord?.imageId || null
  const oldImageVersion = existingRecord?.imageVersion || null
  let uploadedImageId = null
  let uploadedImageVersion = null
  let createdEventId = null
  const record = {
    id: cookEditor.id || uniqueId('cook'),
    date,
    note,
    rating,
    image: cookEditor.image,
    imageId: cookEditor.imageId,
    imageVersion: cookEditor.imageVersion,
    createdAt: existingRecord?.createdAt || new Date().toISOString(),
  }
  if (cookEditor.imageFile) {
    record.imageId = uniqueId(`cook-${selectedId}`)
    record.imageVersion = new Date().toISOString()
    try {
      await storeImage(record.imageId, cookEditor.imageFile, record.imageVersion)
      await uploadCloudImage(record.imageId, cookEditor.imageFile)
      uploadedImageId = record.imageId
      uploadedImageVersion = record.imageVersion
    } catch (error) {
      if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
      window.alert('做菜记录图片保存失败，请重新选择图片。')
      return
    }
  }
  if (isNewRecord) {
    try {
      const eventResult = await createCloudCookEvent(selectedId, date)
      if (eventResult?.duplicate) {
        if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
        window.alert(eventResult.message || '今天已经记录过这道菜了')
        return
      }
      createdEventId = eventResult?.event?.id || null
    } catch (error) {
      if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
      window.alert(error?.message || '做菜记录保存失败，请稍后重试')
      return
    }
  }
  if (createdEventId) record.eventId = createdEventId
  let updatedRecipe = null
  recipes = recipes.map(recipe => {
    if (!sameId(recipe.id, selectedId)) return recipe
    const cookRecords = cookEditor.id
      ? (recipe.cookRecords || []).map(item => sameId(item.id, cookEditor.id) ? record : item)
      : [record, ...(recipe.cookRecords || [])]
    updatedRecipe = {
      ...recipe,
      cookRecords,
      cookCount: isNewRecord ? Math.max(Number(recipe.cookCount || 0) + 1, cookRecords.length) : Number(recipe.cookCount || cookRecords.length),
      lastCookedAt: isNewRecord ? date : (recipe.lastCookedAt || date),
      modifiedAt: new Date().toISOString(),
    }
    return updatedRecipe
  })
  try {
    await persistSingleRecipe(updatedRecipe)
  } catch (error) {
    recipes = previousRecipes
    if (createdEventId) await deleteCloudCookEvent(createdEventId).catch(() => null)
    if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
    window.alert('做菜记录保存失败，原图片已保留。')
    render()
    return
  }
  if (uploadedImageId && oldImageId && oldImageId !== uploadedImageId) {
    await Promise.allSettled([removeStoredImage(oldImageId, oldImageVersion)])
  }
  cookEditor = null
  if (isNewRecord) {
    await invalidateStatsCacheForMutation({ familyStats: true, ranking: true, annualTrend: true })
    await syncCloudLibrary({ force: true })
  }
  render()
}

function isUsableImageBlob(blob) {
  return Boolean(blob && Number(blob.size || 0) > 0 && String(blob.type || '').startsWith('image/'))
}

async function deleteCookRecord(recordId) {
  const current = findRecipeById(selectedId)
  if (!canEditRecipe(current)) return
  const record = (current.cookRecords || []).find(item => sameId(item.id, recordId))
  if (!record) return
  if (!window.confirm('确定要删除这条做菜记录吗？')) return
  const previousRecipes = recipes
  let updatedRecipe = null
  recipes = recipes.map(recipe => {
    if (!sameId(recipe.id, selectedId)) return recipe
    const cookRecords = (recipe.cookRecords || []).filter(item => !sameId(item.id, recordId))
    const latest = [...cookRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
    updatedRecipe = { ...recipe, cookRecords, cookCount: cookRecords.length, lastCookedAt: latest?.date || null, modifiedAt: new Date().toISOString() }
    return updatedRecipe
  })
  try {
    await persistSingleRecipe(updatedRecipe)
  } catch (error) {
    recipes = previousRecipes
    window.alert('做菜记录删除失败，图片和数据已保留。')
    render()
    return
  }
  if (record.eventId) {
    try {
      await deleteCloudCookEvent(record.eventId)
    } catch (error) {
      window.alert(error?.message || '做菜记录删除失败，请稍后重试')
      await syncCloudLibrary({ force: true })
      return
    }
  }
  await invalidateStatsCacheForMutation({ familyStats: true, ranking: true, annualTrend: true })
  if (record.imageId) await Promise.allSettled([removeStoredImage(record.imageId, record.imageVersion)])
  if (record.image?.startsWith('blob:')) URL.revokeObjectURL(record.image)
  if (cookEditor?.id && sameId(cookEditor.id, recordId)) cookEditor = null
  render()
}

function setupPullToRefresh() {
  const panel = document.querySelector('.recipe-panel')
  const indicator = document.querySelector('.pull-refresh-indicator')
  if (!panel || !indicator || panel.dataset.pullReady) return
  panel.dataset.pullReady = '1'
  setupHomeTabSwipe(panel)
  let tracking = false
  let startY = 0
  let pullDistance = 0

  panel.addEventListener('touchstart', event => {
    const scrollTop = Math.max(panel.scrollTop, window.scrollY, document.documentElement.scrollTop)
    if (refreshing || page !== 'home' || scrollTop > 0 || event.touches.length !== 1) return
    tracking = true
    pullDistance = 0
    startY = event.touches[0].clientY
  }, { passive: true })

  panel.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return
    pullDistance = Math.max(0, event.touches[0].clientY - startY)
    if (!pullDistance) return
    const visualDistance = Math.min(74, pullDistance * .45)
    indicator.classList.add('visible')
    indicator.style.transform = `translateY(${visualDistance}px)`
    indicator.textContent = pullDistance > 86 ? '松开刷新' : '下拉刷新'
  }, { passive: true })

  const finish = () => {
    if (!tracking) return
    const shouldRefresh = pullDistance > 86
    tracking = false
    indicator.style.transform = ''
    if (shouldRefresh) refreshFromCloud()
    else {
      indicator.classList.remove('visible')
      indicator.textContent = '下拉刷新'
    }
  }
  panel.addEventListener('touchend', finish, { passive: true })
  panel.addEventListener('touchcancel', finish, { passive: true })
}

function setupHomeTabSwipe(panel) {
  if (!panel || panel.dataset.swipeReady) return
  panel.dataset.swipeReady = '1'
  let gesture = null
  const ignoredStart = target => target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], .settings-popover, .image-lightbox')
  panel.addEventListener('pointerdown', event => {
    if (page !== 'home' || viewingMember || settingsMenuOpen || imagePreview || event.pointerType === 'mouse' || event.clientX < 24 || ignoredStart(event.target)) return
    panel.setPointerCapture?.(event.pointerId)
    gesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTime: Date.now(), horizontal: false, vertical: false, triggered: false }
  }, { passive: true })
  panel.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.triggered) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (gesture.vertical || (absY >= 14 && absY > absX * 1.05)) {
      gesture.vertical = true
      return
    }
    if (absX >= 14 && absX > absY * 1.05) {
      gesture.horizontal = true
      event.preventDefault()
    }
  }, { passive: false })
  panel.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const { startX, startY, startTime, horizontal, vertical } = gesture
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    const duration = Date.now() - startTime
    const normalSwipe = absX >= 36 && absX > absY * 1.05
    const fastSwipe = absX >= 28 && duration <= 220 && absX > absY
    if (vertical || (!horizontal && !normalSwipe && !fastSwipe)) return
    const currentIndex = HOME_SCOPE_ORDER.indexOf(activeScope)
    const nextIndex = currentIndex + (dx < 0 ? 1 : -1)
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= HOME_SCOPE_ORDER.length) return
    event.preventDefault()
    gesture.triggered = true
    gesture = null
    suppressHomeClickUntil = Date.now() + 500
    setHomeScope(HOME_SCOPE_ORDER[nextIndex])
  }, { passive: false })
  panel.addEventListener('pointercancel', event => {
    if (gesture?.pointerId === event.pointerId) gesture = null
  }, { passive: true })
}

async function checkAccess() {
  const cachedUser = loadCachedUser()
  if (cachedUser) {
    currentUser = cachedUser
    startApplication()
  } else {
    root.innerHTML = authLoadingTemplate()
  }
  try {
    const response = await fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
    const result = await response.json()
    if (response.ok && result.authenticated) {
      currentUser = result.user
      saveCachedUser(currentUser)
      return startApplication()
    }
    if (cachedUser && response.status === 401 && result.reason === 'session_expired') {
      storageRemove(USER_CACHE_KEY)
      appStarted = false
      currentUser = null
      recipes = []
    }
    if (cachedUser && response.status !== 401) return
    root.innerHTML = authTemplate(response.status === 503 ? result.error : '')
  } catch {
    if (cachedUser) {
      return
    }
    root.innerHTML = authTemplate('暂时无法验证访问，请检查网络后重试')
  }
}

root.addEventListener('input', event => {
  if (event.target.id === 'search') {
    query = event.target.value
    if (!searchIsComposing && !event.isComposing) {
      if (query.trim() && homeView !== 'library') {
        homeView = 'library'
        render(true)
        return
      }
      updateSearchResults()
    }
  }
  if (event.target.dataset.draft && draft) {
    draft[event.target.dataset.draft] = event.target.value
    draftDirty = true
  }
})

root.addEventListener('submit', async event => {
  if (event.target.id !== 'login-form') return
  event.preventDefault()
  if (authBusy) return
  const formData = new FormData(event.target)
  const account = String(formData.get('account') || '').trim()
  const password = String(formData.get('password') || '')
  const isAdmin = account.includes('@')
  const payload = isAdmin
    ? { mode: 'admin', email: account, password }
    : { mode: 'member', loginCode: account, pin: password }
  authBusy = true
  root.innerHTML = authTemplate()
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()
    authBusy = false
    if (response.ok) {
      currentUser = result.user
      saveCachedUser(currentUser)
      return startApplication()
    }
    root.innerHTML = authTemplate(result.error || '登录失败')
    document.getElementById('login-account')?.focus()
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
  if (query.trim() && homeView !== 'library') {
    homeView = 'library'
    searchIsComposing = false
    render(true)
    return
  }
  searchIsComposing = false
  updateSearchResults()
})

root.addEventListener('change', async event => {
  if (event.target.id === 'draft-family-shared' && draft) {
    draft.isFamilyShared = event.target.checked
    draftDirty = true
    return
  }
  const file = event.target.files?.[0]
  if (!file) return
  if (event.target.id === 'draft-file-input') {
    const draftRef = draft
    const generation = draftGeneration
    if (!draftRef || draftImageBusy) return
    draftImageBusy = true
    try {
      const normalizedFile = await normalizeImageFile(file)
      if (draft !== draftRef || draftGeneration !== generation || (page !== 'new' && page !== 'edit')) return
      if (draftRef.imageFile && draftRef.image?.startsWith('blob:')) URL.revokeObjectURL(draftRef.image)
      draftRef.imageFile = normalizedFile
      draftRef.image = URL.createObjectURL(normalizedFile)
      draftRef.removeImage = false
      draftDirty = true
      draftImageBusy = false
      render()
    } catch (error) {
      window.alert('图片处理失败，请重新选择一张普通照片。')
    } finally {
      event.target.value = ''
      if (draft === draftRef && draftGeneration === generation) draftImageBusy = false
    }
    return
  }
  if (event.target.id === 'cook-file-input' && cookEditor) {
    try {
      const normalizedFile = await normalizeImageFile(file)
      if (cookEditor.image?.startsWith('blob:')) URL.revokeObjectURL(cookEditor.image)
      cookEditor.imageFile = normalizedFile
      cookEditor.image = URL.createObjectURL(normalizedFile)
      render()
    } catch (error) {
      window.alert('图片处理失败，请重新选择一张普通照片。')
    } finally {
      event.target.value = ''
    }
    return
  }
  if (event.target.id === 'file-input') {
    await handleRecipeImageUpload(event, file)
    return
  }
  if (false) {
    if (recipeImageBusy) return
    recipeImageBusy = true
    const uploadRecipeId = selectedId
    const requestId = createRecipeSaveRequestId()
    const current = findRecipeById(selectedId)
    if (!current) { recipeImageBusy = false; return }
    const oldImageId = current.imageId || null
    const oldImageVersion = current.imageVersion || null
    const imageId = uniqueId(`recipe-${current.id}`)
    const imageVersion = new Date().toISOString()
    try {
      const normalizedFile = await normalizeImageFile(file)
      await storeImage(imageId, normalizedFile, imageVersion)
      logRecipeSave('IMAGE_NORMALIZE_START', { requestId, recipeId: uploadRecipeId, imageId })
      logRecipeSave('IMAGE_UPLOAD_START', { requestId, recipeId: uploadRecipeId, imageId })
      await uploadCloudImage(imageId, normalizedFile, requestId, uploadRecipeId)
      logRecipeSave('IMAGE_UPLOAD_SUCCESS', { requestId, recipeId: uploadRecipeId, imageId, status: 200 })
      if (page !== 'detail' || !sameId(selectedId, uploadRecipeId)) {
        await Promise.allSettled([removeStoredImage(imageId, imageVersion)])
        return
      }
      const updatedRecipe = { ...current, image: URL.createObjectURL(normalizedFile), imageId, imageVersion, modifiedAt: new Date().toISOString() }
      const previousRecipes = recipes
      recipes = recipes.map(recipe => sameId(recipe.id, selectedId) ? updatedRecipe : recipe)
      try {
        logRecipeSave('RECIPE_SAVE_START', { requestId, recipeId: uploadRecipeId, imageId })
        const savedRecipe = await persistSingleRecipe(updatedRecipe, requestId)
        logRecipeSave('RECIPE_SAVE_SUCCESS', { requestId, recipeId: uploadRecipeId, imageId: savedRecipe?.imageId || imageId, status: 200 })
        if (savedRecipe?.imageId !== imageId) throw Object.assign(new Error('Recipe image binding could not be confirmed'), { stage: 'IMAGE_BIND_FAILED' })
        logRecipeSave('IMAGE_BIND_CONFIRMED', { requestId, recipeId: uploadRecipeId, imageId })
      } catch (error) {
        logRecipeSave(error.stage || 'RECIPE_SAVE_FAILED', { requestId, recipeId: uploadRecipeId, imageId, status: error.status || null, error: error.message })
        recipes = previousRecipes
        await removeRemoteImageIfSafe(imageId, uploadRecipeId, imageVersion, requestId)
        window.alert('菜谱保存失败，原图片已保留。')
        render()
        return
      }
      if (oldImageId && oldImageId !== imageId) await removeRemoteImageIfSafe(oldImageId, uploadRecipeId, oldImageVersion, requestId)
      if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
      render()
    } catch (error) {
      logRecipeSave('IMAGE_UPLOAD_FAILED', { requestId, recipeId: uploadRecipeId, imageId, status: error.status || null, error: error.message })
      await Promise.allSettled([removeStoredImage(imageId, imageVersion)])
      window.alert('图片处理或保存失败，请重新选择一张普通照片。')
    } finally {
      event.target.value = ''
      recipeImageBusy = false
    }
  }
})

root.addEventListener('error', event => {
  const image = event.target
  if (!(image instanceof HTMLImageElement)) return
  const imageId = image.dataset.imageId
  if (!imageId || imageRetrying.has(imageId)) return
  const recipe = recipes.find(item => item.imageId === imageId)
  if (!recipe) return
  imageRetrying.add(imageId)
  removeStoredImage(recipe.imageId, recipe.imageVersion)
    .catch(() => null)
    .finally(async () => {
      clearRecipeImage(recipe)
      await cacheRecipeImage(recipe).catch(() => null)
      render()
    })
}, true)

root.addEventListener('click', async event => {
  if (suppressHomeClickUntil > Date.now()) {
    suppressHomeClickUntil = 0
    event.preventDefault()
    return
  }
  const target = event.target instanceof Element ? event.target.closest('[data-action], [data-category], [data-scope], [data-ranking-period], [data-stats-period], [data-recipe], [data-recipe-id], [data-draft-category], [data-edit-note], [data-delete-note], [data-edit-cook], [data-delete-cook], [data-member-view], [data-member-toggle], [data-member-pin], [data-member-rename], [data-member-delete]') : null
  if (!target) {
    if (annualTrendPoint) { annualTrendPoint = null; render() }
    return
  }
  const action = target.dataset.action
  if (annualTrendPoint && action !== 'annual-trend-point') {
    annualTrendPoint = null
    if (!action) { render(); return }
  }
  if (target.classList.contains('settings-layer') && event.target instanceof Element && event.target.closest('.settings-popover')) return
  if (action && target.closest('.settings-popover') && action !== 'close-settings') {
    settingsMenuOpen = false
    render()
    initSupabaseSessionBridge().catch(() => null)
  }
  if (target.dataset.category) { activeCategory = target.dataset.category; homeView = 'library'; settingsMenuOpen = false; render(); return }
  if (target.dataset.statsPeriod) { await setFamilyStatsPeriod(target.dataset.statsPeriod); return }
  if (target.dataset.rankingPeriod) { await setRankingPeriod(target.dataset.rankingPeriod); return }
  if (action === 'family-stats-prev') { await stepFamilyStatsPeriod(-1); return }
  if (action === 'family-stats-next') { await stepFamilyStatsPeriod(1); return }
  if (action === 'ranking-prev') { await stepRankingPeriod(-1); return }
  if (action === 'ranking-next') { await stepRankingPeriod(1); return }
  if (action === 'annual-trend-point') {
    annualTrendPoint = { year: annualTrendYear, memberIndex: Number(target.dataset.memberIndex), month: Number(target.dataset.month), count: Number(target.dataset.count) || 0 }
    render()
    return
  }
  if (action === 'annual-trend-prev') { await stepAnnualTrendYear(-1); return }
  if (action === 'annual-trend-next') { await stepAnnualTrendYear(1); return }
  if (target.dataset.scope) {
    setHomeScope(target.dataset.scope)
    return
  }
  if (action === 'open-recipe' && target.dataset.recipeId) { openRecipe(target.dataset.recipeId); return }
  if (target.dataset.recipe) { openRecipe(target.dataset.recipe); return }
  if (target.dataset.draftCategory) { if (!draft || draftBusy || draftImageBusy) return; syncDraftFields(); const category = target.dataset.draftCategory; draft.categories = draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category]; draftDirty = true; render(); return }
  if (target.dataset.editNote) { openNoteEditor(target.dataset.editNote); return }
  if (target.dataset.deleteNote) { deleteNote(target.dataset.deleteNote); return }
  if (target.dataset.editCook) { if (canEditRecipe(findRecipeById(selectedId))) openCookEditor(target.dataset.editCook); return }
  if (target.dataset.deleteCook) { deleteCookRecord(target.dataset.deleteCook); return }
  if (target.dataset.memberView) {
    const member = members.find(item => sameId(item.id, target.dataset.memberView))
    if (member) {
      viewingMember = { id: member.id, displayName: member.displayName }
      activeScope = 'mine'
      activeCategory = '全部'
      query = ''
      settingsMenuOpen = false
      page = 'home'
      render()
    }
    return
  }
  if (target.dataset.memberToggle) {
    const member = members.find(item => sameId(item.id, target.dataset.memberToggle))
    if (member) updateMember(member.id, { isActive: !member.isActive })
    return
  }
  if (target.dataset.memberPin) {
    const pin = window.prompt('请输入新的 PIN / 密码，至少 4 位')
    if (pin) updateMember(target.dataset.memberPin, { pin })
    return
  }
  if (target.dataset.memberRename) {
    const member = members.find(item => sameId(item.id, target.dataset.memberRename))
    const displayName = window.prompt('请输入新的显示名称', member?.displayName || '')
    if (displayName) updateMember(target.dataset.memberRename, { displayName })
    return
  }
  if (target.dataset.memberDelete) { deleteMember(target.dataset.memberDelete); return }
  if (action === 'add-note') { openNoteEditor(); return }
  if (action === 'cancel-note') { noteEditor = null; render(); return }
  if (action === 'save-note') { saveNote(); return }
  if (action === 'toggle-favorite') { toggleFavorite(); return }
  if (action === 'quick-cook') { quickCookRecipe(); return }
  if (action === 'toggle-family-share') { toggleFamilyShare(); return }
  if (action === 'copy-recipe') { copySelectedRecipe(); return }
  if (action === 'add-cook-record') { if (canRecordRecipe(findRecipeById(selectedId))) openCookEditor(); return }
  if (action === 'cancel-cook-record') { cookEditor = null; render(); return }
  if (action === 'save-cook-record') { saveCookRecord(); return }
  if (action === 'choose-cook-image') { document.getElementById('cook-file-input')?.click(); return }
  if (action === 'new-recipe') { startNewRecipe(); return }
  if (action === 'toggle-theme') { toggleTheme(); return }
  if (action === 'share-url') {
    try {
      const result = await shareCurrentUrl()
      if (result === 'copied') window.alert('网址已复制')
    } catch (error) {
      try {
        await copyCurrentUrl()
        window.alert('网址已复制')
      } catch {
        window.alert('网址已复制失败')
      }
    }
    return
  }
  if (action === 'settings') { settingsMenuOpen = !settingsMenuOpen; render(); return }
  if (action === 'close-settings') { settingsMenuOpen = false; render(); return }
  if (action === 'account-info') {
    window.alert(`当前账号：${currentAccountName()}${currentUser?.loginCode ? `\n账号编号：${currentUser.loginCode}` : ''}`)
    settingsMenuOpen = false
    render()
    return
  }
  if (action === 'stop-view-member') { viewingMember = null; activeScope = 'mine'; activeCategory = '全部'; query = ''; render(); return }
  if (action === 'members') { settingsMenuOpen = false; openMembersPage(); return }
  if (action === 'storage-stats') {
    settingsMenuOpen = false
    try {
      const stats = await loadCloudStorageStats()
      const size = stats.totalBytes >= 1024 * 1024
        ? `${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB`
        : `${(stats.totalBytes / 1024).toFixed(1)} KB`
      const capacity = stats.capacityBytes > 0 ? `\n配置容量：${(stats.capacityBytes / 1024 / 1024).toFixed(0)} MB` : '\n配置容量：未配置'
      const warning = stats.usageRatio >= 0.7 ? '\n⚠️ 已达到容量的 70%，请安排清理或扩容。' : ''
      window.alert(`Supabase Storage 统计\n图片数量：${stats.imageCount}\n当前图片总容量：${size}${capacity}\n扫描对象：${stats.scanned}${warning}`)
    } catch {
      window.alert('Storage 统计读取失败，请稍后重试。')
    }
    render()
    return
  }
  if (action === 'cleanup-images') {
    settingsMenuOpen = false
    try {
      const result = await cleanupCloudImages()
      window.alert(`图片清理完成：扫描 ${result.scanned} 张，删除 ${result.deleted} 张。`)
    } catch (error) {
      window.alert('图片清理失败，请稍后重试。')
    }
    render()
    return
  }
  if (action === 'clear-local-cache') {
    settingsMenuOpen = false
    if (!window.confirm('确定清除本地缓存吗？登录状态会保留，菜谱和图片会重新从服务器读取。')) { render(); return }
    try {
      await clearLocalCacheAndReload()
      window.alert('本地缓存已清除，并已重新同步服务器数据。')
    } catch (error) {
      window.alert('清除缓存失败，请稍后重试。')
      render()
    }
    return
  }
  if (action === 'create-member') { createMember(); return }
  if (action === 'logout') {
    fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' }).finally(() => {
      storageRemove(USER_CACHE_KEY)
      appStarted = false
      selectedId = null
      currentUser = null
      viewingMember = null
      settingsMenuOpen = false
      recipes = []
      members = []
      page = 'home'
      root.innerHTML = authTemplate()
      document.getElementById('login-account')?.focus()
    })
    return
  }
  if (action === 'edit-recipe') { if (canEditRecipe(findRecipeById(selectedId))) startEditRecipe(); return }
  if (action === 'save-recipe') { saveRecipe(); return }
  if (action === 'request-delete-recipe') { deleteRecipePrompt = true; render(); return }
  if (action === 'cancel-delete-recipe') { deleteRecipePrompt = false; render(); return }
  if (action === 'confirm-delete-recipe') { deleteCurrentRecipe(); return }
  if (action === 'cancel-form') {
    syncDraftFields()
    if (page === 'edit' && draftDirty) { formExitPrompt = true; render(); return }
    leaveFormWithoutSaving()
    return
  }
  if (action === 'discard-changes') { leaveFormWithoutSaving(); return }
  if (action === 'continue-editing') { formExitPrompt = false; render(); return }
  if (action === 'save-and-exit') { saveRecipe(); return }
  if (action === 'choose-draft-image') { if (!draft || draftBusy || draftImageBusy) return; document.getElementById('draft-file-input')?.click(); return }
  if (action === 'remove-draft-image') {
    if (!draft || draftBusy || draftImageBusy) return
    if (draft.imageFile && draft.image?.startsWith('blob:')) URL.revokeObjectURL(draft.image)
    draft.image = null
    draft.imageFile = null
    draft.removeImage = true
    draftDirty = true
    render()
    return
  }
  if (action === 'clear') { query = ''; const search = document.getElementById('search'); if (search) { search.value = ''; search.focus() } updateSearchResults(); return }
  if (action === 'back-home') {
    if (settingsMenuOpen) { settingsMenuOpen = false; render(); return }
    goHome()
    return
  }
  if (action === 'add-image' && page === 'detail') {
    if (!canEditRecipe(findRecipeById(selectedId))) return
    document.getElementById('file-input')?.click()
    return
  }
  if (action === 'add-image') { openRecipe(target.closest('[data-recipe]')?.dataset.recipe); return }
  if (action === 'image-menu' && page === 'detail') { if (!canEditRecipe(findRecipeById(selectedId))) return; event.stopPropagation(); imageMenu = true; render(); return }
  if (action === 'close-menu' && (target === event.target || target.classList.contains('cancel'))) { imageMenu = false; render(); return }
  if (action === 'replace-image') { imageMenu = false; render(); setTimeout(() => document.getElementById('file-input')?.click()); return }
  if (action === 'delete-image') {
    const current = findRecipeById(selectedId)
    if (!canEditRecipe(current)) return
    const oldImageId = current.imageId
    const oldImageVersion = current.imageVersion
    const previousRecipes = recipes
    const updatedRecipe = { ...current, image: null, imageId: null, imageVersion: null, modifiedAt: new Date().toISOString() }
    recipes = recipes.map(recipe => sameId(recipe.id, selectedId) ? updatedRecipe : recipe)
    try {
      await persistSingleRecipe(updatedRecipe)
    } catch (error) {
      recipes = previousRecipes
      window.alert('图片删除失败，原图片已保留。')
      render()
      return
    }
    if (oldImageId) await removeRemoteImageIfSafe(oldImageId, selectedId, oldImageVersion)
    if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
    imageMenu = false
    render()
    return
  }
  if (action === 'view-image') { imageMenu = false; imagePreview = true; render(); return }
  if (action === 'close-preview') { imagePreview = false; render() }
})

var recipeComments = []
var recipeCommentsRecipeId = null
var recipeCommentsLoading = false
var guestCommentBusy = false
var guestCommentDraft = { guestName: '', content: '' }

function matchScope(recipe) {
  if (!currentUser) return true
  if (currentUser?.role === 'guest') return Boolean(recipe.isFamilyShared)
  if (viewingMember) return sameId(recipe.authorUserId, viewingMember.id)
  if (activeScope === 'mine') return sameId(recipe.authorUserId, currentUser.id)
  if (activeScope === 'shared') return Boolean(recipe.isFamilyShared)
  if (activeScope === 'favorites') return isFavorite(recipe)
  return sameId(recipe.authorUserId, currentUser.id)
}

function canEditRecipe(recipe) {
  if (currentUser?.role === 'guest') return false
  return isAdmin() || sameId(recipe?.authorUserId, currentUser?.id)
}

function canRecordRecipe(recipe) {
  if (currentUser?.role === 'guest') return false
  return canViewRecipe(recipe)
}

function canViewRecipe(recipe) {
  if (!recipe) return false
  if (currentUser?.role === 'guest') return Boolean(recipe.isFamilyShared)
  return Boolean(isAdmin() || sameId(recipe.authorUserId, currentUser?.id) || recipe.isFamilyShared)
}

function homeStats() {
  if (currentUser?.role === 'guest') {
    return {
      mine: 0,
      shared: recipes.filter(recipe => recipe.isFamilyShared).length,
      favorites: 0,
      members: 0,
    }
  }
  return {
    mine: recipes.filter(recipe => sameId(recipe.authorUserId, currentUser?.id)).length,
    shared: recipes.filter(recipe => recipe.isFamilyShared).length,
    favorites: recipes.filter(recipe => isFavorite(recipe)).length,
    members: familyMemberCount || members.length || (isAdmin() ? 1 : 0),
  }
}

function currentAccountName() {
  if (currentUser?.role === 'guest') return '游客'
  return currentUser?.displayName || (isAdmin() ? '管理员' : '我')
}

function homeSubtitle() {
  if (currentUser?.role === 'guest') return '游客浏览 · 仅查看家庭共享菜谱'
  if (viewingMember) return `正在查看：${viewingMember.displayName}的菜谱`
  return `${currentAccountName()}的菜谱`
}

function scopeTitle() {
  if (viewingMember) return `${viewingMember.displayName}的菜谱`
  if (currentUser?.role === 'guest') return '家庭共享'
  if (activeScope === 'shared') return '家庭共享'
  if (activeScope === 'favorites') return '我的收藏'
  return '我的菜谱'
}

function settingsMenuTemplateRaw() {
  if (!settingsMenuOpen) return ''
  const selectedRecipe = findRecipeById(selectedId)
  if (currentUser?.role === 'guest') {
    return `<div class="settings-layer" data-action="close-settings"><div class="settings-popover" role="dialog" aria-label="设置菜单">
      <button data-action="toggle-theme">${themeMode === 'dark' ? '切换浅色模式' : '切换深色模式'}</button>
      <button data-action="share-url">分享链接</button>
      <button data-action="guest-exit">退出游客模式</button>
      <button class="muted" data-action="close-settings">取消</button>
    </div></div>`
  }
  return `<div class="settings-layer" data-action="close-settings"><div class="settings-popover" role="dialog" aria-label="设置菜单">
    <button data-action="toggle-theme">${themeMode === 'dark' ? '切换浅色模式' : '切换深色模式'}</button>
    <button data-action="share-url">分享链接</button>
    ${page === 'new' || page === 'edit' ? '' : '<button data-action="new-recipe">新增菜谱</button>'}
    ${page === 'detail' && canEditRecipe(selectedRecipe) ? '<button data-action="edit-recipe">编辑菜谱</button>' : ''}
    <button data-action="account-info">账号信息</button>
    ${isAdmin() ? '<button data-action="members">成员管理</button><button data-action="storage-stats">Storage 统计</button><button data-action="cleanup-images">清理图片垃圾</button>' : ''}
    <div class="app-info-panel">
      <div class="app-info-row compact">
        <span>当前版本</span>
        <strong>${APP_VERSION}</strong>
      </div>
    </div>
    <button data-action="clear-local-cache">清除本地缓存</button>
    <button data-action="logout">退出登录</button>
    <button class="muted" data-action="close-settings">取消</button>
  </div></div>`
}

function globalActionsTemplate() {
  return `<div class="global-actions" aria-label="全局操作">
    <button class="global-icon-button" data-action="settings" aria-label="菜单">☰</button>
  </div>`
}

function statsTemplate() {
  const stats = homeStats()
  const mineActive = !viewingMember && activeScope === 'mine'
  const sharedActive = !viewingMember && activeScope === 'shared'
  const favoritesActive = !viewingMember && activeScope === 'favorites'
  if (currentUser?.role === 'guest') {
    return `<div class="home-stats guest-stats">
      <button type="button" data-scope="shared" class="${sharedActive ? 'active' : ''}"><strong>${stats.shared}</strong><span>家庭共享</span></button>
      <span class="stat-card disabled"><strong>游客</strong><span>仅浏览</span></span>
    </div>`
  }
  return `<div class="home-stats" aria-label="菜谱范围">
      <button type="button" data-scope="mine" class="${mineActive ? 'active' : ''}"><strong>${stats.mine}</strong><span>我的菜谱</span></button>
      <button type="button" data-scope="shared" class="${sharedActive ? 'active' : ''}"><strong>${stats.shared}</strong><span>家庭共享</span></button>
      <button type="button" data-scope="favorites" class="${favoritesActive ? 'active' : ''}"><strong>${stats.favorites}</strong><span>我的收藏</span></button>
    </div>`
}

function authTemplate(message = '') {
  return `<main class="auth-screen"><section class="auth-card"><div class="auth-mark">家</div><div class="eyebrow">OUR FAMILY TABLE</div><h1>咱家菜谱</h1><p>家庭私房菜谱</p>
    <form id="login-form" class="login-form">
      <h2>登录咱家菜谱</h2>
      <label for="login-account">账号</label>
      <input id="login-account" name="account" autocomplete="username" placeholder="管理员邮箱或家庭成员编号" autofocus>
      <label for="login-password">密码 / PIN</label>
      <input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="请输入密码或 PIN">
      <button type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? '正在进入…' : '进入菜谱'}</button>
    </form>
    <button class="guest-login-button" type="button" data-action="guest-login">游客浏览</button>
    <div class="auth-error" role="alert">${escapeHtml(message)}</div><small>不开放注册，账号由管理员创建</small></section></main>`
}

async function openRecipeComments(recipeId) {
  if (!recipeId || recipeCommentsLoading) return
  recipeCommentsLoading = true
  try {
    const response = await fetch(`/api/comments?recipeId=${encodeURIComponent(recipeId)}`, { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error(`Failed to load comments: ${response.status}`)
    const data = await response.json()
    recipeCommentsRecipeId = recipeId
    recipeComments = Array.isArray(data.comments) ? data.comments : []
    if (page === 'detail' && sameId(selectedId, recipeId)) render()
  } catch (error) {
    console.warn('留言读取失败', error)
  } finally {
    recipeCommentsLoading = false
  }
}

function commentsSection(recipe) {
  const comments = recipeCommentsRecipeId === recipe.id ? recipeComments : []
  const canWriteComment = currentUser?.role === 'guest' && recipe.isFamilyShared
  const canDeleteComment = isAdmin() || sameId(recipe.authorUserId, currentUser?.id)
  const list = comments.length
    ? `<div class="comment-list">${comments.map(comment => `<article class="comment-item">
        <div class="comment-meta"><strong>${escapeHtml(comment.guest_name || '匿名')}</strong><time>${escapeHtml((comment.created_at || '').replace('T', ' ').slice(0, 16))}</time>${canDeleteComment ? `<button class="danger-text" data-action="delete-comment" data-comment-id="${escapeHtml(comment.id)}">删除</button>` : ''}</div>
        <p>${escapeHtml(comment.content || '')}</p>
      </article>`).join('')}</div>`
    : '<p class="empty-copy">还没有留言。</p>'
  const form = canWriteComment ? `<div class="comment-form">
    <label><span>昵称</span><input id="guest-comment-name" value="${escapeHtml(guestCommentDraft.guestName || currentUser?.displayName || '游客')}" placeholder="请输入昵称"></label>
    <label><span>留言内容</span><textarea id="guest-comment-content" maxlength="300" placeholder="写下你想说的话">${escapeHtml(guestCommentDraft.content || '')}</textarea></label>
    <div class="comment-form-actions"><button class="secondary-button" data-action="guest-comment-clear">清空</button><button class="primary-button" data-action="save-guest-comment" ${guestCommentBusy ? 'disabled' : ''}>提交留言</button></div>
  </div>` : ''
  return `<section class="recipe-section comments-section"><div class="recipe-section-title"><span>06</span><h2>留言区</h2></div><div class="recipe-section-body">${recipe.isFamilyShared ? '' : '<p class="empty-copy">仅家庭共享菜谱支持留言。</p>'}${form}${recipeCommentsRecipeId === recipe.id && recipeCommentsLoading ? '<p class="empty-copy">正在加载留言…</p>' : ''}${list}</div></section>`
}

function detailTemplate(recipe) {
  const editable = canEditRecipe(recipe)
  const showWritingActions = currentUser?.role !== 'guest'
  return `<div class="app-shell detail-shell"><header class="detail-header"><button class="icon-button" data-action="back-home" aria-label="返回">${icons.back}</button><div class="detail-header-title">菜谱详情</div>${globalActionsTemplate()}</header>
    ${settingsMenuTemplate()}
    <main class="detail-content"><div class="detail-title-row"><div><div class="eyebrow">咱家的拿手菜</div><h1>${escapeHtml(recipe.name)}</h1></div><div class="title-mark">◌</div></div>
      <div class="recipe-author-line">记录人：${escapeHtml(recipe.authorName || '家人')}${recipe.isFamilyShared ? ` · 共享人：${escapeHtml(recipe.authorName || '家人')}` : ''} · 已做 ${recipe.cookCount || 0} 次</div>
      <div class="share-status-card ${recipe.isFamilyShared ? 'shared' : 'private'}">
        <div><strong>当前状态：${recipe.isFamilyShared ? '👨‍👩‍👧 家庭共享' : '🔒 私人菜谱'}</strong><small>${recipe.isFamilyShared ? '所有家庭成员都能看到这道菜。' : '只有创建者和管理员可以看到。'}</small></div>
        <div class="share-card-actions"><label class="share-switch ${editable ? '' : 'disabled'}"><span>共享到家庭</span><input type="checkbox" data-action="toggle-family-share" ${recipe.isFamilyShared ? 'checked' : ''} ${editable ? '' : 'disabled'}><i></i></label>${showWritingActions ? `<button class="detail-favorite-button" data-action="toggle-favorite">${isFavorite(recipe) ? '★ 已收藏' : '☆ 收藏'}</button>` : ''}</div>
      </div>
      ${imageArea(recipe)}<input id="file-input" class="hidden-input" type="file" accept="image/*">
      ${section('01', '材料', `<ul class="simple-list">${recipe.ingredients.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      ${section('02', '制作步骤', `<ol class="steps">${recipe.steps.map((step,index) => `<li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join('')}</ol>`)}
      ${section('03', '注意事项', `<p class="body-copy">${escapeHtml(recipe.tips || '暂无')}</p>`)}
      ${cookRecordsSection(recipe)}
      ${notesSection(recipe)}
    </main>${imageMenu ? actionSheet() : ''}${imagePreview && recipe.image ? imageLightbox(recipe) : ''}</div>`
}

async function loadCookStatus(recipeId) {
  cookStatus = { recipeId, count: Number(findRecipeById(recipeId)?.cookCount || 0), todayRecorded: false, loading: true, busy: false }
  try {
    const status = await loadCloudCookStatus(recipeId)
    cookStatus = { recipeId, count: Number(status.count || 0), todayRecorded: Boolean(status.todayRecorded), loading: false, busy: false }
  } catch (error) {
    cookStatus = { recipeId, count: Number(findRecipeById(recipeId)?.cookCount || 0), todayRecorded: false, loading: false, busy: false }
  }
  if (page === 'detail' && sameId(selectedId, recipeId)) render()
}

async function quickCookRecipe() {
  const recipe = findRecipeById(selectedId)
  if (!recipe || !canRecordRecipe(recipe) || cookStatus.busy) return
  cookStatus = { ...cookStatus, recipeId: recipe.id, busy: true, loading: false }
  render()
  try {
    const result = await createCloudCookEvent(recipe.id)
    const count = Number(result.count || cookStatus.count || recipe.cookCount || 0)
    cookStatus = { recipeId: recipe.id, count, todayRecorded: true, loading: false, busy: false }
    recipes = recipes.map(item => sameId(item.id, recipe.id) ? { ...item, cookCount: count, lastCookedAt: new Date().toLocaleDateString('sv-SE') } : item)
    await invalidateStatsCacheForMutation({ familyStats: true, ranking: true, annualTrend: true })
    await syncCloudLibrary({ force: true })
    render()
  } catch (error) {
    cookStatus = { ...cookStatus, busy: false }
    render()
    window.alert(error?.message || '记录失败，请稍后再试')
  }
}

async function refreshFamilyStatsOnly({ force = false } = {}) {
  if (!cloudReady || currentUser?.role === 'guest') return
  const requestGeneration = ++familyStatsRequestGeneration
  const requestedPeriod = familyStatsPeriod
  const requestedYear = familyStatsYear
  const requestedMonth = familyStatsMonth
  const params = { period: requestedPeriod, year: requestedYear, month: requestedMonth }
  let freshDataChanged = false
  const cached = await readStatsCache('family-stats', params)
  const cacheIsFresh = cached && Date.now() - Number(cached.updatedAt || 0) < STATS_REVALIDATE_INTERVAL_MS
  if (cached?.data && requestGeneration === familyStatsRequestGeneration && familyStatsPeriod === requestedPeriod && familyStatsYear === requestedYear && familyStatsMonth === requestedMonth) {
    familyStats = cached.data
    familyStatsLoading = false
    familyStatsDataState = 'cached'
    console.info(JSON.stringify({ stage: 'STATS_CACHE_APPLIED', scope: 'family-stats', key: cached.key }))
    console.info(JSON.stringify({ stage: 'HOME_STATS_RENDER_FROM_CACHE', scope: 'family-stats' }))
    render()
  } else if (!cached) {
    familyStatsLoading = true
    familyStatsDataState = 'loading'
    render()
  }
  if (cacheIsFresh && !force) return
  console.info(JSON.stringify({ stage: 'STATS_REVALIDATE_START', scope: 'family-stats', period: requestedPeriod, year: requestedYear, month: requestedMonth }))
  try {
    const statsData = await loadCloudFamilyStats({ period: requestedPeriod, year: requestedYear, month: requestedMonth })
    if (requestGeneration !== familyStatsRequestGeneration || familyStatsPeriod !== requestedPeriod || familyStatsYear !== requestedYear || familyStatsMonth !== requestedMonth) return
    const unchanged = JSON.stringify(familyStats) === JSON.stringify(statsData)
    familyStats = statsData
    familyStatsDataState = 'confirmed'
    freshDataChanged = !unchanged
    await writeStatsCache('family-stats', params, statsData)
    console.info(JSON.stringify({ stage: unchanged ? 'STATS_REVALIDATE_NO_CHANGE' : 'STATS_REVALIDATE_SUCCESS', scope: 'family-stats', period: requestedPeriod, year: requestedYear, month: requestedMonth }))
  } catch (error) {
    console.warn('统计刷新失败', error)
  } finally {
    if (requestGeneration !== familyStatsRequestGeneration) return
    familyStatsLoading = false
    if (freshDataChanged || !cached) render()
  }
}

async function refreshAnnualTrendOnly({ force = false } = {}) {
  if (!cloudReady || currentUser?.role === 'guest') return
  const requestGeneration = ++annualTrendRequestGeneration
  const requestedYear = annualTrendYear
  annualTrendPoint = null
  const params = { period: 'year', year: requestedYear }
  let freshDataChanged = false
  const cached = await readStatsCache('annual-trend', params)
  const cacheIsFresh = cached && Date.now() - Number(cached.updatedAt || 0) < STATS_REVALIDATE_INTERVAL_MS
  if (cached?.data && requestGeneration === annualTrendRequestGeneration && annualTrendYear === requestedYear) {
    annualTrend = cached.data
    annualTrendDataState = 'cached'
    console.info(JSON.stringify({ stage: 'ANNUAL_TREND_CACHE_APPLIED', key: cached.key }))
    render()
  }
  if (cacheIsFresh && !force) return
  console.info(JSON.stringify({ stage: 'STATS_REVALIDATE_START', scope: 'annual-trend', year: requestedYear }))
  try {
    const trendData = await loadCloudAnnualTrend(requestedYear)
    if (requestGeneration !== annualTrendRequestGeneration || annualTrendYear !== requestedYear) return
    const unchanged = JSON.stringify(annualTrend) === JSON.stringify(trendData)
    annualTrend = trendData
    annualTrendDataState = 'confirmed'
    freshDataChanged = !unchanged
    await writeStatsCache('annual-trend', params, trendData)
    console.info(JSON.stringify({ stage: unchanged ? 'STATS_REVALIDATE_NO_CHANGE' : 'STATS_REVALIDATE_SUCCESS', scope: 'annual-trend', year: requestedYear }))
  } catch (error) {
    console.warn('年度做饭趋势刷新失败', error)
  }
  if (requestGeneration !== annualTrendRequestGeneration) return
  if (freshDataChanged || !cached) render()
}

async function refreshRankingOnly({ force = false } = {}) {
  if (!cloudReady) return
  const requestGeneration = ++rankingRequestGeneration
  const requestedPeriod = rankingPeriod
  const requestedYear = rankingYear
  const requestedMonth = rankingMonth
  const params = { period: requestedPeriod, year: requestedYear, month: requestedMonth }
  let freshDataChanged = false
  const cached = await readStatsCache('ranking', params)
  const cacheIsFresh = cached && Date.now() - Number(cached.updatedAt || 0) < STATS_REVALIDATE_INTERVAL_MS
  if (cached?.data && requestGeneration === rankingRequestGeneration && rankingPeriod === requestedPeriod && rankingYear === requestedYear && rankingMonth === requestedMonth) {
    monthlyRanking = Array.isArray(cached.data.rankings) ? cached.data.rankings : []
    rankingDataState = 'cached'
    console.info(JSON.stringify({ stage: 'RANKING_CACHE_HIT', key: cached.key }))
    console.info(JSON.stringify({ stage: 'RANKING_CACHE_APPLIED', key: cached.key }))
    render()
  }
  if (cacheIsFresh && !force) return
  console.info(JSON.stringify({ stage: 'STATS_REVALIDATE_START', scope: 'ranking', period: requestedPeriod, year: requestedYear, month: requestedMonth }))
  try {
    const rankingData = await loadCloudRanking({ period: requestedPeriod, year: requestedYear, month: requestedMonth })
    if (requestGeneration !== rankingRequestGeneration || rankingPeriod !== requestedPeriod || rankingYear !== requestedYear || rankingMonth !== requestedMonth) return
    const unchanged = JSON.stringify(monthlyRanking) === JSON.stringify(Array.isArray(rankingData.rankings) ? rankingData.rankings : [])
    monthlyRanking = Array.isArray(rankingData.rankings) ? rankingData.rankings : []
    rankingDataState = 'confirmed'
    freshDataChanged = !unchanged
    await writeStatsCache('ranking', params, rankingData)
    console.info(JSON.stringify({ stage: unchanged ? 'STATS_REVALIDATE_NO_CHANGE' : 'STATS_REVALIDATE_SUCCESS', scope: 'ranking', period: requestedPeriod, year: requestedYear, month: requestedMonth }))
  } catch (error) {
    console.warn('排行榜刷新失败', error)
  }
  if (requestGeneration !== rankingRequestGeneration) return
  if (freshDataChanged || !cached) render()
}

function currentMadridParts() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric' }).formatToParts(new Date())
  return { year: Number(parts.find(part => part.type === 'year')?.value), month: Number(parts.find(part => part.type === 'month')?.value) }
}

async function setFamilyStatsPeriod(period) {
  familyStatsPeriod = period
  const now = currentMadridParts()
  if (period === 'all') {
    familyStatsYear = now.year
    familyStatsMonth = now.month
  } else if (period === 'year') {
    familyStatsYear = now.year
    familyStatsMonth = now.month
  } else {
    familyStatsYear = now.year
    familyStatsMonth = now.month
  }
  await refreshFamilyStatsOnly()
}

async function stepFamilyStatsPeriod(delta) {
  if (familyStatsPeriod === 'all') return
  if (familyStatsPeriod === 'year') familyStatsYear += delta
  else {
    familyStatsMonth += delta
    if (familyStatsMonth < 1) { familyStatsMonth = 12; familyStatsYear -= 1 }
    if (familyStatsMonth > 12) { familyStatsMonth = 1; familyStatsYear += 1 }
  }
  const now = currentMadridParts()
  if (familyStatsYear > now.year || (familyStatsPeriod === 'month' && familyStatsYear === now.year && familyStatsMonth > now.month)) {
    familyStatsYear = now.year; familyStatsMonth = now.month
  }
  await refreshFamilyStatsOnly()
}

async function stepAnnualTrendYear(delta) {
  const now = currentMadridParts()
  const nextYear = Math.min(now.year, Math.max(2000, annualTrendYear + delta))
  if (nextYear === annualTrendYear) return
  annualTrendYear = nextYear
  await refreshAnnualTrendOnly()
}

async function setRankingPeriod(period) {
  rankingPeriod = period
  const now = currentMadridParts()
  rankingYear = now.year
  rankingMonth = now.month
  await refreshRankingOnly()
}

async function stepRankingPeriod(delta) {
  if (rankingPeriod === 'all') return
  if (rankingPeriod === 'year') rankingYear += delta
  else {
    rankingMonth += delta
    if (rankingMonth < 1) { rankingMonth = 12; rankingYear -= 1 }
    if (rankingMonth > 12) { rankingMonth = 1; rankingYear += 1 }
  }
  const now = currentMadridParts()
  if (rankingYear > now.year || (rankingPeriod === 'month' && rankingYear === now.year && rankingMonth > now.month)) {
    rankingYear = now.year; rankingMonth = now.month
  }
  await refreshRankingOnly()
}

function settingsMenuTemplate() {
  return settingsMenuTemplateRaw()
    .replace(/<button data-action="storage-stats">[\s\S]*?<\/button>/g, '')
    .replace(/<button data-action="cleanup-images">[\s\S]*?<\/button>/g, '')
}

function render(preserveFocus = false) {
  syncMenuScrollLock()
  if (page === 'detail' && selectedId && !cookStatus.loading && !sameId(cookStatus.recipeId, selectedId)) loadCookStatus(selectedId)
  if (page === 'new' || page === 'edit') root.innerHTML = newRecipeTemplate()
  else if (page === 'members') root.innerHTML = membersTemplate()
  else if (page === 'detail') {
    const recipe = findRecipeById(selectedId)
    root.innerHTML = canViewRecipe(recipe) ? detailTemplate(recipe) : homeTemplate()
    if (!canViewRecipe(recipe)) { page = 'home'; selectedId = null; clearRecipeComments() }
  }
  else root.innerHTML = homeTemplate()
  if (preserveFocus) { const input = document.getElementById('search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length) }
  if (imagePreview) setupImagePreviewInteractions()
  if (page === 'home') requestAnimationFrame(() => {
    syncActiveCategoryPosition()
    setupPullToRefresh()
    preloadHomeImages().catch(() => null)
  })
}

async function startApplication() {
  if (appStarted) return
  try {
    appStarted = true
    startSessionWatch()
    history.replaceState({ appPage: 'home' }, '')
    activeScope = currentUser?.role === 'guest' ? 'shared' : 'mine'
    activeCategory = '全部'
    query = ''
    viewingMember = null
    settingsMenuOpen = false
    clearRecipeComments()
    recipes = loadRecipes()
    await hydrateRecipesFromIndexedDB({ renderCached: false }).catch(() => null)
    await hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), false).catch(() => null)
    await hydrateVisibleStatsFromCache().catch(() => null)
    render()
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).catch(error => console.warn('离线服务启动失败。', error))
    if (isAdmin()) loadMembers().then(render).catch(error => console.warn('成员列表读取失败。', error))
    bootstrapCloudSync().catch(error => console.warn('后台同步启动失败。', error))
  } catch (error) {
    appStarted = false
    showStartupFailure(error)
  }
}

async function revalidateSession() {
  if (!currentUser) return
  try {
    const response = await fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
    const result = await response.json().catch(() => ({}))
    if (response.ok && result.authenticated && result.user) {
      currentUser = result.user
      saveCachedUser(currentUser)
      return
    }
    // Only the explicit expiry response may end an existing cached session.
    if (response.status === 401 && result.reason === 'session_expired') {
      storageRemove(USER_CACHE_KEY)
      currentUser = null
      appStarted = false
      recipes = []
      root.innerHTML = authTemplate('登录已过期，请重新登录')
    }
  } catch {
    // Offline/transient errors must never clear a valid UI session.
  }
}

function startSessionWatch() {
  if (sessionWatchStarted || typeof window === 'undefined') return
  sessionWatchStarted = true
  window.addEventListener('online', () => revalidateSession())
  window.addEventListener('focus', () => revalidateSession())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revalidateSession()
  })
}

function openRecipe(recipeId) {
  invalidateRecipeImageOperation()
  const recipe = findRecipeById(recipeId)
  if (!canViewRecipe(recipe)) return
  touchRecipeOpen(recipeId)
  selectedId = recipeId
  page = 'detail'
  history.pushState({ appPage: 'detail', recipeId }, '')
  clearRecipeComments()
  render()
}

function goHome(fromHistory = false) {
  if (!fromHistory && history.state?.appPage === 'detail') {
    invalidateRecipeImageOperation()
    history.back()
    return
  }
  invalidateRecipeImageOperation()
  selectedId = null
  imageMenu = false
  imagePreview = false
  noteEditor = null
  settingsMenuOpen = false
  clearRecipeComments()
  page = 'home'
  rankingPeriod = 'all'
  familyStatsPeriod = 'all'
  const now = currentMadridParts()
  rankingYear = now.year; rankingMonth = now.month; familyStatsYear = now.year; familyStatsMonth = now.month
  annualTrendYear = now.year
  annualTrendPoint = null
  render()
  hydrateVisibleStatsFromCache().then(() => {
    if (page === 'home') render()
    return Promise.allSettled([refreshFamilyStatsOnly(), refreshAnnualTrendOnly(), refreshRankingOnly()])
  }).catch(() => {
    Promise.allSettled([refreshFamilyStatsOnly(), refreshAnnualTrendOnly(), refreshRankingOnly()]).catch(() => null)
  })
}

function clearRecipeComments() {
  recipeComments = []
  recipeCommentsRecipeId = null
  recipeCommentsLoading = false
  guestCommentBusy = false
  guestCommentDraft = { guestName: '', content: '' }
}

async function saveGuestComment() {
  const recipe = findRecipeById(selectedId)
  if (!recipe || currentUser?.role !== 'guest' || !recipe.isFamilyShared) return
  const guestName = String(document.getElementById('guest-comment-name')?.value || '').trim()
  const content = String(document.getElementById('guest-comment-content')?.value || '').trim()
  if (!guestName || !content) {
    window.alert('昵称和留言不能为空')
    return
  }
  if (content.length > 300) {
    window.alert('留言最多 300 字')
    return
  }
  guestCommentBusy = true
  guestCommentDraft = { guestName, content }
  render()
  try {
    const response = await fetch(`/api/comments?recipeId=${encodeURIComponent(recipe.id)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestName, content }),
    })
    const result = await response.json()
    if (!response.ok) {
      window.alert(result.error || '留言提交失败')
      return
    }
    guestCommentDraft = { guestName: '', content: '' }
    await openRecipeComments(recipe.id)
    render()
  } catch (error) {
    window.alert('留言提交失败，请稍后重试')
  } finally {
    guestCommentBusy = false
    render()
  }
}

async function deleteGuestComment(commentId) {
  const recipe = findRecipeById(selectedId)
  if (!recipe || !commentId) return
  if (!window.confirm('确定要删除这条留言吗？')) return
  const response = await fetch(`/api/comments?recipeId=${encodeURIComponent(recipe.id)}&id=${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    window.alert(result.error || '留言删除失败')
    return
  }
  await openRecipeComments(recipe.id)
  render()
}

function normalizeGuestCommentDraft() {
  guestCommentDraft = {
    guestName: document.getElementById('guest-comment-name')?.value || guestCommentDraft.guestName || '',
    content: document.getElementById('guest-comment-content')?.value || guestCommentDraft.content || '',
  }
}

root.addEventListener('input', event => {
  if (event.target.id === 'guest-comment-name' || event.target.id === 'guest-comment-content') normalizeGuestCommentDraft()
})

root.addEventListener('click', async event => {
  const target = event.target instanceof Element ? event.target.closest('[data-action]') : null
  if (!target) return
  const action = target.dataset.action
  if (action === 'guest-login') {
    console.info('[guest] button clicked')
    authBusy = true
    root.innerHTML = authTemplate()
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'guest' }),
      })
      const result = await response.json()
      if (!response.ok) {
        root.innerHTML = authTemplate(result.error || '游客浏览失败')
        return
      }
      console.info('[guest] session created')
      currentUser = result.user
      saveCachedUser(currentUser)
      console.info('[guest] state saved', currentUser?.role, currentUser?.id)
      appStarted = false
      await startApplication()
      console.info('[guest] home rendered')
    } catch (error) {
      root.innerHTML = authTemplate('游客浏览失败，请稍后重试')
      console.error('[guest] flow failed', error)
    } finally {
      authBusy = false
    }
    return
  }
  if (action === 'guest-exit') {
    console.info('[guest] exit requested')
    settingsMenuOpen = false
    fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' }).finally(() => {
      storageRemove(USER_CACHE_KEY)
      appStarted = false
      selectedId = null
      currentUser = null
      viewingMember = null
      settingsMenuOpen = false
      recipes = []
      members = []
      page = 'home'
      recipeComments = []
      recipeCommentsRecipeId = null
      root.innerHTML = authTemplate()
      document.getElementById('login-account')?.focus()
      console.info('[guest] returned to login')
    })
    return
  }
  if (action === 'save-guest-comment') { event.preventDefault(); await saveGuestComment(); return }
  if (action === 'guest-comment-clear') { guestCommentDraft = { guestName: '', content: '' }; render(); return }
  if (action === 'delete-comment' && target.dataset.commentId) { await deleteGuestComment(target.dataset.commentId); return }
  if (action === 'reload-only') { window.location.reload(); return }
  if (action === 'reload-app') { await reloadLatestVersion(); return }
})

window.addEventListener('popstate', event => {
  if (settingsMenuOpen) {
    settingsMenuOpen = false
    render()
    history.pushState({ appPage: page, recipeId: selectedId }, '')
    return
  }
  if (event.state?.appPage === 'detail' && event.state.recipeId) {
    if (!sameId(selectedId, event.state.recipeId)) invalidateRecipeImageOperation()
    selectedId = event.state.recipeId
    page = 'detail'
    render()
    return
  }
  goHome(true)
})

installGlobalErrorHandlers()
try {
  applyTheme()
  checkAccess().catch(showStartupFailure)
} catch (error) {
  showStartupFailure(error)
}
