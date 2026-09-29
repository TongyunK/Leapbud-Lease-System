<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Document, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  batchDeleteDocumentTemplatesApi,
  createDocumentTemplateApi,
  deleteDocumentTemplateApi,
  downloadAgreementSampleApi,
  downloadInvoiceSampleApi,
  downloadReceiptSampleApi,
  downloadDocumentTemplateApi,
  fetchDocumentFieldDictionary,
  fetchDocumentTemplates,
  previewDocumentTemplateApi,
  updateDocumentTemplateApi,
} from '@/api/document-templates'
import type {
  DocumentFieldDictItem,
  DocumentTemplateRecord,
  DocumentTemplateType,
} from '@/types/document-template'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { measureActionColWidth, useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const { actionColWidth } = useActionColWidth()
const { colW, textColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const TEMPLATE_TYPES: DocumentTemplateType[] = ['agreement', 'invoice', 'receipt']

const loading = ref(false)
const formVisible = ref(false)
const fieldGuideVisible = ref(false)
const editing = ref<DocumentTemplateRecord | null>(null)
const list = ref<DocumentTemplateRecord[]>([])
const filterType = ref<DocumentTemplateType | ''>('')
const uploadFile = ref<File | null>(null)
const fileCleared = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const fieldGuideLoading = ref(false)
const fieldGuideType = ref<DocumentTemplateType>('agreement')
const fieldDict = ref<DocumentFieldDictItem[]>([])

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
} = useTableSortFilter<DocumentTemplateRecord>()

const columnGetters = {
  name: (o: DocumentTemplateRecord) => o.name,
  type: (o: DocumentTemplateRecord) => o.type,
  fileName: (o: DocumentTemplateRecord) => o.fileName,
  enabled: (o: DocumentTemplateRecord) => String(o.enabled),
  remark: (o: DocumentTemplateRecord) => o.remark,
  createdAt: (o: DocumentTemplateRecord) => o.createdAt,
  updatedAt: (o: DocumentTemplateRecord) => o.updatedAt,
}

const typeFilterOptions = computed(() =>
  TEMPLATE_TYPES.map((type) => ({
    value: type,
    label: t(`documentTemplate.types.${type}`),
  })),
)

const enabledFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const sorted = computed(() => {
  const applied = applySortFilter(list.value, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        a.name.localeCompare(b.name) ||
        a.createdAt.localeCompare(b.createdAt),
    )
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
} = useTableSelection<DocumentTemplateRecord>()
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

watch([filters, dateRanges, sortKey, sortOrder, filterType], () => {
  clearSelection()
}, { deep: true })

const rowActionWidth = computed(() => {
  void locale.value
  return Math.max(
    actionColWidth.value.two,
    measureActionColWidth([
      t('documentTemplate.actions.download'),
      t('common.edit'),
      t('common.delete'),
    ]),
  )
})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '560px'))
const fieldGuideWidth = computed(() => (isMobile.value ? '96%' : '720px'))

const form = reactive({
  name: '',
  type: 'agreement' as DocumentTemplateType,
  enabled: true,
  remark: '',
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchDocumentTemplates({
      type: filterType.value || undefined,
      enabledOnly: false,
    })
    list.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

watch(filterType, () => {
  resetPage()
  void loadList()
})

function typeLabel(type: string) {
  return t(`documentTemplate.types.${type}`, type)
}

function openCreate() {
  editing.value = null
  uploadFile.value = null
  fileCleared.value = false
  Object.assign(form, {
    name: '',
    type: (filterType.value || 'agreement') as DocumentTemplateType,
    enabled: true,
    remark: '',
  })
  formVisible.value = true
}

function openEdit(row: DocumentTemplateRecord) {
  editing.value = row
  uploadFile.value = null
  fileCleared.value = false
  Object.assign(form, {
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    remark: row.remark || '',
  })
  formVisible.value = true
}

function fileDisplayName() {
  if (uploadFile.value) return uploadFile.value.name
  if (fileCleared.value) return ''
  return editing.value?.fileName || ''
}

function hasTemplateFile() {
  return Boolean(fileDisplayName())
}

function canPreviewFile() {
  return Boolean(editing.value?.id) && !uploadFile.value && !fileCleared.value
}

function triggerPickFile() {
  fileInputRef.value?.click()
}

function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0] || null
  if (!file) return
  if (!/\.docx$/i.test(file.name)) {
    ElMessage.warning(t('documentTemplate.docxOnly'))
    input.value = ''
    return
  }
  uploadFile.value = file
  fileCleared.value = false
  if (!form.name.trim()) {
    form.name = file.name.replace(/\.docx$/i, '')
  }
  input.value = ''
}

