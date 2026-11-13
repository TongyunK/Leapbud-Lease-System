<script setup lang="ts">
import { useResourcePermissions } from '@/composables/useResourcePermissions'
const perms = useResourcePermissions('users')
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { OfficeBuilding, Plus, QuestionFilled, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchBuildings } from '@/api/buildings'
import { fetchRoles } from '@/api/roles'
import {
  createUserApi,
  deleteUserApi,
  batchDeleteUsersApi,
  fetchUsers,
  updateUserApi,
} from '@/api/users'
import type { UserRecord, UserStatus } from '@/types/user'
import type { BuildingRecord } from '@/types/building'
import type { RoleRecord } from '@/types/role'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const isMobile = useIsMobile()
const useCards = computed(() => isMobile.value)
const { actionColW } = useActionColWidth()
const userActionColWidth = computed(() =>
  actionColW([
    perms.update && t('common.edit'),
    perms.update && t('user.resetPassword'),
    perms.delete && t('common.delete'),
  ]),
)
const { colW, codeColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const keyword = ref('')
const loading = ref(false)
const formVisible = ref(false)
const editing = ref<UserRecord | null>(null)

const list = ref<UserRecord[]>([])
const buildingOptions = ref<BuildingRecord[]>([])
const roleCatalog = ref<RoleRecord[]>([])

const statusOptions: UserStatus[] = ['active', 'disabled']
const DEFAULT_ROLE_CODE = 'user'

/** admin / superAdmin：默认可访问全部大厦，无需分配 */
function isAllBuildingsRole(role?: string | null) {
  const r = String(role || '')
    .trim()
    .toLowerCase()
  return r === 'admin' || r === 'superadmin'
}

function roleLabel(code: string) {
  const fromCatalog = roleCatalog.value.find((r) => r.code === code)?.name
  if (fromCatalog) return fromCatalog
  const fromList = list.value.find((u) => u.role === code)?.roleName
  return fromList || code
}

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
} = useTableSortFilter<UserRecord>()

const columnGetters = {
  account: (u: UserRecord) => u.account,
  displayName: (u: UserRecord) => u.displayName,
  role: (u: UserRecord) => u.role,
  status: (u: UserRecord) => u.status,
  lastLoginAt: (u: UserRecord) => u.lastLoginAt || '',
  updatedBy: (u: UserRecord) => u.updatedBy,
  updatedAt: (u: UserRecord) => u.updatedAt,
}

