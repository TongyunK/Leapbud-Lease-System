/**
 * 将业务写操作从 @Roles(UserRole.admin) 改为 @RequirePermissions('resource:action')
 * 并挂上 PermissionsGuard。幂等：已改过的文件会跳过。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.join(__dirname, '..', 'src')

/** folder name under src -> permission module code */
const RESOURCE_MAP = {
  buildings: 'buildings',
  rooms: 'rooms',
  customers: 'customers',
  'customer-requirements': 'customerRequirements',
  occupants: 'occupants',
  contracts: 'contracts',
  'contract-periods': 'contractPeriods',
  'lease-terminations': 'leaseTerminations',
  'contract-other-fees': 'contractOtherFees',
  'deposit-refunds': 'depositRefunds',
  invoices: 'invoices',
  'invoice-service-details': 'invoiceServiceDetails',
  receivables: 'receivables',
  receipts: 'receipts',
}

function detectAction(methodSrc) {
  if (/@Post\(\s*['"]import['"]/.test(methodSrc) || /importBatch\s*\(/.test(methodSrc)) {
    return 'import'
  }
  if (/@Post\(\s*['"]batch-delete['"]/.test(methodSrc) || /removeMany\s*\(/.test(methodSrc)) {
    return 'batchDelete'
  }
  if (/@Delete\(/.test(methodSrc) || /\bremove\s*\(/.test(methodSrc)) return 'delete'
  if (/@Patch\(/.test(methodSrc) || /\bupdate\s*\(/.test(methodSrc)) return 'update'
  if (/@Post\(\s*['"][^'"]+\/images['"]/.test(methodSrc)) return 'update'
  if (/@Delete\(\s*['"][^'"]+\/images/.test(methodSrc)) return 'update'
  if (/@Post\(\)/.test(methodSrc) || /\bcreate\s*\(/.test(methodSrc)) return 'create'
  return null
}

function ensureImports(src) {
  let out = src
  if (!out.includes("from '../permissions/permissions.guard'") && !out.includes('from "../permissions/permissions.guard"')) {
    // depth: controllers are one level under module folder
    const guardImport = `import { PermissionsGuard } from '../permissions/permissions.guard';\n`
    const reqImport = `import { RequirePermissions } from '../permissions/require-permissions.decorator';\n`
    // insert after Roles import if present
    if (out.includes("from '../auth/roles.decorator'") || out.includes('from "../auth/roles.decorator"')) {
      out = out.replace(
        /import \{ Roles \} from ['"]\.\.\/auth\/roles\.decorator['"];?\r?\n/,
        (m) => m + guardImport + reqImport,
      )
    } else {
      out = guardImport + reqImport + out
    }
  }
  return out
}

function ensureUseGuards(src) {
  // Class-level or method-level: add PermissionsGuard next to RolesGuard
  return src.replace(
    /@UseGuards\(\s*JwtAuthGuard\s*,\s*RolesGuard\s*\)/g,
    '@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)',
  )
}

function patchAdminRoles(src, resource) {
  // Split by decorator blocks that include @Roles(UserRole.admin) alone (not admin, user)
  // Replace those method-level admin-only roles with RequirePermissions based on following method
  const lines = src.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (
      trimmed === '@Roles(UserRole.admin)' ||
      trimmed === '@Roles(UserRole.admin);'
    ) {
      // Look ahead for method signature / route to detect action
      const window = lines.slice(i, Math.min(i + 25, lines.length)).join('\n')
      // Skip if this is class-level (next non-empty is @Controller or export class)
      const ahead = lines
        .slice(i + 1)
        .map((l) => l.trim())
        .filter(Boolean)
      if (ahead[0]?.startsWith('@Controller') || ahead[0]?.startsWith('export class')) {
        out.push(line)
        continue
      }
      const action = detectAction(window)
      if (action) {
        const indent = line.match(/^\s*/)?.[0] ?? ''
        out.push(`${indent}@RequirePermissions('${resource}:${action}')`)
        continue
      }
    }
    // rooms update already has admin,user — add RequirePermissions before it if missing
    out.push(line)
  }
  return out.join('\n')
}

function addRequireOnAdminUserWrites(src, resource) {
  // For methods that keep @Roles(UserRole.admin, UserRole.user) but are writes (update/images),
  // ensure RequirePermissions is present on that method.
  const lines = src.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (
      trimmed === '@Roles(UserRole.admin, UserRole.user)' ||
      trimmed === '@Roles(UserRole.admin, UserRole.user);'
    ) {
      const window = lines.slice(i, Math.min(i + 30, lines.length)).join('\n')
      const action = detectAction(window)
      // Only annotate write-like methods that aren't plain findAll
      if (action && action !== 'create' /* create shouldn't be admin+user */) {
        // check previous lines for already RequirePermissions
        const prev = lines.slice(Math.max(0, i - 5), i).join('\n')
        if (!prev.includes('@RequirePermissions')) {
          const indent = line.match(/^\s*/)?.[0] ?? ''
          // For class-level Roles(admin,user) skip
          const ahead = lines
            .slice(i + 1)
            .map((l) => l.trim())
            .filter(Boolean)
          if (ahead[0]?.startsWith('@Controller') || ahead[0]?.startsWith('export class')) {
            out.push(line)
            continue
          }
          // Only for update/delete/import style — not GET findAll
          if (action === 'update' || action === 'delete' || action === 'import' || action === 'batchDelete') {
            out.push(`${indent}@RequirePermissions('${resource}:${action}')`)
          }
        }
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

let changed = 0
for (const [folder, resource] of Object.entries(RESOURCE_MAP)) {
  const dir = path.join(srcRoot, folder)
  if (!fs.existsSync(dir)) continue
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.controller.ts')) continue
    const fp = path.join(dir, file)
    let src = fs.readFileSync(fp, 'utf8')
    if (src.includes('@RequirePermissions') && src.includes('PermissionsGuard')) {
      console.log('skip (already patched):', path.relative(srcRoot, fp))
      continue
    }
    const before = src
    src = ensureImports(src)
    src = ensureUseGuards(src)
    src = patchAdminRoles(src, resource)
    src = addRequireOnAdminUserWrites(src, resource)
    if (src !== before) {
      fs.writeFileSync(fp, src, 'utf8')
      changed += 1
      console.log('patched:', path.relative(srcRoot, fp))
    } else {
      console.log('unchanged:', path.relative(srcRoot, fp))
    }
  }
}
console.log('done, changed=', changed)
