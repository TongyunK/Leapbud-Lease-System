<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ElTree } from 'element-plus'
import { resolveMenuIcon } from '@/utils/menuIcons'
import {
  assignRoleMenusApi,
  createRoleApi,
  deleteRoleApi,
  batchDeleteRolesApi,
  fetchRoleMenusApi,
  fetchRoles,
  updateRoleApi,
} from '@/api/roles'
import {
  assignRolePermissionsApi,
  fetchPermissionCatalogApi,
  fetchRolePermissionsApi,
  type PermissionItem,
  type PermissionModuleGroup,
} from '@/api/permissions'
import { permissionItemLabel, permissionModuleLabel } from '@/utils/permissionLabel'
import { menuDisplayName } from '@/utils/menuLabel'
import { fetchMenus } from '@/api/menus'
import type { RoleRecord } from '@/types/role'
import type { MenuRecord } from '@/types/menu'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { measureActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { useNavStore } from '@/stores/nav'

const { t, te, locale } = useI18n()
const isMobile = useIsMobile()
const navStore = useNavStore()
const userStore = useUserStore()
const perms = useResourcePermissions('roles')
const { colW, codeColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

function permLabel(item: PermissionItem) {
  void locale.value
  return permissionItemLabel(item, t, te)
}

const roleActionWidth = computed(() => {
  void locale.value
  const labels: string[] = []
  if (perms.update) {
    labels.push(t('common.edit'), t('role.menus'), t('role.permissions'))
  }
  if (perms.delete) labels.push(t('common.delete'))
  return measureActionColWidth(labels)
})

const loading = ref(false)
const formVisible = ref(false)
const editing = ref<RoleRecord | null>(null)
const list = ref<RoleRecord[]>([])

const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  dateRanges,
  sortOrderOf,
  activeConditionCount,
  clearAll,
  apply: applySortFilter,
  sortKey,
  sortOrder,
  uniqueOptions,
} = useTableSortFilter<RoleRecord>()

const columnGetters = {
  code: (o: RoleRecord) => o.code,
  name: (o: RoleRecord) => o.name,
  sortOrder: (o: RoleRecord) => o.sortOrder,
  active: (o: RoleRecord) => String(o.active),
  menuCount: (o: RoleRecord) => o.menuCount,
  permissionCount: (o: RoleRecord) => o.permissionCount,
  createdBy: (o: RoleRecord) => o.createdBy,
  createdAt: (o: RoleRecord) => o.createdAt,
}

const codeFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.code))
const nameFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.name))
const sortOrderFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.sortOrder))
const menuCountFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.menuCount))
const permissionCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (o) => o.permissionCount),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))
const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const sorted = computed(() => {
  const applied = applySortFilter(list.value, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  }
  return applied
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(sorted)

watch([filters, dateRanges, sortKey, sortOrder], () => resetPage(), { deep: true })

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<RoleRecord>()
const batchDeleting = ref(false)
const selectAllLoading = ref(false)
const {
  state: batchState,
  percentage: batchPercentage,
  begin: beginBatch,
  setProgress: setBatchProgress,
  finish: finishBatch,
  close: closeBatch,
} = useBatchProgress()

watch([filters, dateRanges, sortKey, sortOrder], () => {
  clearSelection()
}, { deep: true })

async function onSelectAll() {
  if (selectAllLoading.value || total.value === 0) return
  selectAllLoading.value = true
  try {
    await selectRows(sorted.value)
  } finally {
    selectAllLoading.value = false
  }
}

async function onBatchDelete() {
  if (!selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(
      t('common.batchDeleteConfirm', { n: selectedIds.value.length }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  const ids = [...selectedIds.value]
  batchDeleting.value = true
  beginBatch(ids.length)
  try {
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteRolesApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '520px'))

const form = reactive({
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  active: true,
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchRoles()
    list.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

function openCreate() {
  editing.value = null
  Object.assign(form, {
    code: '',
    name: '',
    description: '',
    sortOrder: (sorted.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: RoleRecord) {
  editing.value = row
  Object.assign(form, {
    code: row.code,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.warning(t('role.codeNameRequired'))
    return
  }
  try {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (editing.value) {
      await updateRoleApi(editing.value.id, payload)
      ElMessage.success(t('role.updated'))
    } else {
      await createRoleApi(payload)
      ElMessage.success(t('role.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: RoleRecord) {
  if (row.isSystem) {
    ElMessage.warning(t('role.systemProtected'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('role.deleteConfirm', { name: row.name }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteRoleApi(row.id)
    ElMessage.success(t('role.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: RoleRecord) {
  try {
    await updateRoleApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}

const menusDrawerVisible = ref(false)
const menusLoading = ref(false)
const menusSaving = ref(false)
const menusTarget = ref<RoleRecord | null>(null)
const menuTree = ref<MenuRecord[]>([])
const checkedMenuIds = ref<string[]>([])
const menuTreeRef = ref<InstanceType<typeof ElTree> | null>(null)

function menuLabel(node: MenuRecord) {
  void locale.value
  return menuDisplayName(node, locale.value, t, te)
}

function collectMenuIds(nodes: MenuRecord[]): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    ids.push(n.id)
    if (n.children?.length) ids.push(...collectMenuIds(n.children))
  }
  return ids
}

const menusSelectedCount = computed(() => {
  const all = new Set(collectMenuIds(menuTree.value))
  return checkedMenuIds.value.filter((id) => all.has(id)).length
})

function selectAllMenus() {
  const ids = collectMenuIds(menuTree.value)
  menuTreeRef.value?.setCheckedKeys(ids)
  checkedMenuIds.value = ids
}

function clearAllMenus() {
  menuTreeRef.value?.setCheckedKeys([])
  checkedMenuIds.value = []
}

async function openMenus(row: RoleRecord) {
  menusTarget.value = row
  menusDrawerVisible.value = true
  menusLoading.value = true
  checkedMenuIds.value = []
  try {
    const [menusRes, roleMenusRes] = await Promise.all([
      fetchMenus({ flat: false }),
      fetchRoleMenusApi(row.id),
    ])
    menuTree.value = menusRes.data ?? []
    checkedMenuIds.value = roleMenusRes.data.menuIds ?? []
    await nextTick()
    menuTreeRef.value?.setCheckedKeys(checkedMenuIds.value)
  } catch {
    /* interceptor */
  } finally {
    menusLoading.value = false
  }
}

function onMenusCheck() {
  const tree = menuTreeRef.value
  if (!tree) return
  const checked = tree.getCheckedKeys(false) as string[]
  const half = tree.getHalfCheckedKeys() as string[]
  checkedMenuIds.value = [...new Set([...checked, ...half])]
}

async function saveMenus() {
  const row = menusTarget.value
  if (!row) return
  onMenusCheck()
  menusSaving.value = true
  try {
    await assignRoleMenusApi(row.id, checkedMenuIds.value)
    ElMessage.success(t('role.menusUpdated'))
    menusDrawerVisible.value = false
    await loadList()
    void navStore.loadNav()
  } catch {
    /* interceptor */
  } finally {
    menusSaving.value = false
  }
}

const permsDrawerVisible = ref(false)
const permsTarget = ref<RoleRecord | null>(null)
const permsLoading = ref(false)
const permsSaving = ref(false)
const permsCatalog = ref<PermissionModuleGroup[]>([])
const checkedPermCodes = ref<string[]>([])
const permsKeyword = ref('')
/** 超级管理员角色：始终全权限，不可改 */
const permsIsSuperAdminRole = computed(
  () => String(permsTarget.value?.code || '').trim().toLowerCase() === 'superadmin',
)
/** 管理员角色：仅超级管理员可配置其功能权限 */
const permsIsAdminRole = computed(() => permsTarget.value?.code === 'admin')
const permsReadOnly = computed(
  () => permsIsSuperAdminRole.value || (permsIsAdminRole.value && !userStore.isSuperAdmin),
)
const permsSelectedCount = computed(() => checkedPermCodes.value.length)

/** 非超管：目录再与本人权限求交，搜索／勾选范围与登录用户可见范围一致 */
function scopeCatalogByActor(catalog: PermissionModuleGroup[]): PermissionModuleGroup[] {
  if (userStore.isSuperAdmin) return catalog
  const allow = new Set(userStore.permissions)
  return catalog
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => allow.has(i.code)),
    }))
    .filter((g) => g.items.length > 0)
}

const scopedPermsCatalog = computed(() => scopeCatalogByActor(permsCatalog.value))

const filteredPermsCatalog = computed(() => {
  const q = permsKeyword.value.trim().toLowerCase()
  const base = scopedPermsCatalog.value
  if (!q) return base
  const out: PermissionModuleGroup[] = []
  for (const group of base) {
    const moduleLabel = permissionModuleLabel(group.module, t, te, group.moduleName).toLowerCase()
    const moduleHit =
      moduleLabel.includes(q) ||
      String(group.module || '')
        .toLowerCase()
        .includes(q) ||
      String(group.moduleName || '')
        .toLowerCase()
        .includes(q)
    const items = moduleHit
      ? group.items
      : group.items.filter((item) => {
          const label = permLabel(item).toLowerCase()
          return (
            label.includes(q) ||
            item.code.toLowerCase().includes(q) ||
            String(item.action || '')
              .toLowerCase()
              .includes(q) ||
            String(item.name || '')
              .toLowerCase()
              .includes(q)
          )
        })
    if (items.length) out.push({ ...group, items })
  }
  return out
})

async function openPermissions(row: RoleRecord) {
  permsTarget.value = row
  permsDrawerVisible.value = true
  permsLoading.value = true
  permsKeyword.value = ''
  checkedPermCodes.value = []
  try {
    // 先刷新本人权限，保证目录／搜索可见范围与当前登录态一致
    await userStore.loadPermissions()
    const [catalogRes, rolePermsRes] = await Promise.all([
      fetchPermissionCatalogApi(),
      fetchRolePermissionsApi(row.id),
    ])
    const catalog = scopeCatalogByActor(
      (catalogRes.data ?? []).filter((g) => (g.items?.length ?? 0) > 0),
    )
    permsCatalog.value = catalog
    const allowed = new Set(catalog.flatMap((g) => g.items.map((i) => i.code)))
    // 仅勾选本人可见项；操作者没有的码不展示，保存时由后端保留
    checkedPermCodes.value = (rolePermsRes.data.codes ?? []).filter((c) => allowed.has(c))
  } catch {
    /* interceptor */
  } finally {
    permsLoading.value = false
  }
}

function selectAllPerms() {
  const visible = filteredPermsCatalog.value.flatMap((g) => g.items.map((i) => i.code))
  checkedPermCodes.value = [...new Set([...checkedPermCodes.value, ...visible])]
}

function clearAllPerms() {
  checkedPermCodes.value = []
}

function selectModulePerms(group: PermissionModuleGroup) {
  const allow = userStore.isSuperAdmin
    ? null
    : new Set(userStore.permissions)
  const codes = group.items
    .map((i) => i.code)
    .filter((c) => !allow || allow.has(c))
  checkedPermCodes.value = [...new Set([...checkedPermCodes.value, ...codes])]
}

async function savePermissions() {
  const row = permsTarget.value
  if (!row || permsReadOnly.value) return
  permsSaving.value = true
  try {
    await assignRolePermissionsApi(row.id, checkedPermCodes.value)
    ElMessage.success(t('role.permissionsUpdated'))
    permsDrawerVisible.value = false
    await loadList()
    // 刷新本人权限；超级管理员同时刷新「仅超管拥有」列表以更新发光描边
    if (userStore.isSuperAdmin || userStore.isAdmin || userStore.role === row.code) {
      void userStore.loadPermissions()
    }
  } catch {
    /* interceptor */
  } finally {
    permsSaving.value = false
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.roles') }}</h2>
      <div class="head-actions">
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
        <el-button v-if="perms.create" v-admin-glow="perms.codes.create" type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('role.create') }}
        </el-button>
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${roleActionWidth}`"
          :data="paged"
          row-key="id"
          height="100%"
          stripe
          border
          style="width: 100%"
          @selection-change="onSelectionChange"
        >
          <el-table-column
            type="selection"
            width="48"
            fixed="left"
            align="center"
            header-align="center"
            reserve-selection
          />
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="52"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column
            :min-width="codeColW(t('role.fields.code'), { interactive: true, samples: paged.map((r) => r.code) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.code')"
                filterable
                sortable
                :options="codeFilterOptions"
                :model-value="filters.code || []"
                :sort-order="sortOrderOf('code')"
                @update:model-value="(v) => setFilter('code', v)"
                @update:sort-order="(v) => setSort('code', v)"
              />
            </template>
            <template #default="{ row }">{{ row.code }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('role.fields.name'), { interactive: true, contentMin: 140 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.name')"
                filterable
                sortable
                :options="nameFilterOptions"
                :model-value="filters.name || []"
                :sort-order="sortOrderOf('name')"
                @update:model-value="(v) => setFilter('name', v)"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
            <template #default="{ row }">{{ row.name }}</template>
          </el-table-column>
          <el-table-column
            prop="description"
            :label="t('role.fields.description')"
            :min-width="colW(t('role.fields.description'), { contentMin: 180 })"
            show-overflow-tooltip
          />
          <el-table-column
            prop="sortOrder"
            :min-width="colW(t('role.fields.sortOrder'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.sortOrder')"
                filterable
                sortable
                :options="sortOrderFilterOptions"
                :model-value="filters.sortOrder || []"
                :sort-order="sortOrderOf('sortOrder')"
                @update:model-value="(v) => setFilter('sortOrder', v)"
                @update:sort-order="(v) => setSort('sortOrder', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('role.fields.menuCount'), { interactive: true, contentMin: 100 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.menuCount')"
                filterable
                sortable
                :options="menuCountFilterOptions"
                :model-value="filters.menuCount || []"
                :sort-order="sortOrderOf('menuCount')"
                @update:model-value="(v) => setFilter('menuCount', v)"
                @update:sort-order="(v) => setSort('menuCount', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="perms.update"
                type="button"
                class="menu-count-link"
                @click="openMenus(row)"
              >
                {{ row.menuCount }}
              </button>
              <span v-else>{{ row.menuCount }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('role.fields.permissionCount'), { interactive: true, contentMin: 100 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.permissionCount')"
                filterable
                sortable
                :options="permissionCountFilterOptions"
                :model-value="filters.permissionCount || []"
                :sort-order="sortOrderOf('permissionCount')"
                @update:model-value="(v) => setFilter('permissionCount', v)"
                @update:sort-order="(v) => setSort('permissionCount', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="perms.update"
                type="button"
                class="menu-count-link"
                @click="openPermissions(row)"
              >
                {{ row.permissionCount }}
              </button>
              <span v-else>{{ row.permissionCount }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('role.fields.active'), { interactive: true, contentMin: 110 })"
            align="center"
            header-align="center"
            class-name="col-switch"
            label-class-name="col-switch"
          >
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.active')"
                filterable
                :options="activeFilterOptions"
                :model-value="filters.active || []"
                @update:model-value="(v) => setFilter('active', v)"
              />
            </template>
            <template #default="{ row }">
              <el-switch :model-value="row.active" @change="() => toggleActive(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.createdBy')"
                filterable
                sortable
                :options="createdByFilterOptions"
                :model-value="filters.createdBy || []"
                :sort-order="sortOrderOf('createdBy')"
                @update:model-value="(v) => setFilter('createdBy', v)"
                @update:sort-order="(v) => setSort('createdBy', v)"
              />
            </template>
            <template #default="{ row }">{{ row.createdBy || '—' }}</template>
          </el-table-column>
          <el-table-column
            prop="createdAt"
            :width="datetimeColWidth"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.createdAt')"
                sortable
                date-range
                :model-value="filters.createdAt || []"
                :sort-order="sortOrderOf('createdAt')"
                :date-range-value="dateRangeOf('createdAt')"
                @update:sort-order="(v) => setSort('createdAt', v)"
                @update:model-value="(v) => setFilter('createdAt', v)"
                @update:date-range-value="(v) => setDateRange('createdAt', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="roleActionWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
                <button type="button" class="action-pill action-pill--view" v-if="perms.update" v-admin-glow="perms.codes.update" @click="openMenus(row)">
                  {{ t('role.menus') }}
                </button>
                <button
                  v-if="perms.update" v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--view"
                  @click="openPermissions(row)"
                >
                  {{ t('role.permissions') }}
                </button>
                <button
                  v-if="perms.delete" v-admin-glow="perms.codes.delete"
                  type="button"
                  class="action-pill action-pill--danger"
                  :disabled="row.isSystem"
                  @click="onDelete(row)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="table-pagination">
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="pageSizes"
          :selected-count="selectedCount"
          enable-select-all
          :select-all-loading="selectAllLoading"
          @select-all="onSelectAll"
          @clear-selection="clearSelection"
        >
          <template v-if="perms.batchDelete" #batch>
            <button
              v-admin-glow="perms.codes.batchDelete"
              type="button"
              class="lb-pager__batch-btn"
              :disabled="batchDeleting || selectAllLoading"
              @click="onBatchDelete"
            >
              {{ t('common.batchDelete') }}
            </button>
          </template>
        </TablePagination>
      </div>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('role.edit') : t('role.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('role.fields.code')" required>
          <el-input v-model="form.code" :disabled="!!editing?.isSystem" />
        </el-form-item>
        <el-form-item :label="t('role.fields.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('role.fields.description')">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('role.fields.sortOrder')">
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('role.fields.active')">
          <el-switch v-model="form.active" />
        </el-form-item>
        <AuditDetailSection
          v-if="editing"
          :created-by="editing.createdBy"
          :created-at="editing.createdAt"
          :updated-by="editing.updatedBy"
          :updated-at="editing.updatedAt"
        />
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" class="lb-btn-primary" @click="saveForm">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="menusDrawerVisible"
      :title="t('role.menusTitle', { name: menusTarget?.name || '' })"
      :size="isMobile ? '100%' : '460px'"
      destroy-on-close
      class="role-menus-drawer"
    >
      <div class="menus-drawer-body">
        <div class="menus-toolbar">
          <span class="menus-selected">{{ t('role.menusSelected', { n: menusSelectedCount }) }}</span>
          <div class="menus-toolbar-actions">
            <button type="button" class="menus-text-btn" :disabled="menusLoading" @click="selectAllMenus">
              {{ t('role.menusSelectAll') }}
            </button>
            <button type="button" class="menus-text-btn" :disabled="menusLoading" @click="clearAllMenus">
              {{ t('role.menusClear') }}
            </button>
          </div>
        </div>
        <div v-loading="menusLoading" class="menus-tree-wrap">
          <el-tree
            v-if="menuTree.length"
            ref="menuTreeRef"
            class="menus-tree"
            :data="menuTree"
            node-key="id"
            show-checkbox
            default-expand-all
            :props="{ label: 'name', children: 'children' }"
            :default-checked-keys="checkedMenuIds"
            @check="onMenusCheck"
          >
            <template #default="{ data }">
              <span class="menus-tree-node" :class="{ 'is-dir': data.type === 'directory' }">
                <el-icon class="menus-tree-icon" :size="15">
                  <component :is="resolveMenuIcon(data.icon)" />
                </el-icon>
                <span class="menus-tree-label">{{ menuLabel(data) }}</span>
                <span v-if="data.type === 'directory'" class="menus-type-tag">
                  {{ t('sysMenu.type.directory') }}
                </span>
              </span>
            </template>
          </el-tree>
          <p v-else-if="!menusLoading" class="menus-empty">—</p>
        </div>
      </div>
      <template #footer>
        <div class="menus-drawer-footer">
          <el-button @click="menusDrawerVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button
            type="primary"
            class="lb-btn-primary"
            :loading="menusSaving"
            @click="saveMenus"
          >
            {{ t('common.save') }}
          </el-button>
        </div>
      </template>
    </el-drawer>

    <el-drawer
      v-model="permsDrawerVisible"
      :title="t('role.permissionsTitle', { name: permsTarget?.name || '' })"
      :size="isMobile ? '100%' : '520px'"
      destroy-on-close
      class="role-perms-drawer"
    >
      <div class="menus-drawer-body">
        <p v-if="permsIsSuperAdminRole" class="perms-admin-hint">
          {{ t('role.permissionsSuperAdminHint') }}
        </p>
        <p v-else-if="permsIsAdminRole && !userStore.isSuperAdmin" class="perms-admin-hint">
          {{ t('role.permissionsAdminLockedHint') }}
        </p>
        <p v-else-if="permsIsAdminRole && userStore.isSuperAdmin" class="perms-admin-hint">
          {{ t('role.permissionsAdminEditableHint') }}
        </p>
        <p v-else-if="!userStore.isSuperAdmin && !permsReadOnly" class="perms-admin-hint">
          {{ t('role.permissionsAssignScopeHint') }}
        </p>
        <div class="perms-search">
          <el-input
            v-model="permsKeyword"
            clearable
            :prefix-icon="Search"
            :placeholder="t('role.permissionsSearchPlaceholder')"
            class="perms-search__input"
          />
        </div>
        <div class="menus-toolbar">
          <span class="menus-selected">{{ t('role.permissionsSelected', { n: permsSelectedCount }) }}</span>
          <div class="menus-toolbar-actions">
            <button
              type="button"
              class="menus-text-btn"
              :disabled="permsLoading || permsReadOnly"
              @click="selectAllPerms"
            >
              {{ t('role.permissionsSelectAll') }}
            </button>
            <button
              type="button"
              class="menus-text-btn"
              :disabled="permsLoading || permsReadOnly"
              @click="clearAllPerms"
            >
              {{ t('role.permissionsClear') }}
            </button>
          </div>
        </div>
        <div v-loading="permsLoading" class="perms-list-wrap">
          <div v-for="group in filteredPermsCatalog" :key="group.module" class="perms-module">
            <div class="perms-module-head">
              <span class="perms-module-name">
                {{ permissionModuleLabel(group.module, t, te, group.moduleName) }}
              </span>
              <button
                type="button"
                class="menus-text-btn"
                :disabled="permsReadOnly"
                @click="selectModulePerms(group)"
              >
                {{ t('role.permissionsModuleSelect') }}
              </button>
            </div>
            <el-checkbox-group v-model="checkedPermCodes" :disabled="permsReadOnly" class="perms-checks">
              <el-checkbox
                v-for="item in group.items"
                :key="item.code"
                class="perms-check"
                :class="{ 'is-on': checkedPermCodes.includes(item.code) }"
                :label="item.code"
              >
                {{ permLabel(item) }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
          <p v-if="!permsLoading && !filteredPermsCatalog.length" class="menus-empty">
            {{ permsKeyword.trim() ? t('role.permissionsSearchEmpty') : '—' }}
          </p>
        </div>
      </div>
      <template #footer>
        <div class="menus-drawer-footer">
          <el-button @click="permsDrawerVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button
            type="primary"
            class="lb-btn-primary"
            :loading="permsSaving"
            :disabled="permsReadOnly"
            @click="savePermissions"
          >
            {{ t('common.save') }}
          </el-button>
        </div>
      </template>
    </el-drawer>

    <BatchProgressDialog
      v-model="batchState.visible"
      :phase="batchState.phase"
      :total="batchState.total"
      :current="batchState.current"
      :percentage="batchPercentage"
      :ok="batchState.ok"
      :fail="batchState.fail"
      :result-tone="batchState.resultTone"
      @close="closeBatch"
    />
  </div>
</template>

<style scoped>
.perms-admin-hint {
  margin: 0 0 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #eef5f1;
  color: #3d4f45;
  font-size: 0.8rem;
  line-height: 1.45;
}

.perms-search {
  flex-shrink: 0;
  margin: 0 0 10px;
}

.perms-search__input {
  width: 100%;
}

.perms-search__input :deep(.el-input__wrapper) {
  min-height: 34px;
  padding-inline: 12px 10px;
  border-radius: 999px !important;
  background: #fafbfa !important;
  box-shadow: 0 0 0 1px #d7ded9 inset !important;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.perms-search__input :deep(.el-input__wrapper:hover) {
  background: #fff !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #d7ded9) inset !important;
}

.perms-search__input :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #d7ded9) inset,
    0 0 0 3px rgba(15, 74, 50, 0.1) !important;
}

.perms-search__input :deep(.el-input__inner) {
  color: #1a2a22;
  font-size: 0.86rem;
  font-weight: 500;
}

.perms-search__input :deep(.el-input__inner::placeholder) {
  color: #8a9a92;
}

.perms-search__input :deep(.el-input__prefix),
.perms-search__input :deep(.el-input__suffix) {
  color: #5a6b62;
}

.perms-list-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.perms-module {
  border: 1px solid #e2e8e5;
  border-radius: 12px;
  background: #fbfcfb;
  padding: 10px 12px 8px;
}

.perms-module-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.perms-module-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f4a32;
}

.perms-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.perms-checks :deep(.perms-check) {
  --el-checkbox-checked-bg-color: var(--lb-brand, #0f4a32);
  --el-checkbox-checked-input-border-color: var(--lb-brand, #0f4a32);
  --el-checkbox-input-border-color-hover: var(--lb-brand, #0f4a32);
  margin-right: 0;
  height: auto;
  padding: 5px 10px 5px 8px;
  border-radius: 999px;
  border: 1px solid #d7e2dc;
  background: #fff;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;
}

.perms-checks :deep(.perms-check:hover) {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #d7e2dc);
  background: #f4faf7;
}

.perms-checks :deep(.perms-check.is-on),
.perms-checks :deep(.perms-check.is-checked) {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 40%, #fff);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, transparent);
}

.perms-checks :deep(.perms-check .el-checkbox__label) {
  padding-left: 6px;
  color: #3d4f45;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
}

.perms-checks :deep(.perms-check.is-on .el-checkbox__label),
.perms-checks :deep(.perms-check.is-checked .el-checkbox__label) {
  color: var(--lb-brand, #0f4a32);
  font-weight: 700;
}

.perms-checks :deep(.perms-check .el-checkbox__inner) {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  border-color: #b7c7bd;
}

.perms-checks :deep(.perms-check .el-checkbox__inner::after) {
  box-sizing: content-box;
  width: 4px;
  height: 8px;
  left: 50%;
  top: 46%;
  border-width: 1.5px;
  transform: translate(-50%, -55%) rotate(45deg) scaleY(0);
  transform-origin: center;
}

.perms-checks :deep(.perms-check.is-checked .el-checkbox__inner::after),
.perms-checks :deep(.perms-check.is-on .el-checkbox__inner::after),
.perms-checks :deep(.perms-check .el-checkbox__input.is-checked .el-checkbox__inner::after) {
  transform: translate(-50%, -55%) rotate(45deg) scaleY(1);
}

.perms-checks :deep(.perms-check.is-checked .el-checkbox__inner),
.perms-checks :deep(.perms-check.is-on .el-checkbox__inner) {
  background-color: var(--lb-brand, #0f4a32);
  border-color: var(--lb-brand, #0f4a32);
  box-shadow: 0 0 0 3px rgba(15, 74, 50, 0.14);
}

.perms-checks :deep(.perms-check.is-disabled) {
  opacity: 0.72;
}

.menu-count-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--lb-brand, #0f4a32);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.menu-count-link:hover {
  color: #0c3d29;
}

.menus-drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.menus-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.menus-selected {
  font-size: 0.78rem;
  font-weight: 650;
  color: #0f4a32;
  background: #e4efe9;
  border-radius: 999px;
  padding: 3px 10px;
}

.menus-toolbar-actions {
  display: flex;
  gap: 4px;
}

.menus-text-btn {
  border: 0;
  background: transparent;
  color: #0f4a32;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.menus-text-btn:hover:not(:disabled) {
  background: #e4efe9;
}

.menus-text-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.menus-tree-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 6px 8px 4px;
  border: 1px solid #e2e8e5;
  border-radius: 12px;
  background: linear-gradient(180deg, #fbfcfb 0%, #f7faf8 100%);
}

.menus-tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-right: 4px;
}

.menus-tree-icon {
  flex-shrink: 0;
  color: #7a8f84;
}

.menus-tree-node.is-dir .menus-tree-icon {
  color: #0f4a32;
}

.menus-tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  color: #2a3d34;
}

.menus-tree-node.is-dir .menus-tree-label {
  font-weight: 700;
  color: #0f4a32;
}

.menus-type-tag {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 650;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  color: #0f4a32;
  background: #e4efe9;
  border: 1px solid #c9ddd2;
}

.menus-empty {
  margin: 36px 0;
  text-align: center;
  color: var(--lb-muted, #6a7a70);
}

.menus-drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

<style>
.role-perms-drawer.el-drawer,
.role-menus-drawer.el-drawer {
  --el-color-primary: #0f4a32;
  --el-checkbox-checked-bg-color: #0f4a32;
  --el-checkbox-checked-input-border-color: #0f4a32;
  --el-checkbox-input-border-color-hover: #0f4a32;
  display: flex;
  flex-direction: column;
}

.role-perms-drawer .el-drawer__header {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8e5;
}

.role-perms-drawer .el-drawer__title {
  color: #0f4a32;
  font-weight: 700;
}

.role-perms-drawer .el-drawer__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 4px;
  overflow: hidden;
}

.role-perms-drawer .el-drawer__footer {
  border-top: 1px solid #e2e8e5;
  padding-top: 12px;
}

.role-menus-drawer .el-drawer__header {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8e5;
}

.role-menus-drawer .el-drawer__title {
  color: #0f4a32;
  font-weight: 700;
}

.role-menus-drawer .el-drawer__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 4px;
  overflow: hidden;
}

.role-menus-drawer .el-drawer__footer {
  border-top: 1px solid #e2e8e5;
  padding-top: 12px;
}

.role-menus-drawer .menus-tree .el-tree-node__content {
  height: 36px;
  border-radius: 8px;
  margin: 1px 0;
  transition: background 0.15s ease;
}

.role-menus-drawer .menus-tree .el-tree-node__content:hover {
  background: #eef5f1;
}

.role-menus-drawer .menus-tree .el-tree-node.is-checked > .el-tree-node__content {
  background: rgba(15, 74, 50, 0.06);
}

.role-menus-drawer .menus-tree .el-tree-node__expand-icon {
  color: #8a9a92;
  font-size: 14px;
}

.role-menus-drawer .menus-tree .el-checkbox__inner {
  border-radius: 4px;
}
</style>
