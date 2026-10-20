<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from '@element-plus/icons-vue'
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
  type PermissionModuleGroup,
} from '@/api/permissions'
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
const roleActionWidth = computed(() => {
  void locale.value
  return measureActionColWidth([
    t('common.edit'),
    t('role.menus'),
    t('role.permissions'),
    t('common.delete'),
  ])
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
} = useTableSortFilter<RoleRecord>()

const columnGetters = {
  code: (o: RoleRecord) => o.code,
  name: (o: RoleRecord) => o.name,
  sortOrder: (o: RoleRecord) => o.sortOrder,
  active: (o: RoleRecord) => String(o.active),
  menuCount: (o: RoleRecord) => o.menuCount,
  permissionCount: (o: RoleRecord) => o.permissionCount,
  createdAt: (o: RoleRecord) => o.createdAt,
}

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
  const key = node.nameKey?.trim()
  if (key && te(key)) return t(key)
  return node.name
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
const permsIsAdminRole = computed(() => permsTarget.value?.code === 'admin')
const permsSelectedCount = computed(() => checkedPermCodes.value.length)

async function openPermissions(row: RoleRecord) {
  permsTarget.value = row
  permsDrawerVisible.value = true
  permsLoading.value = true
  checkedPermCodes.value = []
  try {
    const [catalogRes, rolePermsRes] = await Promise.all([
      fetchPermissionCatalogApi(),
      fetchRolePermissionsApi(row.id),
    ])
    permsCatalog.value = catalogRes.data ?? []
    checkedPermCodes.value = rolePermsRes.data.codes ?? []
  } catch {
    /* interceptor */
  } finally {
    permsLoading.value = false
  }
}

function selectAllPerms() {
  checkedPermCodes.value = permsCatalog.value.flatMap((g) => g.items.map((i) => i.code))
}

function clearAllPerms() {
  checkedPermCodes.value = []
}

function selectModulePerms(group: PermissionModuleGroup) {
  const codes = group.items.map((i) => i.code)
  checkedPermCodes.value = [...new Set([...checkedPermCodes.value, ...codes])]
}

async function savePermissions() {
  const row = permsTarget.value
  if (!row || permsIsAdminRole.value) return
  permsSaving.value = true
  try {
    await assignRolePermissionsApi(row.id, checkedPermCodes.value)
    ElMessage.success(t('role.permissionsUpdated'))
    permsDrawerVisible.value = false
    await loadList()
    // 刷新本人权限；admin 同时刷新「仅管理员拥有」列表以更新发光描边
    if (userStore.isAdmin || userStore.role === row.code) {
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
          :key="tableLayoutKey"
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
                sortable
                :sort-order="sortOrderOf('code')"
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
                sortable
                :sort-order="sortOrderOf('name')"
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
                sortable
                :sort-order="sortOrderOf('sortOrder')"
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
                sortable
                :sort-order="sortOrderOf('menuCount')"
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
                sortable
                :sort-order="sortOrderOf('permissionCount')"
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
            prop="createdBy"
            :label="t('common.createdBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
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
                :sort-order="sortOrderOf('createdAt')"
                :date-range-value="dateRangeOf('createdAt')"
                @update:sort-order="(v) => setSort('createdAt', v)"
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
        <AuditDetailSection v-if="editing" :record="editing" />
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
        <p v-if="permsIsAdminRole" class="perms-admin-hint">{{ t('role.permissionsAdminHint') }}</p>
        <div class="menus-toolbar">
          <span class="menus-selected">{{ t('role.permissionsSelected', { n: permsSelectedCount }) }}</span>
          <div class="menus-toolbar-actions">
            <button
              type="button"
              class="menus-text-btn"
              :disabled="permsLoading || permsIsAdminRole"
              @click="selectAllPerms"
            >
              {{ t('role.permissionsSelectAll') }}
            </button>
            <button
              type="button"
              class="menus-text-btn"
              :disabled="permsLoading || permsIsAdminRole"
              @click="clearAllPerms"
            >
              {{ t('role.permissionsClear') }}
            </button>
          </div>
        </div>
        <div v-loading="permsLoading" class="perms-list-wrap">
          <div v-for="group in permsCatalog" :key="group.module" class="perms-module">
            <div class="perms-module-head">
              <span class="perms-module-name">{{ group.moduleName }}</span>
              <button
                type="button"
                class="menus-text-btn"
                :disabled="permsIsAdminRole"
                @click="selectModulePerms(group)"
              >
                {{ t('role.permissionsModuleSelect') }}
              </button>
            </div>
            <el-checkbox-group v-model="checkedPermCodes" :disabled="permsIsAdminRole" class="perms-checks">
              <el-checkbox
                v-for="item in group.items"
                :key="item.code"
                class="perms-check"
                :class="{ 'is-on': checkedPermCodes.includes(item.code) }"
                :label="item.code"
              >
                {{ item.name }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
          <p v-if="!permsLoading && !permsCatalog.length" class="menus-empty">—</p>
        </div>
      </div>
      <template #footer>
        <div class="menus-drawer-footer">
          <el-button @click="permsDrawerVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button
            type="primary"
            class="lb-btn-primary"
            :loading="permsSaving"
            :disabled="permsIsAdminRole"
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
  left: 5px;
  top: 2px;
  width: 3px;
  height: 8px;
  border-width: 1.5px;
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
