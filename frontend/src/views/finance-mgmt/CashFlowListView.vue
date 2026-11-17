<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Search, Upload } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  deleteCashFlowApi,
  batchDeleteCashFlowsApi,
  fetchCashFlow,
  fetchCashFlowDirectionCounts,
  fetchCashFlows,
  importCashFlowsApi,
  type CashFlowDirectionCounts,
  type CashFlowListQuery,
} from '@/api/cash-flows'
import type { CashFlowRecord } from '@/types/cash-flow'
import { CASH_FLOW_DIRECTIONS, CASH_FLOW_SOURCE_TYPES } from '@/types/cash-flow'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { ACTION_COL_ICON, useActionColWidth } from '@/composables/useActionColWidth'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CountListPill from '@/components/CountListPill.vue'
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import RefundOrderDetailDrawer from '@/components/RefundOrderDetailDrawer.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import ContractSettlementDetailDrawer from '@/components/ContractSettlementDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import { cashFlowDirectionTone, cashFlowSourceTypeTone } from '@/constants/statusBadges'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { useImportProgress } from '@/composables/useImportProgress'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import {
  cashFlowIoTemplateExampleRow,
  cashFlowToIoRow,
  rowToCashFlowIoPayload,
  type CashFlowImportPayload,
} from '@/utils/cashFlowExport'
import { fetchRefundOrder } from '@/api/refund-orders'
import type { RefundOrderRecord } from '@/types/refund-order'
import { fetchContractSettlement } from '@/api/contract-settlements'
import type { ContractSettlementRecord } from '@/types/contract-settlement'

const { t } = useI18n()
const perms = useResourcePermissions('cashFlows')
const { actionColW } = useActionColWidth()
const {
  colW,
  textColW,
  codeColW,
  statusColW,
  datetimeColWidth,
  auditUserColWidth,
  tableLayoutKey,
} = useTableColWidth()

const keyword = ref('')
const drawerVisible = ref(false)
const current = ref<CashFlowRecord | null>(null)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const refundOrderDrawer = ref(false)
const refundOrderRecord = ref<RefundOrderRecord | null>(null)
const relatedCashFlowsVisible = ref(false)
const settlementDrawer = ref(false)
const settlementRecord = ref<ContractSettlementRecord | null>(null)

function openCashFlowsFromRefund(row: RefundOrderRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  refundOrderRecord.value = row
  relatedCashFlowsVisible.value = true
}

async function openCashFlowFromRelated(row: CashFlowRecord) {
  try {
    const { data } = await fetchCashFlow(row.id)
    current.value = data
  } catch {
    current.value = row
  }
  drawerVisible.value = true
}

const directionOptions = computed(() =>
  CASH_FLOW_DIRECTIONS.map((s) => ({
    value: s,
    label: t(`cashFlow.direction.${s}`),
  })),
)
const sourceOptions = computed(() =>
  CASH_FLOW_SOURCE_TYPES.map((s) => ({
    value: s,
    label: t(`cashFlow.sourceType.${s}`),
  })),
)

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
  uniqueOptions,
} = useTableSortFilter<CashFlowRecord>()

/** 页头快捷筛选：全部 / 入账 / 出账（互斥） */
const directionChipFilter = ref<'all' | 'in' | 'out'>('all')
const directionChipCounts = ref<CashFlowDirectionCounts>({ all: 0, in: 0, out: 0 })

const directionChips = computed(() => [
  {
    key: 'all' as const,
    label: t('cashFlow.directionFilterAll'),
    count: directionChipCounts.value.all,
  },
  {
    key: 'in' as const,
    label: t('cashFlow.direction.in'),
    count: directionChipCounts.value.in,
  },
  {
    key: 'out' as const,
    label: t('cashFlow.direction.out'),
    count: directionChipCounts.value.out,
  },
])

