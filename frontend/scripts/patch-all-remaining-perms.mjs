/**
 * 1) DepositDeductionListView -> depositDeductions
 * 2) 系统/配置页接入 useResourcePermissions，并去掉 router requiresAdmin
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'src')

function patchListView(rel, resource) {
  const fp = path.join(root, 'views', rel)
  if (!fs.existsSync(fp)) {
    console.log('missing', rel)
    return
  }
  let s = fs.readFileSync(fp, 'utf8')
  if (s.includes('useResourcePermissions')) {
    // still replace leftover isAdmin if any
  } else {
    if (s.includes("from '@/stores/user'")) {
      s = s.replace(
        "from '@/stores/user'",
        "from '@/stores/user'\nimport { useResourcePermissions } from '@/composables/useResourcePermissions'",
      )
    } else {
      s =
        `import { useResourcePermissions } from '@/composables/useResourcePermissions'\n` + s
    }
  }

  if (s.includes('const isAdmin = computed(() => userStore.isAdmin)')) {
    s = s.replace(
      'const isAdmin = computed(() => userStore.isAdmin)',
      `const perms = useResourcePermissions('${resource}')`,
    )
  } else if (!s.includes('useResourcePermissions(')) {
    // insert after userStore / isMobile
    if (s.includes('const userStore = useUserStore()')) {
      s = s.replace(
        'const userStore = useUserStore()',
        `const userStore = useUserStore()\nconst perms = useResourcePermissions('${resource}')`,
      )
    } else {
      s = s.replace(
        /(<script setup[^>]*>\r?\n)/,
        `$1import { useResourcePermissions } from '@/composables/useResourcePermissions'\nconst perms = useResourcePermissions('${resource}')\n`,
      )
    }
  }

  s = s.replaceAll('if (!isAdmin.value || !selectedIds', 'if (!perms.batchDelete.value || !selectedIds')
  s = s.replace(/if \(!isAdmin\.value\) \{\r?\n\s*ElMessage\.warning\(t\([^)]*[Ii]mport/g, (m) =>
    m.replace('!isAdmin.value', '!perms.import.value'),
  )
  s = s.replaceAll('v-if="isAdmin"', 'v-if="perms.create"') // first pass create buttons often
  // refine common patterns
  s = s.replace(
    /<el-dropdown-item v-if="perms\.create" command="import">/g,
    '<el-dropdown-item v-if="perms.import" command="import">',
  )
  s = s.replace(
    /<template v-if="perms\.create" #batch>/g,
    '<template v-if="perms.batchDelete" #batch>',
  )
  s = s.replace(
    /<el-table-column\r?\n\s*v-if="perms\.create"\r?\n\s*:label="t\('common\.actions'\)"/g,
    `<el-table-column\n            v-if="perms.canEditOrDelete"\n            :label="t('common.actions')"`,
  )

  // system pages: gate primary create / edit / delete / batch without prior isAdmin
  if (!rel.includes('DepositDeduction') && !s.includes('v-if="perms.create"')) {
    s = s.replace(
      /<el-button\r?\n(\s*)type="primary"\r?\n(\s*):icon="Plus"/g,
      '<el-button\n$1v-if="perms.create"\n$1type="primary"\n$2:icon="Plus"',
    )
    s = s.replace(
      /<el-button type="primary" :icon="Plus"/g,
      '<el-button v-if="perms.create" type="primary" :icon="Plus"',
    )
  }

  // action pills
  s = s.replace(
    /<button type="button" class="action-pill action-pill--edit"/g,
    '<button v-if="perms.update" type="button" class="action-pill action-pill--edit"',
  )
  s = s.replace(
    /<button\r?\n(\s*)type="button"\r?\n(\s*)class="action-pill action-pill--edit"/g,
    '<button\n$1v-if="perms.update"\n$1type="button"\n$2class="action-pill action-pill--edit"',
  )
  s = s.replace(
    /<button type="button" class="action-pill action-pill--danger"/g,
    '<button v-if="perms.delete" type="button" class="action-pill action-pill--danger"',
  )
  s = s.replace(
    /<button\r?\n(\s*)type="button"\r?\n(\s*)class="action-pill action-pill--danger"/g,
    '<button\n$1v-if="perms.delete"\n$1type="button"\n$2class="action-pill action-pill--danger"',
  )
  // reset password / numbering reset -> update
  s = s.replace(
    /<button type="button" class="action-pill action-pill--key"/g,
    '<button v-if="perms.update" type="button" class="action-pill action-pill--key"',
  )
  s = s.replace(
    /<button type="button" class="action-pill action-pill--warn"/g,
    '<button v-if="perms.update" type="button" class="action-pill action-pill--warn"',
  )
  // role menus / permissions buttons
  s = s.replace(
    /@click="openMenus\(row\)"/g,
    'v-if="perms.update" @click="openMenus(row)"',
  )
  // avoid double v-if
  s = s.replace(/v-if="perms\.update" v-if="perms\.update"/g, 'v-if="perms.update"')

  // batch template if plain
  if (!s.includes('#batch') || s.includes('v-if="perms.batchDelete" #batch')) {
    // ok
  } else if (s.includes('<template #batch>')) {
    s = s.replace('<template #batch>', '<template v-if="perms.batchDelete" #batch>')
  }

  fs.writeFileSync(fp, s, 'utf8')
  console.log('view', rel, 'isAdmin left', (s.match(/isAdmin/g) || []).length)
}

const views = [
  ['finance-mgmt/DepositDeductionListView.vue', 'depositDeductions'],
  ['system/UserListView.vue', 'users'],
  ['system/RoleListView.vue', 'roles'],
  ['system/MenuListView.vue', 'menus'],
  ['system/RoomConfigListView.vue', 'roomConfigs'],
  ['system/RoomTypeListView.vue', 'roomTypes'],
  ['system/CustomerSourceListView.vue', 'customerSources'],
  ['system/DocumentTemplateListView.vue', 'documentTemplates'],
  ['system/AutoNumberingListView.vue', 'numberingRules'],
  ['contract-mgmt/ContractConfigListView.vue', 'contractConfigs'],
]

for (const [rel, resource] of views) patchListView(rel, resource)

// router: remove requiresAdmin
const routerFp = path.join(root, 'router', 'index.ts')
let router = fs.readFileSync(routerFp, 'utf8')
router = router.replace(/\r?\n\s*requiresAdmin:\s*true,/g, '')
router = router.replace(
  /\r?\n\s*if \(to\.meta\.requiresAdmin && !userStore\.isAdmin\) \{\r?\n\s*return \{ name: 'buildings' \}\r?\n\s*\}\r?\n/g,
  '\n',
)
fs.writeFileSync(routerFp, router, 'utf8')
console.log('router requiresAdmin removed')
