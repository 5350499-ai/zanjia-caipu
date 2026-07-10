import { cleanupCloudImages, clearCloudImageResponseCache, deleteCloudRecipe, downloadCloudImage, initCloud, loadCloudLibrary, saveCloudLibrary, saveCloudRecipe, uploadCloudImage } from './cloud.js'

const categories = ['ȫ��', '�Ȳ�', '����', '����', '��ʳ', '����', '��Ʒ', '���', '�ز�']
const selectableCategories = categories.slice(1)

const starterRecipes = [
  { id: 1, name: '�㳦������˿���', categories: ['�Ȳ�', '���'], ingredients: ['�㳦 1��', '������ 1��', '�����˿ 1��', '�ײ� 4Ƭ'], seasonings: ['���� 2��', '��� 1��', '�� 3��', '�� ����'], steps: ['��˿��ǰ����ˮ����������п顣', '�㳦�Գ��ͣ�����ĩ�Ͱײ˳����', '���붹������˿��һС��ˮ����ζ����8���ӡ�'], tips: '��˿��ˮ����֭��Ҫ�յ�̫�ɡ�����ǰ��һ���ٷ��Ρ�', notes: [{ id: 'note-1', date: '2026-06-20', text: '���ˮ�Ŷ���' }, { id: 'note-2', date: '2026-07-03', text: '�������ó�' }], image: null },
  { id: 2, name: '������������', categories: ['�Ȳ�', '�ز�'], ingredients: ['������ 2��', '���� 3��', 'С�� 1��'], seasonings: ['�� ����', '���� ����'], steps: ['�����������δ�ɢ������ʢ����', '������������֭�����Ǻ��Ρ�', '���ؼ������ȣ����л���'], tips: '������ѡ��һЩ�ģ������׳���֭��', notes: [{ id: 'note-3', date: '2026-05-12', text: '�ǷŰ��׸պ�' }], image: null },
  { id: 3, name: '��ź�Ź���', categories: ['����', '���'], ingredients: ['�Ź� 500��', '��ź 2��', '�� 4Ƭ'], seasonings: ['�� ����', '�׺��� ����'], steps: ['�Ź���ˮ�¹���ˮ��ϴ����', '��ź�й����飬���Źǡ���Ƭһ�������', '��������ˮ��С����90���Ӻ���Ρ�'], tips: '�����ţ������ʡ�', notes: [], image: null },
  { id: 4, name: '����ƹ�', categories: ['����', '�ز�'], ingredients: ['�ƹ� 2��', '������ 1С��'], seasonings: ['�� 4��', '��� 2��', '���� 1��', '���� ����'], steps: ['�ƹ������жΡ�', '��ĩ����ϰ��ȡ�', '����ƹϺͻ����װ��ȡ�'], tips: '�ְ��ֳԣ��ž��˻��ˮ��', notes: [], image: null },
  { id: 5, name: 'С���Ϲ���', categories: ['����', '��ʳ'], ingredients: ['С�� 80��', '�Ϲ� 200��'], seasonings: ['��ˮ 900����'], steps: ['С����ϴһ�Σ��Ϲ���С�顣', 'ˮ������С�׺��Ϲϡ�', 'С����30���ӣ���;�������Ρ�'], tips: 'С�ײ�Ҫ������ϴ��������ʧ��ζ��', notes: [], image: null },
]

const STORAGE_KEY = 'family-recipes-v1'
const IMAGE_DB_NAME = 'family-recipes-images'
const IMAGE_STORE = 'images'
const IMAGE_META_STORE = 'image-meta'
const RECIPE_META_STORE = 'recipe-meta'
const IMAGE_CACHE_LIMIT = 500 * 1024 * 1024
const HOME_PRELOAD_LIMIT = 20
const USER_CACHE_KEY = 'family-recipes-last-user'
const APP_VERSION = 'v1.0.10'
const THEME_KEY = 'zanjia-theme'

function userStorageKey() {
  return currentUser?.id ? `${STORAGE_KEY}:${currentUser.id}` : STORAGE_KEY
}

function saveCachedUser(user) {
  if (!user?.id) return
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
}

function loadCachedUser() {
  try {
    const user = JSON.parse(localStorage.getItem(USER_CACHE_KEY))
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
  localStorage.setItem(THEME_KEY, themeMode)
  applyTheme()
  render()
}

function loadRecipes() {
  try {
    const saved = JSON.parse(localStorage.getItem(userStorageKey()))
    if (Array.isArray(saved)) return saved.map(normalizeRecipe)
  } catch (error) {
    console.warn('���ز��׶�ȡʧ�ܣ���ʹ�ó�ʼ���ݡ�', error)
  }
  return currentUser ? [] : starterRecipes
}

async function hydrateRecipesFromIndexedDB() {
  try {
    const cached = await readRecipeCache()
    if (!Array.isArray(cached) || !cached.length) return false
    const nextRecipes = cached.map(normalizeRecipe)
    if (recipesChanged(nextRecipes)) {
      recipes = nextRecipes
      render()
      hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), true).catch(() => null)
    }
    return true
  } catch (error) {
    console.warn('IndexedDB ���׻����ȡʧ�ܡ�', error)
    return false
  }
}

function normalizeRecipe(recipe) {
  const { image, ...rest } = recipe
  return {
    ...rest,
    image: null,
    categories: rest.categories || [],
    tags: [],
    notes: (rest.notes || []).map(note => ({ ...note, id: note.id || uniqueId('note') })),
    favoriteUserIds: rest.favoriteUserIds || [],
    cookRecords: (rest.cookRecords || []).map(record => ({ ...record, id: record.id || uniqueId('cook') })),
    cookCount: Number(rest.cookCount || (rest.cookRecords || []).length || 0),
    lastCookedAt: rest.lastCookedAt || null,
  }
}

let recipes = []

let activeCategory = 'ȫ��'
let activeScope = 'mine'
let query = ''
let selectedId = null
let page = 'home'
let members = []
let memberDraft = { loginCode: '', displayName: '', pin: '' }
let imageMenu = false
let draft = null
let draftDirty = false
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
let familyMemberCount = 0
let viewingMember = null
let settingsMenuOpen = false
let themeMode = localStorage.getItem(THEME_KEY) || 'light'
const imageObjectUrls = new Map()
const imageRetrying = new Set()

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
    if (recipe.image) return `<div class="image-area has-image compact"><img src="${recipe.image}" data-image-id="${escapeHtml(recipe.imageId || '')}" alt="${escapeHtml(recipe.name)}"></div>`
    return `<div class="image-area placeholder compact"><span class="placeholder-plus" aria-hidden="true">+</span><strong>���ͼƬ</strong></div>`
  }
  if (recipe.image) return `<button class="image-area has-image" data-action="view-image"><img src="${recipe.image}" data-image-id="${escapeHtml(recipe.imageId || '')}" alt="${escapeHtml(recipe.name)}"></button>`
  if (page === 'detail' && !canEditRecipe(recipe)) return `<div class="image-area placeholder"><span class="placeholder-plus" aria-hidden="true">+</span><strong>����ͼƬ</strong></div>`
  return `<button class="image-area placeholder" data-action="add-image"><span class="camera-ring">${icons.add}</span><strong>�����ͼ</strong><small>�ϴ�����˵ĳ�Ʒ��Ƭ</small></button>`
}

