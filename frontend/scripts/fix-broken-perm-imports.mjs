import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const views = path.join(__dirname, '..', 'src', 'views')

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

for (const fp of walk(views)) {
  let s = fs.readFileSync(fp, 'utf8')
  const before = s

  // Fix: import before <script setup>
  s = s.replace(
    /^import \{ useResourcePermissions \} from '@\/composables\/useResourcePermissions'\r?\n<script setup([^>]*)>\r?\nimport \{ useResourcePermissions \} from '@\/composables\/useResourcePermissions'\r?\nconst perms = useResourcePermissions\('([^']+)'\)\r?\n/,
    `<script setup$1>\nimport { useResourcePermissions } from '@/composables/useResourcePermissions'\nconst perms = useResourcePermissions('$2')\n`,
  )

  // Fix: only outer import before script
  s = s.replace(
    /^import \{ useResourcePermissions \} from '@\/composables\/useResourcePermissions'\r?\n<script setup([^>]*)>\r?\n/,
    `<script setup$1>\nimport { useResourcePermissions } from '@/composables/useResourcePermissions'\n`,
  )

  // Deduplicate import lines
  const lines = s.split(/\r?\n/)
  let seenImport = false
  let seenPermsConst = false
  const next = []
  for (const line of lines) {
    if (line.trim() === "import { useResourcePermissions } from '@/composables/useResourcePermissions'") {
      if (seenImport) continue
      seenImport = true
    }
    if (/^const perms = useResourcePermissions\(/.test(line.trim())) {
      if (seenPermsConst) continue
      seenPermsConst = true
    }
    next.push(line)
  }
  s = next.join('\n')

  if (s !== before) {
    fs.writeFileSync(fp, s, 'utf8')
    console.log('fixed', path.relative(views, fp))
  }
}
console.log('done')
