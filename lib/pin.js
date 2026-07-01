const crypto = require('crypto')

const ITERATIONS = 210000
const KEY_LENGTH = 32
const DIGEST = 'sha256'

function hashSecret(secret = '') {
  const salt = crypto.randomBytes(16).toString('base64url')
  const hash = crypto.pbkdf2Sync(String(secret), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url')
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`
}

function safeEqual(left = '', right = '') {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function verifySecret(secret = '', stored = '') {
  const [scheme, iterations, salt, expected] = String(stored).split('$')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false
  const actual = crypto.pbkdf2Sync(String(secret), salt, Number(iterations), KEY_LENGTH, DIGEST).toString('base64url')
  return safeEqual(actual, expected)
}

module.exports = { hashSecret, verifySecret }
