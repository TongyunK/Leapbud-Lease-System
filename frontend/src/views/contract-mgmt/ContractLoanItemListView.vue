<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createContractLoanItemApi,
  deleteContractLoanItemApi,
  batchDeleteContractLoanItemsApi,
  fetchContractLoanItem,
  fetchContractLoanItems,
  importContractLoanItemsApi,
  updateContractLoanItemApi,
} from '@/api/contract-loan-items'
import type { ContractLoanItemWritePayload, ContractLoanItemListQuery } from '@/api/contract-loan-items'
import { fetchContracts } from '@/api/contracts'
import type { ContractLoanItemRecord } from '@/types/contract-loan-item'
import type { ContractRecord } from '@/types/contract'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import ContractLoanItemDetailDrawer from '@/components/ContractLoanItemDetailDrawer.vue'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import { ACTION_COL_ICON, useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  contractLoanItemIoTemplateExampleRow,
  contractLoanItemToIoRow,
  rowToContractLoanItemIoPayload,
} from '@/utils/contractLoanItemExport'
import type { ContractLoanItemImportPayload } from '@/utils/contractLoanItemExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const isMobile = useIsMobile()
const perms = useResourcePermissions('contractLoanItems')
const { actionColW } = useActionColWidth()
const listActionColWidth = computed(() =>
  actionColW([
    ACTION_COL_ICON,
    perms.update && t('common.edit'),
    perms.delete && t('common.delete'),
  ]),
)
const { colW, textColW, codeColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const keyword = ref('')
const formVisible = ref(false)
const editing = ref<ContractLoanItemRecord | null>(null)
const contracts = ref<ContractRecord[]>([])

const drawerVisible = ref(false)
const current = ref<ContractLoanItemRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)

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
} = useTableSortFilter<ContractLoanItemRecord>()

const {
  loading,
  exporting,
  list,
  total,
  page,
  pageSize,
  pageSizes,
  rowIndex,
  loadList,
  fetchExportRows,
  onClearFilters,
} = useServerPagedList<ContractLoanItemRecord, ContractLoanItemListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    return {
      keyword: kw,
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
          quantities: packFilterValues(f.quantity),
      unitAmounts: packFilterValues(f.unitAmount),
      subtotals: packFilterValues(f.subtotal),
      roomCodes: packFilterValues(f.roomCode),
      createdBys: packFilterValues(f.createdBy),
      sortBy,
      sortDir,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchContractLoanItems,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ContractLoanItemRecord>()
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteContractLoanItemsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const contractFilterOptions = computed(() =>
  contracts.value.map((c) => ({
    value: c.id,
    label: `${c.contractCode} · ${c.customerName} · ${c.roomCode}`,
  })),
)

function uniqueListOptions(
  get: (row: ContractLoanItemRecord) => string | number | null | undefined,
  labelOf?: (value: string) => string,
) {
  return uniqueOptions(list.value, get, labelOf)
}

const contractCodeFilterOptions = computed(() => uniqueListOptions((r) => r.contractCode))
const quantityFilterOptions = computed(() =>
  uniqueListOptions((r) => (r.quantity == null ? '' : String(r.quantity))),
)
const unitAmountFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.unitAmount == null ? '' : String(r.unitAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const subtotalFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.subtotal == null ? '' : String(r.subtotal)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const roomCodeFilterOptions = computed(() => uniqueListOptions((r) => r.roomCode))
const createdByFilterOptions = computed(() => uniqueListOptions((r) => r.createdBy))
const customerNameFilterOptions = computed(() => uniqueListOptions((r) => r.customerName))

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  contractId: '' as string,
  description: '',
  quantity: 1,
  unitAmount: 0,
  remark: '',
  sortOrder: 0,
})

const form = reactive(emptyForm())

const computedSubtotal = computed(
  () => (Number(form.quantity) || 0) * (Number(form.unitAmount) || 0),
)

