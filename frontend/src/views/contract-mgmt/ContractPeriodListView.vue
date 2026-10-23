<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createContractPeriodApi,
  deleteContractPeriodApi,
  batchDeleteContractPeriodsApi,
  fetchContractPeriod,
  fetchContractPeriods,
  importContractPeriodsApi,
  updateContractPeriodApi,
} from '@/api/contract-periods'
import type {
  ContractPeriodListQuery,
  ContractPeriodWritePayload,
} from '@/api/contract-periods'
import { fetchContracts } from '@/api/contracts'
import { fetchContractConfigs } from '@/api/contract-configs'
import type { ContractPeriodListRecord } from '@/types/contract-period'
import type { ContractRecord } from '@/types/contract'
import { CONTRACT_PERIOD_UNITS } from '@/types/contract'
import type { ContractConfigOption } from '@/types/contract-config'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import ContractPeriodDetailDrawer from '@/components/ContractPeriodDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime } from '@/utils/format'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  contractPeriodIoTemplateExampleRow,
  contractPeriodToIoRow,
  rowToContractPeriodIoPayload,
} from '@/utils/contractPeriodExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const PAGE_SIZES = [10, 20, 50, 100]
const EXPORT_PAGE_SIZE = 500

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const perms = useResourcePermissions('contractPeriods')
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, datetimeColWidth, tableLayoutKey } = useTableColWidth()

const keyword = ref('')
const loading = ref(false)
const exporting = ref(false)
const formVisible = ref(false)
const editing = ref<ContractPeriodListRecord | null>(null)
const list = ref<ContractPeriodListRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const pageSizes = PAGE_SIZES
const contracts = ref<ContractRecord[]>([])
const periodTypeOptions = ref<ContractConfigOption[]>([])

/** 编号列宽随当前页数据变化时强制重算（避免首屏空列表后列宽卡住） */
const codeLayoutKey = computed(() =>
  [
    codeColW(t('contractPeriod.fields.contractCode'), {
      interactive: true,
      samples: list.value.map((r) => r.contractCode),
    }),
    codeColW(t('contractPeriod.fields.roomCode'), {
      samples: list.value.map((r) => r.roomCode),
    }),
  ].join('-'),
)

const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const drawerVisible = ref(false)
const current = ref<ContractPeriodListRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')

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
  sortKey,
  sortOrder,
} = useTableSortFilter<ContractPeriodListRecord>()

const dateTypeFilterOptions = computed(() =>
  periodTypeOptions.value.map((o) => ({ value: o.label, label: o.label })),
)

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const c of contracts.value) {
    const name = c.customerName?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const contractFilterOptions = computed(() =>
  contracts.value.map((c) => ({
    value: c.id,
    label: `${c.contractCode} · ${c.customerName} · ${c.roomCode}`,
  })),
)

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ContractPeriodListRecord>()
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
  if (!perms.batchDelete.value || !selectedIds.value.length) return
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteContractPeriodsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

function rowIndex(indexOnPage: number) {
  return (page.value - 1) * pageSize.value + indexOnPage + 1
}

function resetPage() {
  page.value = 1
}

function rangePair(key: string): { from?: string; to?: string } {
  const range = dateRangeOf(key)
  if (!range?.[0] || !range?.[1]) return {}
  return { from: range[0], to: range[1] }
}

function buildListQuery(overrides?: Partial<ContractPeriodListQuery>): ContractPeriodListQuery {
  const start = rangePair('startDate')
  const end = rangePair('endDate')
  const created = rangePair('createdAt')
  const updated = rangePair('updatedAt')
  const dateTypes = filters.dateType?.length ? [...filters.dateType] : undefined
  return {
    keyword: keyword.value.trim() || undefined,
    customerNames: filters.customerName?.length ? [...filters.customerName] : undefined,
    dateTypes,
    sortBy: sortKey.value || undefined,
    sortDir: sortOrder.value || undefined,
    startDateFrom: start.from,
    startDateTo: start.to,
    endDateFrom: end.from,
    endDateTo: end.to,
    createdAtFrom: created.from,
    createdAtTo: created.to,
    updatedAtFrom: updated.from,
    updatedAtTo: updated.to,
    page: page.value,
    pageSize: pageSize.value,
    ...overrides,
  }
}

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchContractPeriods(buildListQuery())
    list.value = data.items
    total.value = data.total
    const maxPage = Math.max(1, Math.ceil(data.total / pageSize.value) || 1)
    if (page.value > maxPage) {
      suppressWatch = true
      page.value = maxPage
      suppressWatch = false
    }
  } finally {
    loading.value = false
  }
}

