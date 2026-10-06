<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, EditPen } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createNumberingRuleApi,
  deleteNumberingRuleApi,
  batchDeleteNumberingRulesApi,
  fetchNumberingRules,
  resetNumberingRuleApi,
  updateNumberingRuleApi,
} from '@/api/numbering-rules'
import type { NumberingBizKey, NumberingResetCycle, NumberingRule } from '@/types/numbering-rule'
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

const BIZ_KEYS: NumberingBizKey[] = [
  'customer',
  'customerRequirement',
  'contract',
  'invoice',
  'receipt',
]

const RESET_CYCLES: NumberingResetCycle[] = ['none', 'daily', 'monthly', 'yearly']

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

const actionColWidth = computed(() => {
  void locale.value
  return measureActionColWidth([
    t('autoNumbering.copy'),
    t('autoNumbering.reset'),
    t('common.delete'),
  ])
})

const loading = ref(false)
const formVisible = ref(false)
const editing = ref<NumberingRule | null>(null)
const list = ref<NumberingRule[]>([])

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
} = useTableSortFilter<NumberingRule>()

const columnGetters = {
  name: (o: NumberingRule) => o.name,
  bizKey: (o: NumberingRule) => o.bizKey || '',
  format: (o: NumberingRule) => o.format,
  preview: (o: NumberingRule) => o.preview,
  startValue: (o: NumberingRule) => o.startValue,
  resetCycle: (o: NumberingRule) => o.resetCycle,
  active: (o: NumberingRule) => String(o.active),
  createdAt: (o: NumberingRule) => o.createdAt,
  updatedAt: (o: NumberingRule) => o.updatedAt,
}

const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const bizKeyFilterOptions = computed(() =>
  BIZ_KEYS.map((k) => ({ value: k, label: t(`autoNumbering.bizKey.${k}`) })),
)

const resetCycleFilterOptions = computed(() =>
  RESET_CYCLES.map((k) => ({ value: k, label: t(`autoNumbering.resetCycle.${k}`) })),
)

