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
import { fetchWhatsappBusinessNumbers } from '@/api/whatsapp-business-numbers'
import type { DocumentTemplateRecord, DocumentTemplateType } from '@/types/document-template'
import type { BuildingRecord } from '@/types/building'
import type { WhatsappBusinessNumber } from '@/types/whatsapp'
import type { RoomRecord } from '@/types/room'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'

import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import CountListPill from '@/components/CountListPill.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import WorkingHoursField from '@/components/WorkingHoursField.vue'
import {
  buildingIoTemplateExampleRow,
  buildingToIoRow,
  rowToBuildingIoPayload,
} from '@/utils/buildingExport'
import { useUserStore } from '@/stores/user'
import { useBuildingScopeStore } from '@/stores/buildingScope'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { EMPTY_FILTER_VALUE, packFilterValues } from '@/utils/columnFilter'
import { ACTION_COL_ICON, useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, QuestionFilled, Search, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'

const { t } = useI18n()
const userStore = useUserStore()
const buildingScope = useBuildingScopeStore()
const perms = useResourcePermissions('buildings')

/** 大厦增删改后刷新顶栏「全部大厦」筛选选项 */
function refreshHeaderBuildingOptions() {
  void buildingScope.load()
}
const { actionColW } = useActionColWidth()
const listActionColWidth = computed(() =>
  actionColW([ACTION_COL_ICON, perms.update && t('common.edit')]),
)
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
  uniqueOptions,
} = useTableSortFilter<BuildingRecord>()

const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])
const nameFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.name))

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
      names: packFilterValues(f.name),
      managers: packFilterValues(f.manager),
      active: packFilterValues(f.active),
      createdBys: packFilterValues(f.createdBy),
      updatedBys: packFilterValues(f.updatedBy),
      createdAtEmpty: (f.createdAt || []).includes(EMPTY_FILTER_VALUE) || undefined,
      updatedAtEmpty: (f.updatedAt || []).includes(EMPTY_FILTER_VALUE) || undefined,
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

const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))
const updatedByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.updatedBy))

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
  if (!perms.batchDelete || !selectedIds.value.length) return
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
    refreshHeaderBuildingOptions()
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

const whatsappNumberOptions = ref<WhatsappBusinessNumber[]>([])

async function loadWhatsappOptions() {
  try {
    const { data } = await fetchWhatsappBusinessNumbers({ activeOnly: true })
    whatsappNumberOptions.value = data
  } catch {
    /* interceptor / silent */
  }
}

onMounted(() => {
  void loadList()
  void loadManagerOptions()
  void loadTemplateOptions()
  void loadWhatsappOptions()
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
  whatsappBusinessNumberId: '' as string,
  whatsappAutoSendEnabled: false,
  chequePaymentBy: '',
  paymentAdvice: '',
  agreementTemplateId: '' as string,
  invoiceTemplateId: '' as string,
  receiptTemplateId: '' as string,
  active: true,
})

/** 编辑时 pin 已绑定（含停用）项，避免下拉丢失当前值 */
const whatsappNumberSelectOptions = computed(() => {
  const list = [...whatsappNumberOptions.value]
  const id = form.whatsappBusinessNumberId
  if (id && !list.some((n) => n.id === id) && editing.value?.whatsappBusinessNumberId === id) {
    list.unshift({
      id,
      label: editing.value.whatsappBusinessNumberLabel || editing.value.whatsappBusinessPhoneNumber || id,
      phoneNumber: editing.value.whatsappBusinessPhoneNumber || '',
      sortOrder: 0,
      active: false,
      createdBy: '',
      createdAt: '',
      updatedBy: '',
      updatedAt: '',
    })
  }
  return list
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
  if (!perms.import) {
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

    let waNumbers: WhatsappBusinessNumber[] = []
    try {
      const numsRes = await fetchWhatsappBusinessNumbers({ activeOnly: false })
      waNumbers = numsRes.data
    } catch {
      /* 解析时无目录则号码留空 */
    }
    const phoneToId = new Map(waNumbers.map((n) => [n.phoneNumber.trim().toLowerCase(), n.id]))

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
      const phoneKey = parsed.whatsappBusinessPhoneNumber.trim().toLowerCase()
      payloads.push({
        name: parsed.name,
        address: parsed.address,
        addressEn: parsed.addressEn,
        manager: parsed.manager,
        managerPhone: parsed.managerPhone,
        email: parsed.email,
        workingHours: parsed.workingHours,
        fpsId: parsed.fpsId,
        bankAccountHolder: parsed.bankAccountHolder,
        bankAccount: parsed.bankAccount,
        chequePaymentBy: parsed.chequePaymentBy,
        paymentAdvice: parsed.paymentAdvice,
        active: parsed.active,
        whatsappAutoSendEnabled: parsed.whatsappAutoSendEnabled,
        whatsappBusinessNumberId: phoneKey ? phoneToId.get(phoneKey) || null : null,
      })
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
    refreshHeaderBuildingOptions()
    resetPage()
    finishImport()
  } catch {
    failImport(t('building.importFailed'))
  }
}

function openCreate() {
  editing.value = null
  void loadTemplateOptions()
  void loadWhatsappOptions()
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
    whatsappBusinessNumberId: '',
    whatsappAutoSendEnabled: false,
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
  void loadWhatsappOptions()
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
    whatsappBusinessNumberId: row.whatsappBusinessNumberId || '',
    whatsappAutoSendEnabled: !!row.whatsappAutoSendEnabled,
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
    refreshHeaderBuildingOptions()
  } catch {
    /* interceptor */
  }
}