async function fetchExportRows(scope: 'filtered' | 'all'): Promise<ContractPeriodListRecord[]> {
  const base: ContractPeriodListQuery =
    scope === 'all'
      ? { page: 1, pageSize: EXPORT_PAGE_SIZE }
      : buildListQuery({ page: 1, pageSize: EXPORT_PAGE_SIZE })

  const rows: ContractPeriodListRecord[] = []
  let pageNo = 1
  let totalCount = Infinity
  while (rows.length < totalCount) {
    const { data } = await fetchContractPeriods({
      ...base,
      page: pageNo,
      pageSize: EXPORT_PAGE_SIZE,
    })
    rows.push(...data.items)
    totalCount = data.total
    if (!data.items.length) break
    pageNo += 1
  }
  return rows
}

let keywordTimer: ReturnType<typeof setTimeout> | null = null
let suppressWatch = false

watch(keyword, () => {
  if (suppressWatch) return
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    resetPage()
    void loadList()
  }, 300)
})

watch(
  [filters, dateRanges, sortKey, sortOrder],
  () => {
    if (suppressWatch) return
    resetPage()
    void loadList()
  },
  { deep: true },
)

watch(page, () => {
  if (suppressWatch) return
  void loadList()
})

watch(pageSize, () => {
  if (suppressWatch) return
  suppressWatch = true
  resetPage()
  suppressWatch = false
  void loadList()
})

function onClearFilters() {
  suppressWatch = true
  if (keywordTimer) clearTimeout(keywordTimer)
  clearAll()
  keyword.value = ''
  resetPage()
  suppressWatch = false
  void loadList()
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '720px'))

const emptyForm = () => ({
  contractId: '' as string,
  dateType: '',
  dateUnit: '月' as (typeof CONTRACT_PERIOD_UNITS)[number],
  dateValue: 12,
  startDate: '',
  endDate: '',
  sortOrder: 0,
})

const form = reactive(emptyForm())

function periodDurationLabel(p: Pick<ContractPeriodListRecord, 'dateValue' | 'dateUnit'>): string {
  const n = Number(p.dateValue) || 0
  return `${n}${p.dateUnit === '日' ? t('contract.periodUnits.日') : t('contract.periodUnits.月')}`
}

async function loadContracts() {
  const [{ data: contractData }, { data: periodTypes }] = await Promise.all([
    fetchContracts(),
    fetchContractConfigs({ type: 'periodType', activeOnly: true }),
  ])
  contracts.value = contractData.items
  periodTypeOptions.value = periodTypes
}

onMounted(async () => {
  await Promise.all([loadContracts(), loadList()])
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  form.dateType = periodTypeOptions.value[0]?.label || '使用期'
  formVisible.value = true
}

function openEdit(row: ContractPeriodListRecord) {
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    dateType: row.dateType || periodTypeOptions.value[0]?.label || '',
    dateUnit: (row.dateUnit as (typeof CONTRACT_PERIOD_UNITS)[number]) || '月',
    dateValue: row.dateValue ?? 0,
    startDate: row.startDate || '',
    endDate: row.endDate || '',
    sortOrder: row.sortOrder ?? 0,
  })
  formVisible.value = true
}

function payloadFromForm(): ContractPeriodWritePayload {
  return {
    contractId: form.contractId.trim(),
    dateType: form.dateType.trim(),
    dateUnit: form.dateUnit,
    dateValue: Math.max(0, Math.floor(Number(form.dateValue) || 0)),
    startDate: form.startDate,
    endDate: form.endDate,
    sortOrder: Math.floor(Number(form.sortOrder) || 0),
  }
}