async function loadDirectionChipCounts() {
  try {
    const { data } = await fetchCashFlowDirectionCounts()
    directionChipCounts.value = {
      all: data.all ?? 0,
      in: data.in ?? 0,
      out: data.out ?? 0,
    }
  } catch {
    /* interceptor */
  }
}

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
} = useServerPagedList<CashFlowRecord, CashFlowListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const flow = range('flowDate')
    const created = range('createdAt')
    const chipKey = directionChipFilter.value
    return {
      keyword: kw,
      sortBy,
      sortDir,
      flowCodes: packFilterValues(f.flowCode),
      directions: chipKey === 'all' ? packFilterValues(f.direction) : [chipKey],
      amounts: packFilterValues(f.amount),
      sourceTypes: packFilterValues(f.sourceType),
      sourceRefs: packFilterValues(f.sourceRef),
      receiptCounts: packFilterValues(f.receiptCount),
      refundOrderCounts: packFilterValues(f.refundOrderCount),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      createdBys: packFilterValues(f.createdBy),
      flowDateFrom: flow.from,
      flowDateTo: flow.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchCashFlows,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<CashFlowRecord>()
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

watch([keyword, filters, sortKey, sortOrder, dateRanges, directionChipFilter], () => {
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
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteCashFlowsApi(chunk),
      setBatchProgress,
    )
    finishBatch(ok, fail)
    clearSelection()
    await reloadListAndCounts()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

async function reloadListAndCounts() {
  await Promise.all([loadList(), loadDirectionChipCounts()])
}

function setDirectionChipFilter(key: 'all' | 'in' | 'out') {
  if (directionChipFilter.value === key) return
  directionChipFilter.value = key
  if (filters.direction?.length) setFilter('direction', [])
  resetPage()
  void loadList()
}

function onClearCashFlowFilters() {
  directionChipFilter.value = 'all'
  onClearFilters()
  void loadDirectionChipCounts()
}

const cashFlowConditionCount = computed(
  () => activeConditionCount.value + (directionChipFilter.value !== 'all' ? 1 : 0),
)

const listActionColWidth = computed(() =>
  actionColW([ACTION_COL_ICON, perms.delete && t('common.delete')]),
)

const codeLayoutKey = computed(() =>
  [
    codeColW(t('cashFlow.fields.flowCode'), {
      interactive: true,
      samples: list.value.map((r) => r.flowCode),
    }),
    codeColW(t('cashFlow.fields.sourceRef'), {
      interactive: true,
      samples: list.value.map((r) => r.receiptCode || r.refundOrderCode),
    }),
  ].join('-'),
)

const flowCodeFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.flowCode))
const contractCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.contractCode),
)
const customerNameFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.customerName),
)
const sourceRefFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.receiptCode || r.refundOrderCode),
)
const amountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.amount == null ? '' : String(r.amount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const receiptCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.receiptCount ?? (r.receiptId ? 1 : 0))),
)
const refundOrderCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.refundOrderCount ?? (r.refundOrderId ? 1 : 0))),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))

function moneyOrDash(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

async function openDetail(row: CashFlowRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchCashFlow(row.id)
    current.value = data
  } catch {
    current.value = row
  }
  drawerVisible.value = true
  void direction
}

async function onDelete(row: CashFlowRecord) {
  try {
    await ElMessageBox.confirm(
      t('cashFlow.deleteConfirm', { code: row.flowCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteCashFlowApi(row.id, { silentError: true })
    await ElMessageBox.alert(t('cashFlow.deleted'), t('common.tip'), { type: 'success' })
    await reloadListAndCounts()
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
        ?.message ||
      (e as { message?: string })?.message ||
      t('common.error')
    await ElMessageBox.alert(String(msg), t('common.tip'), { type: 'error' })
  }
}

function onRowClick(
  row: CashFlowRecord,
  column: { type?: string } | undefined,
  event: Event,
) {
  if (column?.type === 'selection' || column?.type === 'index') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .fk-link, input, textarea')) return
  void openDetail(row, 'rtl')
}

function openReceiptSide(row: CashFlowRecord) {
  if (!row.receiptId) return
  void relationDrawers.value?.openReceiptSide(row.receiptId)
}

async function openRefundOrderById(refundOrderId: string, fallback?: CashFlowRecord | null) {
  if (!refundOrderId) return
  try {
    const { data } = await fetchRefundOrder(refundOrderId)
    refundOrderRecord.value = data
  } catch {
    const row = fallback
    refundOrderRecord.value = {
      id: refundOrderId,
      refundCode: row?.refundOrderCode || '',
      status: '',
      contractId: row?.contractId || '',
      contractCode: row?.contractCode || '',
      customerId: row?.customerId || '',
      customerCode: row?.customerCode || '',
      customerName: row?.customerName || '',
      roomId: null,
      roomCode: '',
      roomName: '',
      settlementId: null,
      settlementCode: '',
      settlementType: '',
      depositRefundId: null,
      amount: row?.amount ?? 0,
      paidAmount: 0,
      remainingAmount: row?.amount ?? 0,
      refundDate: row?.flowDate || '',
      paymentMethod: row?.paymentMethod || '',
      handlerId: null,
      handler: '',
      remark: '',
      items: [],
      createdBy: row?.createdBy || '',
      updatedBy: row?.updatedBy || '',
      createdAt: row?.createdAt || '',
      updatedAt: row?.updatedAt || '',
    }
  }
  refundOrderDrawer.value = true
}

function openRefundOrderSide(row: CashFlowRecord) {
  if (!row.refundOrderId) return
  void openRefundOrderById(row.refundOrderId, row)
}

async function openSettlementSide(id: string) {
  try {
    const { data } = await fetchContractSettlement(id)
    settlementRecord.value = data
    settlementDrawer.value = true
  } catch {
    /* ignore */
  }
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
  if (scope) void exportCashFlowsXlsx(scope)
}

function downloadImportTemplate() {
  const example = cashFlowIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'CashFlows')
  XLSX.writeFile(wb, 'cash-flows-import-template.xlsx')
  void ElMessageBox.alert(t('cashFlow.templateDone'), t('common.tip'), { type: 'success' })
}

async function exportCashFlowsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: CashFlowRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      await ElMessageBox.alert(t('cashFlow.exportEmpty'), t('common.tip'), { type: 'warning' })
      return
    }
    const sheetRows = rows.map((r) => cashFlowToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CashFlows')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `cash-flows-${exportFileSuffix(scope)}-${day}.xlsx`)
    await ElMessageBox.alert(t('cashFlow.exportDone', { n: rows.length }), t('common.tip'), {
      type: 'success',
    })
  } catch {
    await ElMessageBox.alert(t('cashFlow.importFailed'), t('common.tip'), { type: 'error' })
  } finally {
    exporting.value = false
  }
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!perms.import) {
    await ElMessageBox.alert(t('cashFlow.importAdminOnly'), t('common.tip'), { type: 'warning' })
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'skipped', 'failed'],
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
        message: t('cashFlow.importEmpty'),
      })
      return
    }

    const payloads: CashFlowImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToCashFlowIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              來源單據: String(row['來源單據'] ?? row['来源单据'] ?? ''),
              流水編號: String(row['流水編號'] ?? row['流水编号'] ?? ''),
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
        const { data } = await importCashFlowsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.skipped) bumpImport('skipped', data.skipped)
        if (data.failed) bumpImport('failed', data.failed)
        appendImportIssues(data.issues)
      } catch {
        bumpImport('failed', batch.length)
        appendImportIssues(
          batch.map((it) => ({
            status: 'failed' as const,
            reason: t('common.importUi.batchRequestFailed'),
            keys: {
              來源單據: it.sourceRef || '',
              流水編號: it.flowCode || '',
            },
          })),
        )
      }
    }

    await reloadListAndCounts()
    finishImport()
  } catch {
    failImport(t('cashFlow.importFailed'))
  }
}