function getFilteredRecipes() {
  const keyword = query.trim().toLowerCase()
  return recipes.filter(recipe => {
    const scopeMatch = matchScope(recipe)
    const categoryMatch = activeCategory === 'ȫ��' || recipe.categories.includes(activeCategory)
    const searchableText = [
      recipe.name,
      ...(recipe.ingredients || []),
      ...(recipe.seasonings || []),
      ...(recipe.steps || []),
      recipe.tips || '',
      ...(recipe.notes || []).map(note => note.text || ''),
      ...(recipe.cookRecords || []).map(record => `${record.note || ''} ${record.date || ''}`),
    ].join(' ').toLowerCase()
    return scopeMatch && categoryMatch && (!keyword || searchableText.includes(keyword))
  }).sort((a, b) => {
    if (activeScope === 'recentCooked') return String(b.lastCookedAt || '').localeCompare(String(a.lastCookedAt || ''))
    if (activeScope === 'mostCooked') return Number(b.cookCount || 0) - Number(a.cookCount || 0)
    const recent = String(b.lastViewedAt || '').localeCompare(String(a.lastViewedAt || ''))
    if (recent) return recent
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
}

function sameId(left, right) {
  return String(left ?? '') === String(right ?? '')
}

function findRecipeById(id) {
  return recipes.find(recipe => sameId(recipe.id, id))
}

function matchScope(recipe) {
  if (!currentUser) return true
  if (viewingMember) return sameId(recipe.authorUserId, viewingMember.id)
  if (activeScope === 'mine') return sameId(recipe.authorUserId, currentUser.id)
  if (activeScope === 'shared') return Boolean(recipe.isFamilyShared)
  return sameId(recipe.authorUserId, currentUser.id)
}

function isAdmin() {
  return currentUser?.role === 'admin'
}

function canEditRecipe(recipe) {
  return isAdmin() || sameId(recipe?.authorUserId, currentUser?.id)
}

function canViewRecipe(recipe) {
  return Boolean(recipe && (isAdmin() || sameId(recipe.authorUserId, currentUser?.id) || recipe.isFamilyShared))
}

function isFavorite(recipe) {
  return Boolean(currentUser?.id && (recipe?.favoriteUserIds || []).includes(currentUser.id))
}

function homeStats() {
  return {
    mine: recipes.filter(recipe => sameId(recipe.authorUserId, currentUser?.id)).length,
    shared: recipes.filter(recipe => recipe.isFamilyShared).length,
    members: familyMemberCount || members.length || (isAdmin() ? 1 : 0),
  }
}

function currentAccountName() {
  return currentUser?.displayName || (isAdmin() ? '����Ա' : '��')
}

function homeSubtitle() {
  if (viewingMember) return `���ڲ鿴��${viewingMember.displayName}�Ĳ���`
  return `${currentAccountName()}�Ĳ���`
}

function relativeDate(dateText) {
  if (!dateText) return ''
  const today = new Date()
  const date = new Date(dateText)
  const diff = Math.round((new Date(today.toDateString()) - new Date(date.toDateString())) / 86400000)
  if (diff === 0) return '����'
  if (diff === 1) return '����'
  if (diff > 1) return `${diff}��ǰ`
  return dateText.slice(0, 10)
}

function authTemplate(message = '') {
  return `<main class="auth-screen"><section class="auth-card"><div class="auth-mark">家</div><div class="eyebrow">OUR FAMILY TABLE</div><h1>咱家菜谱</h1><p>家庭私房菜谱</p>
    <form id="auth-form" class="login-form">
      <h2>账号登录</h2>
      <label for="auth-account">账号 / 邮箱</label>
      <input id="auth-account" name="account" autocomplete="username" placeholder="成员账号 001，或管理员邮箱" autofocus>
      <label for="auth-password">密码 / PIN</label>
      <input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="请输入密码">
      <button type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? '正在进入…' : '进入菜谱'}</button>
    </form>
    <button class="guest-login-button" type="button" data-action="guest-login">游客浏览</button>
    <div class="auth-error" role="alert">${escapeHtml(message)}</div><small>不开放注册，账号由管理员创建</small></section></main>`
}
function authLoadingTemplate() {
  return `<main class="auth-screen"><section class="auth-card auth-loading"><div class="auth-mark">��</div><p>���ڴ��ۼҲ��ס�</p></section></main>`
}

function recipePanelTemplate() {
  const filtered = getFilteredRecipes()
  return `<div class="list-heading"><h2>${query ? `��${escapeHtml(query)}��` : scopeTitle()}</h2><span>${filtered.length} ��</span></div><div class="recipe-list">
    ${filtered.map(recipe => `<article class="recipe-card" data-action="open-recipe" data-recipe-id="${escapeHtml(recipe.id)}" role="button" tabindex="0">${imageArea(recipe, true)}<div class="card-content"><h3>${escapeHtml(recipe.name)}</h3></div></article>`).join('')}
    ${filtered.length ? '' : `<div class="empty-state">${icons.search}<h3>û���ҵ���ز���</h3><p>�����������������</p></div>`}</div>`
}

function scopeTitle() {
  if (viewingMember) return `${viewingMember.displayName}�Ĳ���`
  if (activeScope === 'mine') return '�ҵĲ���'
  if (activeScope === 'shared') return '��ͥ����'
  return '�ҵĲ���'
}

function settingsMenuTemplate() {
  if (!settingsMenuOpen) return ''
  const selectedRecipe = findRecipeById(selectedId)
  return `<div class="settings-popover" role="dialog" aria-label="���ò˵�">
    ${page === 'new' || page === 'edit' ? '' : '<button data-action="new-recipe">��������</button>'}
    ${page === 'detail' && canEditRecipe(selectedRecipe) ? '<button data-action="edit-recipe">�༭����</button>' : ''}
    <button data-action="account-info">�˺���Ϣ</button>
    ${isAdmin() ? '<button data-action="members">��Ա����</button><button data-action="cleanup-images">����ͼƬ����</button>' : ''}
    <div class="app-info-panel">
      <div class="app-info-row compact">
        <span>�汾</span>
        <strong>${APP_VERSION}</strong>
      </div>
    </div>
    <button data-action="clear-local-cache">������ػ���</button>
    <button data-action="logout">�˳���¼</button>
    <button class="muted" data-action="close-settings">ȡ��</button>
  </div>`
}

function globalActionsTemplate() {
  return `<div class="global-actions" aria-label="ȫ�ֲ���">
    <button class="global-icon-button" data-action="toggle-theme" aria-label="�л�����">${themeMode === 'dark' ? '??' : '??'}</button>
    <button class="global-icon-button" data-action="share-url" aria-label="������ַ">??</button>
    <button class="global-icon-button" data-action="settings" aria-label="�˵�">?</button>
  </div>`
}

function statsTemplate() {
  const stats = homeStats()
  const mineActive = !viewingMember && activeScope === 'mine'
  const sharedActive = !viewingMember && activeScope === 'shared'
  return `<div class="home-stats">
    <button type="button" data-scope="mine" class="${mineActive ? 'active' : ''}"><strong>${stats.mine}</strong><span>�ҵĲ���</span></button>
    <button type="button" data-scope="shared" class="${sharedActive ? 'active' : ''}"><strong>${stats.shared}</strong><span>��ͥ����</span></button>
    <span class="stat-card disabled"><strong>${stats.members}</strong><span>��ͥ��Ա</span></span>
  </div>`
}

function homeTemplate() {
  return `<div class="app-shell home-shell">
    <header class="home-header"><div class="brand-row"><div><div class="eyebrow">OUR FAMILY TABLE</div><h1>�ۼҲ���</h1><p class="account-subtitle">${escapeHtml(homeSubtitle())}</p></div><div class="header-actions">${globalActionsTemplate()}</div></div>
      <div class="home-action-row">
        ${viewingMember ? '<button class="secondary-mini-button" data-action="stop-view-member">�����ҵ���ҳ</button>' : ''}
      </div>
      ${settingsMenuTemplate()}
      ${statsTemplate()}
      <label class="search-box">${icons.search}<input id="search" value="${escapeHtml(query)}" placeholder="�Ѳ��������" autocomplete="off" enterkeyhint="search"><button class="clear-search ${query ? '' : 'hidden'}" data-action="clear" aria-label="�������">${icons.close}</button></label>
      <nav class="category-nav" aria-label="���׷���">${categories.map(category => `<button data-category="${category}" class="${category === activeCategory ? 'active' : ''}"><span>${category}</span></button>`).join('')}</nav></header>
    <div class="home-body"><main class="recipe-panel"><div class="pull-refresh-indicator ${refreshing ? 'visible' : ''}">${refreshing ? '����ͬ�����²��ס�' : '����ˢ��'}</div>${recipePanelTemplate()}</main></div>
    </div>`
}

function membersTemplate() {
  return `<div class="app-shell form-shell"><header class="detail-header"><button class="icon-button" data-action="back-home" aria-label="����">${icons.back}</button><div class="detail-header-title">��ͥ��Ա</div>${globalActionsTemplate()}</header>
    ${settingsMenuTemplate()}
    <main class="recipe-form">
      <section class="form-section">
        <div class="form-label"><strong>������Ա�˺�</strong><span>������Ա�ɴ���</span></div>
        <input class="form-control" id="member-login-code" placeholder="�˺ű�ţ����� 001" value="${escapeHtml(memberDraft.loginCode)}">
        <input class="form-control member-field" id="member-display-name" placeholder="��ʾ���ƣ����� ����1" value="${escapeHtml(memberDraft.displayName)}">
        <input class="form-control member-field" id="member-pin-new" type="password" placeholder="PIN / ���룬���� 4 λ" value="${escapeHtml(memberDraft.pin)}">
        <button class="primary-button member-create-button" data-action="create-member">�����˺�</button>
      </section>
      <section class="form-section">
        <div class="form-label"><strong>���г�Ա</strong><span>${members.length} ���˺�</span></div>
        <div class="member-list">${members.map(member => `<article class="member-card" data-member-view="${member.id}">
          <div><strong>${escapeHtml(member.displayName)}</strong><span>${escapeHtml(member.loginCode)} �� ${member.role === 'admin' ? '����Ա' : '��Ա'} �� ${member.isActive ? '����' : '��ͣ��'}</span></div>
          <div class="member-actions">
            <button data-member-view="${member.id}">�鿴����</button>
            ${member.role === 'admin' ? '' : `
            <button data-member-toggle="${member.id}">${member.isActive ? 'ͣ��' : '����'}</button>
            <button data-member-pin="${member.id}">�� PIN</button>
            <button data-member-rename="${member.id}">����</button>
            <button class="danger-text" data-member-delete="${member.id}">ɾ��</button>
            `}
          </div>
        </article>`).join('') || '<p class="empty-copy">��û�м�ͥ��Ա�˺š�</p>'}</div>
      </section>
    </main></div>`
}

function section(number, title, body) {
  return `<section class="recipe-section"><div class="recipe-section-title"><span>${number}</span><h2>${title}</h2></div><div class="recipe-section-body">${body}</div></section>`
}

function detailTemplate(recipe) {
  const editable = canEditRecipe(recipe)
  return `<div class="app-shell detail-shell"><header class="detail-header"><button class="icon-button" data-action="back-home" aria-label="����">${icons.back}</button><div class="detail-header-title">��������</div>${globalActionsTemplate()}</header>
    ${settingsMenuTemplate()}
    <main class="detail-content"><div class="detail-title-row"><div><div class="eyebrow">�ۼҵ����ֲ�</div><h1>${escapeHtml(recipe.name)}</h1></div><div class="title-mark">?</div></div>
      <div class="recipe-author-line">��¼�ˣ�${escapeHtml(recipe.authorName || '����')}${recipe.isFamilyShared ? ` �� �����ˣ�${escapeHtml(recipe.authorName || '����')}` : ''} �� ���� ${recipe.cookCount || 0} ��</div>
      <div class="share-status-card ${recipe.isFamilyShared ? 'shared' : 'private'}">
        <div><strong>��ǰ״̬��${recipe.isFamilyShared ? '???????? ��ͥ����' : '?? ˽�˲���'}</strong><small>${recipe.isFamilyShared ? '���м�ͥ��Ա�����ڡ���ͥ������￴����' : 'ֻ�д����ߺ͹���Ա���Կ�����'}</small></div>
        <label class="share-switch ${editable ? '' : 'disabled'}"><span>�������ͥ</span><input type="checkbox" data-action="toggle-family-share" ${recipe.isFamilyShared ? 'checked' : ''} ${editable ? '' : 'disabled'}><i></i></label>
      </div>
      <div class="detail-quick-actions"><button data-action="toggle-favorite">${isFavorite(recipe) ? '�� ���ղ�' : '�� �ղ�'}</button><button data-action="copy-recipe">���Ʋ���</button></div>
      ${imageArea(recipe)}<input id="file-input" class="hidden-input" type="file" accept="image/*">
      ${section('01', '����', `<ul class="simple-list">${recipe.ingredients.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      ${section('02', '����', `<ul class="simple-list">${recipe.seasonings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      ${section('03', '��������', `<ol class="steps">${recipe.steps.map((step,index) => `<li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join('')}</ol>`)}
      ${section('04', 'ע������', `<p class="body-copy">${escapeHtml(recipe.tips || '����')}</p>`)}
      ${notesSection(recipe)}
      ${cookRecordsSection(recipe)}
    </main>${imageMenu ? actionSheet() : ''}${imagePreview && recipe.image ? imageLightbox(recipe) : ''}</div>`
}

function newRecipeTemplate() {
  const isEditing = page === 'edit'
  return `<div class="app-shell form-shell"><header class="detail-header"><button class="icon-button" data-action="cancel-form" aria-label="ȡ��${isEditing ? '�༭' : '����'}">${icons.back}</button><div class="detail-header-title">${isEditing ? '�༭����' : '��������'}</div>${globalActionsTemplate()}</header>
    ${settingsMenuTemplate()}
    <main class="recipe-form">
      <section class="form-section photo-section"><div class="form-label"><strong>��Ʒ��Ƭ</strong><span>��ѡ</span></div>
        ${draft.image ? `<button class="form-photo has-image" data-action="choose-draft-image"><img src="${draft.image}" alt="������Ĳ���ͼƬ"><span>����ͼƬ</span></button><button class="remove-form-photo" data-action="remove-draft-image">ɾ��ͼƬ</button>` : `<button class="form-photo placeholder" data-action="choose-draft-image"><span class="camera-ring">${icons.add}</span><strong>�����ͼ</strong><small>����ʹ�ú��� 4:3 ��Ƭ</small></button>`}
        <input id="draft-file-input" class="hidden-input" type="file" accept="image/*">
      </section>
      <section class="form-section"><label class="form-label" for="draft-name"><strong>����</strong><em>����</em></label><input class="form-control" id="draft-name" data-draft="name" value="${escapeHtml(draft.name)}" placeholder="���磺�㳦������˿���"></section>
      <section class="form-section"><div class="form-label"><strong>����</strong><span>�ɶ�ѡ</span></div><div class="category-picker">${selectableCategories.map(category => `<button type="button" data-draft-category="${category}" class="${draft.categories.includes(category) ? 'selected' : ''}">${category}</button>`).join('')}</div></section>
      <section class="form-section"><label class="share-toggle"><input type="checkbox" id="draft-family-shared" ${draft.isFamilyShared ? 'checked' : ''}><span><strong>��ͥ����</strong><small>����󣬼��˶��ܿ�����ֻ�д����ߺ͹���Ա�����޸ġ�</small></span></label></section>
      ${formTextarea('ingredients', '����', 'ÿ��һ�ֲ��ϣ����磺\n���� 1��\n�㳦 1��')}
      ${formTextarea('seasonings', '����', 'ÿ��һ�ֵ��ϣ����磺\n���� 2��\n�� ����')}
      ${formTextarea('steps', '��������', 'ÿ��һ�����裬������Զ����', true)}
      ${formTextarea('tips', 'ע������', '���磺��˿��ˮ����֭��Ҫ�յ�̫�ɡ�')}
      ${isEditing ? '' : formTextarea('note', '��ע', '��¼������˵��ĵã�����ʱ���Զ��������ڡ�')}
      <div class="form-bottom-actions"><button class="secondary-button" data-action="cancel-form">ȡ��</button><button class="primary-button" data-action="save-recipe">${isEditing ? '�����޸�' : '����'}</button></div>
      ${isEditing ? '<button class="delete-recipe-button" data-action="request-delete-recipe">ɾ������</button>' : ''}
    </main>${formExitPrompt ? unsavedChangesDialog() : ''}${deleteRecipePrompt ? deleteRecipeDialog() : ''}</div>`
}

function formTextarea(key, title, placeholder, tall = false) {
  return `<section class="form-section"><label class="form-label" for="draft-${key}"><strong>${title}</strong><span>${key === 'ingredients' || key === 'seasonings' || key === 'steps' ? 'һ��һ��' : '��ѡ'}</span></label><textarea class="form-control ${tall ? 'tall' : ''}" id="draft-${key}" data-draft="${key}" placeholder="${placeholder}">${escapeHtml(draft[key])}</textarea></section>`
}

function actionSheet() { return `<div class="sheet-backdrop" data-action="close-menu"><div class="action-sheet"><div class="sheet-handle"></div><h2>ͼƬ����</h2><button data-action="view-image">�鿴��ͼ</button><button data-action="replace-image">����ͼƬ</button><button class="danger" data-action="delete-image">ɾ��ͼƬ</button><button class="cancel" data-action="close-menu">ȡ��</button></div></div>` }
function imageLightbox(recipe) { return `<div class="image-lightbox"><button data-action="close-preview" aria-label="�رմ�ͼ">${icons.close}</button><div class="image-stage"><img id="preview-image" src="${recipe.image}" alt="${escapeHtml(recipe.name)}��ͼ"></div><p>˫����˫ָ����</p></div>` }
function unsavedChangesDialog() { return `<div class="confirm-backdrop"><div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">�Ƿ񱣴��޸ģ�</h2><p>��ղ��޸ĵ����ݻ�û�б��档</p><div class="confirm-actions"><button class="discard" data-action="discard-changes">������</button><button class="continue" data-action="continue-editing">�����༭</button><button class="save" data-action="save-and-exit">����</button></div></div></div>` }
function deleteRecipeDialog() { return `<div class="confirm-backdrop"><div class="confirm-dialog delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-recipe-title"><h2 id="delete-recipe-title">ȷ��Ҫɾ�����������</h2><p>ɾ�����޷��ָ���</p><div class="delete-confirm-actions"><button class="secondary-button" data-action="cancel-delete-recipe">ȡ��</button><button class="confirm-delete-button" data-action="confirm-delete-recipe">ȷ��ɾ��</button></div></div></div>` }

function notesSection(recipe) {
  const notes = [...recipe.notes].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)))
  const editable = canEditRecipe(recipe)
  const form = noteEditor ? `<div class="note-editor">
    <label for="note-date"><span>����</span><input id="note-date" type="date" value="${noteEditor.date}"></label>
    <label for="note-text"><span>��ע����</span><textarea id="note-text" placeholder="��¼������˵��ĵá���">${escapeHtml(noteEditor.text)}</textarea></label>
    <div class="note-editor-actions"><button class="secondary-button" data-action="cancel-note">ȡ��</button><button class="primary-button" data-action="save-note">���汸ע</button></div>
  </div>` : ''
  const list = notes.length ? `<div class="note-list">${notes.map(note => `<article class="note"><div class="note-top"><time>${note.date}</time>${editable ? `<div class="note-actions"><button data-edit-note="${note.id}">�༭</button><button class="danger-text" data-delete-note="${note.id}">ɾ��</button></div>` : ''}</div><p>${escapeHtml(note.text)}</p></article>`).join('')}</div>` : '<p class="empty-copy">��û�б�ע����������˺��һ�ʰɡ�</p>'
  return `<section class="recipe-section notes-section"><div class="recipe-section-title"><span>05</span><h2>��ʷ��ע</h2></div><div class="recipe-section-body">${editable ? '<div class="notes-toolbar"><button data-action="add-note">+ ���ӱ�ע</button></div>' : ''}${form}${list}</div></section>`
}

function cookRecordsSection(recipe) {
  const editable = canEditRecipe(recipe)
  const records = [...(recipe.cookRecords || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id)))
  const form = cookEditor ? `<div class="note-editor cook-editor">
    <label for="cook-date"><span>����ʱ��</span><input id="cook-date" type="date" value="${cookEditor.date}"></label>
    <label for="cook-note"><span>��μ�¼</span><textarea id="cook-note" placeholder="���磺������̫Ӳ���´ζ��һ��ˮ��">${escapeHtml(cookEditor.note)}</textarea></label>
    <label for="cook-rating"><span>�������</span><select id="cook-rating">${[0,1,2,3,4,5].map(value => `<option value="${value}" ${Number(cookEditor.rating || 0) === value ? 'selected' : ''}>${value ? `${value} ��` : '������'}</option>`).join('')}</select></label>
    ${cookEditor.image ? `<button class="record-photo has-image" data-action="choose-cook-image"><img src="${cookEditor.image}" alt="�������ͼƬ"><span>����ͼƬ</span></button>` : `<button class="record-photo placeholder" data-action="choose-cook-image"><span class="placeholder-plus">+</span><strong>������ͼƬ</strong></button>`}
    <input id="cook-file-input" class="hidden-input" type="file" accept="image/*">
    <div class="note-editor-actions"><button class="secondary-button" data-action="cancel-cook-record">ȡ��</button><button class="primary-button" data-action="save-cook-record">${cookEditor.id ? '�����޸�' : '�����¼'}</button></div>
  </div>` : ''
  const growth = records.filter(record => record.image).length ? `<div class="growth-strip">${records.filter(record => record.image).map(record => `<img src="${record.image}" alt="${escapeHtml(record.date || '����ͼƬ')}">`).join('')}</div>` : ''
  const list = records.length ? `<div class="cook-record-list">${records.map(record => `<article class="cook-record"><div class="cook-record-head"><time>${record.date || ''}</time><span>${record.rating ? '��'.repeat(Number(record.rating)) : ''}</span>${editable ? `<div class="note-actions"><button data-edit-cook="${record.id}">�༭</button><button class="danger-text" data-delete-cook="${record.id}">ɾ��</button></div>` : ''}</div>${record.image ? `<img src="${record.image}" alt="���˼�¼ͼƬ">` : ''}<p>${escapeHtml(record.note || '���û�б�ע')}</p></article>`).join('')}</div>` : '<p class="empty-copy">��û�����˼�¼��ÿ��һ�Σ��ͼ�һ�ʡ�</p>'
  return `<section class="recipe-section cook-section"><div class="recipe-section-title"><span>06</span><h2>���˼�¼</h2></div><div class="recipe-section-body">${editable ? '<div class="notes-toolbar"><button data-action="add-cook-record">+ ��¼���</button></div>' : ''}${form}${growth}${list}</div></section>`
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
      title: '�ۼҲ���',
      text: '�ۼҲ���',
      url,
    })
    return 'shared'
  }
  await copyCurrentUrl()
  return 'copied'
}