async function saveForm() {
  if (!form.contractId.trim()) {
    ElMessage.warning(t('contractPeriod.contractRequired'))
    return
  }
  if (!form.dateType.trim()) {
    ElMessage.warning(t('contractPeriod.dateTypeRequired'))
    return
  }
  if (!form.startDate || !form.endDate) {
    ElMessage.warning(t('contractPeriod.datesRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateContractPeriodApi(editing.value.id, payload)
      ElMessage.success(t('contractPeriod.updated'))
    } else {
      await createContractPeriodApi(payload)
      ElMessage.success(t('contractPeriod.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ContractPeriodListRecord) {
  try {
    await ElMessageBox.confirm(
      t('contractPeriod.deleteConfirm', { code: row.contractCode, dateType: row.dateType }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteContractPeriodApi(row.id)
    ElMessage.success(t('contractPeriod.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: ContractPeriodListRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchContractPeriod(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: ContractPeriodListRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  void openDetail(row, 'rtl')
}

async function openContractSide(contractId?: string | null, _direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openContractSide(contractId)
}

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openCustomerSide(customerId, direction)
}

async function openRoomSide(roomId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openRoomSide(roomId, direction)
}

const importInputRef = ref<HTMLInputElement | null>(null)
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

function onDataIoCommand(cmd: string | number) {
  if (cmd === 'import') {
    importInputRef.value?.click()
    return
  }
  if (cmd === 'template') {
    downloadImportTemplate()
    return
  }
  const scope = exportScopeFromCommand(cmd)
  if (scope) {
    void exportContractPeriodsXlsx(scope)
  }
}

function downloadImportTemplate() {
  const example = contractPeriodIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ContractPeriods')
  XLSX.writeFile(wb, 'contract-periods-import-template.xlsx')
  ElMessage.success(t('contractPeriod.templateDone'))
}

async function exportContractPeriodsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ContractPeriodListRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('contractPeriod.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => contractPeriodToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ContractPeriods')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `contract-periods-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('contractPeriod.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('contractPeriod.importFailed'))
  } finally {
    exporting.value = false
  }
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!perms.import.value) {
    ElMessage.warning(t('contractPeriod.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'skipped', 'unlinked', 'failed'],
  })
  try {
    setImportPreparing()
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rawRows.length) {
      finishImport({
        tone: 'warning',
        message: t('contractPeriod.importEmpty'),
      })
      return
    }

    const payloads: ContractPeriodWritePayload[] = []
    for (const row of rawRows) {
      const parsed = rowToContractPeriodIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
              房間編號: String(row['房間編號'] ?? row['房间编号'] ?? ''),
              客戶名稱: String(row['客戶名稱'] ?? row['客户名称'] ?? ''),
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
        const { data } = await importContractPeriodsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.skipped) bumpImport('skipped', data.skipped)
        if (data.unlinked) bumpImport('unlinked', data.unlinked)
        if (data.failed) bumpImport('failed', data.failed)
        appendImportIssues(data.issues)
      } catch {
        bumpImport('failed', batch.length)
        appendImportIssues(
          batch.map((it) => ({
            status: 'failed' as const,
            reason: t('common.importUi.batchRequestFailed'),
            keys: {
              合約編號: it.contractCode || '',
              房間編號: it.roomCode || '',
              客戶名稱: it.customerName || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('contractPeriod.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.contractPeriods') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('contractPeriod.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('contractPeriod.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('contractPeriod.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('contractPeriod.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('contractPeriod.downloadTemplate') }}</span>
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

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${codeLayoutKey}`"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
          scrollbar-always-on
          style="width: 100%"
          @selection-change="onSelectionChange"
          @row-click="onRowClick"
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
            :width="codeColW(t('contractPeriod.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractPeriod.fields.contractCode')"
                sortable
                :sort-order="sortOrderOf('contractCode')"
                @update:sort-order="(v) => setSort('contractCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.contractId"
                type="button"
                class="fk-link"
                :title="row.contractCode"
                @click.stop="openContractSide(row.contractId)"
              >
                {{ row.contractCode || '—' }}
              </button>
              <span v-else>{{ row.contractCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractPeriod.fields.dateType'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractPeriod.fields.dateType')"
                filterable
                sortable
                :options="dateTypeFilterOptions"
                :model-value="filters.dateType || []"
                :sort-order="sortOrderOf('dateType')"
                @update:model-value="(v) => setFilter('dateType', v)"
                @update:sort-order="(v) => setSort('dateType', v)"
              />
            </template>
            <template #default="{ row }">{{ row.dateType || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractPeriod.fields.dateUnit')"
            :min-width="colW(t('contractPeriod.fields.dateUnit'), { contentMin: 72 })"
          >
            <template #default="{ row }">
              {{ t(`contract.periodUnits.${row.dateUnit}`, row.dateUnit) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractPeriod.fields.dateValue'), { interactive: true, contentMin: 72 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractPeriod.fields.dateValue')"
                sortable
                :sort-order="sortOrderOf('dateValue')"
                @update:sort-order="(v) => setSort('dateValue', v)"
              />
            </template>
            <template #default="{ row }">{{ row.dateValue ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractPeriod.fields.duration')"
            :min-width="colW(t('contractPeriod.fields.duration'), { contentMin: 80 })"
          >
            <template #default="{ row }">{{ periodDurationLabel(row) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractPeriod.fields.startDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractPeriod.fields.startDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('startDate')"
                :date-range-value="dateRangeOf('startDate')"
                @update:sort-order="(v) => setSort('startDate', v)"
                @update:date-range-value="(v) => setDateRange('startDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.startDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractPeriod.fields.endDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractPeriod.fields.endDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('endDate')"
                :date-range-value="dateRangeOf('endDate')"
                @update:sort-order="(v) => setSort('endDate', v)"
                @update:date-range-value="(v) => setDateRange('endDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.endDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('contractPeriod.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractPeriod.fields.customerName')"
                filterable
                sortable
                :options="customerNameFilterOptions"
                :model-value="filters.customerName || []"
                :sort-order="sortOrderOf('customerName')"
                @update:model-value="(v) => setFilter('customerName', v)"
                @update:sort-order="(v) => setSort('customerName', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.customerId"
                type="button"
                class="fk-link"
                :title="row.customerName"
                @click.stop="openCustomerSide(row.customerId)"
              >
                {{ row.customerName || '—' }}
              </button>
              <span v-else>{{ row.customerName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('contractPeriod.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractPeriod.fields.roomCode')"
                sortable
                :sort-order="sortOrderOf('roomCode')"
                @update:sort-order="(v) => setSort('roomCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.roomId"
                type="button"
                class="fk-link"
                :title="row.roomCode"
                @click.stop="openRoomSide(row.roomId)"
              >
                {{ row.roomCode || '—' }}
              </button>
              <span v-else>{{ row.roomCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="sortOrder"
            :label="t('contractPeriod.fields.sortOrder')"
            :min-width="colW(t('contractPeriod.fields.sortOrder'), { contentMin: 64 })"
            align="center"
            header-align="center"
          />
          <el-table-column
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
            v-if="perms.canEditOrDelete"
            :label="t('common.actions')"
            :width="actionColWidth.two"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--danger"
                  @click.stop="onDelete(row)"
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

    <ContractPeriodDetailDrawer
      v-model="drawerVisible"
      :period="current"
      :desktop-direction="detailDirection"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('contractPeriod.edit') : t('contractPeriod.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="period-form">
        <div class="form-grid">
          <el-form-item :label="t('contractPeriod.fields.contractCode')" required class="span-2">
            <el-select
              v-model="form.contractId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('contractPeriod.fields.contractCode')"
              :disabled="!!editing"
            >
              <el-option
                v-for="opt in contractFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('contractPeriod.fields.dateType')" required>
            <el-select v-model="form.dateType" filterable style="width: 100%">
              <el-option
                v-for="pt in periodTypeOptions"
                :key="pt.id"
                :label="pt.label"
                :value="pt.label"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('contractPeriod.fields.dateUnit')">
            <el-select v-model="form.dateUnit" style="width: 100%">
              <el-option
                v-for="u in CONTRACT_PERIOD_UNITS"
                :key="u"
                :label="t(`contract.periodUnits.${u}`)"
                :value="u"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('contractPeriod.fields.dateValue')">
            <el-input-number
              v-model="form.dateValue"
              :min="0"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractPeriod.fields.duration')">
            <el-input :model-value="periodDurationLabel(form)" readonly />
          </el-form-item>
          <el-form-item :label="t('contractPeriod.fields.startDate')" required>
            <el-date-picker
              v-model="form.startDate"
              type="date"
              value-format="YYYY-MM-DD"
              :placeholder="t('contractPeriod.fields.startDate')"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractPeriod.fields.endDate')" required>
            <el-date-picker
              v-model="form.endDate"
              type="date"
              value-format="YYYY-MM-DD"
              :placeholder="t('contractPeriod.fields.endDate')"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractPeriod.fields.sortOrder')">
            <el-input-number
              v-model="form.sortOrder"
              :min="0"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
        </div>
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
.period-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.period-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}
</style>
