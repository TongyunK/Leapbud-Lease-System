<script setup lang="ts">
import {
  fetchBuildings,
  updateBuildingApi,
  createBuildingApi,
  deleteBuildingApi,
  batchDeleteBuildingsApi,
  importBuildingsApi,
} from '@/api/buildings'
import type { BuildingListQuery, BuildingWritePayload } from '@/api/buildings'
import {
  fetchDocumentTemplates,
  previewDocumentTemplateApi,
} from '@/api/document-templates'
import type { DocumentTemplateRecord, DocumentTemplateType } from '@/types/document-template'
import type { BuildingRecord } from '@/types/building'
import type { RoomRecord } from '@/types/room'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'

import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import CountListPill from '@/components/CountListPill.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import WorkingHoursField from '@/components/WorkingHoursField.vue'
import {
  buildingIoTemplateExampleRow,
  buildingToIoRow,
  rowToBuildingIoPayload,
} from '@/utils/buildingExport'
import { useUserStore } from '@/stores/user'
import { useImportProgress } from '@/composables/useImportProgress'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'

const { t } = useI18n()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const { colW, textColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()
const isMobile = useIsMobile()
const useCards = computed(() => isMobile.value)

const keyword = ref('')
const drawerVisible = ref(false)
const relatedRoomsDrawer = ref(false)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const formVisible = ref(false)
const current = ref<BuildingRecord | null>(null)
const relatedRoomsBuilding = ref<BuildingRecord | null>(null)
const editing = ref<BuildingRecord | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)
const managerFilterOptions = ref<{ value: string; label: string }[]>([])
const {
  state: importState,
  percentage: importPercentage,
  importing,
  begin: beginImport,
  setTotal: setImportTotal,
  setPreparing: setImportPreparing,
  setProcessing: setImportProcessing,
  bump: bumpImport,
  appendIssues: appendImportIssues,
  finish: finishImport,
  fail: failImport,
  close: closeImport,
} = useImportProgress()

const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  sortOrderOf,
  activeConditionCount,
  clearAll,
  sortKey,
  sortOrder,
  dateRanges,
} = useTableSortFilter<BuildingRecord>()

