<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createReceivableApi,
  deleteReceivableApi,
  batchDeleteReceivablesApi,
  fetchReceivable,
  fetchReceivables,
  importReceivablesApi,
  updateReceivableApi,
} from '@/api/receivables'
import type { ReceivableWritePayload, ReceivableListQuery } from '@/api/receivables'

import { fetchInvoices } from '@/api/invoices'
import { fetchDepositRefunds } from '@/api/deposit-refunds'
import type { ReceivableRecord } from '@/types/receivable'
import type { InvoiceRecord } from '@/types/invoice'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import ReceivableDetailDrawer from '@/components/ReceivableDetailDrawer.vue'
import CountListPill from '@/components/CountListPill.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import type { ReceiptRecord } from '@/types/receipt'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  receivableIoTemplateExampleRow,
  receivableToIoRow,
  rowToReceivableIoPayload,
} from '@/utils/receivableExport'
import type { ReceivableImportPayload } from '@/utils/receivableExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const perms = useResourcePermissions('receivables')
const { actionColWidth } = useActionColWidth()
const {
  colW,
  textColW,
  codeColW,
  datetimeColWidth,
  auditUserColWidth,
  tableLayoutKey,
} = useTableColWidth()

const keyword = ref('')
const formVisible = ref(false)
const editing = ref<ReceivableRecord | null>(null)
const invoices = ref<InvoiceRecord[]>([])
const depositRefunds = ref<DepositRefundRecord[]>([])

const drawerVisible = ref(false)
const relatedReceiptsDrawer = ref(false)
const relatedListReceivable = ref<ReceivableRecord | null>(null)
const current = ref<ReceivableRecord | null>(null)
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
} = useTableSortFilter<ReceivableRecord>()

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
} = useServerPagedList<ReceivableRecord, ReceivableListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const invoice = range('invoiceDate')
    const due = range('paymentDueDate')
    return {
      keyword: kw,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      sortBy,
      sortDir,
      invoiceDateFrom: invoice.from,
      invoiceDateTo: invoice.to,
      paymentDueDateFrom: due.from,
      paymentDueDateTo: due.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchReceivables,
})

const codeLayoutKey = computed(() =>
  [
    codeColW(t('receivable.fields.receivableCode'), {
      interactive: true,
      samples: list.value.map((r) => r.receivableCode),
    }),
    codeColW(t('receivable.fields.invoiceCode'), {
      interactive: true,
      samples: list.value.map((r) => r.invoiceCode),
    }),
    codeColW(t('receivable.fields.contractCode'), {
      interactive: true,
      samples: list.value.map((r) => r.contractCode),
    }),
  ].join('-'),
)

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ReceivableRecord>()
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
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteReceivablesApi(chunk),
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

const invoiceFilterOptions = computed(() =>
  invoices.value.map((inv) => ({
    value: inv.id,
    label: `${inv.invoiceCode} · ${inv.customerName} · ${inv.contractCode}`,
  })),
)

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const inv of invoices.value) {
    const name = inv.customerName?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const depositRefundFilterOptions = computed(() =>
  depositRefunds.value.map((r) => ({
    value: r.id,
    label: `${r.refundCode} · ${r.customerName} · ${r.contractCode}`,
  })),
)

const selectedInvoice = computed(
  () => invoices.value.find((inv) => inv.id === form.invoiceId) || null,
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  invoiceId: '' as string,
  receivableCode: '',
  invoiceDate: '',
  paymentDueDate: '',
  invoiceAmount: null as number | null,
  receivedAmount: 0 as number | null,
  receivableAmount: null as number | null,
  relatedReceiptRef: '',
  depositRefundId: '' as string,
  remark: '',
})

const form = reactive(emptyForm())
const receivableAmountTouched = ref(false)

function recalcReceivableAmount() {
  if (receivableAmountTouched.value) return
  const inv = Number(form.invoiceAmount) || 0
  const recv = Number(form.receivedAmount) || 0
  form.receivableAmount = inv - recv
}

