<script setup lang="ts">
import { useResourcePermissions } from '@/composables/useResourcePermissions'
const perms = useResourcePermissions('documentTemplates')
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Check,
  CopyDocument,
  Download,
  Plus,
  QuestionFilled,
  Reading,
  Search,
  UploadFilled,
} from '@element-plus/icons-vue'
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
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const { actionColW } = useActionColWidth()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

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
const fieldGuideKeyword = ref('')
const fieldDict = ref<DocumentFieldDictItem[]>([])
const fieldGuideTableRef = ref<{ doLayout?: () => void } | null>(null)
const fieldGuideTableWrapRef = ref<HTMLElement | null>(null)
const fieldGuideTableHeight = ref(480)
let fieldGuideTableRo: ResizeObserver | null = null

const filteredFieldDict = computed(() => {
  const q = fieldGuideKeyword.value.trim().toLowerCase()
  const rows = fieldDict.value || []
  if (!q) return rows
  return rows.filter((r) => {
    const key = String(r.key || '').toLowerCase()
    const label = String(r.label || '').toLowerCase()
    const note = String(r.note || '').toLowerCase()
    return key.includes(q) || label.includes(q) || note.includes(q)
  })
})

/** 按当前字典最长 `{key}` 测宽，并预留复制按钮、「舊」标签与代码胶囊内边距 */
const fieldGuideKeyColWidth = computed(() => {
  const samples = (fieldDict.value || []).map((r) => `{${r.key}}`)
  const base = codeColW(t('documentTemplate.fieldGuide.key'), { samples })
  const badgeExtra = (fieldDict.value || []).some((r) => r.deprecated) ? 44 : 12
  // 复制按钮 22 + gap + 胶囊留白
  return Math.max(base + badgeExtra + 50, 220)
})

const copiedFieldKey = ref('')
let copiedFieldKeyTimer: ReturnType<typeof setTimeout> | null = null

async function copyFieldKey(key: string) {
  const text = `{${key}}`
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  } catch {
    await ElMessageBox.alert(t('documentTemplate.fieldGuide.copyFailed'), t('common.tip'), {
      type: 'error',
    })
    return
  }
  copiedFieldKey.value = key
  if (copiedFieldKeyTimer) clearTimeout(copiedFieldKeyTimer)
  copiedFieldKeyTimer = setTimeout(() => {
    if (copiedFieldKey.value === key) copiedFieldKey.value = ''
    copiedFieldKeyTimer = null
  }, 1400)
}

const fieldGuideLoopColWidth = computed(() =>
  statusColW(
    t('documentTemplate.fieldGuide.loop'),
    [t('documentTemplate.fieldGuide.loopYes'), t('documentTemplate.fieldGuide.loopNo')],
    { interactive: false },
  ),
)

function measureFieldGuideTableHeight() {
  const el = fieldGuideTableWrapRef.value
  if (!el) return
  const h = Math.max(200, Math.floor(el.getBoundingClientRect().height))
  if (h !== fieldGuideTableHeight.value) fieldGuideTableHeight.value = h
  void nextTick(() => fieldGuideTableRef.value?.doLayout?.())
}

function bindFieldGuideTableObserver() {
  fieldGuideTableRo?.disconnect()
  fieldGuideTableRo = null
  const el = fieldGuideTableWrapRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  fieldGuideTableRo = new ResizeObserver(() => measureFieldGuideTableHeight())
  fieldGuideTableRo.observe(el)
  measureFieldGuideTableHeight()
}

watch(fieldGuideVisible, async (open) => {
  if (!open) {
    fieldGuideTableRo?.disconnect()
    fieldGuideTableRo = null
    return
  }
  await nextTick()
  bindFieldGuideTableObserver()
  // 进入／退出内容区全屏时 class 变化也会触发 ResizeObserver
  window.setTimeout(measureFieldGuideTableHeight, 80)
  window.setTimeout(measureFieldGuideTableHeight, 220)
})

