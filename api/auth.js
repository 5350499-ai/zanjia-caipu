const { clearSessionCookie, createSessionCookie, credentialsMatch, hasAuthConfig, isAuthorized, readJson, sendJson } = require('../lib/server-auth')

module.exports = async function handler(request, response) {
  if (!hasAuthConfig()) return sendJson(response, 503, { error: '访问密码尚未配置' })

  if (request.method === 'GET') return sendJson(response, 200, { authenticated: isAuthorized(request) })

  if (request.method === 'POST') {
    const { email = '', password = '' } = await readJson(request)
    if (!credentialsMatch(email, password)) return sendJson(response, 401, { error: '账号或密码不正确' })
    response.setHeader('Set-Cookie', createSessionCookie(request))
    return sendJson(response, 200, { authenticated: true })
  }

  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearSessionCookie(request))
    return sendJson(response, 200, { authenticated: false })
  }

  response.setHeader('Allow', 'GET, POST, DELETE')
  return sendJson(response, 405, { error: 'Method not allowed' })
}