const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const {
  loading,
  exporting,
  list,
  total,
  page,
  pageSize,
  pageSizes,
  rowIndex,
  resetPage,
  loadList,
  fetchExportRows,
  onClearFilters,
} = useServerPagedList<BuildingRecord, BuildingListQuery>({
  keyword,
  sortFilter: {
    filters,
    dateRanges,
    dateRangeOf,
    sortKey,
    sortOrder,
    clearAll,
  },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const updated = range('updatedAt')
    return {
      keyword: kw,
      activeOnly: false,
      managers: f.manager?.length ? [...f.manager] : undefined,
      active: f.active?.length ? [...f.active] : undefined,
      sortBy,
      sortDir,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      updatedAtFrom: updated.from,
      updatedAtTo: updated.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchBuildings,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<BuildingRecord>()
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

watch([keyword, filters, sortKey, sortOrder, dateRanges], () => {
  clearSelection()
})

async function onSelectAll() {
  if (selectAllLoading.value || total.value === 0) return
  selectAllLoading.value = true
  try {
    const rows = await fetchExportRows('filtered')
    await selectRows(rows)
  } finally {
    selectAllLoading.value = false
  }
}

async function onBatchDelete() {
  if (!isAdmin.value || !selectedIds.value.length) return
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteBuildingsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

async function loadManagerOptions() {
  const { data } = await fetchBuildings({ activeOnly: false })
  const names = [
    ...new Set(data.items.map((b) => b.manager.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  managerFilterOptions.value = names.map((m) => ({ value: m, label: m }))
}

onMounted(() => {
  void loadList()
  void loadManagerOptions()
  void loadTemplateOptions()
})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '760px'))

const form = reactive({
  name: '',
  address: '',
  addressEn: '',
  manager: '',
  managerPhone: '',
  email: '',
  workingHours: '',
  fpsId: '',
  bankAccountHolder: '',
  bankAccount: '',
  apiTemplateSuffix: '',
  useWbaNumber: '',
  buildingConfig: '',
  chequePaymentBy: '',
  paymentAdvice: '',
  agreementTemplateId: '' as string,
  invoiceTemplateId: '' as string,
  receiptTemplateId: '' as string,
  active: true,
})

const TEMPLATE_SLOTS: {
  type: DocumentTemplateType
  label: string
  formKey: 'agreementTemplateId' | 'invoiceTemplateId' | 'receiptTemplateId'
}[] = [
  { type: 'agreement', label: 'building.fields.agreementTemplate', formKey: 'agreementTemplateId' },
  { type: 'invoice', label: 'building.fields.invoiceTemplate', formKey: 'invoiceTemplateId' },
  { type: 'receipt', label: 'building.fields.receiptTemplate', formKey: 'receiptTemplateId' },
]

const templateOptions = ref<DocumentTemplateRecord[]>([])

async function loadTemplateOptions() {
  try {
    const res = await fetchDocumentTemplates({ enabledOnly: true })
    templateOptions.value = res.data
  } catch {
    templateOptions.value = []
  }
}

function templatesOf(type: DocumentTemplateType) {
  return templateOptions.value.filter((row) => row.type === type)
}

function selectedTemplateId(type: DocumentTemplateType) {
  const slot = TEMPLATE_SLOTS.find((s) => s.type === type)
  return slot ? form[slot.formKey] : ''
}

async function onPreviewSelectedTemplate(type: DocumentTemplateType) {
  const id = selectedTemplateId(type)
  if (!id) {
    ElMessage.info(t('building.templatePreviewUnavailable'))
    return
  }
  try {
    await previewDocumentTemplateApi(id)
  } catch (e) {
    const msg =
      e instanceof Error && e.message ? e.message : t('building.templatePreviewFailed')
    ElMessage.error(msg)
  }
}

function openDetail(row: BuildingRecord) {
  current.value = row
  drawerVisible.value = true
}

function openRoomsSide(row: BuildingRecord) {
  if (!row.roomIds?.length) return
  relatedRoomsBuilding.value = row
  relatedRoomsDrawer.value = true
}

function onOpenRoomFromList(room: RoomRecord) {
  void relationDrawers.value?.openRoomSide(room.id)
}

function onBuildingRowClick(row: BuildingRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  openDetail(row)
}

function onDataIoCommand(cmd: string | number) {
  if (cmd === 'import') {
    importInputRef.value?.click()
    return
  }
  if (cmd === 'template') {
    const example = buildingIoTemplateExampleRow(t)
    const ws = XLSX.utils.json_to_sheet([example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Buildings')
    XLSX.writeFile(wb, 'buildings-import-template.xlsx')
    ElMessage.success(t('building.templateDone'))
    return
  }
  const scope = exportScopeFromCommand(cmd)
  if (scope) {
    void exportBuildingsXlsx(scope)
  }
}

async function exportBuildingsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: BuildingRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('building.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('building.exportEmpty'))
      return
    }
    const sheetRows = rows.map((b) => buildingToIoRow(b, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Buildings')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `buildings-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('building.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('building.importFailed'))
  } finally {
    exporting.value = false
  }
}

function onImportFile(ev: Event) {
  void runImportFile(ev)
}

async function runImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAdmin.value) {
    ElMessage.warning(t('building.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'updated', 'skipped', 'failed'],
  })
  try {
    setImportPreparing()
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rawRows.length) {
      finishImport({ tone: 'warning', message: t('building.importEmpty') })
      return
    }

    const payloads: BuildingWritePayload[] = []
    for (const row of rawRows) {
      const parsed = rowToBuildingIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              大廈名稱: String(row['大廈名稱'] ?? row['大厦名称'] ?? row['大廈'] ?? row['大厦'] ?? ''),
            },
          },
        ])
        continue
      }
      payloads.push(parsed)
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(payloads, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importBuildingsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.updated) bumpImport('updated', data.updated)
        if (data.skipped) bumpImport('skipped', data.skipped)
        if (data.failed) bumpImport('failed', data.failed)
        appendImportIssues(data.issues)
      } catch {
        bumpImport('failed', batch.length)
        appendImportIssues(
          batch.map((it) => ({
            status: 'failed' as const,
            reason: t('common.importUi.batchRequestFailed'),
            keys: { 大廈名稱: it.name || '' },
          })),
        )
      }
    }

    await loadList()
    void loadManagerOptions()
    resetPage()
    finishImport()
  } catch {
    failImport(t('building.importFailed'))
  }
}