onBeforeUnmount(() => {
  fieldGuideTableRo?.disconnect()
  fieldGuideTableRo = null
  if (copiedFieldKeyTimer) {
    clearTimeout(copiedFieldKeyTimer)
    copiedFieldKeyTimer = null
  }
})

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
} = useTableSortFilter<DocumentTemplateRecord>()

const columnGetters = {
  name: (o: DocumentTemplateRecord) => o.name,
  type: (o: DocumentTemplateRecord) => o.type,
  fileName: (o: DocumentTemplateRecord) => o.fileName,
  enabled: (o: DocumentTemplateRecord) => String(o.enabled),
  remark: (o: DocumentTemplateRecord) => o.remark,
  createdBy: (o: DocumentTemplateRecord) => o.createdBy,
  updatedBy: (o: DocumentTemplateRecord) => o.updatedBy,
  createdAt: (o: DocumentTemplateRecord) => o.createdAt,
  updatedAt: (o: DocumentTemplateRecord) => o.updatedAt,
}

const nameFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.name))
const fileNameFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.fileName))
const typeFilterOptions = computed(() =>
  TEMPLATE_TYPES.map((type) => ({
    value: type,
    label: t(`documentTemplate.types.${type}`),
  })),
)
const updatedByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.updatedBy))
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))

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

const rowActionWidth = computed(() =>
  actionColW([
    t('documentTemplate.actions.download'),
    perms.update && t('common.edit'),
    perms.delete && t('common.delete'),
  ]),
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '560px'))
const fieldGuideWidth = computed(() => (isMobile.value ? '96%' : '860px'))

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
  fieldGuideKeyword.value = ''
  fieldGuideVisible.value = true
  await loadFieldGuide()
}

