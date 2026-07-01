const { isAuthorized, sendJson } = require('../lib/server-auth')

module.exports = function handler(request, response) {
  if (!isAuthorized(request)) return sendJson(response, 401, { error: 'Unauthorized' })
  return sendJson(response, 200, { ok: true })
}
