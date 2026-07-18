const crypto = require('crypto')

const COOKIE_NAME = 'family_recipe_session'
// Keep the signed browser session for a full year. This is the app's
// long-lived session layer; Supabase access remains server-side.
const SESSION_SECONDS = 60 * 60 * 24 * 365

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=')
    if (index < 0) return cookies
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
    return cookies
  }, {})
}

function safeEqual(left = '', right = '') {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function authSecret() {
  return process.env.AUTH_SECRET || `family-recipes:${process.env.APP_PASSWORD || ''}`
}

function sign(payload) {
  return crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url')
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodePayload(value) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) } catch { return null }
}

function hasAuthConfig() {
  return Boolean(process.env.APP_PASSWORD)
}

function getSessionUser(request) {
  const value = parseCookies(request.headers.cookie)[COOKIE_NAME]
  if (!value) return null
  const [payload, signature] = value.split('.')
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null
  const user = decodePayload(payload)
  if (!user || Number(user.expiresAt) <= Date.now()) return null
  return user
}

function isAuthorized(request) {
  return Boolean(getSessionUser(request))
}

function passwordMatches(password) {
  return hasAuthConfig() && safeEqual(password, process.env.APP_PASSWORD)
}

function createSessionCookie(request, user) {
  const payload = encodePayload({
    id: user.id,
    loginCode: user.login_code || user.loginCode,
    displayName: user.display_name || user.displayName,
    role: user.role,
    isGuest: user.role === 'guest',
    familyId: user.family_id || user.familyId || 'family-main',
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
  })
  const secure = request.headers['x-forwarded-proto'] === 'https' || Boolean(process.env.VERCEL)
  return `${COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${SESSION_SECONDS}`
}

function clearSessionCookie(request) {
  const secure = request.headers['x-forwarded-proto'] === 'https' || Boolean(process.env.VERCEL)
  return `${COOKIE_NAME}=; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=0`
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    loginCode: user.loginCode || user.login_code,
    displayName: user.displayName || user.display_name,
    role: user.role,
    isGuest: user.role === 'guest',
    familyId: user.familyId || user.family_id,
  }
}

function sendJson(response, status, data) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

async function readJson(request) {
  if (request.body && typeof request.body === 'object') return request.body
  let body = ''
  for await (const chunk of request) body += chunk
  try { return JSON.parse(body || '{}') } catch { return {} }
}

async function readBuffer(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

module.exports = {
  clearSessionCookie,
  createSessionCookie,
  getSessionUser,
  hasAuthConfig,
  isAuthorized,
  passwordMatches,
  publicUser,
  readBuffer,
  readJson,
  sendJson,
}