function fieldGuideRowClass({ row }: { row: DocumentFieldDictItem }) {
  return row.deprecated ? 'field-guide-row--deprecated' : ''
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
          clearable value-on-clear=""
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
        <button type="button" class="doc-tool-btn" @click="onDownloadSample">
          <el-icon :size="15"><Download /></el-icon>
          <span>{{ sampleDownloadLabel }}</span>
        </button>
        <button type="button" class="doc-tool-btn doc-tool-btn--guide" @click="openFieldGuide">
          <el-icon :size="15"><Reading /></el-icon>
          <span>{{ t('documentTemplate.actions.fieldGuide') }}</span>
        </button>
        <el-button v-if="perms.create" v-admin-glow="perms.codes.create" type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('documentTemplate.create') }}
        </el-button>
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${rowActionWidth}`"
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
            :min-width="textColW(t('documentTemplate.fields.name'), { interactive: true, contentMin: 140 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('documentTemplate.fields.name')"
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
                filterable
                sortable
                :options="fileNameFilterOptions"
                :model-value="filters.fileName || []"
                :sort-order="sortOrderOf('fileName')"
                @update:model-value="(v) => setFilter('fileName', v)"
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
            align="center"
            header-align="center"
            class-name="col-switch"
            label-class-name="col-switch"
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
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
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
                :model-value="filters.updatedAt || []"
                :sort-order="sortOrderOf('updatedAt')"
                :date-range-value="dateRangeOf('updatedAt')"
                @update:sort-order="(v) => setSort('updatedAt', v)"
                @update:model-value="(v) => setFilter('updatedAt', v)"
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
                  v-if="perms.update" v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--view"
                  @click="onDownload(row as DocumentTemplateRecord)"
                >
                  {{ t('documentTemplate.actions.download') }}
                </button>
                <button
                  v-if="perms.update" v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="openEdit(row as DocumentTemplateRecord)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="perms.delete" v-admin-glow="perms.codes.delete"
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
      :title="editing ? t('documentTemplate.edit') : t('documentTemplate.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('documentTemplate.fields.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('documentTemplate.fields.type')" required>
          <el-select clearable value-on-clear="" fit-input-width v-model="form.type" style="width: 100%">
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
          <div class="template-upload">
            <button
              v-if="!hasTemplateFile()"
              type="button"
              class="template-upload__trigger"
              @click="triggerPickFile"
            >
              <el-icon class="template-upload__cloud" :size="18">
                <UploadFilled />
              </el-icon>
              <span class="template-upload__text">{{ t('attachment.upload') }}</span>
              <span class="template-upload__count">
                {{ t('attachment.count', { current: 0, max: 1 }) }}
              </span>
            </button>
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
            <p v-else class="template-upload__empty">{{ t('attachment.empty') }}</p>
            <p class="template-file-note">{{ t('documentTemplate.docxOnly') }}</p>
          </div>
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
      class="lb-dialog field-guide-dialog"
      :width="fieldGuideWidth"
      destroy-on-close
    >
      <template #header>
        <span class="field-guide-dlg-title">
          {{ t('documentTemplate.fieldGuideTitle') }}
          <el-tooltip :content="t('documentTemplate.fieldGuideHint')" placement="top">
            <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
          </el-tooltip>
        </span>
      </template>

      <div class="field-guide-shell">
        <div class="field-guide-banner">
          {{ t('documentTemplate.fieldGuideHint') }}
        </div>

        <div class="field-guide-toolbar">
          <div class="field-guide-toolbar__type">
            <span class="field-guide-toolbar__label">{{ t('documentTemplate.fieldGuide.typeLabel') }}</span>
            <div class="field-guide-type-chips" role="radiogroup" :aria-label="t('documentTemplate.fieldGuide.typeLabel')">
              <button
                v-for="o in typeFilterOptions"
                :key="o.value"
                type="button"
                class="field-guide-type-chip"
                :class="{ 'is-active': fieldGuideType === o.value }"
                role="radio"
                :aria-checked="fieldGuideType === o.value"
                @click="fieldGuideType = o.value"
              >
                {{ o.label }}
              </button>
            </div>
          </div>
          <el-input
            v-model="fieldGuideKeyword"
            clearable
            class="field-guide-search"
            :prefix-icon="Search"
            :placeholder="t('documentTemplate.fieldGuide.searchPlaceholder')"
          />
          <span class="field-guide-count">
            {{ t('documentTemplate.fieldGuide.count', { n: filteredFieldDict.length }) }}
          </span>
        </div>

        <div ref="fieldGuideTableWrapRef" class="field-guide-table-wrap">
          <el-table
            ref="fieldGuideTableRef"
            v-loading="fieldGuideLoading"
            :data="filteredFieldDict"
            :row-class-name="fieldGuideRowClass"
            :height="fieldGuideTableHeight"
            stripe
            border
            style="width: 100%"
            class="field-guide-table"
            empty-text=" "
          >
        <el-table-column
          prop="key"
          :label="t('documentTemplate.fieldGuide.key')"
          :width="fieldGuideKeyColWidth"
          class-name="col-code"
          label-class-name="col-code"
        >
          <template #default="{ row }">
            <div class="field-guide-key">
              <code class="field-guide-key__code">{{ '{' + row.key + '}' }}</code>
              <el-tooltip
                :content="
                  copiedFieldKey === row.key
                    ? t('documentTemplate.fieldGuide.copied')
                    : t('documentTemplate.fieldGuide.copyTip')
                "
                placement="top"
                :hide-after="copiedFieldKey === row.key ? 900 : 0"
              >
                <button
                  type="button"
                  class="field-guide-key__copy"
                  :class="{ 'is-copied': copiedFieldKey === row.key }"
                  :aria-label="t('documentTemplate.fieldGuide.copyTip')"
                  @click.stop="copyFieldKey(row.key)"
                >
                  <el-icon :size="13">
                    <Check v-if="copiedFieldKey === row.key" />
                    <CopyDocument v-else />
                  </el-icon>
                </button>
              </el-tooltip>
              <el-tooltip
                v-if="row.deprecated"
                :content="t('documentTemplate.fieldGuide.deprecatedTip')"
                placement="top"
              >
                <span class="field-guide-tag field-guide-tag--deprecated">
                  {{ t('documentTemplate.fieldGuide.deprecated') }}
                </span>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="label"
          :label="t('documentTemplate.fieldGuide.label')"
          :min-width="colW(t('documentTemplate.fieldGuide.label'), { contentMin: 140 })"
        />
        <el-table-column
          :label="t('documentTemplate.fieldGuide.loop')"
          :width="fieldGuideLoopColWidth"
          align="center"
        >
          <template #default="{ row }">
            <span
              class="field-guide-tag"
              :class="row.loop ? 'field-guide-tag--loop' : 'field-guide-tag--single'"
            >
              {{
                row.loop
                  ? t('documentTemplate.fieldGuide.loopYes')
                  : t('documentTemplate.fieldGuide.loopNo')
              }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          prop="note"
          :label="t('documentTemplate.fieldGuide.note')"
          :min-width="textColW(t('documentTemplate.fieldGuide.note'), { kind: 'long', contentMin: 320 })"
        >
          <template #default="{ row }">
            <span class="field-guide-note">{{ row.note || '—' }}</span>
          </template>
        </el-table-column>
            <template #empty>
              <div class="field-guide-empty">{{ t('documentTemplate.fieldGuide.empty') }}</div>
            </template>
          </el-table>
        </div>
      </div>
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

.doc-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #d5d5d5);
  border-radius: 8px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff) 0%,
    color-mix(in srgb, var(--lb-brand, #0f4a32) 3%, #fff) 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 1px 2px color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, transparent);
  color: var(--lb-brand, #0f4a32);
  font-size: 0.88rem;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.doc-tool-btn:hover {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 42%, #c8c8c8);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #fff) 0%,
    color-mix(in srgb, var(--lb-brand, #0f4a32) 7%, #fff) 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 4px 10px color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, transparent);
  color: var(--lb-brand-dark, #0c3d29);
  transform: translateY(-0.5px);
}

.doc-tool-btn:active {
  transform: none;
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, transparent);
}

.doc-tool-btn--guide {
  border-color: color-mix(in srgb, #4f7fa3 28%, #d5d5d5);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, #4f7fa3 10%, #fff) 0%,
    color-mix(in srgb, #4f7fa3 3%, #fff) 100%
  );
  color: #3f6a8a;
}

.doc-tool-btn--guide:hover {
  border-color: color-mix(in srgb, #4f7fa3 48%, #c8c8c8);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, #4f7fa3 16%, #fff) 0%,
    color-mix(in srgb, #4f7fa3 8%, #fff) 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 4px 10px color-mix(in srgb, #4f7fa3 14%, transparent);
  color: #335872;
}

.doc-tool-btn .el-icon {
  flex-shrink: 0;
}

.template-file-input {
  display: none;
}
.template-upload {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}
.template-upload__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #3a7bd5;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
}
.template-upload__trigger:hover .template-upload__text {
  text-decoration: underline;
}
.template-upload__cloud {
  flex: 0 0 auto;
  color: #3a7bd5;
}
.template-upload__text {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.template-upload__count {
  font-weight: 550;
  text-decoration: none;
}
.template-upload__empty {
  margin: 0;
  color: var(--lb-muted, #666);
  font-size: 0.82rem;
  line-height: 1.4;
}
.template-file-note {
  margin: 0;
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
.field-guide-dlg-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: inherit;
  font-weight: inherit;
  line-height: 1.4;
}
.form-label-tip {
  color: var(--lb-muted, #666);
  cursor: help;
  vertical-align: middle;
  flex-shrink: 0;
}
.field-guide-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding-bottom: 10px;
  box-sizing: border-box;
}

.field-guide-banner {
  flex: 0 0 auto;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #e6e6e6);
  border-radius: 10px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, #fff);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 55%, #444);
  font-size: 0.86rem;
  line-height: 1.5;
}
.field-guide-toolbar {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin-bottom: 0;
}

.field-guide-table-wrap {
  position: relative;
  flex: 0 0 auto;
  height: min(480px, 55vh);
  min-height: 280px;
  min-width: 0;
}
.field-guide-toolbar__type {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.field-guide-toolbar__label {
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--lb-muted, #666);
}
.field-guide-type-chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.field-guide-type-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #d8d8d8);
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, transparent);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 42%, #555);
  font-size: 0.88rem;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.field-guide-type-chip:hover {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 36%, #c8c8c8);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 7%, #fff);
  color: var(--lb-brand, #0f4a32);
  transform: translateY(-0.5px);
}
.field-guide-type-chip.is-active {
  border-color: var(--lb-brand, #0f4a32);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--lb-brand, #0f4a32) 92%, #fff) 0%,
    var(--lb-brand, #0f4a32) 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 4px 10px color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, transparent);
  color: #fff;
}
.field-guide-type-chip.is-active:hover {
  border-color: var(--lb-brand-dark, #0c3d29);
  background: var(--lb-brand-dark, #0c3d29);
  color: #fff;
  transform: none;
}
.field-guide-search {
  width: min(100%, 240px);
}
.field-guide-count {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--lb-muted, #666);
}
.field-guide-key {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.field-guide-key__code {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #f4f4f4);
  color: var(--lb-brand-dark, #0c3d29);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: inherit;
  font-weight: 650;
  line-height: 1.45;
  white-space: nowrap;
}
.field-guide-key__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #ddd);
  border-radius: 6px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #fff);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 55%, #666);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.field-guide-key__copy:hover {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #ccc);
  color: var(--lb-brand-dark, #0c3d29);
}
.field-guide-key__copy.is-copied {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #fff);
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 32%, #ccc);
  color: var(--lb-brand, #0f4a32);
}
.field-guide-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.92em;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}
.field-guide-tag--deprecated {
  background: color-mix(in srgb, #c9843a 16%, #fff);
  color: #9a6418;
  border: 1px solid color-mix(in srgb, #c9843a 28%, #e8e0d4);
}
.field-guide-tag--loop {
  background: color-mix(in srgb, #4f7fa3 14%, #fff);
  color: #355f7d;
  border: 1px solid color-mix(in srgb, #4f7fa3 26%, #d9e2ea);
}
.field-guide-tag--single {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 70%, #555);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #ddd);
}
.field-guide-note {
  display: inline-block;
  white-space: normal;
  word-break: break-word;
  line-height: 1.45;
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #333);
  font-size: inherit;
}
.field-guide-empty {
  padding: 28px 12px;
  color: var(--lb-muted, #666);
  font-size: var(--lb-table-body, 0.82rem);
}
.field-guide-table.el-table {
  --el-table-header-bg-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #fff);
  --el-table-header-text-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #5a6068);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 3.5%, #fff);
  --el-table-border-color: var(--lb-table-border, #ebebeb);
  font-size: var(--lb-table-body, 0.82rem);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #333);
}
.field-guide-table :deep(th.el-table__cell) {
  background-color: var(--el-table-header-bg-color);
  color: var(--el-table-header-text-color);
  font-size: var(--lb-table-head, 0.78rem);
  font-weight: 650;
}
.field-guide-table :deep(.field-guide-row--deprecated > td.el-table__cell) {
  background: color-mix(in srgb, #c9843a 5%, #fff) !important;
}
.field-guide-table :deep(.el-table__cell) {
  vertical-align: top;
  font-size: inherit;
}
</style>

<style>
/* 内容区全屏：表格吃满弹窗下方剩余高度 */
.el-dialog.field-guide-dialog.lb-dialog--content-fs .el-dialog__body {
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  min-height: 0 !important;
}

.el-dialog.field-guide-dialog.lb-dialog--content-fs .el-dialog__body {
  padding-bottom: 14px !important;
}

.el-dialog.field-guide-dialog.lb-dialog--content-fs .field-guide-shell {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  padding-bottom: 4px;
}

.el-dialog.field-guide-dialog.lb-dialog--content-fs .field-guide-table-wrap {
  flex: 1 1 auto;
  height: 0 !important;
  min-height: 200px;
  max-height: none;
  margin-bottom: 2px;
}
</style>