function onInvoiceSelected() {
  const inv = selectedInvoice.value
  if (!inv) return
  form.invoiceDate = inv.invoiceDate || ''
  form.paymentDueDate = inv.paymentDueDate || ''
  form.invoiceAmount = inv.amount
  receivableAmountTouched.value = false
  recalcReceivableAmount()
}

function onInvoiceAmountChange() {
  recalcReceivableAmount()
}

function onReceivedAmountChange() {
  recalcReceivableAmount()
}

function onReceivableAmountManual() {
  receivableAmountTouched.value = true
}

async function loadInvoices() {
  const { data } = await fetchInvoices()
  invoices.value = data.items
}

async function loadDepositRefunds() {
  const { data } = await fetchDepositRefunds()
  depositRefunds.value = data.items
}

onMounted(async () => {
  await Promise.all([loadInvoices(), loadDepositRefunds(), loadList()])
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  receivableAmountTouched.value = false
  formVisible.value = true
}

function openEdit(row: ReceivableRecord) {
  editing.value = row
  Object.assign(form, {
    invoiceId: row.invoiceId || '',
    receivableCode: row.receivableCode || '',
    invoiceDate: row.invoiceDate || '',
    paymentDueDate: row.paymentDueDate || '',
    invoiceAmount: row.invoiceAmount,
    receivedAmount: row.receivedAmount ?? 0,
    receivableAmount: row.receivableAmount,
    relatedReceiptRef: row.relatedReceiptRef || '',
    depositRefundId: row.depositRefundId || '',
    remark: row.remark || '',
  })
  receivableAmountTouched.value = true
  formVisible.value = true
}

function payloadFromForm(): ReceivableWritePayload {
  return {
    invoiceId: form.invoiceId.trim(),
    receivableCode: form.receivableCode.trim() || undefined,
    invoiceDate: form.invoiceDate || undefined,
    paymentDueDate: form.paymentDueDate || undefined,
    invoiceAmount: form.invoiceAmount == null ? undefined : Number(form.invoiceAmount) || 0,
    receivedAmount: form.receivedAmount == null ? undefined : Number(form.receivedAmount) || 0,
    receivableAmount:
      form.receivableAmount == null ? undefined : Number(form.receivableAmount) || 0,
    relatedReceiptRef: form.relatedReceiptRef.trim() || undefined,
    depositRefundId: form.depositRefundId.trim() || null,
    remark: form.remark.trim() || undefined,
  }
}

async function saveForm() {
  if (!form.invoiceId.trim()) {
    ElMessage.warning(t('receivable.invoiceRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateReceivableApi(editing.value.id, payload)
      ElMessage.success(t('receivable.updated'))
    } else {
      await createReceivableApi(payload)
      ElMessage.success(t('receivable.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ReceivableRecord) {
  try {
    await ElMessageBox.confirm(
      t('receivable.deleteConfirm', { code: row.receivableCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteReceivableApi(row.id)
    ElMessage.success(t('receivable.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: ReceivableRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchReceivable(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openReceiptsSide(row: ReceivableRecord) {
  if (!row.receiptCount) return
  relatedListReceivable.value = row
  relatedReceiptsDrawer.value = true
}
function onOpenReceiptFromRelated(row: ReceiptRecord) {
  void relationDrawers.value?.openReceiptSide(row.id)
}

function onRowClick(row: ReceivableRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (
    el?.closest(
      '.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection',
    )
  )
    return
  void openDetail(row, 'rtl')
}

async function openInvoiceSide(invoiceId?: string | null, _direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openInvoiceSide(invoiceId)
}

async function openContractSide(contractId?: string | null, _direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openContractSide(contractId)
}

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openCustomerSide(customerId, direction)
}

async function openDepositRefundSide(
  depositRefundId?: string | null,
  _direction: 'ltr' | 'rtl' = 'ltr',
) {
  await relationDrawers.value?.openDepositRefundSide(depositRefundId)
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
  if (scope) void exportReceivablesXlsx(scope)
}

function downloadImportTemplate() {
  const example = receivableIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Receivables')
  XLSX.writeFile(wb, 'receivables-import-template.xlsx')
  ElMessage.success(t('receivable.templateDone'))
}

async function exportReceivablesXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ReceivableRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('receivable.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => receivableToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Receivables')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `receivables-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('receivable.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('receivable.importFailed'))
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
    ElMessage.warning(t('receivable.importAdminOnly'))
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
        message: t('receivable.importEmpty'),
      })
      return
    }

    const payloads: ReceivableImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToReceivableIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              發票編號: String(row['所屬發票'] ?? row['所属发票'] ?? row['發票編號'] ?? ''),
              應收編號: String(row['應收編號'] ?? row['应收编号'] ?? ''),
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
        const { data } = await importReceivablesApi(batch)
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
              發票編號: it.invoiceCode || '',
              應收編號: it.receivableCode || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('receivable.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.receivables') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('receivable.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('receivable.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button
            class="room-io-btn"
            :aria-label="t('receivable.dataIo')"
            :loading="importing || exporting"
          >
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('receivable.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('receivable.downloadTemplate') }}</span>
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
            width="44"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column
            :width="
              codeColW(t('receivable.fields.receivableCode'), {
                interactive: true,
                samples: list.map((r) => r.receivableCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.receivableCode')"
                sortable
                :sort-order="sortOrderOf('receivableCode')"
                @update:sort-order="(v) => setSort('receivableCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.receivableCode || '—' }}</template>
          </el-table-column>
          <el-table-column
            :width="
              codeColW(t('receivable.fields.invoiceCode'), {
                interactive: true,
                samples: list.map((r) => r.invoiceCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.invoiceCode')"
                sortable
                :sort-order="sortOrderOf('invoiceCode')"
                @update:sort-order="(v) => setSort('invoiceCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.invoiceId"
                type="button"
                class="fk-link"
                :title="row.invoiceCode"
                @click.stop="openInvoiceSide(row.invoiceId)"
              >
                {{ row.invoiceCode || '—' }}
              </button>
              <span v-else>{{ row.invoiceCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :width="
              codeColW(t('receivable.fields.contractCode'), {
                interactive: true,
                samples: list.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.contractCode')"
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
            :min-width="textColW(t('receivable.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.customerName')"
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
            :min-width="colW(t('receivable.fields.invoiceDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.invoiceDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('invoiceDate')"
                :date-range-value="dateRangeOf('invoiceDate')"
                @update:sort-order="(v) => setSort('invoiceDate', v)"
                @update:date-range-value="(v) => setDateRange('invoiceDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.invoiceDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('receivable.fields.paymentDueDate'), { interactive: true, contentMin: 110 })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.paymentDueDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('paymentDueDate')"
                :date-range-value="dateRangeOf('paymentDueDate')"
                @update:sort-order="(v) => setSort('paymentDueDate', v)"
                @update:date-range-value="(v) => setDateRange('paymentDueDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.paymentDueDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receivable.fields.invoiceAmount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.invoiceAmount')"
                sortable
                :sort-order="sortOrderOf('invoiceAmount')"
                @update:sort-order="(v) => setSort('invoiceAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.invoiceAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receivable.fields.receivedAmount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.receivedAmount')"
                sortable
                :sort-order="sortOrderOf('receivedAmount')"
                @update:sort-order="(v) => setSort('receivedAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.receivedAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receivable.fields.receivableAmount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.receivableAmount')"
                sortable
                :sort-order="sortOrderOf('receivableAmount')"
                @update:sort-order="(v) => setSort('receivableAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.receivableAmount) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('receivable.fields.relatedReceiptRef')"
            :min-width="textColW(t('receivable.fields.relatedReceiptRef'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.relatedReceiptRef || '—' }}</template>
          </el-table-column>
          <el-table-column
            :width="
              codeColW(t('receivable.fields.depositRefundCode'), {
                interactive: true,
                samples: list.map((r) => r.depositRefundCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.depositRefundCode')"
                sortable
                :sort-order="sortOrderOf('depositRefundCode')"
                @update:sort-order="(v) => setSort('depositRefundCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.depositRefundId"
                type="button"
                class="fk-link"
                :title="row.depositRefundCode"
                @click.stop="openDepositRefundSide(row.depositRefundId)"
              >
                {{ row.depositRefundCode || '—' }}
              </button>
              <span v-else>{{ row.depositRefundCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('receivable.fields.remark')"
            :min-width="textColW(t('receivable.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receivable.fields.receiptCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.receiptCount')"
                sortable
                :sort-order="sortOrderOf('receiptCount')"
                @update:sort-order="(v) => setSort('receiptCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.receiptCount ?? 0" @click="openReceiptsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column :min-width="auditUserColWidth" show-overflow-tooltip>
            <template #header>
              <TableColumnHeader
                :label="t('common.createdBy')"
                sortable
                :sort-order="sortOrderOf('createdBy')"
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

    <ReceivableDetailDrawer
      v-model="drawerVisible"
      :record="current"
      :desktop-direction="detailDirection"
      @open-invoice="(id) => openInvoiceSide(id, 'ltr')"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-deposit-refund="(id) => openDepositRefundSide(id, 'ltr')"
      @open-receipts="openReceiptsSide"
    />
    <RelatedReceiptsDrawer
      v-model="relatedReceiptsDrawer"
      :receivable-id="relatedListReceivable?.id"
      :title-context="relatedListReceivable?.receivableCode || ''"
      desktop-direction="ltr"
      @open-receipt="onOpenReceiptFromRelated"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
      @changed="loadList"
    />
    <RelatedEntityDrawers ref="relationDrawers" @changed="loadList" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('receivable.edit') : t('receivable.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="fee-form">
        <div class="form-grid">
          <el-form-item :label="t('receivable.fields.invoiceCode')" required class="span-2">
            <el-select
              v-model="form.invoiceId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('receivable.fields.invoiceCode')"
              :disabled="!!editing"
              @change="onInvoiceSelected"
            >
              <el-option
                v-for="opt in invoiceFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('receivable.fields.contractCode')">
            <el-input
              :model-value="selectedInvoice?.contractCode || editing?.contractCode || ''"
              readonly
              :placeholder="t('receivable.autoFromInvoice')"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.customerName')">
            <el-input
              :model-value="selectedInvoice?.customerName || editing?.customerName || ''"
              readonly
              :placeholder="t('receivable.autoFromInvoice')"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.receivableCode')" class="span-2">
            <el-input
              v-model="form.receivableCode"
              :placeholder="t('receivable.codeAutoHint')"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.invoiceDate')">
            <el-date-picker
              v-model="form.invoiceDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.paymentDueDate')">
            <el-date-picker
              v-model="form.paymentDueDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.invoiceAmount')">
            <el-input-number
              v-model="form.invoiceAmount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
              @change="onInvoiceAmountChange"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.receivedAmount')">
            <el-input-number
              v-model="form.receivedAmount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
              @change="onReceivedAmountChange"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.receivableAmount')" class="span-2">
            <el-input-number
              v-model="form.receivableAmount"
              :precision="2"
              :controls="false"
              style="width: 100%"
              @change="onReceivableAmountManual"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.relatedReceiptRef')" class="span-2">
            <el-input v-model="form.relatedReceiptRef" />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.depositRefundCode')" class="span-2">
            <el-select
              v-model="form.depositRefundId"
              clearable
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('receivable.fields.depositRefundCode')"
            >
              <el-option
                v-for="opt in depositRefundFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('receivable.fields.remark')" class="span-2">
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

.room-io-file {
  display: none;
}
</style>