const accountFilterOptions = computed(() => uniqueOptions(list.value, (u) => u.account))
const displayNameFilterOptions = computed(() => uniqueOptions(list.value, (u) => u.displayName))
const roleFilterOptions = computed(() => {
  const codes = new Set<string>([
    ...roleCatalog.value.map((r) => r.code),
    ...list.value.map((u) => u.role),
  ])
  return [...codes].map((code) => ({ value: code, label: roleLabel(code) }))
})
const statusFilterOptions = computed(() =>
  statusOptions.map((s) => ({ value: s, label: t(`user.status.${s}`) })),
)
const updatedByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.updatedBy))

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = !q
    ? list.value
    : list.value.filter((u) =>
        [
          u.account,
          u.displayName,
          u.phone,
          u.email,
          u.role,
          u.roleName,
          u.status,
          ...(u.buildings || []).map((b) => b.name),
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
  return applySortFilter(base, columnGetters)
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([keyword, filters, dateRanges, sortKey, sortOrder], () => resetPage(), { deep: true })

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<UserRecord>()
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

watch([keyword, filters, dateRanges, sortKey, sortOrder], () => {
  clearSelection()
}, { deep: true })

async function onSelectAll() {
  if (selectAllLoading.value || total.value === 0) return
  selectAllLoading.value = true
  try {
    await selectRows(filtered.value)
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteUsersApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))
const buildingSelectRef = ref<{ $el?: HTMLElement } | null>(null)
const buildingTagLimit = ref(4)
let buildingSelectObserver: ResizeObserver | null = null

const form = reactive({
  account: '',
  password: '',
  displayName: '',
  role: DEFAULT_ROLE_CODE,
  status: 'active' as UserStatus,
  phone: '',
  email: '',
  buildingIds: [] as string[],
})

const formRoleOptions = computed(() => {
  const active = roleCatalog.value.filter((r) => r.active)
  if (!editing.value) return active
  const current = roleCatalog.value.find((r) => r.code === form.role)
  if (current && !current.active && !active.some((r) => r.code === current.code)) {
    return [current, ...active]
  }
  return active
})

function fitBuildingTags() {
  const root = buildingSelectRef.value?.$el
  if (!root) return
  const names = form.buildingIds.map(
    (id) => buildingOptions.value.find((b) => b.id === id)?.name || id,
  )
  if (!names.length) {
    buildingTagLimit.value = 1
    return
  }
  const available = Math.max(0, root.clientWidth - 40)
  const measure = document.createElement('span')
  measure.style.cssText =
    'position:absolute;left:-9999px;visibility:hidden;white-space:nowrap;font-size:12px;'
  document.body.appendChild(measure)
  const widths = names.map((name) => {
    measure.textContent = name
    return Math.ceil(measure.offsetWidth) + 40
  })
  measure.textContent = `+${names.length}`
  const plusWidth = Math.ceil(measure.offsetWidth) + 24
  measure.remove()

  let used = 0
  let count = 0
  for (let i = 0; i < widths.length; i += 1) {
    const hasMore = i < widths.length - 1
    const next = used + widths[i] + (hasMore ? plusWidth + 6 : 0)
    if (count > 0 && next > available) break
    used += widths[i] + 6
    count += 1
  }
  buildingTagLimit.value = Math.max(1, count)
}

watch(
  () => [formVisible.value, form.role, form.buildingIds.join('|')] as const,
  async ([open, role]) => {
    buildingSelectObserver?.disconnect()
    buildingSelectObserver = null
    if (!open || isAllBuildingsRole(role)) return
    await nextTick()
    fitBuildingTags()
    const el = buildingSelectRef.value?.$el
    if (!el || typeof ResizeObserver === 'undefined') return
    buildingSelectObserver = new ResizeObserver(() => fitBuildingTags())
    buildingSelectObserver.observe(el)
  },
)

onBeforeUnmount(() => buildingSelectObserver?.disconnect())

function buildingLabel(row: UserRecord) {
  if (isAllBuildingsRole(row.role)) return t('user.allBuildings')
  const names = (row.buildings || []).map((b) => b.name)
  return names.length ? names.join('、') : '—'
}

async function loadList() {
  loading.value = true
  try {
    const [usersRes, buildingsRes, rolesRes] = await Promise.all([
      fetchUsers(),
      fetchBuildings(),
      fetchRoles(),
    ])
    list.value = usersRes.data
    buildingOptions.value = (buildingsRes.data.items ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
    roleCatalog.value = (rolesRes.data ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
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
    account: '',
    password: '',
    displayName: '',
    role: roleCatalog.value.some((r) => r.code === DEFAULT_ROLE_CODE && r.active)
      ? DEFAULT_ROLE_CODE
      : formRoleOptions.value[0]?.code || DEFAULT_ROLE_CODE,
    status: 'active',
    phone: '',
    email: '',
    buildingIds: [],
  })
  formVisible.value = true
}

function openEdit(row: UserRecord) {
  editing.value = row
  Object.assign(form, {
    account: row.account,
    password: '',
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    phone: row.phone || '',
    email: row.email || '',
    buildingIds: [...(row.buildingIds || [])],
  })
  formVisible.value = true
}

async function saveForm() {
  if (!editing.value && !form.account.trim()) {
    ElMessage.warning(t('user.accountRequired'))
    return
  }
  if (!editing.value && form.password.length < 6) {
    ElMessage.warning(t('account.passwordTooShort'))
    return
  }

  try {
    if (editing.value) {
      const payload: Parameters<typeof updateUserApi>[1] = {
        displayName: form.displayName.trim() || form.account,
        role: form.role,
        status: form.status,
        phone: form.phone.trim(),
        email: form.email.trim(),
        buildingIds: isAllBuildingsRole(form.role) ? [] : [...form.buildingIds],
      }
      await updateUserApi(editing.value.id, payload)
      ElMessage.success(t('user.updated'))
    } else {
      await createUserApi({
        account: form.account.trim(),
        password: form.password,
        displayName: form.displayName.trim() || form.account.trim(),
        role: form.role,
        status: form.status,
        phone: form.phone.trim(),
        email: form.email.trim(),
        buildingIds: isAllBuildingsRole(form.role) ? [] : [...form.buildingIds],
      })
      ElMessage.success(t('user.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* axios interceptor shows error */
  }
}

const resetVisible = ref(false)
const resetTarget = ref<UserRecord | null>(null)
const resetForm = reactive({ password: '', confirm: '' })

function openReset(row: UserRecord) {
  resetTarget.value = row
  resetForm.password = ''
  resetForm.confirm = ''
  resetVisible.value = true
}

async function saveReset() {
  const row = resetTarget.value
  if (!row) return
  if (resetForm.password.length < 6) {
    ElMessage.warning(t('account.passwordTooShort'))
    return
  }
  if (resetForm.password !== resetForm.confirm) {
    ElMessage.warning(t('account.passwordMismatch'))
    return
  }
  try {
    await updateUserApi(row.id, { password: resetForm.password })
    ElMessage.success(t('user.passwordReset'))
    resetVisible.value = false
  } catch {
    /* axios interceptor shows error */
  }
}

async function toggleStatus(row: UserRecord) {
  if (row.account === 'admin') {
    ElMessage.warning(t('user.adminStatusProtected'))
    return
  }
  const next: UserStatus = row.status === 'active' ? 'disabled' : 'active'
  try {
    await updateUserApi(row.id, { status: next })
    row.status = next
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: UserRecord) {
  try {
    await ElMessageBox.confirm(t('user.deleteConfirm', { account: row.account }), t('common.deleteTitle'), {
      type: 'warning',
    })
    await deleteUserApi(row.id)
    ElMessage.success(t('user.deleted'))
    await loadList()
  } catch {
    /* cancel or error */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.users') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('user.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
        <el-button v-if="perms.create" v-admin-glow="perms.codes.create" type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('user.create') }}
        </el-button>
      </div>
    </div>

    <div v-if="!useCards" class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${userActionColWidth}`"
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
          <el-table-column type="index" :index="rowIndex" label="#" width="52" fixed="left" align="center" header-align="center" />
          <el-table-column
            prop="account"
            :min-width="codeColW(t('user.fields.account'), { interactive: true, samples: paged.map((r) => r.account) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('user.fields.account')"
                filterable
                sortable
                :options="accountFilterOptions"
                :model-value="filters.account || []"
                :sort-order="sortOrderOf('account')"
                @update:model-value="(v) => setFilter('account', v)"
                @update:sort-order="(v) => setSort('account', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="displayName"
            :min-width="colW(t('user.fields.displayName'), { interactive: true, contentMin: 152 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('user.fields.displayName')"
                filterable
                sortable
                :options="displayNameFilterOptions"
                :model-value="filters.displayName || []"
                :sort-order="sortOrderOf('displayName')"
                @update:model-value="(v) => setFilter('displayName', v)"
                @update:sort-order="(v) => setSort('displayName', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('user.fields.role'), { interactive: true, contentMin: 128 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('user.fields.role')"
                filterable
                sortable
                :options="roleFilterOptions"
                :model-value="filters.role || []"
                :sort-order="sortOrderOf('role')"
                @update:model-value="(v) => setFilter('role', v)"
                @update:sort-order="(v) => setSort('role', v)"
              />
            </template>
            <template #default="{ row }">{{ row.roleName || roleLabel(row.role) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('user.fields.buildings'), { contentMin: 160 })"
            :label="t('user.fields.buildings')"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ buildingLabel(row) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('user.fields.status'), { interactive: true, contentMin: 110 })"
            align="center"
            header-align="center"
            class-name="col-switch"
            label-class-name="col-switch"
          >
            <template #header>
              <TableColumnHeader
                :label="t('user.fields.status')"
                filterable
                sortable
                :options="statusFilterOptions"
                :model-value="filters.status || []"
                :sort-order="sortOrderOf('status')"
                @update:model-value="(v) => setFilter('status', v)"
                @update:sort-order="(v) => setSort('status', v)"
              />
            </template>
            <template #default="{ row }">
              <el-switch
                :model-value="row.status === 'active'"
                :disabled="row.account === 'admin'"
                @change="() => toggleStatus(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="phone"
            :label="t('user.fields.phone')"
            :min-width="colW(t('user.fields.phone'), { contentMin: 120 })"
          />
          <el-table-column
            prop="email"
            :label="t('user.fields.email')"
            :min-width="colW(t('user.fields.email'), { contentMin: 180 })"
          />
          <el-table-column
            prop="lastLoginAt"
            :width="datetimeColWidth"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #header>
              <TableColumnHeader
                :label="t('user.fields.lastLoginAt')"
                sortable
                date-range
                :model-value="filters.lastLoginAt || []"
                :sort-order="sortOrderOf('lastLoginAt')"
                :date-range-value="dateRangeOf('lastLoginAt')"
                @update:sort-order="(v) => setSort('lastLoginAt', v)"
                @update:model-value="(v) => setFilter('lastLoginAt', v)"
                @update:date-range-value="(v) => setDateRange('lastLoginAt', v)"
              />
            </template>
            <template #default="{ row }">{{ row.lastLoginAt || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedBy')"
                filterable
                sortable
                :options="updatedByFilterOptions"
                :model-value="filters.updatedBy || []"
                :sort-order="sortOrderOf('updatedBy')"
                @update:model-value="(v) => setFilter('updatedBy', v)"
                @update:sort-order="(v) => setSort('updatedBy', v)"
              />
            </template>
            <template #default="{ row }">{{ row.updatedBy || '—' }}</template>
          </el-table-column>
          <el-table-column prop="updatedAt" :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedAt')"
                sortable
                date-range
                :model-value="filters.updatedAt || []"
                :sort-order="sortOrderOf('updatedAt')"
                :date-range-value="dateRangeOf('updatedAt')"
                @update:sort-order="(v) => setSort('updatedAt', v)"
                @update:model-value="(v) => setFilter('updatedAt', v)"
                @update:date-range-value="(v) => setDateRange('updatedAt', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="userActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
                <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--key" @click="openReset(row)">
                  {{ t('user.resetPassword') }}
                </button>
                <button
                  v-if="perms.delete" v-admin-glow="perms.codes.delete"
                  type="button"
                  class="action-pill action-pill--danger"
                  :disabled="row.account === 'admin'"
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

    <div v-else class="data-cards" v-loading="loading">
      <article v-for="row in paged" :key="row.id" class="data-card">
        <div class="data-card__head">
          <div>
            <h3 class="data-card__title">{{ row.displayName || row.account }}</h3>
            <p class="data-card__meta">{{ row.account }} · {{ row.roleName || roleLabel(row.role) }} · {{ buildingLabel(row) }}</p>
          </div>
          <el-switch
            :model-value="row.status === 'active'"
            :disabled="row.account === 'admin'"
            @change="() => toggleStatus(row)"
          />
        </div>
        <dl class="data-card__grid">
          <div>
            <dt>{{ t('user.fields.phone') }}</dt>
            <dd>{{ row.phone || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('user.fields.email') }}</dt>
            <dd>{{ row.email || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.updatedBy') }}</dt>
            <dd>{{ row.updatedBy || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('user.fields.lastLoginAt') }}</dt>
            <dd>{{ row.lastLoginAt || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.updatedAt') }}</dt>
            <dd>{{ row.updatedAt || '—' }}</dd>
          </div>
        </dl>
        <div class="data-card__actions action-pills">
          <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
            {{ t('common.edit') }}
          </button>
          <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--key" @click="openReset(row)">
            {{ t('user.resetPassword') }}
          </button>
          <button
            v-if="perms.delete" v-admin-glow="perms.codes.delete"
            type="button"
            class="action-pill action-pill--danger"
            :disabled="row.account === 'admin'"
            @click="onDelete(row)"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </article>
      <div v-if="filtered.length" class="table-pagination cards-pagination">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('user.edit') : t('user.create')"
      :width="dialogWidth"
      align-center
      destroy-on-close
      class="user-form-dialog"
    >
      <el-form label-position="top" class="user-form">
        <div class="form-grid">
          <el-form-item :label="t('user.fields.account')" required>
            <el-input v-model="form.account" :disabled="Boolean(editing)" />
          </el-form-item>
          <el-form-item :label="t('user.fields.displayName')">
            <el-input v-model="form.displayName" />
          </el-form-item>
          <el-form-item :label="t('user.fields.role')">
            <el-select v-model="form.role" style="width: 100%" filterable>
              <el-option
                v-for="r in formRoleOptions"
                :key="r.code"
                :label="r.name"
                :value="r.code"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('user.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option v-for="s in statusOptions" :key="s" :label="t(`user.status.${s}`)" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('user.fields.phone')">
            <el-input v-model="form.phone" />
          </el-form-item>
          <el-form-item :label="t('user.fields.email')">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item v-if="!editing" class="span-2" :label="t('user.fields.password')" required>
            <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item class="span-2">
            <template #label>
              <span class="form-label-with-tip">
                {{ t('user.fields.buildings') }}
                <el-tooltip
                  v-if="!isAllBuildingsRole(form.role)"
                  :content="t('user.buildingsHint')"
                  placement="top"
                >
                  <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <p v-if="isAllBuildingsRole(form.role)" class="form-hint">{{ t('user.buildingsAdminHint') }}</p>
            <el-select
              v-else
              ref="buildingSelectRef"
              v-model="form.buildingIds"
              class="user-building-select"
              popper-class="user-building-popper"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              :max-collapse-tags="buildingTagLimit"
              style="width: 100%"
            >
              <el-option v-for="b in buildingOptions" :key="b.id" :label="b.name" :value="b.id">
                <span class="user-building-option">
                  <el-icon><OfficeBuilding /></el-icon>
                  <span>{{ b.name }}</span>
                </span>
              </el-option>
            </el-select>
          </el-form-item>
        </div>
        <AuditDetailSection
          v-if="editing"
          :created-by="editing.createdBy"
          :created-at="editing.createdAt"
          :updated-by="editing.updatedBy"
          :updated-at="editing.updatedAt"
        />
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">{{ t('common.save') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="resetVisible"
      :title="t('user.resetPasswordTitle')"
      :width="isMobile ? '94%' : '420px'"
      align-center
      destroy-on-close
    >
      <p class="form-hint reset-hint">{{ t('user.resetPasswordHint', { account: resetTarget?.account || '' }) }}</p>
      <el-form label-position="top">
        <el-form-item :label="t('account.newPassword')" required>
          <el-input v-model="resetForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item :label="t('account.confirmPassword')" required>
          <el-input v-model="resetForm.confirm" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="resetVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveReset">{{ t('common.save') }}</el-button>
        </div>
      </template>
    </el-dialog>

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
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.form-grid .span-2 {
  grid-column: 1 / -1;
}

.user-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.reset-hint {
  margin: 0 0 12px;
}

.form-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form-label-tip {
  color: var(--lb-muted, #6a7a70);
  cursor: help;
  vertical-align: middle;
  flex-shrink: 0;
}

.form-hint {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--lb-muted, #6a7a70);
}

.user-building-select :deep(.el-tag) {
  border-radius: 999px;
  height: 24px;
  padding: 0 8px;
  background: #e4efe9;
  border-color: #c9ddd2;
  color: #0f4a32;
  --el-tag-bg-color: #e4efe9;
  --el-tag-border-color: #c9ddd2;
  --el-tag-text-color: #0f4a32;
  --el-tag-hover-color: #0f4a32;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-grid .span-2 {
    grid-column: auto;
  }
}
</style>