function persistRecipes() {
  const serializable = serializeRecipes()
  localStorage.setItem(userStorageKey(), JSON.stringify(serializable))
  writeRecipeCache(serializable).catch(error => console.warn('IndexedDB ���׻���д��ʧ�ܡ�', error))
  saveCloudLibrary(serializable).catch(error => console.warn('�ƶ�ͬ��ʧ�ܣ������ѱ����ڱ�����', error))
}

async function persistSingleRecipe(recipe) {
  await saveCloudRecipe(serializeRecipes([recipe])[0])
  const serializable = serializeRecipes()
  localStorage.setItem(userStorageKey(), JSON.stringify(serializable))
  writeRecipeCache(serializable).catch(error => console.warn('IndexedDB ���׻���д��ʧ�ܡ�', error))
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

async function normalizeImageFile(file, { maxSize = 1600, quality = 0.82 } = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('��ѡ��ͼƬ�ļ�')
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = sourceUrl
    if (image.decode) await image.decode()
    else await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('ͼƬ����ʧ��'))
    })
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (!sourceWidth || !sourceHeight) throw new Error('ͼƬ�ߴ��ȡʧ��')
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { colorSpace: 'srgb', alpha: false }) || canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('������޷�����ͼƬ')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('ͼƬת��ʧ��')), 'image/jpeg', quality)
    })
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'recipe-image'}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    URL.revokeObjectURL(sourceUrl)
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
    const request = indexedDB.open(IMAGE_DB_NAME, 3)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(IMAGE_STORE)) database.createObjectStore(IMAGE_STORE)
      if (!database.objectStoreNames.contains(IMAGE_META_STORE)) database.createObjectStore(IMAGE_META_STORE)
      if (!database.objectStoreNames.contains(RECIPE_META_STORE)) database.createObjectStore(RECIPE_META_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
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
      await writeImageMeta(cacheKey, file).catch(error => console.warn('ͼƬ����Ԫ����д��ʧ�ܡ�', error))
      pruneImageCache().catch(error => console.warn('ͼƬ��������ʧ�ܡ�', error))
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

async function clearIndexedDBCache() {
  const database = await openImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([IMAGE_STORE, IMAGE_META_STORE, RECIPE_META_STORE], 'readwrite')
    transaction.objectStore(IMAGE_STORE).clear()
    transaction.objectStore(IMAGE_META_STORE).clear()
    transaction.objectStore(RECIPE_META_STORE).delete(userStorageKey())
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

async function clearLocalCacheAndReload() {
  localStorage.removeItem(userStorageKey())
  for (const objectUrl of imageObjectUrls.values()) URL.revokeObjectURL(objectUrl)
  imageObjectUrls.clear()
  await Promise.allSettled([clearIndexedDBCache(), clearCloudImageResponseCache()])
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

async function pruneImageCache() {
  const items = await listImageMeta()
  let total = items.reduce((sum, item) => sum + Number(item.size || 0), 0)
  if (total <= IMAGE_CACHE_LIMIT) return
  const removable = items.sort((a, b) => Number(a.lastAccessed || 0) - Number(b.lastAccessed || 0))
  for (const item of removable) {
    if (total <= IMAGE_CACHE_LIMIT) break
    await removeStoredImage(item.key)
    total -= Number(item.size || 0)
  }
}

async function hydrateRecipeImages(targetRecipes = recipes, shouldRender = true) {
  await Promise.all(targetRecipes.map(async recipe => {
    try {
      if (recipe.imageId) {
        const blob = await readImage(recipe.imageId, recipe.imageVersion)
        if (blob) setRecipeImageFromBlob(recipe, blob)
      }
      await Promise.all((recipe.cookRecords || []).map(async record => {
        if (!record.imageId) return
        const blob = await readImage(record.imageId, record.imageVersion)
        if (blob) setRecordImageFromBlob(record, blob)
      }))
    } catch (error) {
      console.warn('ͼƬ��ȡʧ�ܡ�', error)
    }
  }))
  if (shouldRender) render()
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
    const cached = await readImage(recipe.imageId, recipe.imageVersion).catch(() => null)
    if (cached) setRecipeImageFromBlob(recipe, cached)
    else {
      const blob = await downloadCloudImage(recipe.imageId, recipe.imageVersion)
      if (blob) {
        await storeImage(recipe.imageId, blob, recipe.imageVersion)
        setRecipeImageFromBlob(recipe, blob)
      }
    }
    changed = true
  }
  for (const record of (recipe.cookRecords || [])) {
    if (!record.imageId || record.image) continue
    const cached = await readImage(record.imageId, record.imageVersion).catch(() => null)
    if (cached) setRecordImageFromBlob(record, cached)
    else {
      const blob = await downloadCloudImage(record.imageId, record.imageVersion)
      if (blob) {
        await storeImage(record.imageId, blob, record.imageVersion)
        setRecordImageFromBlob(record, blob)
      }
    }
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
        console.warn('ͼƬԤ����ʧ�ܡ�', error)
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
    if (window.__familyRecipeStats?.memberCount) familyMemberCount = window.__familyRecipeStats.memberCount
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
    localStorage.setItem(userStorageKey(), JSON.stringify(serializable))
    writeRecipeCache(serializable).catch(error => console.warn('IndexedDB ���׻���д��ʧ�ܡ�', error))
    if (!cloudLibraryExists) await saveCloudLibrary(serializable)
    if (shouldRender) render()
    hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), true).catch(error => console.warn('����ͼƬ�����ȡʧ�ܡ�', error))
    preloadHomeImages().catch(error => console.warn('��ҳͼƬԤ����ʧ�ܡ�', error))
  } catch (error) {
    console.warn('�ƶ˲��׶�ȡʧ�ܣ�����ʹ�ñ������ݡ�', error)
    if (!navigator.onLine) window.alert('��ǰ���ߣ�����ʾ���ػ��档��������Զ�ͬ����')
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
  preloadHomeImages().catch(error => console.warn('ˢ�º�ͼƬԤ����ʧ�ܡ�', error))
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
  draft = { name: '', categories: [], ingredients: '', seasonings: '', steps: '', tips: '', note: '', image: null, imageFile: null, imageId: null, removeImage: false, isFamilyShared: false }
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
    isFamilyShared: Boolean(recipe.isFamilyShared),
  }
  page = 'edit'
  draftDirty = false
  formExitPrompt = false
  deleteRecipePrompt = false
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
  const current = isEditing ? findRecipeById(draft.id) : null
  const id = isEditing ? current.id : Date.now()
  const previousRecipes = recipes
  const oldImageId = current?.imageId || null
  const oldImageVersion = current?.imageVersion || null
  let imageId = draft.imageId || null
  let imageVersion = current?.imageVersion || null
  let uploadedImageId = null
  let uploadedImageVersion = null
  if (draft.imageFile) {
    imageId = uniqueId(`recipe-${id}`)
    imageVersion = now.toISOString()
    try {
      await storeImage(imageId, draft.imageFile, imageVersion)
      await uploadCloudImage(imageId, draft.imageFile)
      uploadedImageId = imageId
      uploadedImageVersion = imageVersion
    } catch (error) {
      window.alert('ͼƬ����ʧ�ܣ�������ѡ��ͼƬ��')
      if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
      return
    }
  }
  if (draft.removeImage && imageId) {
    imageId = null
    imageVersion = null
  }
  const recipe = {
    id, name: draft.name.trim(), categories: [...draft.categories],
    tags: [],
    ingredients: splitLines(draft.ingredients), seasonings: splitLines(draft.seasonings), steps: splitLines(draft.steps),
    tips: draft.tips.trim(),
    notes: isEditing ? current.notes : (draft.note.trim() ? [{ id: uniqueId('note'), date, text: draft.note.trim() }] : []),
    favoriteUserIds: current?.favoriteUserIds || [],
    cookRecords: current?.cookRecords || [],
    cookCount: current?.cookCount || 0,
    lastCookedAt: current?.lastCookedAt || null,
    image: draft.removeImage ? null : draft.image,
    imageId,
    imageVersion,
    authorUserId: current?.authorUserId || currentUser?.id,
    authorName: current?.authorName || currentUser?.displayName || '����',
    familyId: current?.familyId || currentUser?.familyId,
    isFamilyShared: Boolean(draft.isFamilyShared),
    createdByRole: current?.createdByRole || currentUser?.role || 'member',
    createdAt: current?.createdAt || now.toISOString(), modifiedAt: now.toISOString(),
  }
  const nextRecipes = isEditing ? recipes.map(item => sameId(item.id, id) ? recipe : item) : [recipe, ...recipes]
  recipes = nextRecipes
  try {
    await persistSingleRecipe(recipe)
  } catch (error) {
    recipes = previousRecipes
    if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
    window.alert('���ױ���ʧ�ܣ�ԭͼƬ�ѱ����')
    render()
    return
  }
  if ((draft.imageFile || draft.removeImage) && oldImageId && oldImageId !== imageId) {
    await Promise.allSettled([removeStoredImage(oldImageId, oldImageVersion)])
    if (current?.image?.startsWith('blob:') && current.image !== draft.image) URL.revokeObjectURL(current.image)
  }
  activeCategory = 'ȫ��'
  query = ''
  page = isEditing ? 'detail' : 'home'
  selectedId = isEditing ? id : selectedId
  draft = null
  draftDirty = false
  formExitPrompt = false
  render()
}

