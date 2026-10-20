<script setup lang="ts">
import { useResourcePermissions } from '@/composables/useResourcePermissions'
const perms = useResourcePermissions('contractConfigs')
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Calendar, House, Key, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createContractConfigApi,
  deleteContractConfigApi,
  batchDeleteContractConfigsApi,
  fetchContractConfigs,
  updateContractConfigApi,
} from '@/api/contract-configs'
import type { ContractConfigOption, ContractConfigType } from '@/types/contract-config'
import { KEY_DEPOSIT_CODES } from '@/types/contract-config'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const isMobile = useIsMobile()
const { actionColWidth } = useActionColWidth()
const { colW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const activeTab = ref<ContractConfigType>('periodType')
const loading = ref(false)
const formVisible = ref(false)
const editing = ref<ContractConfigOption | null>(null)
const list = ref<ContractConfigOption[]>([])

const tabMeta = [
  { type: 'periodType' as const, icon: Calendar },
  { type: 'leaseType' as const, icon: House },
  { type: 'keyDeposit' as const, icon: Key },
]

const PROTECTED_CODES = new Set<string>([KEY_DEPOSIT_CODES.door, KEY_DEPOSIT_CODES.mailbox])

function isProtectedCode(code: string) {
  return PROTECTED_CODES.has(code)
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
} = useTableSortFilter<ContractConfigOption>()

const columnGetters = {
  label: (o: ContractConfigOption) => o.label,
  code: (o: ContractConfigOption) => o.code,
  unitPrice: (o: ContractConfigOption) => o.unitPrice ?? -Infinity,
  sortOrder: (o: ContractConfigOption) => o.sortOrder,
  active: (o: ContractConfigOption) => String(o.active),
  createdAt: (o: ContractConfigOption) => o.createdAt,
  updatedAt: (o: ContractConfigOption) => o.updatedAt,
}

const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const tabCounts = computed(() => {
  const counts: Record<ContractConfigType, number> = { periodType: 0, leaseType: 0, keyDeposit: 0 }
  for (const o of list.value) counts[o.type] += 1
  return counts
})

const filtered = computed(() => {
  const base = list.value.filter((o) => o.type === activeTab.value)
  const applied = applySortFilter(base, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  }
  return applied
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([activeTab, filters, dateRanges, sortKey, sortOrder], () => resetPage(), { deep: true })

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ContractConfigOption>()
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

watch([activeTab, filters, dateRanges, sortKey, sortOrder], () => {
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteContractConfigsApi(chunk), setBatchProgress)
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
  label: '',
  unitPrice: undefined as number | undefined,
  sortOrder: 0,
  active: true,
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchContractConfigs({ activeOnly: false })
    list.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

watch(activeTab, () => {
  formVisible.value = false
  resetPage()
})

function openCreate() {
  editing.value = null
  Object.assign(form, {
    label: '',
    unitPrice: undefined,
    sortOrder: (filtered.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: ContractConfigOption) {
  editing.value = row
  Object.assign(form, {
    label: row.label,
    unitPrice: row.unitPrice ?? undefined,
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!form.label.trim()) {
    ElMessage.warning(t('contractConfig.labelRequired'))
    return
  }
  if (activeTab.value === 'keyDeposit') {
    if (form.unitPrice == null) {
      ElMessage.warning(t('contractConfig.unitPriceRequired'))
      return
    }
  }

  try {
    const payload = {
      label: form.label.trim(),
      unitPrice: activeTab.value === 'keyDeposit' ? (form.unitPrice ?? null) : null,
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (editing.value) {
      await updateContractConfigApi(editing.value.id, payload)
      ElMessage.success(t('contractConfig.updated'))
    } else {
      await createContractConfigApi({ type: activeTab.value, ...payload })
      ElMessage.success(t('contractConfig.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ContractConfigOption) {
  if (isProtectedCode(row.code)) return
  try {
    await ElMessageBox.confirm(
      t('contractConfig.deleteConfirm', { label: row.label }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteContractConfigApi(row.id)
    ElMessage.success(t('contractConfig.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: ContractConfigOption) {
  try {
    await updateContractConfigApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page contract-config-page">
    <div class="admin-page-head admin-page-head--with-config-tabs">
      <h2>{{ t('menu.contractConfigs') }}</h2>
      <div class="config-type-tabs" role="tablist" :aria-label="t('menu.contractConfigs')">
        <button
          v-for="tab in tabMeta"
          :key="tab.type"
          type="button"
          role="tab"
          class="config-type-tab"
          :class="{ 'is-active': activeTab === tab.type }"
          :aria-selected="activeTab === tab.type"
          @click="activeTab = tab.type"
        >
          <el-icon :size="14" class="config-type-tab__icon" aria-hidden="true">
            <component :is="tab.icon" />
          </el-icon>
          <span>{{ t(`contractConfig.types.${tab.type}`) }}</span>
          <span class="config-type-tab__count">({{ tabCounts[tab.type] }})</span>
        </button>
      </div>
      <div class="head-actions">
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
        <el-button v-if="perms.create" v-admin-glow="perms.codes.create" type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t(`contractConfig.createFor.${activeTab}`) }}
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
          <el-table-column type="index" :index="rowIndex" label="#" width="52" fixed="left" align="center" header-align="center" />
          <el-table-column
            prop="label"
            :min-width="colW(t('contractConfig.fields.label'), { interactive: true, contentMin: 200 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractConfig.fields.label')"
                sortable
                :sort-order="sortOrderOf('label')"
                @update:sort-order="(v) => setSort('label', v)"
              />
            </template>
            <template #default="{ row }">
              <div class="config-label-cell">
                <span class="config-label-cell__text">{{ row.label || '—' }}</span>
                <span v-if="isProtectedCode(row.code)" class="config-protected-tag">{{ t('contractConfig.systemProtected') }}</span>
                <span v-if="!row.active" class="config-label-cell__off">{{ t('user.status.disabled') }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            v-if="activeTab === 'keyDeposit'"
            prop="unitPrice"
            :min-width="colW(t('contractConfig.fields.unitPrice'), { interactive: true, contentMin: 120 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractConfig.fields.unitPrice')"
                sortable
                :sort-order="sortOrderOf('unitPrice')"
                @update:sort-order="(v) => setSort('unitPrice', v)"
              />
            </template>
            <template #default="{ row }">
              <span class="config-unit-price">{{ row.unitPrice != null ? row.unitPrice : '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="sortOrder"
            :min-width="colW(t('contractConfig.fields.sortOrder'), { interactive: true, contentMin: 120 })"
            align="center"
            header-align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractConfig.fields.sortOrder')"
                sortable
                :sort-order="sortOrderOf('sortOrder')"
                @update:sort-order="(v) => setSort('sortOrder', v)"
              />
            </template>
            <template #default="{ row }">
              <span class="config-sort-num">{{ row.sortOrder }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractConfig.fields.active'), { interactive: true, contentMin: 128 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractConfig.fields.active')"
                filterable
                sortable
                :options="activeFilterOptions"
                :model-value="filters.active || []"
                :sort-order="sortOrderOf('active')"
                @update:model-value="(v) => setFilter('active', v)"
                @update:sort-order="(v) => setSort('active', v)"
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
            prop="updatedBy"
            :label="t('common.updatedBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
          <el-table-column
            prop="updatedAt"
            :width="datetimeColWidth"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
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
                <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="!isProtectedCode(row.code)"
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onDelete(row)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <div class="config-empty">{{ t('contractConfig.subtitle') }}</div>
          </template>
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
      :title="editing ? t('common.edit') : t(`contractConfig.createFor.${activeTab}`)"
      :width="dialogWidth"
      destroy-on-close
      class="lb-dialog contract-config-dialog"
    >
      <el-form label-position="top" class="contract-config-form">
        <el-form-item :label="t('contractConfig.fields.label')" required>
          <el-input v-model="form.label" />
        </el-form-item>
        <el-form-item v-if="activeTab === 'keyDeposit'" :label="t('contractConfig.fields.unitPrice')" required>
          <el-input-number
            v-model="form.unitPrice"
            :min="0"
            :precision="2"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <div class="form-grid form-grid--2">
          <el-form-item :label="t('contractConfig.fields.sortOrder')">
            <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('contractConfig.fields.active')">
            <el-switch v-model="form.active" />
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
.admin-page-head--with-config-tabs {
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px 12px;
}

.admin-page-head--with-config-tabs h2 {
  height: 30px;
  line-height: 30px;
  flex: 0 0 auto;
}

.admin-page-head--with-config-tabs .head-actions {
  margin-left: auto;
  flex-shrink: 0;
}

.config-type-tabs {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}

.config-type-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 30px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid #d7ded9;
  border-radius: 999px;
  background: #fff;
  color: #4a5c54;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  box-sizing: border-box;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.config-type-tab__icon {
  flex: 0 0 auto;
}

.config-type-tab__count {
  color: #7a8a82;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.config-type-tab:hover {
  border-color: #b7cbbf;
}

.config-type-tab.is-active {
  border-color: #0f4a32;
  background: #eef6f1;
  color: #0f4a32;
}

.config-type-tab.is-active .config-type-tab__count {
  color: #3d6b55;
}

.config-label-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.config-label-cell__text {
  font-weight: 650;
  color: #1a2a22;
}

.config-label-cell__off {
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: #f1f2f1;
  color: #8a9590;
  font-size: 0.72rem;
  font-weight: 650;
}

.config-protected-tag {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #eef6f1;
  color: #3d6b55;
  font-size: 0.72rem;
  font-weight: 650;
}

.config-unit-price {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #4a5c54;
}

.config-sort-num {
  display: inline-flex;
  min-width: 1.6em;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #4a5c54;
}

.config-empty {
  padding: 28px 12px;
  color: #7a8a82;
  font-size: 0.88rem;
}

.form-grid--2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

@media (max-width: 640px) {
  .admin-page-head--with-config-tabs {
    flex-wrap: wrap;
  }

  .admin-page-head--with-config-tabs .config-type-tabs {
    order: 3;
    flex: 1 1 100%;
  }

  .form-grid--2 {
    grid-template-columns: 1fr;
  }
}
</style>