const sorted = computed(() => {
  const applied = applySortFilter(list.value, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
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
} = useTableSelection<NumberingRule>()
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

const usedBizKeys = computed(() => {
  const keys = new Set<string>()
  for (const row of list.value) {
    if (row.bizKey && (!editing.value || editing.value.id !== row.id)) {
      keys.add(row.bizKey)
    }
  }
  return keys
})

const availableBizKeyOptions = computed(() =>
  BIZ_KEYS.filter((k) => !usedBizKeys.value.has(k) || form.bizKey === k).map((k) => ({
    value: k,
    label: t(`autoNumbering.bizKey.${k}`),
  })),
)

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
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteNumberingRulesApi(chunk),
      setBatchProgress,
    )
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
  name: '',
  format: '',
  bizKey: null as NumberingBizKey | null,
  startValue: 1,
  resetCycle: 'none' as NumberingResetCycle,
  sortOrder: 0,
  active: true,
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchNumberingRules({ activeOnly: false })
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
    name: '',
    format: 'CSM%YY%04d',
    bizKey: availableBizKeyOptions.value[0]?.value ?? null,
    startValue: 1,
    resetCycle: 'none' as NumberingResetCycle,
    sortOrder: (sorted.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: NumberingRule) {
  editing.value = row
  Object.assign(form, {
    name: row.name,
    format: row.format,
    bizKey: row.bizKey,
    startValue: row.startValue,
    resetCycle: row.resetCycle,
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

function openCopy(row: NumberingRule) {
  editing.value = null
  Object.assign(form, {
    name: `${row.name}_copy_${Date.now()}`,
    format: row.format,
    bizKey: null,
    startValue: row.startValue,
    resetCycle: row.resetCycle,
    sortOrder: (sorted.value.at(-1)?.sortOrder ?? 0) + 1,
    active: false,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!form.name.trim()) {
    ElMessage.warning(t('autoNumbering.nameRequired'))
    return
  }
  if (!form.format.trim()) {
    ElMessage.warning(t('autoNumbering.formatRequired'))
    return
  }
  if (!/%0?\d*d/.test(form.format)) {
    ElMessage.warning(t('autoNumbering.formatSeqRequired'))
    return
  }
  try {
    const payload = {
      name: form.name.trim(),
      format: form.format.trim(),
      bizKey: form.bizKey,
      startValue: form.startValue,
      resetCycle: form.resetCycle,
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (editing.value) {
      await updateNumberingRuleApi(editing.value.id, payload)
      ElMessage.success(t('autoNumbering.updated'))
    } else {
      await createNumberingRuleApi(payload)
      ElMessage.success(t('autoNumbering.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: NumberingRule) {
  try {
    await ElMessageBox.confirm(
      t('autoNumbering.deleteConfirm', { name: row.name }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteNumberingRuleApi(row.id)
    ElMessage.success(t('autoNumbering.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function onReset(row: NumberingRule) {
  try {
    await ElMessageBox.confirm(
      t('autoNumbering.resetConfirm', { name: row.name }),
      t('autoNumbering.reset'),
      { type: 'warning' },
    )
    await resetNumberingRuleApi(row.id)
    ElMessage.success(t('autoNumbering.resetDone'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: NumberingRule) {
  try {
    await updateNumberingRuleApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}

function bizKeyLabel(key: NumberingBizKey | null) {
  if (!key) return '—'
  return t(`autoNumbering.bizKey.${key}`)
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.autoNumbering') }}</h2>
      <div class="head-actions">
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('autoNumbering.create') }}
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
            :min-width="textColW(t('autoNumbering.fields.name'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
            <template #default="{ row }">
              <button type="button" class="name-edit-link" @click="openEdit(row)">
                <span>{{ row.name }}</span>
                <el-icon :size="14" class="name-edit-link__icon"><EditPen /></el-icon>
              </button>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.bizKey'), { interactive: true, contentMin: 140 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.bizKey')"
                filterable
                :options="bizKeyFilterOptions"
                :model-value="filters.bizKey || []"
                @update:model-value="(v) => setFilter('bizKey', v)"
              />
            </template>
            <template #default="{ row }">{{ bizKeyLabel(row.bizKey) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('autoNumbering.fields.format'), { interactive: true, samples: list.map((r) => r.format) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.format')"
                sortable
                :sort-order="sortOrderOf('format')"
                @update:sort-order="(v) => setSort('format', v)"
              />
            </template>
            <template #default="{ row }">{{ row.format }}</template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('autoNumbering.fields.preview'), { samples: list.map((r) => r.preview) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.preview')"
                sortable
                :sort-order="sortOrderOf('preview')"
                @update:sort-order="(v) => setSort('preview', v)"
              />
            </template>
            <template #default="{ row }">{{ row.preview }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.startValue'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.startValue')"
                sortable
                :sort-order="sortOrderOf('startValue')"
                @update:sort-order="(v) => setSort('startValue', v)"
              />
            </template>
            <template #default="{ row }">{{ row.startValue }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.resetCycle'), { interactive: true, contentMin: 120 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.resetCycle')"
                filterable
                :options="resetCycleFilterOptions"
                :model-value="filters.resetCycle || []"
                @update:model-value="(v) => setFilter('resetCycle', v)"
              />
            </template>
            <template #default="{ row }">
              {{ t(`autoNumbering.resetCycle.${row.resetCycle}`) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.active'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.active')"
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
                @update:date-range-value="(v) => setDateRange('updatedAt', v)"
                @update:sort-order="(v) => setSort('updatedAt', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="actionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button type="button" class="action-pill action-pill--edit" @click="openCopy(row)">
                  {{ t('autoNumbering.copy') }}
                </button>
                <button type="button" class="action-pill action-pill--warn" @click="onReset(row)">
                  {{ t('autoNumbering.reset') }}
                </button>
                <button type="button" class="action-pill action-pill--danger" @click="onDelete(row)">
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

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('autoNumbering.edit') : t('autoNumbering.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('autoNumbering.fields.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.format')" required>
          <el-input v-model="form.format" />
          <div class="form-hint">{{ t('autoNumbering.formatHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.bizKey')">
          <el-select
            v-model="form.bizKey"
            clearable
            :placeholder="t('autoNumbering.bizKeyOptional')"
            style="width: 100%"
          >
            <el-option
              v-for="opt in availableBizKeyOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.startValue')">
          <el-input-number
            v-model="form.startValue"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.resetCycle')">
          <el-select v-model="form.resetCycle" style="width: 100%">
            <el-option
              v-for="c in RESET_CYCLES"
              :key="c"
              :label="t(`autoNumbering.resetCycle.${c}`)"
              :value="c"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.sortOrder')">
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.active')">
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
        <div class="dialog-footer">
          <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">
            {{ t('common.save') }}
          </el-button>
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
.name-edit-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.name-edit-link:hover {
  color: var(--el-color-primary);
}
.name-edit-link__icon {
  opacity: 0.55;
}
.name-edit-link:hover .name-edit-link__icon {
  opacity: 1;
}
.form-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
  white-space: pre-line;
}
</style>