async function deleteCurrentRecipe() {
  const recipeId = draft?.id ?? selectedId
  const current = findRecipeById(recipeId)
  if (!current) return
  try {
    await deleteCloudRecipe(recipeId)
  } catch (error) {
    window.alert('����ɾ��ʧ�ܣ�ͼƬ�������ѱ����')
    return
  }
  const imageIds = [
    current.imageId ? { id: current.imageId, version: current.imageVersion } : null,
    ...(current.cookRecords || []).map(record => record.imageId ? { id: record.imageId, version: record.imageVersion } : null),
  ].filter(Boolean)
  await Promise.allSettled(imageIds.map(item => removeStoredImage(item.id, item.version)))
  if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
  recipes = recipes.filter(recipe => !sameId(recipe.id, recipeId))
  localStorage.setItem(userStorageKey(), JSON.stringify(serializeRecipes()))
  selectedId = null
  draft = null
  draftDirty = false
  formExitPrompt = false
  deleteRecipePrompt = false
  page = 'home'
  history.replaceState({ appPage: 'home' }, '')
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
  const shared = document.getElementById('draft-family-shared')
  if (shared) draft.isFamilyShared = shared.checked
}

function updateSearchResults() {
  const panel = document.querySelector('.recipe-panel')
  if (panel) panel.innerHTML = `<div class="pull-refresh-indicator ${refreshing ? 'visible' : ''}">${refreshing ? '����ͬ�����²��ס�' : '����ˢ��'}</div>${recipePanelTemplate()}`
  document.querySelector('.clear-search')?.classList.toggle('hidden', !query)
  requestAnimationFrame(setupPullToRefresh)
  preloadHomeImages().catch(() => null)
}