async function saveForm() {
  if (!form.name.trim()) return
  if (!editing.value && !perms.create) {
    ElMessage.warning(t('building.importAdminOnly'))
    return
  }
  try {
    const payload: BuildingWritePayload = {
      ...form,
      agreementTemplateId: form.agreementTemplateId || null,
      invoiceTemplateId: form.invoiceTemplateId || null,
      receiptTemplateId: form.receiptTemplateId || null,
      whatsappBusinessNumberId: form.whatsappBusinessNumberId || null,
      whatsappAutoSendEnabled: !!form.whatsappAutoSendEnabled,
    }
    if (editing.value) {
      await updateBuildingApi(editing.value.id, payload)
    } else {
      await createBuildingApi(payload)
    }
    await loadList()
    void loadManagerOptions()
    refreshHeaderBuildingOptions()
    formVisible.value = false
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <RefreshListButton :loading="loading" @refresh="() => void loadList()" />
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
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
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
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
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

    <div v-if="!useCards" class="table-card">
      <div
        class="table-scroll"
        v-loading="loading"
        element-loading-background="rgba(247, 250, 248, 0.78)"
      >
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${listActionColWidth}`"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
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
                filterable
                sortable
                :options="nameFilterOptions"
                :model-value="filters.name || []"
                :sort-order="sortOrderOf('name')"
                @update:model-value="(v) => setFilter('name', v)"
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
            header-align="center"
            class-name="col-switch"
            label-class-name="col-switch"
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
          <el-table-column prop="createdAt" :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
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
            :width="listActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <ActionDetailButton @click="openDetail(row as BuildingRecord)" />
                <button
                  v-if="perms.update" v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row as BuildingRecord)"
                >
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
          <ActionDetailButton @click="openDetail(row)" />
          <button
            v-if="perms.update" v-admin-glow="perms.codes.update"
            type="button"
            class="action-pill action-pill--edit"
            @click="openEdit(row)"
          >
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
          <el-form-item :label="t('building.fields.email')">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item :label="t('building.fields.manager')">
            <el-input v-model="form.manager" />
          </el-form-item>
          <el-form-item :label="t('building.fields.managerPhone')">
            <el-input v-model="form.managerPhone" />
          </el-form-item>
          <el-form-item :label="t('building.fields.address')" class="span-2">
            <el-input v-model="form.address" />
          </el-form-item>
          <el-form-item :label="t('building.fields.addressEn')" class="span-2">
            <el-input v-model="form.addressEn" />
          </el-form-item>
          <el-form-item :label="t('building.fields.workingHours')" class="span-2">
            <WorkingHoursField v-model="form.workingHours" />
          </el-form-item>
          <el-form-item :label="t('building.fields.active')">
            <el-switch v-model="form.active" />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('building.sections.finance') }}</h3>
          </div>
          <el-form-item :label="t('building.fields.bankAccount')">
            <el-input v-model="form.bankAccount" />
          </el-form-item>
          <el-form-item :label="t('building.fields.bankAccountHolder')">
            <el-input v-model="form.bankAccountHolder" />
          </el-form-item>
          <el-form-item :label="t('building.fields.fpsId')">
            <el-input v-model="form.fpsId" />
          </el-form-item>
          <el-form-item :label="t('building.fields.chequePaymentBy')" class="span-2">
            <el-input v-model="form.chequePaymentBy" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('building.fields.paymentAdvice')" class="span-2">
            <el-input v-model="form.paymentAdvice" type="textarea" :rows="2" />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('building.sections.whatsapp') }}</h3>
          </div>
          <el-form-item :label="t('building.fields.whatsappBusinessNumber')">
            <el-select
              v-model="form.whatsappBusinessNumberId"
              clearable
              value-on-clear=""
              filterable
              class="template-bind-select"
              :placeholder="t('common.pleaseSelect')"
            >
              <el-option
                v-for="opt in whatsappNumberSelectOptions"
                :key="opt.id"
                :label="`${opt.label}（${opt.phoneNumber}）`"
                :value="opt.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('building.fields.whatsappTemplatesBound')">
            <div v-if="(editing?.whatsappTemplates || []).length" class="wa-bound-templates">
              <div
                v-for="tpl in editing?.whatsappTemplates || []"
                :key="tpl.id"
                class="wa-bound-templates__row"
              >
                <span class="wa-bound-templates__cat">{{ tpl.categoryLabel }}</span>
                <span class="wa-bound-templates__name">{{ tpl.label }}（{{ tpl.templateName }}）</span>
              </div>
            </div>
            <p v-else class="wa-bound-templates__empty">{{ t('building.whatsappTemplatesBoundEmpty') }}</p>
          </el-form-item>
          <el-form-item :label="t('building.fields.whatsappAutoSendEnabled')">
            <el-switch v-model="form.whatsappAutoSendEnabled" />
          </el-form-item>

          <div class="form-section">
            <h3 class="form-section-title-with-tip">
              {{ t('building.sections.templates') }}
              <el-tooltip :content="t('building.templateBindHint')" placement="top">
                <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </h3>
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
                clearable value-on-clear=""
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

.form-section-title-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form-label-tip {
  color: var(--lb-muted, #666);
  cursor: help;
  vertical-align: middle;
  flex-shrink: 0;
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

.wa-bound-templates {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.wa-bound-templates__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 0.9rem;
  line-height: 1.35;
  color: #2f3d36;
}

.wa-bound-templates__cat {
  font-weight: 650;
  color: var(--lb-brand, #0f4a32);
}

.wa-bound-templates__empty {
  margin: 0;
  font-size: 0.88rem;
  color: #7a8a82;
  line-height: 1.4;
}
</style>
