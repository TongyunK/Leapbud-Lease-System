import fs from 'fs'
import path from 'path'
import os from 'os'
import PizZip from 'pizzip'

const root = path.join(process.cwd(), 'uploads', 'document-templates')
const dirs = fs.readdirSync(root).filter((d) => {
  try {
    return fs.statSync(path.join(root, d)).isDirectory()
  } catch {
    return false
  }
})

let target = null
for (const d of dirs) {
  const dir = path.join(root, d)
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.docx')) continue
    const full = path.join(dir, f)
    // prefer 发票 / invoice-ish by mtime among recent
    const st = fs.statSync(full)
    if (!target || st.mtimeMs > target.mtimeMs) {
      // keep candidates that look like invoice by name bytes containing common patterns
      target = { full, name: f, mtimeMs: st.mtimeMs, dir: d }
    }
  }
}

// Prefer folder cmudkrrno0001mdtk9286lzf5 from prior listing
const prefer = path.join(root, 'cmudkrrno0001mdtk9286lzf5')
if (fs.existsSync(prefer)) {
  const f = fs.readdirSync(prefer).find((x) => x.toLowerCase().endsWith('.docx'))
  if (f) target = { full: path.join(prefer, f), name: f, mtimeMs: fs.statSync(path.join(prefer, f)).mtimeMs, dir: 'cmudkrrno0001mdtk9286lzf5' }
}

if (!target) {
  console.error('no docx found')
  process.exit(1)
}

console.log('FILE', target.full)
console.log('NAME', target.name)

const buf = fs.readFileSync(target.full)
const zip = new PizZip(buf)
const xml = zip.file('word/document.xml').asText()

function showAround(needle, n = 5) {
  let i = 0
  let found = 0
  while (found < n && (i = xml.indexOf(needle, i)) !== -1) {
    const a = Math.max(0, i - 200)
    const b = Math.min(xml.length, i + needle.length + 250)
    console.log(`\n=== ${needle} #${found} @${i} ===`)
    console.log(xml.slice(a, b))
    i += needle.length
    found++
  }
  if (!found) console.log(`\n(no ${needle})`)
}

for (const k of ['{#items}', '{/items}', '{description}', '{quantity}', '{unitPrice}', '{amount}', 'items', 'quantity']) {
  let c = 0
  let i = 0
  while ((i = xml.indexOf(k, i)) !== -1) {
    c++
    i++
  }
  console.log(`count ${JSON.stringify(k)} = ${c}`)
}

showAround('{#items}')
showAround('{/items}')
showAround('{quantity}')
showAround('{description}')

// Also dump all <w:t> that contain { or }
const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1])
const relevant = texts.filter((t) => t.includes('{') || t.includes('}') || /item|desc|quant|amount|unit/i.test(t))
console.log('\n=== relevant w:t texts ===')
for (const t of relevant) console.log(JSON.stringify(t))