function centerActiveCategory() {
  const navigation = document.querySelector('.category-nav')
  const active = navigation?.querySelector('.active')
  if (!navigation || !active) return
  navigation.scrollLeft = Math.max(0, active.offsetLeft - (navigation.clientWidth - active.offsetWidth) / 2)
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
  if (!window.confirm('ȷ��ɾ��������ע��')) return
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
    console.warn('��Ա�б��ȡʧ�ܡ�', error)
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
    window.alert(data.error || '������Աʧ��')
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
    window.alert(data.error || '�����Աʧ��')
    return
  }
  await loadMembers()
  render()
}

async function deleteMember(id) {
  if (!window.confirm('ȷ��ɾ�������Ա�˺���ɾ������˺Ų����ٵ�¼��')) return
  const response = await fetch(`/api/members?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
  const data = await response.json()
  if (!response.ok) {
    window.alert(data.error || 'ɾ����Աʧ��')
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
    name: `${source.name}�������棩`,
    image: null,
    imageId: null,
    imageVersion: null,
    authorUserId: currentUser.id,
    authorName: currentUser.displayName || '����',
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
  if (!canEditRecipe(current)) return
  const previousRecipes = recipes
  const date = document.getElementById('cook-date')?.value || new Date().toLocaleDateString('sv-SE')
  const note = document.getElementById('cook-note')?.value.trim() || ''
  const rating = Number(document.getElementById('cook-rating')?.value || 0)
  const existingRecord = cookEditor.id ? (current.cookRecords || []).find(record => sameId(record.id, cookEditor.id)) : null
  const oldImageId = existingRecord?.imageId || null
  const oldImageVersion = existingRecord?.imageVersion || null
  let uploadedImageId = null
  let uploadedImageVersion = null
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
      window.alert('���˼�¼ͼƬ����ʧ�ܣ�������ѡ��ͼƬ��')
      return
    }
  }
  let updatedRecipe = null
  recipes = recipes.map(recipe => {
    if (!sameId(recipe.id, selectedId)) return recipe
    const cookRecords = cookEditor.id
      ? (recipe.cookRecords || []).map(item => sameId(item.id, cookEditor.id) ? record : item)
      : [record, ...(recipe.cookRecords || [])]
    updatedRecipe = { ...recipe, cookRecords, cookCount: cookRecords.length, lastCookedAt: date, modifiedAt: new Date().toISOString() }
    return updatedRecipe
  })
  try {
    await persistSingleRecipe(updatedRecipe)
  } catch (error) {
    recipes = previousRecipes
    if (uploadedImageId) await Promise.allSettled([removeStoredImage(uploadedImageId, uploadedImageVersion)])
    window.alert('���˼�¼����ʧ�ܣ�ԭͼƬ�ѱ����')
    render()
    return
  }
  if (uploadedImageId && oldImageId && oldImageId !== uploadedImageId) {
    await Promise.allSettled([removeStoredImage(oldImageId, oldImageVersion)])
  }
  cookEditor = null
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
  if (!window.confirm('ȷ��Ҫɾ���������˼�¼��')) return
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
    window.alert('���˼�¼ɾ��ʧ�ܣ�ͼƬ�������ѱ����')
    render()
    return
  }
  if (record.imageId) await Promise.allSettled([removeStoredImage(record.imageId, record.imageVersion)])
  if (record.image?.startsWith('blob:')) URL.revokeObjectURL(record.image)
  if (cookEditor?.id && sameId(cookEditor.id, recordId)) cookEditor = null
  render()
}

function openRecipe(recipeId) {
  const viewedAt = new Date().toISOString()
  const recipe = findRecipeById(recipeId)
  if (!canViewRecipe(recipe)) return
  recipes = recipes.map(recipe => sameId(recipe.id, recipeId) ? { ...recipe, lastViewedAt: viewedAt } : recipe)
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
  settingsMenuOpen = false
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

function setupPullToRefresh() {
  const panel = document.querySelector('.recipe-panel')
  const indicator = document.querySelector('.pull-refresh-indicator')
  if (!panel || !indicator || panel.dataset.pullReady) return
  panel.dataset.pullReady = '1'
  let tracking = false
  let startY = 0
  let pullDistance = 0

  panel.addEventListener('touchstart', event => {
    if (refreshing || page !== 'home' || panel.scrollTop > 0 || event.touches.length !== 1) return
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
    indicator.textContent = pullDistance > 86 ? '�ɿ�ˢ��' : '����ˢ��'
  }, { passive: true })

  const finish = () => {
    if (!tracking) return
    const shouldRefresh = pullDistance > 86
    tracking = false
    indicator.style.transform = ''
    if (shouldRefresh) refreshFromCloud()
    else {
      indicator.classList.remove('visible')
      indicator.textContent = '����ˢ��'
    }
  }
  panel.addEventListener('touchend', finish, { passive: true })
  panel.addEventListener('touchcancel', finish, { passive: true })
}

function render(preserveFocus = false) {
  if (page === 'new' || page === 'edit') root.innerHTML = newRecipeTemplate()
  else if (page === 'members') root.innerHTML = membersTemplate()
  else if (page === 'detail') {
    const recipe = findRecipeById(selectedId)
    root.innerHTML = canViewRecipe(recipe) ? detailTemplate(recipe) : homeTemplate()
    if (!canViewRecipe(recipe)) { page = 'home'; selectedId = null }
  }
  else root.innerHTML = homeTemplate()
  if (preserveFocus) { const input = document.getElementById('search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length) }
  if (imagePreview) setupImagePreviewInteractions()
  if (page === 'detail') setupEdgeSwipeBack()
  if (page === 'home') requestAnimationFrame(() => {
    centerActiveCategory()
    setupPullToRefresh()
    preloadHomeImages().catch(() => null)
  })
}

async function startApplication() {
  if (appStarted) return
  appStarted = true
  history.replaceState({ appPage: 'home' }, '')
  activeScope = 'mine'
  activeCategory = 'ȫ��'
  query = ''
  viewingMember = null
  settingsMenuOpen = false
  recipes = loadRecipes()
  render()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).catch(error => console.warn('���߷������ʧ�ܡ�', error))
  hydrateRecipesFromIndexedDB().catch(() => null)
  hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), true).catch(error => console.warn('����ͼƬ�����ȡʧ�ܡ�', error))
  hydrateRecipeImages(recipes, true).catch(error => console.warn('����ͼƬ�����ȡʧ�ܡ�', error))
  if (isAdmin()) loadMembers().then(render).catch(error => console.warn('��Ա�б��ȡʧ�ܡ�', error))
  bootstrapCloudSync().catch(error => console.warn('��̨ͬ�����ʧ�ܡ�', error))
}

window.addEventListener('popstate', event => {
  if (!appStarted) return
  const recipeId = event.state?.recipeId
  if (event.state?.appPage === 'detail' && recipes.some(recipe => sameId(recipe.id, recipeId))) {
    selectedId = recipeId
    page = 'detail'
    render()
    return
  }
  goHome(true)
})

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
    if (cachedUser && response.ok && !result.authenticated) {
      localStorage.removeItem(USER_CACHE_KEY)
      appStarted = false
      currentUser = null
      recipes = []
    }
    root.innerHTML = authTemplate(response.status === 503 ? result.error : '')
  } catch {
    if (cachedUser) {
      return
    }
    root.innerHTML = authTemplate('��ʱ�޷���֤���ʣ��������������')
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
    document.getElementById('auth-account')?.focus()
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
  if (event.target.id === 'draft-family-shared' && draft) {
    draft.isFamilyShared = event.target.checked
    draftDirty = true
    return
  }
  const file = event.target.files?.[0]
  if (!file) return
  if (event.target.id === 'draft-file-input') {
    try {
      const normalizedFile = await normalizeImageFile(file)
      if (draft.imageFile && draft.image?.startsWith('blob:')) URL.revokeObjectURL(draft.image)
      draft.imageFile = normalizedFile
      draft.image = URL.createObjectURL(normalizedFile)
      draft.removeImage = false
      draftDirty = true
      render()
    } catch (error) {
      window.alert('ͼƬ����ʧ�ܣ�������ѡ��һ����ͨ��Ƭ��')
    } finally {
      event.target.value = ''
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
      window.alert('ͼƬ����ʧ�ܣ�������ѡ��һ����ͨ��Ƭ��')
    } finally {
      event.target.value = ''
    }
    return
  }
  if (event.target.id === 'file-input') {
    const current = findRecipeById(selectedId)
    if (!current) return
    const oldImageId = current.imageId || null
    const oldImageVersion = current.imageVersion || null
    const imageId = uniqueId(`recipe-${current.id}`)
    const imageVersion = new Date().toISOString()
    try {
      const normalizedFile = await normalizeImageFile(file)
      await storeImage(imageId, normalizedFile, imageVersion)
      await uploadCloudImage(imageId, normalizedFile)
      const updatedRecipe = { ...current, image: URL.createObjectURL(normalizedFile), imageId, imageVersion, modifiedAt: new Date().toISOString() }
      const previousRecipes = recipes
      recipes = recipes.map(recipe => sameId(recipe.id, selectedId) ? updatedRecipe : recipe)
      try {
        await persistSingleRecipe(updatedRecipe)
      } catch (error) {
        recipes = previousRecipes
        await Promise.allSettled([removeStoredImage(imageId, imageVersion)])
        window.alert('���ױ���ʧ�ܣ�ԭͼƬ�ѱ����')
        render()
        return
      }
      if (oldImageId && oldImageId !== imageId) await Promise.allSettled([removeStoredImage(oldImageId, oldImageVersion)])
      if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
      render()
    } catch (error) {
      await Promise.allSettled([removeStoredImage(imageId, imageVersion)])
      window.alert('ͼƬ����򱣴�ʧ�ܣ�������ѡ��һ����ͨ��Ƭ��')
    } finally {
      event.target.value = ''
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
  const target = event.target instanceof Element ? event.target.closest('[data-action], [data-category], [data-scope], [data-recipe], [data-recipe-id], [data-draft-category], [data-edit-note], [data-delete-note], [data-edit-cook], [data-delete-cook], [data-member-view], [data-member-toggle], [data-member-pin], [data-member-rename], [data-member-delete]') : null
  if (!target) return
  const action = target.dataset.action
  if (target.dataset.category) { activeCategory = target.dataset.category; settingsMenuOpen = false; render(); return }
  if (target.dataset.scope) { activeScope = target.dataset.scope; viewingMember = null; settingsMenuOpen = false; activeCategory = 'ȫ��'; render(); return }
  if (action === 'open-recipe' && target.dataset.recipeId) { openRecipe(target.dataset.recipeId); return }
  if (target.dataset.recipe) { openRecipe(target.dataset.recipe); return }
  if (target.dataset.draftCategory) { syncDraftFields(); const category = target.dataset.draftCategory; draft.categories = draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category]; draftDirty = true; render(); return }
  if (target.dataset.editNote) { openNoteEditor(target.dataset.editNote); return }
  if (target.dataset.deleteNote) { deleteNote(target.dataset.deleteNote); return }
  if (target.dataset.editCook) { if (canEditRecipe(findRecipeById(selectedId))) openCookEditor(target.dataset.editCook); return }
  if (target.dataset.deleteCook) { deleteCookRecord(target.dataset.deleteCook); return }
  if (target.dataset.memberView) {
    const member = members.find(item => sameId(item.id, target.dataset.memberView))
    if (member) {
      viewingMember = { id: member.id, displayName: member.displayName }
      activeScope = 'mine'
      activeCategory = 'ȫ��'
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
    const pin = window.prompt('�������µ� PIN / ���룬���� 4 λ')
    if (pin) updateMember(target.dataset.memberPin, { pin })
    return
  }
  if (target.dataset.memberRename) {
    const member = members.find(item => sameId(item.id, target.dataset.memberRename))
    const displayName = window.prompt('�������µ���ʾ����', member?.displayName || '')
    if (displayName) updateMember(target.dataset.memberRename, { displayName })
    return
  }
  if (target.dataset.memberDelete) { deleteMember(target.dataset.memberDelete); return }
  if (action === 'add-note') { openNoteEditor(); return }
  if (action === 'cancel-note') { noteEditor = null; render(); return }
  if (action === 'save-note') { saveNote(); return }
  if (action === 'toggle-favorite') { toggleFavorite(); return }
  if (action === 'toggle-family-share') { toggleFamilyShare(); return }
  if (action === 'copy-recipe') { copySelectedRecipe(); return }
  if (action === 'add-cook-record') { if (canEditRecipe(findRecipeById(selectedId))) openCookEditor(); return }
  if (action === 'cancel-cook-record') { cookEditor = null; render(); return }
  if (action === 'save-cook-record') { saveCookRecord(); return }
  if (action === 'choose-cook-image') { document.getElementById('cook-file-input')?.click(); return }
  if (action === 'new-recipe') { startNewRecipe(); return }
  if (action === 'toggle-theme') { toggleTheme(); return }
  if (action === 'share-url') {
    try {
      const result = await shareCurrentUrl()
      if (result === 'copied') window.alert('��ַ�Ѹ���')
    } catch (error) {
      try {
        await copyCurrentUrl()
        window.alert('��ַ�Ѹ���')
      } catch {
        window.alert('��ַ�Ѹ���ʧ��')
      }
    }
    return
  }
  if (action === 'settings') { settingsMenuOpen = !settingsMenuOpen; render(); return }
  if (action === 'close-settings') { settingsMenuOpen = false; render(); return }
  if (action === 'account-info') {
    window.alert(`��ǰ�˺ţ�${currentAccountName()}${currentUser?.loginCode ? `\n�˺ű�ţ�${currentUser.loginCode}` : ''}`)
    settingsMenuOpen = false
    render()
    return
  }
  if (action === 'stop-view-member') { viewingMember = null; activeScope = 'mine'; activeCategory = 'ȫ��'; query = ''; render(); return }
  if (action === 'members') { settingsMenuOpen = false; openMembersPage(); return }
  if (action === 'cleanup-images') {
    settingsMenuOpen = false
    try {
      const result = await cleanupCloudImages()
      window.alert(`ͼƬ������ɣ�ɨ�� ${result.scanned} �ţ�ɾ�� ${result.deleted} �š�`)
    } catch (error) {
      window.alert('ͼƬ����ʧ�ܣ����Ժ����ԡ�')
    }
    render()
    return
  }
  if (action === 'clear-local-cache') {
    settingsMenuOpen = false
    if (!window.confirm('ȷ��������ػ����𣿵�¼״̬�ᱣ������׺�ͼƬ�����´ӷ�������ȡ��')) { render(); return }
    try {
      await clearLocalCacheAndReload()
      window.alert('���ػ������������������ͬ�����������ݡ�')
    } catch (error) {
      window.alert('�������ʧ�ܣ����Ժ����ԡ�')
      render()
    }
    return
  }
  if (action === 'create-member') { createMember(); return }
  if (action === 'logout') {
    fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' }).finally(() => {
      localStorage.removeItem(USER_CACHE_KEY)
      appStarted = false
      selectedId = null
      currentUser = null
      viewingMember = null
      settingsMenuOpen = false
      recipes = []
      members = []
      page = 'home'
      root.innerHTML = authTemplate()
      document.getElementById('member-code')?.focus()
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
      window.alert('ͼƬɾ��ʧ�ܣ�ԭͼƬ�ѱ����')
      render()
      return
    }
    if (oldImageId) await Promise.allSettled([removeStoredImage(oldImageId, oldImageVersion)])
    if (current.image?.startsWith('blob:')) URL.revokeObjectURL(current.image)
    imageMenu = false
    render()
    return
  }
if (action === 'view-image') { imageMenu = false; imagePreview = true; render(); return }
if (action === 'close-preview') { imagePreview = false; render() }
})
applyTheme()
checkAccess()
/*

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
  return sameId(recipe.authorUserId, currentUser.id)
}

function canEditRecipe(recipe) {
  if (currentUser?.role === 'guest') return false
  return isAdmin() || sameId(recipe?.authorUserId, currentUser?.id)
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
      members: 0,
    }
  }
  return {
    mine: recipes.filter(recipe => sameId(recipe.authorUserId, currentUser?.id)).length,
    shared: recipes.filter(recipe => recipe.isFamilyShared).length,
    members: familyMemberCount || members.length || (isAdmin() ? 1 : 0),
  }
}

function currentAccountName() {
  if (currentUser?.role === 'guest') return '�ο�'
  return currentUser?.displayName || (isAdmin() ? '����Ա' : '��')
}

function homeSubtitle() {
  if (currentUser?.role === 'guest') return '�ο���� �� ���鿴��ͥ�������'
  if (viewingMember) return `���ڲ鿴��${viewingMember.displayName}�Ĳ���`
  return `${currentAccountName()}�Ĳ���`
}

function scopeTitle() {
  if (viewingMember) return `${viewingMember.displayName}�Ĳ���`
  if (currentUser?.role === 'guest') return '��ͥ����'
  if (activeScope === 'shared') return '��ͥ����'
  return '�ҵĲ���'
}

function settingsMenuTemplate() {
  if (!settingsMenuOpen) return ''
  const selectedRecipe = findRecipeById(selectedId)
  if (currentUser?.role === 'guest') {
    return `<div class="settings-popover" role="dialog" aria-label="���ò˵�">
      <button data-action="guest-exit">�˳��ο�ģʽ</button>
      <button class="muted" data-action="close-settings">ȡ��</button>
    </div>`
  }
  return `<div class="settings-popover" role="dialog" aria-label="���ò˵�">
    ${page === 'new' || page === 'edit' ? '' : '<button data-action="new-recipe">��������</button>'}
    ${page === 'detail' && canEditRecipe(selectedRecipe) ? '<button data-action="edit-recipe">�༭����</button>' : ''}
    <button data-action="account-info">�˺���Ϣ</button>
    ${isAdmin() ? '<button data-action="members">��Ա����</button><button data-action="cleanup-images">����ͼƬ����</button>' : ''}
    <div class="app-info-panel">
      <div class="app-info-row compact">
        <span>��ǰ�汾</span>
        <strong>${APP_VERSION}</strong>
      </div>
    </div>
    <button data-action="clear-local-cache">������ػ���</button>
    <button data-action="logout">�˳���¼</button>
    <button class="muted" data-action="close-settings">ȡ��</button>
  </div>`
}

function globalActionsTemplate() {
  return `<div class="global-actions" aria-label="ȫ�ֲ���">
    <button class="global-icon-button" data-action="toggle-theme" aria-label="�л�����">${themeMode === 'dark' ? '??' : '??'}</button>
    <button class="global-icon-button" data-action="share-url" aria-label="������ַ">??</button>
    <button class="global-icon-button" data-action="settings" aria-label="�˵�">?</button>
  </div>`
}

function statsTemplate() {
  const stats = homeStats()
  const mineActive = !viewingMember && activeScope === 'mine'
  const sharedActive = !viewingMember && activeScope === 'shared'
  if (currentUser?.role === 'guest') {
    return `<div class="home-stats guest-stats">
      <button type="button" data-scope="shared" class="${sharedActive ? 'active' : ''}"><strong>${stats.shared}</strong><span>��ͥ����</span></button>
      <span class="stat-card disabled"><strong>�ο�</strong><span>�����</span></span>
    </div>`
  }
  return `<div class="home-stats">
    <button type="button" data-scope="mine" class="${mineActive ? 'active' : ''}"><strong>${stats.mine}</strong><span>�ҵĲ���</span></button>
    <button type="button" data-scope="shared" class="${sharedActive ? 'active' : ''}"><strong>${stats.shared}</strong><span>��ͥ����</span></button>
    <span class="stat-card disabled"><strong>${stats.members}</strong><span>��ͥ��Ա</span></span>
  </div>`
}

function authTemplate(message = '') {
  return `<main class="auth-screen"><section class="auth-card"><div class="auth-mark">��</div><div class="eyebrow">OUR FAMILY TABLE</div><h1>�ۼҲ���</h1><p>��ͥ˽������</p>
    <form id="member-login-form" class="login-form">
      <h2>��ͥ��Ա��¼</h2>
      <label for="member-code">�˺ű��</label>
      <input id="member-code" name="loginCode" inputmode="numeric" autocomplete="username" placeholder="���磺001" autofocus>
      <label for="member-pin">PIN / ����</label>
      <input id="member-pin" name="pin" type="password" autocomplete="current-password" placeholder="������ PIN">
      <button type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? '���ڽ��롭' : '�������'}</button>
    </form>
    <details class="admin-login-panel">
      <summary>����Ա�����¼</summary>
      <form id="admin-login-form" class="login-form">
        <label for="admin-email">����</label>
        <input id="admin-email" name="email" type="email" autocomplete="username" placeholder="����Ա����">
        <label for="admin-password">����</label>
        <input id="admin-password" name="password" type="password" autocomplete="current-password" placeholder="����Ա����">
        <button type="submit" ${authBusy ? 'disabled' : ''}>����Ա����</button>
      </form>
    </details>
    <button class="guest-login-button" type="button" data-action="guest-login">�ο����</button>
    <button class="guest-login-button" type="button" data-action="guest-login">�ο����</button>
    <div class="auth-error" role="alert">${escapeHtml(message)}</div><small>������ע�ᣬ�˺��ɹ���Ա����</small></section></main>`
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
    console.warn('���Զ�ȡʧ��', error)
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
        <div class="comment-meta"><strong>${escapeHtml(comment.guest_name || '����')}</strong><time>${escapeHtml((comment.created_at || '').replace('T', ' ').slice(0, 16))}</time>${canDeleteComment ? `<button class="danger-text" data-action="delete-comment" data-comment-id="${escapeHtml(comment.id)}">ɾ��</button>` : ''}</div>
        <p>${escapeHtml(comment.content || '')}</p>
      </article>`).join('')}</div>`
    : '<p class="empty-copy">��û�����ԡ�</p>'
  const form = canWriteComment ? `<div class="comment-form">
    <label><span>�ǳ�</span><input id="guest-comment-name" value="${escapeHtml(guestCommentDraft.guestName || currentUser?.displayName || '�ο�')}" placeholder="�������ǳ�"></label>
    <label><span>��������</span><textarea id="guest-comment-content" maxlength="300" placeholder="д������˵�Ļ�">${escapeHtml(guestCommentDraft.content || '')}</textarea></label>
    <div class="comment-form-actions"><button class="secondary-button" data-action="guest-comment-clear">���</button><button class="primary-button" data-action="save-guest-comment" ${guestCommentBusy ? 'disabled' : ''}>�ύ����</button></div>
  </div>` : ''
  return `<section class="recipe-section comments-section"><div class="recipe-section-title"><span>07</span><h2>������</h2></div><div class="recipe-section-body">${recipe.isFamilyShared ? '' : '<p class="empty-copy">����ͥ�������֧�����ԡ�</p>'}${form}${recipeCommentsRecipeId === recipe.id && recipeCommentsLoading ? '<p class="empty-copy">���ڼ������ԡ�</p>' : ''}${list}</div></section>`
}

function detailTemplate(recipe) {
  const editable = canEditRecipe(recipe)
  const showWritingActions = currentUser?.role !== 'guest'
  return `<div class="app-shell detail-shell"><header class="detail-header"><button class="icon-button" data-action="back-home" aria-label="����">${icons.back}</button><div class="detail-header-title">��������</div>${globalActionsTemplate()}</header>
    ${settingsMenuTemplate()}
    <main class="detail-content"><div class="detail-title-row"><div><div class="eyebrow">�ۼҵ����ֲ�</div><h1>${escapeHtml(recipe.name)}</h1></div><div class="title-mark">?</div></div>
      <div class="recipe-author-line">��¼�ˣ�${escapeHtml(recipe.authorName || '����')}${recipe.isFamilyShared ? ` �� �����ˣ�${escapeHtml(recipe.authorName || '����')}` : ''} �� ���� ${recipe.cookCount || 0} ��</div>
      <div class="share-status-card ${recipe.isFamilyShared ? 'shared' : 'private'}">
        <div><strong>��ǰ״̬��${recipe.isFamilyShared ? '???????? ��ͥ����' : '?? ˽�˲���'}</strong><small>${recipe.isFamilyShared ? '���м�ͥ��Ա���ܿ�������ˡ�' : 'ֻ�д����ߺ͹���Ա���Կ�����'}</small></div>
        <label class="share-switch ${editable ? '' : 'disabled'}"><span>�������ͥ</span><input type="checkbox" data-action="toggle-family-share" ${recipe.isFamilyShared ? 'checked' : ''} ${editable ? '' : 'disabled'}><i></i></label>
      </div>
      ${showWritingActions ? `<div class="detail-quick-actions"><button data-action="toggle-favorite">${isFavorite(recipe) ? '�� ���ղ�' : '�� �ղ�'}</button><button data-action="copy-recipe">���Ʋ���</button></div>` : ''}
      ${imageArea(recipe)}<input id="file-input" class="hidden-input" type="file" accept="image/*">
      ${section('01', '����', `<ul class="simple-list">${recipe.ingredients.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      ${section('02', '����', `<ul class="simple-list">${recipe.seasonings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)}
      ${section('03', '��������', `<ol class="steps">${recipe.steps.map((step,index) => `<li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join('')}</ol>`)}
      ${section('04', 'ע������', `<p class="body-copy">${escapeHtml(recipe.tips || '����')}</p>`)}
      ${notesSection(recipe)}
      ${commentsSection(recipe)}
      ${cookRecordsSection(recipe)}
    </main>${imageMenu ? actionSheet() : ''}${imagePreview && recipe.image ? imageLightbox(recipe) : ''}</div>`
}

function render(preserveFocus = false) {
  if (page === 'detail' && selectedId && recipeCommentsRecipeId !== selectedId && !recipeCommentsLoading) {
    openRecipeComments(selectedId)
  }
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
  if (page === 'detail') setupEdgeSwipeBack()
  if (page === 'home') requestAnimationFrame(() => {
    centerActiveCategory()
    setupPullToRefresh()
    preloadHomeImages().catch(() => null)
  })
}

async function startApplication() {
  if (appStarted) return
  appStarted = true
  history.replaceState({ appPage: 'home' }, '')
  activeScope = currentUser?.role === 'guest' ? 'shared' : 'mine'
  activeCategory = '全部'
  query = ''
  viewingMember = null
  settingsMenuOpen = false
  clearRecipeComments()
  recipes = loadRecipes()
  render()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(error => console.warn('离线服务启动失败�?, error))
  hydrateRecipesFromIndexedDB().catch(() => null)
  hydrateRecipeImages(getFilteredRecipes().slice(0, HOME_PRELOAD_LIMIT), true).catch(error => console.warn('本地图片缓存读取失败�?, error))
  hydrateRecipeImages(recipes, true).catch(error => console.warn('本地图片缓存读取失败�?, error))
  if (isAdmin()) loadMembers().then(render).catch(error => console.warn('成员列表读取失败�?, error))
  bootstrapCloudSync().catch(error => console.warn('后台同步启动失败�?, error))
}

function openRecipe(recipeId) {
  const viewedAt = new Date().toISOString()
  const recipe = findRecipeById(recipeId)
  if (!canViewRecipe(recipe)) return
  recipes = recipes.map(item => sameId(item.id, recipeId) ? { ...item, lastViewedAt: viewedAt } : item)
  persistRecipes()
  selectedId = recipeId
  page = 'detail'
  history.pushState({ appPage: 'detail', recipeId }, '')
  clearRecipeComments()
  openRecipeComments(recipeId)
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
  settingsMenuOpen = false
  clearRecipeComments()
  page = 'home'
  render()
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
    window.alert('�ǳƺ����Բ���Ϊ��')
    return
  }
  if (content.length > 300) {
    window.alert('������� 300 ��')
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
      window.alert(result.error || '�����ύʧ��')
      return
    }
    guestCommentDraft = { guestName: '', content: '' }
    await openRecipeComments(recipe.id)
    render()
  } catch (error) {
    window.alert('�����ύʧ�ܣ����Ժ�����')
  } finally {
    guestCommentBusy = false
    render()
  }
}

async function deleteGuestComment(commentId) {
  const recipe = findRecipeById(selectedId)
  if (!recipe || !commentId) return
  if (!window.confirm('ȷ��Ҫɾ������������')) return
  const response = await fetch(`/api/comments?recipeId=${encodeURIComponent(recipe.id)}&id=${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    window.alert(result.error || '����ɾ��ʧ��')
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
        root.innerHTML = authTemplate(result.error || '�ο����ʧ��')
        return
      }
      currentUser = result.user
      saveCachedUser(currentUser)
      appStarted = false
      await startApplication()
    } catch (error) {
      root.innerHTML = authTemplate('�ο����ʧ�ܣ����Ժ�����')
    } finally {
      authBusy = false
    }
    return
  }
  if (action === 'guest-exit') {
    settingsMenuOpen = false
    fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' }).finally(() => {
      localStorage.removeItem(USER_CACHE_KEY)
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
      document.getElementById('member-code')?.focus()
    })
    return
  }
  if (action === 'save-guest-comment') { event.preventDefault(); await saveGuestComment(); return }
  if (action === 'guest-comment-clear') { guestCommentDraft = { guestName: '', content: '' }; render(); return }
  if (action === 'delete-comment' && target.dataset.commentId) { await deleteGuestComment(target.dataset.commentId); return }
})

applyTheme()
checkAccess()
*/
