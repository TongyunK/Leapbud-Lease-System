/**
 * 系统/配置类控制器：接入 PermissionsGuard + RequirePermissions，去掉写操作上的纯 admin Roles。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.join(__dirname, '..', 'src')

const TARGETS = [
  { folder: 'users', resource: 'users', classAlreadyAnyAuth: true },
  { folder: 'roles', resource: 'roles', classAlreadyAnyAuth: false },
  { folder: 'menus', resource: 'menus', classAlreadyAnyAuth: false },
  { folder: 'room-configs', resource: 'roomConfigs', classAlreadyAnyAuth: false },
  { folder: 'room-types', resource: 'roomTypes', classAlreadyAnyAuth: false },
  { folder: 'customer-sources', resource: 'customerSources', classAlreadyAnyAuth: false },
  { folder: 'contract-configs', resource: 'contractConfigs', classAlreadyAnyAuth: false },
  { folder: 'document-templates', resource: 'documentTemplates', classAlreadyAnyAuth: false },
  { folder: 'numbering-rules', resource: 'numberingRules', classAlreadyAnyAuth: false },
]

const METHOD_ACTION = {
  create: 'create',
  update: 'update',
  remove: 'delete',
  importBatch: 'import',
  removeMany: 'batchDelete',
  reset: 'update',
  assignMenus: 'update',
  saveMenuMatrix: 'update',
  assignPermissions: 'update',
  // document template extras
  upload: 'update',
  replaceFile: 'update',
}

function ensureImports(src) {
  if (src.includes('RequirePermissions')) return src
  let out = src
  if (!out.includes("from '../permissions/permissions.guard'")) {
    const guardImport = `import { PermissionsGuard } from '../permissions/permissions.guard';\n`
    const reqImport = `import { RequirePermissions } from '../permissions/require-permissions.decorator';\n`
    if (out.includes("from '../auth/roles.decorator'")) {
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
  return src
    .replace(
      /@UseGuards\(\s*JwtAuthGuard\s*,\s*RolesGuard\s*\)/g,
      '@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)',
    )
    .replace(
      /@UseGuards\(\s*JwtAuthGuard\s*,\s*RolesGuard\s*,\s*PermissionsGuard\s*,\s*PermissionsGuard\s*\)/g,
      '@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)',
    )
}

function softenClassRoles(src) {
  // class-level @Roles(UserRole.admin) alone -> admin,user so custom roles can pass RolesGuard
  return src.replace(
    /(@Controller\([^\)]*\)\s*\r?\n(?:@[^\n]+\r?\n)*)@Roles\(UserRole\.admin\)(\s*\r?\nexport class)/,
    '$1@Roles(UserRole.admin, UserRole.user)$2',
  )
}

function softenStandaloneAdminRolesBeforeExport(src) {
  // Pattern used by roles.controller: guards then @Roles(admin) then @Controller
  return src.replace(
    /(@UseGuards\([^\)]*\)\s*\r?\n)@Roles\(UserRole\.admin\)(\s*\r?\n@Controller)/,
    '$1@Roles(UserRole.admin, UserRole.user)$2',
  )
}

function patchMethods(src, resource) {
  const methodRe =
    /((?:^[ \t]*@[^\n]+\n)+)([ \t]*(?:async\s+)?(create|update|remove|importBatch|removeMany|reset|assignMenus|saveMenuMatrix|assignPermissions|upload|replaceFile)\s*\()/gm

  return src.replace(methodRe, (full, decorators, sig, name) => {
    const action = METHOD_ACTION[name]
    if (!action) return full
    let dec = decorators.replace(/^[ \t]*@RequirePermissions\([^)]*\)\r?\n/gm, '')
    // drop method-level @Roles(UserRole.admin) so PermissionsGuard owns write auth
    dec = dec.replace(/^[ \t]*@Roles\(UserRole\.admin\)\r?\n/gm, '')
    const indent = (decorators.match(/^[ \t]*/m) || [''])[0]
    const line = `${indent}@RequirePermissions('${resource}:${action}')\n`
    if (/@UseGuards\(/.test(dec)) {
      dec = dec.replace(/(@UseGuards\([^\)]*\)\r?\n)/, `$1${line}`)
    } else {
      dec = line + dec
    }
    return dec + sig
  })
}

function softenNumberingReads(src, resource) {
  if (resource !== 'numberingRules') return src
  // GET list/detail: allow any authenticated (admin,user), no RequirePermissions
  return src
    .replace(
      /(@Get\(\)\s*\r?\n(?:[ \t]*@[^\n]+\r?\n)*)[ \t]*@Roles\(UserRole\.admin\)\r?\n/m,
      (m) => m.replace(/@Roles\(UserRole\.admin\)\r?\n/, '@Roles(UserRole.admin, UserRole.user)\n'),
    )
    .replace(
      /(@Get\(':id'\)\s*\r?\n(?:[ \t]*@[^\n]+\r?\n)*)[ \t]*@Roles\(UserRole\.admin\)\r?\n/m,
      (m) => m.replace(/@Roles\(UserRole\.admin\)\r?\n/, '@Roles(UserRole.admin, UserRole.user)\n'),
    )
}

for (const t of TARGETS) {
  const dir = path.join(srcRoot, t.folder)
  if (!fs.existsSync(dir)) {
    console.log('missing', t.folder)
    continue
  }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.controller.ts')) continue
    // skip preview controllers under document-templates
    if (file.includes('preview')) continue
    const fp = path.join(dir, file)
    let src = fs.readFileSync(fp, 'utf8')
    src = ensureImports(src)
    src = ensureUseGuards(src)
    src = softenStandaloneAdminRolesBeforeExport(src)
    src = softenClassRoles(src)
    src = softenNumberingReads(src, t.resource)
    src = patchMethods(src, t.resource)
    fs.writeFileSync(fp, src, 'utf8')
    console.log('patched', path.relative(srcRoot, fp))
  }
}
console.log('done')
