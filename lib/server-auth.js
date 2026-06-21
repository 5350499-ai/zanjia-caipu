const crypto = require('crypto')

const COOKIE_NAME = 'family_recipe_session'
const SESSION_SECONDS = 60 * 60 * 24 * 30

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

function sign(expiresAt) {
  const secret = process.env.AUTH_SECRET || `family-recipes:${process.env.APP_PASSWORD || ''}`
  return crypto.createHmac('sha256', secret).update(String(expiresAt)).digest('base64url')
}

function hasAuthConfig() {
  return Boolean(process.env.APP_PASSWORD)
}

function isAuthorized(request) {
  if (!hasAuthConfig()) return false
  const value = parseCookies(request.headers.cookie)[COOKIE_NAME]
  if (!value) return false
  const [expiresAt, signature] = value.split('.')
  if (!expiresAt || !signature || Number(expiresAt) <= Date.now()) return false
  return safeEqual(signature, sign(expiresAt))
}

function passwordMatches(password) {
  return hasAuthConfig() && safeEqual(password, process.env.APP_PASSWORD)
}

function createSessionCookie(request) {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000
  const secure = request.headers['x-forwarded-proto'] === 'https' || Boolean(process.env.VERCEL)
  return `${COOKIE_NAME}=${expiresAt}.${sign(expiresAt)}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${SESSION_SECONDS}`
}

function clearSessionCookie(request) {
  const secure = request.headers['x-forwarded-proto'] === 'https' || Boolean(process.env.VERCEL)
  return `${COOKIE_NAME}=; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Max-Age=0`
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

module.exports = { clearSessionCookie, createSessionCookie, hasAuthConfig, isAuthorized, passwordMatches, readJson, sendJson }