function openCreate() {
  editing.value = null
  void loadTemplateOptions()
  Object.assign(form, {
    name: '',
    address: '',
    addressEn: '',
    manager: '',
    managerPhone: '',
    email: '',
    workingHours: '',
    fpsId: '',
    bankAccountHolder: '',
    bankAccount: '',
    apiTemplateSuffix: '',
    useWbaNumber: '',
    buildingConfig: '',
    chequePaymentBy: '',
    paymentAdvice: '',
    agreementTemplateId: '',
    invoiceTemplateId: '',
    receiptTemplateId: '',
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: BuildingRecord) {
  editing.value = row
  void loadTemplateOptions()
  Object.assign(form, {
    name: row.name,
    address: row.address,
    addressEn: row.addressEn,
    manager: row.manager,
    managerPhone: row.managerPhone,
    email: row.email,
    workingHours: row.workingHours,
    fpsId: row.fpsId || '',
    bankAccountHolder: row.bankAccountHolder || '',
    bankAccount: row.bankAccount || '',
    apiTemplateSuffix: row.apiTemplateSuffix || '',
    useWbaNumber: row.useWbaNumber || '',
    buildingConfig: row.buildingConfig || '',
    chequePaymentBy: row.chequePaymentBy || '',
    paymentAdvice: row.paymentAdvice || '',
    agreementTemplateId: row.agreementTemplateId || '',
    invoiceTemplateId: row.invoiceTemplateId || '',
    receiptTemplateId: row.receiptTemplateId || '',
    active: row.active,
  })
  formVisible.value = true
}

async function toggleActive(row: BuildingRecord) {
  try {
    await updateBuildingApi(row.id, { active: !row.active })
    await loadList()
    void loadManagerOptions()
  } catch {
    /* interceptor */
  }
}

async function saveForm() {
  if (!form.name.trim()) return
  if (!editing.value && !isAdmin.value) {
    ElMessage.warning(t('building.importAdminOnly'))
    return
  }
  try {
    const payload: BuildingWritePayload = {
      ...form,
      agreementTemplateId: form.agreementTemplateId || null,
      invoiceTemplateId: form.invoiceTemplateId || null,
      receiptTemplateId: form.receiptTemplateId || null,
    }
    if (editing.value) {
      await updateBuildingApi(editing.value.id, payload)
    } else {
      await createBuildingApi(payload)
    }
    await loadList()
    void loadManagerOptions()
    formVisible.value = false
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.buildings') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('building.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('building.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('building.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('building.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('building.downloadTemplate') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export-page" divided>
                <el-icon><Download /></el-icon>
                <span>{{ t('common.exportPage') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export-filtered">
                <el-icon><Download /></el-icon>
                <span>{{ t('common.exportFiltered') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export-all">
                <el-icon><Download /></el-icon>
                <span>{{ t('common.exportAll') }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <input
          ref="importInputRef"
          type="file"
          class="room-io-file"
          accept=".xlsx,.xls,.csv"
          @change="onImportFile"
        />
      </div>
    </div>

    <div v-if="!useCards" class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="tableLayoutKey"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
          empty-text="—"
          class="building-table--clickable"
          style="width: 100%"
          @selection-change="onSelectionChange"
          @row-click="onBuildingRowClick"
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
            prop="name"
            :min-width="textColW(t('building.fields.name'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="address"
            :label="t('building.fields.address')"
            :min-width="textColW(t('building.fields.address'), { kind: 'address' })"
            class-name="col-address"
            label-class-name="col-address"
            show-overflow-tooltip
          />
          <el-table-column
            prop="manager"
            :min-width="colW(t('building.fields.manager'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.manager')"
                filterable
                sortable
                :options="managerFilterOptions"
                :model-value="filters.manager || []"
                :sort-order="sortOrderOf('manager')"
                @update:model-value="(v) => setFilter('manager', v)"
                @update:sort-order="(v) => setSort('manager', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="managerPhone"
            :label="t('building.fields.managerPhone')"
            :min-width="colW(t('building.fields.managerPhone'), { contentMin: 130 })"
          />
          <el-table-column
            prop="email"
            :label="t('building.fields.email')"
            :min-width="colW(t('building.fields.email'), { contentMin: 200 })"
          />
          <el-table-column
            prop="workingHours"
            :label="t('building.fields.workingHours')"
            :min-width="colW(t('building.fields.workingHours'), { contentMin: 176 })"
          />
          <el-table-column
            :min-width="colW(t('building.fields.rooms'), { interactive: true, contentMin: 108 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.rooms')"
                sortable
                :sort-order="sortOrderOf('roomCount')"
                @update:sort-order="(v) => setSort('roomCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="(row as BuildingRecord).roomIds.length"
                @click="openRoomsSide(row as BuildingRecord)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('building.fields.active'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.active')"
                filterable
                :options="activeFilterOptions"
                :model-value="filters.active || []"
                @update:model-value="(v) => setFilter('active', v)"
              />
            </template>
            <template #default="{ row }">
              <el-switch
                :model-value="(row as BuildingRecord).active"
                @change="() => toggleActive(row as BuildingRecord)"
              />
            </template>
          </el-table-column>
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
                <button type="button" class="action-pill action-pill--view" @click.stop="openDetail(row as BuildingRecord)">
                  {{ t('common.detail') }}
                </button>
                <button type="button" class="action-pill action-pill--edit" @click.stop="openEdit(row as BuildingRecord)">
                  {{ t('common.edit') }}
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
          <template v-if="isAdmin" #batch>
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

    <div v-else class="data-cards">
      <article v-for="row in list" :key="row.id" class="data-card">
        <div class="data-card__head">
          <div>
            <h3 class="data-card__title">{{ row.name }}</h3>
            <p class="data-card__meta">{{ row.address }}</p>
          </div>
          <CountListPill
            :count="row.roomIds.length"
            @click="openRoomsSide(row)"
          />
        </div>
        <dl class="data-card__grid">
          <div>
            <dt>{{ t('building.fields.manager') }}</dt>
            <dd>{{ row.manager }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.managerPhone') }}</dt>
            <dd>{{ row.managerPhone }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('building.fields.email') }}</dt>
            <dd>{{ row.email }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.workingHours') }}</dt>
            <dd>{{ row.workingHours }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.active') }}</dt>
            <dd>
              <el-switch :model-value="row.active" @change="() => toggleActive(row)" />
            </dd>
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
        <div class="data-card__actions">
          <button type="button" class="action-pill action-pill--view" @click="openDetail(row)">
            {{ t('common.detail') }}
          </button>
          <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
            {{ t('common.edit') }}
          </button>
        </div>
      </article>
      <el-empty v-if="!list.length" />
      <div v-if="total" class="table-pagination cards-pagination">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>

    <BuildingDetailDrawer
      v-model="drawerVisible"
      :building="current"
      @open-rooms="openRoomsSide"
    />
    <RelatedRoomsDrawer
      v-model="relatedRoomsDrawer"
      :building="relatedRoomsBuilding"
      desktop-direction="ltr"
      @open-room="onOpenRoomFromList"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('building.edit') : t('building.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      align-center
      class="lb-dialog"
    >
      <el-form label-position="top" class="building-form">
        <div class="form-grid">
          <div class="form-section">
            <h3>{{ t('building.sections.basic') }}</h3>
          </div>
          <el-form-item :label="t('building.fields.name')" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="t('building.fields.manager')">
            <el-input v-model="form.manager" />
          </el-form-item>
          <el-form-item :label="t('building.fields.address')" class="span-2">
            <el-input v-model="form.address" />
          </el-form-item>
          <el-form-item :label="t('building.fields.addressEn')" class="span-2">
            <el-input v-model="form.addressEn" />
          </el-form-item>
          <el-form-item :label="t('building.fields.managerPhone')">
            <el-input v-model="form.managerPhone" />
          </el-form-item>
          <el-form-item :label="t('building.fields.email')">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item :label="t('building.fields.workingHours')" class="span-2">
            <WorkingHoursField v-model="form.workingHours" />
          </el-form-item>
          <el-form-item :label="t('building.fields.buildingConfig')">
            <el-input v-model="form.buildingConfig" />
          </el-form-item>
          <el-form-item :label="t('building.fields.active')">
            <el-switch v-model="form.active" />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('building.sections.finance') }}</h3>
          </div>
          <el-form-item label="FPS_ID">
            <el-input v-model="form.fpsId" />
          </el-form-item>
          <el-form-item :label="t('building.fields.bankAccountHolder')">
            <el-input v-model="form.bankAccountHolder" />
          </el-form-item>
          <el-form-item :label="t('building.fields.bankAccount')">
            <el-input v-model="form.bankAccount" />
          </el-form-item>
          <el-form-item :label="t('building.fields.useWbaNumber')">
            <el-input v-model="form.useWbaNumber" />
          </el-form-item>
          <el-form-item :label="t('building.fields.apiTemplateSuffix')">
            <el-input v-model="form.apiTemplateSuffix" />
          </el-form-item>
          <el-form-item label="Cheque Payment By">
            <el-input v-model="form.chequePaymentBy" />
          </el-form-item>
          <el-form-item label="Payment Advice" class="span-2">
            <el-input v-model="form.paymentAdvice" type="textarea" :rows="2" />
          </el-form-item>

          <div class="form-section form-section--with-hint">
            <h3>{{ t('building.sections.templates') }}</h3>
            <p class="form-section-side-hint">{{ t('building.templateBindHint') }}</p>
          </div>
          <el-form-item
            v-for="slot in TEMPLATE_SLOTS"
            :key="slot.type"
            :label="t(slot.label)"
            class="span-2"
          >
            <div class="template-bind-row">
              <el-select
                v-model="form[slot.formKey]"
                clearable
                filterable
                class="template-bind-select"
                :placeholder="t('building.chooseTemplate')"
              >
                <el-option
                  v-for="opt in templatesOf(slot.type)"
                  :key="opt.id"
                  :label="`${opt.name}（${opt.fileName}）`"
                  :value="opt.id"
                />
              </el-select>
              <el-button
                :disabled="!form[slot.formKey]"
                @click="onPreviewSelectedTemplate(slot.type)"
              >
                {{ t('building.templatePreviewHint') }}
              </el-button>
            </div>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveForm">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <ImportProgressDialog
      v-model="importState.visible"
      :phase="importState.phase"
      :file-name="importState.fileName"
      :total="importState.total"
      :current="importState.current"
      :percentage="importPercentage"
      :status-key="importState.statusKey"
      :stats="importState.stats"
      :result-tone="importState.resultTone"
      :result-message="importState.resultMessage"
      :result-stat-keys="importState.resultStatKeys"
      :issues="importState.issues"
      @close="closeImport"
    />

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
.building-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.building-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.building-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}

.form-section--with-hint {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.form-section--with-hint h3 {
  margin-bottom: 8px;
}

.form-section-side-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-placeholder);
  text-align: right;
}

.template-bind-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.template-bind-select {
  flex: 1;
  min-width: 0;
}
</style>
