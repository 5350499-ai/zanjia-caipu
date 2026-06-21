const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const authHandler = require('./api/auth')
const configHandler = require('./api/config')

const root = __dirname
const port = 5173
process.env.ADMIN_EMAIL ||= 'admin@local.test'
process.env.APP_PASSWORD ||= '123456'
process.env.AUTH_SECRET ||= 'local-development-only-secret'
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' }

const server = http.createServer(async (req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0])
  if (requestPath === '/api/auth') return authHandler(req, res)
  if (requestPath === '/api/config') return configHandler(req, res)
  const target = path.normalize(path.join(root, requestPath === '/' ? 'index.html' : requestPath))
  if (!target.startsWith(root)) { res.writeHead(403); return res.end('Forbidden') }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found') }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(data)
  })
})

server.listen(port, '0.0.0.0', () => {
  const addresses = Object.values(os.networkInterfaces()).flat().filter((item) => item && item.family === 'IPv4' && !item.internal)
  console.log(`Local:   http://localhost:${port}`)
  for (const item of addresses) console.log(`Network: http://${item.address}:${port}`)
})
