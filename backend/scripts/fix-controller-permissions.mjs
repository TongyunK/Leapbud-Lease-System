/**
 * 按方法名修正 @RequirePermissions，并去掉读接口上的误挂权限。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.join(__dirname, '..', 'src')

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

/** methodName -> action | null (null = remove RequirePermissions) */
const METHOD_ACTION = {
  findAll: null,
  findOne: null,
  countByBuilding: null,
  buildingCounts: null,
  getImageFile: null,
  create: 'create',
  update: 'update',
  remove: 'delete',
  importBatch: 'import',
  removeMany: 'batchDelete',
  uploadImages: 'update',
  removeImage: 'update',
  // buildings extras
  uploadLogo: 'update',
}

for (const [folder, resource] of Object.entries(RESOURCE_MAP)) {
  const dir = path.join(srcRoot, folder)
  if (!fs.existsSync(dir)) continue
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.controller.ts')) continue
    const fp = path.join(dir, file)
    let src = fs.readFileSync(fp, 'utf8')

    // Find each method and its preceding decorators block
    // Match: optional decorators then async? methodName(
    const methodRe =
      /((?:^[ \t]*@[^\n]+\n)+)([ \t]*(?:async\s+)?(findAll|findOne|countByBuilding|buildingCounts|getImageFile|create|update|remove|importBatch|removeMany|uploadImages|removeImage|uploadLogo)\s*\()/gm

    src = src.replace(methodRe, (full, decorators, sig, name) => {
      const action = Object.prototype.hasOwnProperty.call(METHOD_ACTION, name)
        ? METHOD_ACTION[name]
        : undefined
      if (action === undefined) return full

      // strip existing RequirePermissions lines
      let dec = decorators.replace(/^[ \t]*@RequirePermissions\([^)]*\)\r?\n/gm, '')
      if (action) {
        // insert RequirePermissions after UseGuards if present, else at start of block end
        const indentMatch = decorators.match(/^[ \t]*/m)
        const indent = indentMatch ? indentMatch[0] : '  '
        const line = `${indent}@RequirePermissions('${resource}:${action}')\n`
        if (/@UseGuards\(/.test(dec)) {
          dec = dec.replace(/(@UseGuards\([^\)]*\)\r?\n)/, `$1${line}`)
        } else if (/@Roles\(/.test(dec)) {
          dec = dec.replace(/(@Roles\([^\)]*\)\r?\n)/, `${line}$1`)
        } else {
          // before first Api* or at end
          dec = line + dec
        }
      }
      return dec + sig
    })

    fs.writeFileSync(fp, src, 'utf8')
    console.log('fixed:', path.relative(srcRoot, fp))
  }
}
console.log('done')
