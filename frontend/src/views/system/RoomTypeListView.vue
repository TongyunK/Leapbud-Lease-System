<script setup lang="ts">
import { useResourcePermissions } from '@/composables/useResourcePermissions'
const perms = useResourcePermissions('roomTypes')
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createRoomTypeApi,
  deleteRoomTypeApi,
  batchDeleteRoomTypesApi,
  fetchRoomTypes,
  updateRoomTypeApi,
} from '@/api/room-types'
import type { RoomTypeOption, RoomTypeTone } from '@/types/room-type'
import { ROOM_TYPE_TONE_OPTIONS } from '@/constants/roomTypes'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import RoomTypeBadge from '@/components/RoomTypeBadge.vue'
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

const loading = ref(false)
const formVisible = ref(false)
const editing = ref<RoomTypeOption | null>(null)
const list = ref<RoomTypeOption[]>([])

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
} = useTableSortFilter<RoomTypeOption>()

const columnGetters = {
  label: (o: RoomTypeOption) => o.label,
  tone: (o: RoomTypeOption) => o.tone,
  sortOrder: (o: RoomTypeOption) => o.sortOrder,
  active: (o: RoomTypeOption) => String(o.active),
  createdAt: (o: RoomTypeOption) => o.createdAt,
  updatedAt: (o: RoomTypeOption) => o.updatedAt,
}

const toneFilterOptions = computed(() =>
  ROOM_TYPE_TONE_OPTIONS.map((tone) => ({ value: tone, label: t(`roomType.tones.${tone}`) })),
)
const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const sorted = computed(() => {
  const applied = applySortFilter(list.value, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
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
} = useTableSelection<RoomTypeOption>()
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteRoomTypesApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '480px'))

const form = reactive({
  label: '',
  tone: 'other' as RoomTypeTone,
  hint: '',
  sortOrder: 0,
  active: true,
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchRoomTypes({ activeOnly: false })
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
    label: '',
    tone: 'office' as RoomTypeTone,
    hint: '',
    sortOrder: (sorted.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: RoomTypeOption) {
  editing.value = row
  Object.assign(form, {
    label: row.label,
    tone: (ROOM_TYPE_TONE_OPTIONS.includes(row.tone as RoomTypeTone)
      ? row.tone
      : 'other') as RoomTypeTone,
    hint: row.hint || '',
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!form.label.trim()) {
    ElMessage.warning(t('roomType.labelRequired'))
    return
  }
  try {
    const payload = {
      label: form.label.trim(),
      tone: form.tone,
      hint: form.hint.trim(),
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (editing.value) {
      await updateRoomTypeApi(editing.value.id, payload)
      ElMessage.success(t('roomType.updated'))
    } else {
      await createRoomTypeApi(payload)
      ElMessage.success(t('roomType.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: RoomTypeOption) {
  try {
    await ElMessageBox.confirm(t('roomType.deleteConfirm', { label: row.label }), t('common.deleteTitle'), {
      type: 'warning',
    })
    await deleteRoomTypeApi(row.id)
    ElMessage.success(t('roomType.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: RoomTypeOption) {
  try {
    await updateRoomTypeApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.roomTypes') }}</h2>
      <div class="head-actions">
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
        <el-button v-if="perms.create" v-admin-glow="perms.codes.create" type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('roomType.create') }}
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
            :min-width="colW(t('roomType.fields.label'), { interactive: true, contentMin: 140 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('roomType.fields.label')"
                sortable
                :sort-order="sortOrderOf('label')"
                @update:sort-order="(v) => setSort('label', v)"
              />
            </template>
            <template #default="{ row }">
              <RoomTypeBadge :value="row.label" :tone="row.tone" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('roomType.fields.tone'), { interactive: true, contentMin: 152 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('roomType.fields.tone')"
                filterable
                sortable
                :options="toneFilterOptions"
                :model-value="filters.tone || []"
                :sort-order="sortOrderOf('tone')"
                @update:model-value="(v) => setFilter('tone', v)"
                @update:sort-order="(v) => setSort('tone', v)"
              />
            </template>
            <template #default="{ row }">{{ t(`roomType.tones.${row.tone}`, row.tone) }}</template>
          </el-table-column>
          <el-table-column
            prop="hint"
            :label="t('roomType.fields.hint')"
            :min-width="colW(t('roomType.fields.hint'), { contentMin: 160 })"
          />
          <el-table-column
            prop="sortOrder"
            :min-width="colW(t('roomType.fields.sortOrder'), { interactive: true, contentMin: 120 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('roomType.fields.sortOrder')"
                sortable
                :sort-order="sortOrderOf('sortOrder')"
                @update:sort-order="(v) => setSort('sortOrder', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('roomType.fields.active'), { interactive: true, contentMin: 128 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('roomType.fields.active')"
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
                <button v-if="perms.delete" v-admin-glow="perms.codes.delete" type="button" class="action-pill action-pill--danger" @click="onDelete(row)">
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
      :title="editing ? t('roomType.edit') : t('roomType.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('roomType.fields.label')" required>
          <el-input v-model="form.label" />
        </el-form-item>
        <el-form-item :label="t('roomType.fields.tone')">
          <el-select v-model="form.tone" style="width: 100%">
            <el-option
              v-for="tone in ROOM_TYPE_TONE_OPTIONS"
              :key="tone"
              :label="t(`roomType.tones.${tone}`)"
              :value="tone"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('roomType.fields.hint')">
          <el-input v-model="form.hint" :placeholder="t('roomType.hintPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('roomType.fields.preview')">
          <RoomTypeBadge :value="form.label || t('roomType.previewSample')" :tone="form.tone" />
        </el-form-item>
        <el-form-item :label="t('roomType.fields.sortOrder')">
          <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('roomType.fields.active')">
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
.admin-page-hint {
  margin: -4px 0 8px;
  color: #6a7a70;
  font-size: 0.9rem;
  flex-shrink: 0;
}
</style>
