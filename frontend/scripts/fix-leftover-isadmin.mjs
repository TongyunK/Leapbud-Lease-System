import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'src', 'views')

const files = [
  'contract-mgmt/ContractListView.vue',
  'contract-mgmt/ContractPeriodListView.vue',
  'contract-mgmt/LeaseTerminationListView.vue',
  'contract-mgmt/ContractOtherFeeListView.vue',
  'customer-mgmt/CustomerRequirementListView.vue',
  'customer-mgmt/OccupantListView.vue',
  'finance-mgmt/DepositRefundListView.vue',
  'finance-mgmt/InvoiceListView.vue',
  'finance-mgmt/InvoiceServiceDetailListView.vue',
  'finance-mgmt/ReceivableListView.vue',
  'finance-mgmt/ReceiptListView.vue',
]

for (const rel of files) {
  const fp = path.join(root, rel)
  let s = fs.readFileSync(fp, 'utf8')

  s = s.replaceAll('if (isAdmin.value)', 'if (perms.canEditOrDelete.value)')

  // openCreate / openEdit / onDelete guards
  s = s.replace(
    /function openCreate\(\) \{\r?\n  if \(!isAdmin\.value\) return/g,
    'function openCreate() {\n  if (!perms.create.value) return',
  )
  s = s.replace(
    /async function openEdit\(([^)]*)\) \{\r?\n  if \(!isAdmin\.value\) return/g,
    'async function openEdit($1) {\n  if (!perms.update.value) return',
  )
  s = s.replace(
    /function openEdit\(([^)]*)\) \{\r?\n  if \(!isAdmin\.value\) return/g,
    'function openEdit($1) {\n  if (!perms.update.value) return',
  )
  s = s.replace(
    /async function onDelete\(([^)]*)\) \{\r?\n  if \(!isAdmin\.value\) return/g,
    'async function onDelete($1) {\n  if (!perms.delete.value) return',
  )

  s = s.replaceAll('v-if="isAdmin"', 'v-if="perms.canEditOrDelete"')
  s = s.replaceAll('<template v-if="isAdmin">', '<template v-if="perms.canEditOrDelete">')

  fs.writeFileSync(fp, s, 'utf8')
  console.log(rel, 'left', (s.match(/isAdmin/g) || []).length)
}
