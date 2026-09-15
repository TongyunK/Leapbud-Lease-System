<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createUserApi,
  deleteUserApi,
  batchDeleteUsersApi,
  fetchUsers,
  updateUserApi,
} from '@/api/users'
import type { UserRecord, UserRole, UserStatus } from '@/types/user'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { userStatusTone } from '@/constants/statusBadges'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const isMobile = useIsMobile()
const useCards = computed(() => isMobile.value)
const { actionColWidth } = useActionColWidth()
const { colW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const keyword = ref('')
const loading = ref(false)
const formVisible = ref(false)
const editing = ref<UserRecord | null>(null)

const list = ref<UserRecord[]>([])

const roleOptions: UserRole[] = ['admin', 'user']
const statusOptions: UserStatus[] = ['active', 'disabled']
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
} = useTableSortFilter<UserRecord>()

const columnGetters = {
  account: (u: UserRecord) => u.account,
  displayName: (u: UserRecord) => u.displayName,
  role: (u: UserRecord) => u.role,
  status: (u: UserRecord) => u.status,
  createdBy: (u: UserRecord) => u.createdBy,
  createdAt: (u: UserRecord) => u.createdAt,
  updatedBy: (u: UserRecord) => u.updatedBy,
  updatedAt: (u: UserRecord) => u.updatedAt,
}

const roleFilterOptions = computed(() =>
  roleOptions.map((r) => ({ value: r, label: t(`user.role.${r}`) })),
)
const statusFilterOptions = computed(() =>
  statusOptions.map((s) => ({ value: s, label: t(`user.status.${s}`) })),
)

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = !q
    ? list.value
    : list.value.filter((u) =>
        [u.account, u.displayName, u.phone, u.email, u.role, u.status]
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

const dialogWidth = computed(() => (isMobile.value ? '94%' : '520px'))

const form = reactive({
  account: '',
  password: '',
  displayName: '',
  role: 'user' as UserRole,
  status: 'active' as UserStatus,
  phone: '',
  email: '',
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchUsers()
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
    account: '',
    password: '',
    displayName: '',
    role: 'user',
    status: 'active',
    phone: '',
    email: '',
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
  if (editing.value && form.password && form.password.length < 6) {
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
      }
      if (form.password) payload.password = form.password
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
      })
      ElMessage.success(t('user.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* axios interceptor shows error */
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
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('user.create') }}
        </el-button>
      </div>
    </div>

    <div v-if="!useCards" class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="tableLayoutKey"
          :data="paged"
          row-key="id"
          height="100%"
          stripe
          border
          empty-text="—"
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
                sortable
                :sort-order="sortOrderOf('account')"
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
                sortable
                :sort-order="sortOrderOf('displayName')"
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
            <template #default="{ row }">{{ t(`user.role.${row.role}`) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('user.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
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
              <StatusBadge :tone="userStatusTone(row.status)" :label="t(`user.status.${row.status}`)" />
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
            prop="createdBy"
            :label="t('common.createdBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
          <el-table-column prop="createdAt" :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
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
            prop="updatedBy"
            :label="t('common.updatedBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
          <el-table-column prop="updatedAt" :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedAt')"
                sortable
                date-range
                :sort-order="sortOrderOf('updatedAt')"
                :date-range-value="dateRangeOf('updatedAt')"
                @update:sort-order="(v) => setSort('updatedAt', v)"
                @update:date-range-value="(v) => setDateRange('updatedAt', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="actionColWidth.two"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
                <button
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
          <template #batch>
            <button
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
            <p class="data-card__meta">{{ row.account }} · {{ t(`user.role.${row.role}`) }}</p>
          </div>
          <StatusBadge :tone="userStatusTone(row.status)" :label="t(`user.status.${row.status}`)" />
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
            <dt>{{ t('common.createdBy') }}</dt>
            <dd>{{ row.createdBy || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.createdAt') }}</dt>
            <dd>{{ row.createdAt || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.updatedBy') }}</dt>
            <dd>{{ row.updatedBy || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.updatedAt') }}</dt>
            <dd>{{ row.updatedAt || '—' }}</dd>
          </div>
        </dl>
        <div class="data-card__actions action-pills">
          <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
            {{ t('common.edit') }}
          </button>
          <button
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
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('user.fields.account')" required>
          <el-input v-model="form.account" :disabled="Boolean(editing)" />
        </el-form-item>
        <el-form-item :label="editing ? t('user.fields.passwordOptional') : t('user.fields.password')" :required="!editing">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item :label="t('user.fields.displayName')">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item :label="t('user.fields.role')">
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="r in roleOptions" :key="r" :label="t(`user.role.${r}`)" :value="r" />
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
