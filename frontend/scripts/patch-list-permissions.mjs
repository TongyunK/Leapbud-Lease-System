/**
 * 将各业务列表页的 isAdmin 按钮门控替换为 useResourcePermissions。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const viewsRoot = path.join(__dirname, '..', 'src', 'views')

const FILES = [
  ['customer-mgmt/CustomerListView.vue', 'customers'],
  ['customer-mgmt/CustomerRequirementListView.vue', 'customerRequirements'],
  ['customer-mgmt/OccupantListView.vue', 'occupants'],
  ['room-mgmt/BuildingListView.vue', 'buildings'],
  ['room-mgmt/RoomListView.vue', 'rooms'],
  ['contract-mgmt/ContractListView.vue', 'contracts'],
  ['contract-mgmt/ContractPeriodListView.vue', 'contractPeriods'],
  ['contract-mgmt/LeaseTerminationListView.vue', 'leaseTerminations'],
  ['contract-mgmt/ContractOtherFeeListView.vue', 'contractOtherFees'],
  ['finance-mgmt/DepositRefundListView.vue', 'depositRefunds'],
  ['finance-mgmt/InvoiceListView.vue', 'invoices'],
  ['finance-mgmt/InvoiceServiceDetailListView.vue', 'invoiceServiceDetails'],
  ['finance-mgmt/ReceivableListView.vue', 'receivables'],
  ['finance-mgmt/ReceiptListView.vue', 'receipts'],
]

for (const [rel, resource] of FILES) {
  const fp = path.join(viewsRoot, rel)
  if (!fs.existsSync(fp)) {
    console.log('missing', rel)
    continue
  }
  let src = fs.readFileSync(fp, 'utf8')
  if (src.includes('useResourcePermissions')) {
    console.log('skip', rel)
    continue
  }

  // import
  if (!src.includes("from '@/composables/useResourcePermissions'")) {
    if (src.includes("from '@/stores/user'")) {
      src = src.replace(
        "from '@/stores/user'",
        "from '@/stores/user'\nimport { useResourcePermissions } from '@/composables/useResourcePermissions'",
      )
    } else {
      src = `import { useResourcePermissions } from '@/composables/useResourcePermissions'\n` + src
    }
  }

  // replace isAdmin computed
  src = src.replace(
    'const isAdmin = computed(() => userStore.isAdmin)',
    `const perms = useResourcePermissions('${resource}')`,
  )

  // script guards
  src = src.replace(/if \(!isAdmin\.value \|\| !selectedIds/g, 'if (!perms.batchDelete.value || !selectedIds')
  src = src.replace(/if \(!isAdmin\.value\) \{\s*\n\s*ElMessage\.warning\(t\([^)]*importAdminOnly/g, (m) =>
    m.replace('!isAdmin.value', '!perms.import.value'),
  )
  src = src.replace(/if \(!isAdmin\.value\) \{\s*\n\s*ElMessage\.warning\(t\([^)]*[Ii]mport/g, (m) =>
    m.replace('!isAdmin.value', '!perms.import.value'),
  )

  // common leftover isAdmin in script for create/edit dialogs
  src = src.replace(/if \(!editing\.value && !isAdmin\.value\)/g, 'if (!editing.value && !perms.create.value)')
  src = src.replace(/if \(!isAdmin\.value\) \{\s*\n\s*return\s*\n\s*\}/g, 'if (!perms.anyWrite.value) {\n    return\n  }')

  // template: create button (primary + Plus typically first isAdmin)
  // Use more specific replacements
  src = src.replace(
    /:width="isAdmin \? actionColWidth\.three : actionColWidth\.one"/g,
    ':width="perms.canEditOrDelete.value ? actionColWidth.three : actionColWidth.one"',
  )
  // Vue template shouldn't use .value - fix that
  src = src.replace(
    /:width="perms\.canEditOrDelete\.value \? actionColWidth\.three : actionColWidth\.one"/g,
    ':width="perms.canEditOrDelete ? actionColWidth.three : actionColWidth.one"',
  )

  // action pills
  src = src.replace(
    /(<button\n\s*v-if="isAdmin"\n\s*type="button"\n\s*class="action-pill action-pill--edit")/g,
    '<button\n                  v-if="perms.update"\n                  type="button"\n                  class="action-pill action-pill--edit"',
  )
  src = src.replace(
    /(<button\n\s*v-if="isAdmin"\n\s*type="button"\n\s*class="action-pill action-pill--danger")/g,
    '<button\n                  v-if="perms.delete"\n                  type="button"\n                  class="action-pill action-pill--danger"',
  )

  // batch slot
  src = src.replace(/<template v-if="isAdmin" #batch>/g, '<template v-if="perms.batchDelete" #batch>')

  // import dropdown
  src = src.replace(
    /<el-dropdown-item v-if="isAdmin" command="import">/g,
    '<el-dropdown-item v-if="perms.import" command="import">',
  )

  // create button - remaining v-if="isAdmin" on el-button with Plus / create
  src = src.replace(
    /<el-button\n\s*v-if="isAdmin"\n\s*type="primary"/g,
    '<el-button\n          v-if="perms.create"\n          type="primary"',
  )

  // any remaining isAdmin in template/script for this file
  const leftover = (src.match(/isAdmin/g) || []).length
  fs.writeFileSync(fp, src, 'utf8')
  console.log('patched', rel, 'leftover isAdmin=', leftover)
}