function clearPickedFile() {
  uploadFile.value = null
  fileCleared.value = true
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function onPreviewRow(row: DocumentTemplateRecord) {
  if (!row?.id) return
  try {
    await previewDocumentTemplateApi(row.id)
  } catch (e) {
    const msg =
      e instanceof Error && e.message ? e.message : t('building.templatePreviewFailed')
    ElMessage.error(msg)
  }
}

async function onPreviewFile() {
  if (uploadFile.value) {
    ElMessage.info(t('building.templatePreviewNeedSave'))
    return
  }
  const id = editing.value?.id
  if (!id) {
    ElMessage.info(t('building.templatePreviewUnavailable'))
    return
  }
  await onPreviewRow({ id } as DocumentTemplateRecord)
}

async function saveForm() {
  if (!form.name.trim()) {
    ElMessage.warning(t('documentTemplate.nameRequired'))
    return
  }
  if (!editing.value && !uploadFile.value) {
    ElMessage.warning(t('documentTemplate.fileRequired'))
    return
  }
  if (editing.value && fileCleared.value && !uploadFile.value) {
    ElMessage.warning(t('documentTemplate.fileRequired'))
    return
  }
  if (uploadFile.value && !/\.docx$/i.test(uploadFile.value.name)) {
    ElMessage.warning(t('documentTemplate.docxOnly'))
    return
  }
  try {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      enabled: form.enabled,
      remark: form.remark.trim(),
    }
    if (editing.value) {
      await updateDocumentTemplateApi(editing.value.id, payload, uploadFile.value)
      ElMessage.success(t('documentTemplate.updated'))
    } else {
      await createDocumentTemplateApi(payload, uploadFile.value!)
      ElMessage.success(t('documentTemplate.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: DocumentTemplateRecord) {
  try {
    await ElMessageBox.confirm(
      t('documentTemplate.deleteConfirm', { name: row.name }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteDocumentTemplateApi(row.id)
    ElMessage.success(t('documentTemplate.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleEnabled(row: DocumentTemplateRecord) {
  try {
    await updateDocumentTemplateApi(row.id, { enabled: !row.enabled })
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDownload(row: DocumentTemplateRecord) {
  try {
    await downloadDocumentTemplateApi(row.id, row.fileName || `${row.name}.docx`)
    ElMessage.success(t('documentTemplate.downloadDone'))
  } catch (e) {
    const msg = e instanceof Error ? e.message : t('documentTemplate.downloadFailed')
    ElMessage.error(msg)
  }
}

async function openFieldGuide() {
  fieldGuideType.value = (filterType.value || 'agreement') as DocumentTemplateType
  fieldGuideVisible.value = true
  await loadFieldGuide()
}

async function onDownloadSample() {
  try {
    const type = (filterType.value || fieldGuideType.value || 'agreement') as DocumentTemplateType
    if (type === 'invoice') {
      await downloadInvoiceSampleApi()
    } else if (type === 'receipt') {
      await downloadReceiptSampleApi()
    } else {
      await downloadAgreementSampleApi()
    }
    ElMessage.success(t('documentTemplate.sampleDownloaded'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('documentTemplate.downloadFailed')
    ElMessage.error(msg)
  }
}

const sampleDownloadLabel = computed(() => {
  if (filterType.value === 'invoice') return t('documentTemplate.actions.downloadInvoiceSample')
  if (filterType.value === 'receipt') return t('documentTemplate.actions.downloadReceiptSample')
  if (filterType.value === 'agreement') return t('documentTemplate.actions.downloadAgreementSample')
  return t('documentTemplate.actions.downloadSample')
})

async function loadFieldGuide() {
  fieldGuideLoading.value = true
  try {
    const { data } = await fetchDocumentFieldDictionary(fieldGuideType.value)
    fieldDict.value = data
  } catch {
    fieldDict.value = []
  } finally {
    fieldGuideLoading.value = false
  }
}

watch(fieldGuideType, () => {
  if (fieldGuideVisible.value) void loadFieldGuide()
})

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
      (chunk) => batchDeleteDocumentTemplatesApi(chunk),
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

const toolbarFilterCount = computed(() => (filterType.value ? 1 : 0))
const clearFilterCount = computed(() => activeConditionCount.value + toolbarFilterCount.value)

function onClearFilters() {
  filterType.value = ''
  clearAll()
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.documentTemplates') }}</h2>
      <div class="head-actions">
        <el-select
          v-model="filterType"
          clearable
          class="head-filter"
          :placeholder="t('documentTemplate.fields.type')"
        >
          <el-option
            v-for="o in typeFilterOptions"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
        <ClearTableFiltersButton :count="clearFilterCount" @clear="onClearFilters" />
        <el-button @click="onDownloadSample">
          {{ sampleDownloadLabel }}
        </el-button>
        <el-button :icon="Document" @click="openFieldGuide">
          {{ t('documentTemplate.actions.fieldGuide') }}
        </el-button>
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('documentTemplate.create') }}
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
            :min-width="textColW(t('documentTemplate.fields.name'), { interactive: true, contentMin: 140 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('documentTemplate.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
            <template #default="{ row }">{{ row.name }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('documentTemplate.fields.type'), { interactive: true, contentMin: 120 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('documentTemplate.fields.type')"
                filterable
                :options="typeFilterOptions"
                :model-value="filters.type || []"
                @update:model-value="(v) => setFilter('type', v)"
              />
            </template>
            <template #default="{ row }">{{ typeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('documentTemplate.fields.fileName'), { interactive: true, kind: 'long' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('documentTemplate.fields.fileName')"
                sortable
                :sort-order="sortOrderOf('fileName')"
                @update:sort-order="(v) => setSort('fileName', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.fileName"
                type="button"
                class="file-chip file-chip--clickable"
                :title="t('building.templatePreviewHint')"
                @click.stop="onPreviewRow(row)"
              >
                <span class="file-chip-icon file-chip-icon--docx">W</span>
                <span class="file-chip-name">{{ row.fileName }}</span>
              </button>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('documentTemplate.fields.enabled'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('documentTemplate.fields.enabled')"
                filterable
                :options="enabledFilterOptions"
                :model-value="filters.enabled || []"
                @update:model-value="(v) => setFilter('enabled', v)"
              />
            </template>
            <template #default="{ row }">
              <el-switch
                :model-value="(row as DocumentTemplateRecord).enabled"
                @change="() => toggleEnabled(row as DocumentTemplateRecord)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('documentTemplate.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader :label="t('documentTemplate.fields.remark')" />
            </template>
            <template #default="{ row }">{{ row.remark || '—' }}</template>
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
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
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
            <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="rowActionWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="onDownload(row as DocumentTemplateRecord)"
                >
                  {{ t('documentTemplate.actions.download') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="openEdit(row as DocumentTemplateRecord)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onDelete(row as DocumentTemplateRecord)"
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

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('documentTemplate.edit') : t('documentTemplate.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('documentTemplate.fields.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('documentTemplate.fields.type')" required>
          <el-select v-model="form.type" style="width: 100%">
            <el-option
              v-for="o in typeFilterOptions"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('documentTemplate.fields.file')" :required="!editing || fileCleared">
          <input
            ref="fileInputRef"
            type="file"
            class="template-file-input"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            @change="onPickFile"
          />
          <div v-if="hasTemplateFile()" class="file-chip-wrap">
            <button
              type="button"
              class="file-chip"
              :class="{
                'file-chip--clickable': canPreviewFile(),
                'file-chip--pending': Boolean(uploadFile),
              }"
              :title="
                canPreviewFile()
                  ? t('building.templatePreviewHint')
                  : uploadFile
                    ? t('building.templatePreviewNeedSave')
                    : undefined
              "
              @click="onPreviewFile"
            >
              <span class="file-chip-icon file-chip-icon--docx">W</span>
              <span class="file-chip-name">{{ fileDisplayName() }}</span>
            </button>
            <button
              type="button"
              class="file-chip-remove"
              :title="t('common.delete')"
              @click="clearPickedFile"
            >
              ×
            </button>
          </div>
          <el-button v-else @click="triggerPickFile">
            {{ t('building.chooseTemplateFile') }}
          </el-button>
          <p class="template-file-note">{{ t('documentTemplate.docxOnly') }}</p>
        </el-form-item>
        <el-form-item :label="t('documentTemplate.fields.enabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item :label="t('documentTemplate.fields.remark')">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
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

    <el-dialog
      v-model="fieldGuideVisible"
      :title="t('documentTemplate.fieldGuideTitle')"
      :width="fieldGuideWidth"
      destroy-on-close
    >
      <div class="field-guide-toolbar">
        <el-select v-model="fieldGuideType" style="width: 220px">
          <el-option
            v-for="o in typeFilterOptions"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
        <span class="field-guide-hint">{{ t('documentTemplate.fieldGuideHint') }}</span>
      </div>
      <el-table
        v-loading="fieldGuideLoading"
        :data="fieldDict"
        stripe
        border
        empty-text="—"
        max-height="480"
        style="width: 100%"
      >
        <el-table-column
          prop="key"
          :label="t('documentTemplate.fieldGuide.key')"
          :min-width="colW(t('documentTemplate.fieldGuide.key'), { contentMin: 160 })"
        />
        <el-table-column
          prop="label"
          :label="t('documentTemplate.fieldGuide.label')"
          :min-width="textColW(t('documentTemplate.fieldGuide.label'), { kind: 'name' })"
        />
        <el-table-column
          :label="t('documentTemplate.fieldGuide.loop')"
          :min-width="colW(t('documentTemplate.fieldGuide.loop'), { contentMin: 80 })"
        >
          <template #default="{ row }">
            {{ row.loop ? t('common.yes') : t('common.no') }}
          </template>
        </el-table-column>
        <el-table-column
          prop="note"
          :label="t('documentTemplate.fieldGuide.note')"
          :min-width="textColW(t('documentTemplate.fieldGuide.note'), { kind: 'long' })"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.note || '—' }}</template>
        </el-table-column>
      </el-table>
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
.head-filter {
  width: 140px;
}
.template-file-input {
  display: none;
}
.template-file-note {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-placeholder);
}
.file-chip-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  max-width: 100%;
  min-width: 0;
}
.file-chip--clickable {
  cursor: pointer;
}
.file-chip--clickable:hover .file-chip-name {
  color: var(--el-color-primary);
  text-decoration: underline;
}
.file-chip--pending {
  cursor: default;
  opacity: 0.9;
}
.file-chip-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
}
.file-chip-icon--docx {
  background: #2b579a;
}
.file-chip-name {
  min-width: 0;
  color: var(--el-text-color-regular);
  word-break: break-all;
}
.file-chip-remove {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.file-chip-remove:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
.field-guide-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.field-guide-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