onMounted(() => {
  void reloadListAndCounts()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <RefreshListButton :loading="loading" @refresh="() => void reloadListAndCounts()" />
      <h2>{{ t('menu.cashFlows') }}</h2>
      <div class="building-chips-rail">
        <div class="building-chips" role="tablist" :aria-label="t('cashFlow.directionFilterAria')">
          <button
            v-for="chip in directionChips"
            :key="chip.key"
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': directionChipFilter === chip.key }"
            :aria-selected="directionChipFilter === chip.key"
            @click="setDirectionChipFilter(chip.key)"
          >
            <span class="building-chip__name">{{ chip.label }}</span>
            <span class="building-chip__count">({{ chip.count }})</span>
          </button>
        </div>
      </div>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('cashFlow.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="cashFlowConditionCount" @clear="onClearCashFlowFilters" />
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('cashFlow.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('cashFlow.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('cashFlow.downloadTemplate') }}</span>
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

    <div class="table-card">
      <div
        class="table-scroll"
        v-loading="loading"
        element-loading-background="rgba(247, 250, 248, 0.78)"
      >
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${codeLayoutKey}-${listActionColWidth}`"
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
            :min-width="
              codeColW(t('cashFlow.fields.flowCode'), {
                interactive: true,
                samples: list.map((r) => r.flowCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.flowCode')"
                filterable
                sortable
                :options="flowCodeFilterOptions"
                :model-value="filters.flowCode || []"
                :sort-order="sortOrderOf('flowCode')"
                @update:model-value="(v) => setFilter('flowCode', v)"
                @update:sort-order="(v) => setSort('flowCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.flowCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('cashFlow.fields.direction'),
                directionOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.direction')"
                filterable
                sortable
                :options="directionOptions"
                :model-value="filters.direction || []"
                :sort-order="sortOrderOf('direction')"
                @update:model-value="(v) => setFilter('direction', v)"
                @update:sort-order="(v) => setSort('direction', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="cashFlowDirectionTone(row.direction)"
                :label="t(`cashFlow.direction.${row.direction}`, row.direction)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('cashFlow.fields.amount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.amount')"
                filterable
                sortable
                :options="amountFilterOptions"
                :model-value="filters.amount || []"
                :sort-order="sortOrderOf('amount')"
                @update:model-value="(v) => setFilter('amount', v)"
                @update:sort-order="(v) => setSort('amount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('cashFlow.fields.flowDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.flowDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('flowDate')"
                :date-range-value="dateRangeOf('flowDate')"
                @update:sort-order="(v) => setSort('flowDate', v)"
                @update:date-range-value="(v) => setDateRange('flowDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.flowDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('cashFlow.fields.sourceType'),
                sourceOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.sourceType')"
                filterable
                sortable
                :options="sourceOptions"
                :model-value="filters.sourceType || []"
                :sort-order="sortOrderOf('sourceType')"
                @update:model-value="(v) => setFilter('sourceType', v)"
                @update:sort-order="(v) => setSort('sourceType', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="cashFlowSourceTypeTone(row.sourceType)"
                :label="t(`cashFlow.sourceType.${row.sourceType}`, row.sourceType)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('cashFlow.fields.sourceRef'), {
                interactive: true,
                samples: list.map((r) => r.receiptCode || r.refundOrderCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.sourceRef')"
                filterable
                sortable
                :options="sourceRefFilterOptions"
                :model-value="filters.sourceRef || []"
                :sort-order="sortOrderOf('sourceRef')"
                @update:model-value="(v) => setFilter('sourceRef', v)"
                @update:sort-order="(v) => setSort('sourceRef', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.receiptId"
                type="button"
                class="fk-link"
                @click.stop="openReceiptSide(row)"
              >
                {{ row.receiptCode || '—' }}
              </button>
              <button
                v-else-if="row.refundOrderId"
                type="button"
                class="fk-link"
                @click.stop="openRefundOrderSide(row)"
              >
                {{ row.refundOrderCode || '—' }}
              </button>
              <template v-else>{{ row.receiptCode || row.refundOrderCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('cashFlow.fields.receiptCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.receiptCount')"
                filterable
                sortable
                :options="receiptCountFilterOptions"
                :model-value="filters.receiptCount || []"
                :sort-order="sortOrderOf('receiptCount')"
                @update:model-value="(v) => setFilter('receiptCount', v)"
                @update:sort-order="(v) => setSort('receiptCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receiptCount ?? (row.receiptId ? 1 : 0)"
                @click="openReceiptSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('cashFlow.fields.refundOrderCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.refundOrderCount')"
                filterable
                sortable
                :options="refundOrderCountFilterOptions"
                :model-value="filters.refundOrderCount || []"
                :sort-order="sortOrderOf('refundOrderCount')"
                @update:model-value="(v) => setFilter('refundOrderCount', v)"
                @update:sort-order="(v) => setSort('refundOrderCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.refundOrderCount ?? (row.refundOrderId ? 1 : 0)"
                @click="openRefundOrderSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('cashFlow.fields.contractCode'), {
                interactive: true,
                samples: list.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.contractCode')"
                filterable
                sortable
                :options="contractCodeFilterOptions"
                :model-value="filters.contractCode || []"
                :sort-order="sortOrderOf('contractCode')"
                @update:model-value="(v) => setFilter('contractCode', v)"
                @update:sort-order="(v) => setSort('contractCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.contractId"
                type="button"
                class="fk-link"
                @click.stop="relationDrawers?.openContractSide(row.contractId)"
              >
                {{ row.contractCode || '—' }}
              </button>
              <template v-else>{{ row.contractCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              textColW(t('cashFlow.fields.customerName'), {
                interactive: true,
                kind: 'name',
              })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.customerName')"
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
                @click.stop="relationDrawers?.openCustomerSide(row.customerId)"
              >
                {{ row.customerName || '—' }}
              </button>
              <template v-else>{{ row.customerName || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column :min-width="auditUserColWidth">
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
            :label="t('common.actions')"
            :width="listActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <ActionDetailButton @click="openDetail(row)" />
                <button
                  v-if="perms.delete"
                  v-admin-glow="perms.codes.delete"
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onDelete(row)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

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

    <CashFlowDetailDrawer
      v-model="drawerVisible"
      :record="current"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id)"
      @open-refund-order="(id) => openRefundOrderById(id, current)"
    />
    <RefundOrderDetailDrawer
      v-model="refundOrderDrawer"
      :record="refundOrderRecord"
      desktop-direction="ltr"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
      @open-settlement="openSettlementSide"
      @open-cash-flows="openCashFlowsFromRefund"
    />
    <RelatedCashFlowsDrawer
      v-model="relatedCashFlowsVisible"
      :refund-order-id="refundOrderRecord?.id"
      :title-context="refundOrderRecord?.refundCode || ''"
      desktop-direction="ltr"
      @open-cash-flow="openCashFlowFromRelated"
    />
    <ContractSettlementDetailDrawer
      v-model="settlementDrawer"
      :record="settlementRecord"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

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
  </div>
</template>

<style scoped>
.room-io-file {
  display: none;
}
</style>