async function loadContracts() {
  const { data } = await fetchContracts()
  contracts.value = data.items
}

onMounted(async () => {
  await Promise.all([loadContracts(), loadList()])
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  formVisible.value = true
}

async function openEdit(row: ContractLoanItemRecord) {
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    description: row.description || '',
    quantity: row.quantity ?? 0,
    unitAmount: row.unitAmount ?? 0,
    remark: row.remark || '',
    sortOrder: row.sortOrder ?? 0,
  })
  formVisible.value = true
}

function payloadFromForm(): ContractLoanItemWritePayload {
  return {
    contractId: form.contractId.trim(),
    description: form.description.trim() || undefined,
    quantity: Number(form.quantity) || 0,
    unitAmount: Number(form.unitAmount) || 0,
    subtotal: computedSubtotal.value,
    remark: form.remark.trim() || undefined,
    sortOrder: Math.floor(Number(form.sortOrder) || 0),
  }
}

async function saveForm() {
  if (!form.contractId.trim()) {
    void ElMessageBox.alert(t('contractLoanItem.contractRequired'), t('common.tip'), { type: 'warning' })
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateContractLoanItemApi(editing.value.id, payload)
      void ElMessageBox.alert(t('contractLoanItem.updated'), t('common.tip'), { type: 'success' })
    } else {
      await createContractLoanItemApi(payload)
      void ElMessageBox.alert(t('contractLoanItem.created'), t('common.tip'), { type: 'success' })
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ContractLoanItemRecord) {
  try {
    await ElMessageBox.confirm(
      t('contractLoanItem.deleteConfirm', { desc: row.description || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteContractLoanItemApi(row.id)
    void ElMessageBox.alert(t('contractLoanItem.deleted'), t('common.tip'), { type: 'success' })
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: ContractLoanItemRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchContractLoanItem(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: ContractLoanItemRecord, column: { type?: string } | undefined, event: Event) {
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

function moneyOrDash(v: number | null | undefined): string {
  return v == null ? '—' : formatMoney(v)
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
  if (scope) void exportFeesXlsx(scope)
}

function downloadImportTemplate() {
  const example = contractLoanItemIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'LoanItems')
  XLSX.writeFile(wb, 'contract-loan-items-import-template.xlsx')
  void ElMessageBox.alert(t('contractLoanItem.templateDone'), t('common.tip'), { type: 'success' })
}

async function exportFeesXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ContractLoanItemRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      void ElMessageBox.alert(t('contractLoanItem.exportEmpty'), t('common.tip'), { type: 'warning' })
      return
    }
    const sheetRows = rows.map((r) => contractLoanItemToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'LoanItems')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `contract-loan-items-${exportFileSuffix(scope)}-${day}.xlsx`)
    void ElMessageBox.alert(t('contractLoanItem.exportDone', { n: rows.length }), t('common.tip'), { type: 'success' })
  } catch {
    void ElMessageBox.alert(t('contractLoanItem.importFailed'), t('common.tip'), { type: 'error' })
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
    void ElMessageBox.alert(t('contractLoanItem.importAdminOnly'), t('common.tip'), { type: 'warning' })
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
        message: t('contractLoanItem.importEmpty'),
      })
      return
    }

    const payloads: ContractLoanItemImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToContractLoanItemIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
                        房間編號: String(row['房間編號'] ?? row['房间编号'] ?? ''),
              費用描述: String(row['描述'] ?? row['費用描述'] ?? row['费用描述'] ?? ''),
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
        const { data } = await importContractLoanItemsApi(batch)
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
              費用描述: it.description || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('contractLoanItem.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <RefreshListButton :loading="loading" @refresh="loadList" />
      <h2>{{ t('menu.contractLoanItems') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('contractLoanItem.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('contractLoanItem.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('contractLoanItem.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('contractLoanItem.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('contractLoanItem.downloadTemplate') }}</span>
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
          :key="`${tableLayoutKey}-${listActionColWidth}`"
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
            :min-width="codeColW(t('contractLoanItem.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractLoanItem.fields.contractCode')"
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
                :title="row.contractCode"
                @click.stop="openContractSide(row.contractId)"
              >
                {{ row.contractCode || '—' }}
              </button>
              <span v-else>{{ row.contractCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('contractLoanItem.fields.description')"
            :min-width="textColW(t('contractLoanItem.fields.description'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractLoanItem.fields.quantity'), { interactive: true, contentMin: 72 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractLoanItem.fields.quantity')"
                filterable
                sortable
                :options="quantityFilterOptions"
                :model-value="filters.quantity || []"
                :sort-order="sortOrderOf('quantity')"
                @update:model-value="(v) => setFilter('quantity', v)"
                @update:sort-order="(v) => setSort('quantity', v)"
              />
            </template>
            <template #default="{ row }">{{ row.quantity ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractLoanItem.fields.unitAmount'), { interactive: true, contentMin: 88 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractLoanItem.fields.unitAmount')"
                filterable
                sortable
                :options="unitAmountFilterOptions"
                :model-value="filters.unitAmount || []"
                :sort-order="sortOrderOf('unitAmount')"
                @update:model-value="(v) => setFilter('unitAmount', v)"
                @update:sort-order="(v) => setSort('unitAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.unitAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractLoanItem.fields.subtotal'), { interactive: true, contentMin: 88 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractLoanItem.fields.subtotal')"
                filterable
                sortable
                :options="subtotalFilterOptions"
                :model-value="filters.subtotal || []"
                :sort-order="sortOrderOf('subtotal')"
                @update:model-value="(v) => setFilter('subtotal', v)"
                @update:sort-order="(v) => setSort('subtotal', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.subtotal) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractLoanItem.fields.remark')"
            :min-width="textColW(t('contractLoanItem.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('contractLoanItem.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractLoanItem.fields.customerName')"
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
            :min-width="codeColW(t('contractLoanItem.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractLoanItem.fields.roomCode')"
                filterable
                sortable
                :options="roomCodeFilterOptions"
                :model-value="filters.roomCode || []"
                :sort-order="sortOrderOf('roomCode')"
                @update:model-value="(v) => setFilter('roomCode', v)"
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
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="perms.delete"
                  v-admin-glow="perms.codes.delete"
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

    <ContractLoanItemDetailDrawer
      v-model="drawerVisible"
      :fee="current"
      :desktop-direction="detailDirection"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
    />

    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('contractLoanItem.edit') : t('contractLoanItem.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="fee-form">
        <div class="form-grid">
          <el-form-item :label="t('contractLoanItem.fields.contractCode')" required class="span-2">
            <SelectWithViewAction
              :disabled="!form.contractId"
              @view="openContractSide(form.contractId, 'ltr')"
            >
              <el-select
                v-model="form.contractId"
                filterable
                fit-input-width
                style="width: 100%"
                :placeholder="t('contractLoanItem.fields.contractCode')"
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
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('contractLoanItem.fields.description')" class="span-2">
            <el-input v-model="form.description" />
          </el-form-item>
          <el-form-item :label="t('contractLoanItem.fields.quantity')">
            <el-input-number
              v-model="form.quantity"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractLoanItem.fields.unitAmount')">
            <el-input-number
              v-model="form.unitAmount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractLoanItem.fields.subtotal')">
            <el-input :model-value="formatMoney(computedSubtotal)" disabled />
          </el-form-item>
          <el-form-item :label="t('contractLoanItem.fields.sortOrder')">
            <el-input-number
              v-model="form.sortOrder"
              :min="0"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractLoanItem.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
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
.head-search {
  width: min(280px, 42vw);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.form-grid .span-2 {
  grid-column: 1 / -1;
}

.select-option-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fee-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.fee-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}
</style>
