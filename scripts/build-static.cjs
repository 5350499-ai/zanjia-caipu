const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'dist')
const entries = ['index.html', 'manifest.json', 'sw.js', 'src', 'icons', 'splash']

fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })

for (const entry of entries) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), { recursive: true })
}
