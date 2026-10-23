<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createReceiptApi,
  deleteReceiptApi,
  batchDeleteReceiptsApi,
  fetchReceipt,
  fetchReceipts,
  importReceiptsApi,
  updateReceiptApi,
} from '@/api/receipts'
import type { ReceiptWritePayload, ReceiptListQuery } from '@/api/receipts'
import { fetchCustomers } from '@/api/customers'
import { fetchContracts } from '@/api/contracts'
import { fetchInvoices } from '@/api/invoices'
import { fetchReceivables } from '@/api/receivables'
import type { ReceiptRecord } from '@/types/receipt'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import type { CustomerRecord } from '@/types/customer'
import type { ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import type { ReceivableRecord } from '@/types/receivable'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import ReceiptDetailDrawer from '@/components/ReceiptDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useActionColWidth, measureActionColWidth } from '@/composables/useActionColWidth'
import { previewReceiptPdfApi, prefetchReceiptPdfApi } from '@/api/document-templates'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  receiptIoTemplateExampleRow,
  receiptToIoRow,
  rowToReceiptIoPayload,
} from '@/utils/receiptExport'
import type { ReceiptImportPayload } from '@/utils/receiptExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t, locale } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const perms = useResourcePermissions('receipts')
const { actionColWidth } = useActionColWidth()

const receiptActionColWidth = computed(() => {
  void locale.value
  if (perms.canEditOrDelete.value) {
    return Math.max(
      actionColWidth.value.three,
      measureActionColWidth([
        t('receipt.printReceipt'),
        t('common.edit'),
        t('common.delete'),
      ]),
    )
  }
  return Math.max(
    actionColWidth.value.one,
    measureActionColWidth([t('receipt.printReceipt')]),
  )
})

const printingReceiptId = ref<string | null>(null)

async function onPrintReceipt(row: ReceiptRecord) {
  if (!row?.id || printingReceiptId.value) return
  printingReceiptId.value = row.id
  try {
    await previewReceiptPdfApi(row.id, { autoPrint: false })
    ElMessage.success(t('receipt.printReceiptPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('receipt.printReceiptFailed')
    ElMessage.error(msg)
  } finally {
    printingReceiptId.value = null
  }
}
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
const editing = ref<ReceiptRecord | null>(null)
const customers = ref<CustomerRecord[]>([])
const contracts = ref<ContractRecord[]>([])
const invoices = ref<InvoiceRecord[]>([])
const receivables = ref<ReceivableRecord[]>([])

const drawerVisible = ref(false)
const current = ref<ReceiptRecord | null>(null)
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
} = useTableSortFilter<ReceiptRecord>()

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
} = useServerPagedList<ReceiptRecord, ReceiptListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const payment = range('paymentDate')
    return {
      keyword: kw,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      paymentMethod: f.paymentMethod?.length ? [...f.paymentMethod] : undefined,
      contractCodes: f.contractCode?.length ? [...f.contractCode] : undefined,
      invoiceCodes: f.invoiceCode?.length ? [...f.invoiceCode] : undefined,
      receivableCodes: f.receivableCode?.length ? [...f.receivableCode] : undefined,
      sortBy,
      sortDir,
      paymentDateFrom: payment.from,
      paymentDateTo: payment.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchReceipts,
})

const codeLayoutKey = computed(() =>
  [
    codeColW(t('receipt.fields.receiptCode'), {
      interactive: true,
      samples: list.value.map((r) => r.receiptCode),
    }),
    codeColW(t('receipt.fields.contractCode'), {
      interactive: true,
      samples: list.value.map((r) => r.contractCode),
    }),
    codeColW(t('receipt.fields.invoiceCode'), {
      interactive: true,
      samples: list.value.map((r) => r.invoiceCode),
    }),
    codeColW(t('receipt.fields.receivableCode'), {
      interactive: true,
      samples: list.value.map((r) => r.receivableCode),
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
} = useTableSelection<ReceiptRecord>()
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
      (chunk) => batchDeleteReceiptsApi(chunk),
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

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const c of customers.value) {
    const name = c.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const paymentMethodFilterOptions = computed(() =>
  RECEIPT_PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
)

const contractCodeFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const c of contracts.value) {
    const code = c.contractCode?.trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    opts.push({ value: code, label: code })
  }
  return opts
})

const invoiceCodeFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const inv of invoices.value) {
    const code = inv.invoiceCode?.trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    opts.push({ value: code, label: code })
  }
  return opts
})

const receivableCodeFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const r of receivables.value) {
    const code = r.receivableCode?.trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    opts.push({ value: code, label: code })
  }
  return opts
})

const customerSelectOptions = computed(() =>
  customers.value.map((c) => ({
    value: c.id,
    label: `${c.customerCode} · ${c.name}`,
  })),
)

const contractSelectOptions = computed(() =>
  contracts.value.map((c) => ({
    value: c.id,
    label: `${c.contractCode} · ${c.customerName}`,
  })),
)

const invoiceSelectOptions = computed(() =>
  invoices.value.map((inv) => ({
    value: inv.id,
    label: `${inv.invoiceCode} · ${inv.customerName}`,
  })),
)

const receivableSelectOptions = computed(() =>
  receivables.value.map((r) => ({
    value: r.id,
    label: `${r.receivableCode} · ${r.customerName}`,
  })),
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  customerId: '' as string,
  receiptCode: '',
  contractId: '' as string,
  invoiceId: '' as string,
  receivableId: '' as string,
  paymentDate: '',
  paymentMethod: RECEIPT_PAYMENT_METHODS[0] as string,
  amount: null as number | null,
  remark: '',
  voucher1: '',
  voucher2: '',
  changeLog: '',
})

const form = reactive(emptyForm())

function onReceivableSelected() {
  const row = receivables.value.find((r) => r.id === form.receivableId)
  if (!row) return
  if (!form.customerId) form.customerId = row.customerId || ''
  if (!form.contractId) form.contractId = row.contractId || ''
  if (!form.invoiceId) form.invoiceId = row.invoiceId || ''
  if (form.amount == null && row.receivableAmount != null) form.amount = row.receivableAmount
}

function onInvoiceSelected() {
  const row = invoices.value.find((inv) => inv.id === form.invoiceId)
  if (!row) return
  if (!form.customerId) form.customerId = row.customerId || ''
  if (!form.contractId) form.contractId = row.contractId || ''
}

function onContractSelected() {
  const row = contracts.value.find((c) => c.id === form.contractId)
  if (!row) return
  if (!form.customerId) form.customerId = row.customerId || ''
}

async function loadLookups() {
  const [custRes, contractRes, invoiceRes, receivableRes] = await Promise.all([
    fetchCustomers(),
    fetchContracts(),
    fetchInvoices(),
    fetchReceivables(),
  ])
  customers.value = custRes.data.items
  contracts.value = contractRes.data.items
  invoices.value = invoiceRes.data.items
  receivables.value = receivableRes.data.items
}

onMounted(async () => {
  await Promise.all([loadLookups(), loadList()])
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  formVisible.value = true
}

function openEdit(row: ReceiptRecord) {
  editing.value = row
  Object.assign(form, {
    customerId: row.customerId || '',
    receiptCode: row.receiptCode || '',
    contractId: row.contractId || '',
    invoiceId: row.invoiceId || '',
    receivableId: row.receivableId || '',
    paymentDate: row.paymentDate || '',
    paymentMethod: row.paymentMethod || RECEIPT_PAYMENT_METHODS[0],
    amount: row.amount,
    remark: row.remark || '',
    voucher1: row.voucher1 || '',
    voucher2: row.voucher2 || '',
    changeLog: row.changeLog || '',
  })
  formVisible.value = true
}

function payloadFromForm(): ReceiptWritePayload {
  return {
    customerId: form.customerId.trim() || undefined,
    receiptCode: form.receiptCode.trim() || undefined,
    contractId: form.contractId.trim() || null,
    invoiceId: form.invoiceId.trim() || null,
    receivableId: form.receivableId.trim() || null,
    paymentDate: form.paymentDate || undefined,
    paymentMethod: form.paymentMethod || undefined,
    amount: form.amount == null ? undefined : Number(form.amount) || 0,
    remark: form.remark.trim() || undefined,
    voucher1: form.voucher1.trim() || undefined,
    voucher2: form.voucher2.trim() || undefined,
    changeLog: form.changeLog.trim() || undefined,
  }
}

async function saveForm() {
  if (!form.customerId.trim() && !form.receivableId.trim() && !form.invoiceId.trim()) {
    ElMessage.warning(t('receipt.customerRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateReceiptApi(editing.value.id, payload)
      ElMessage.success(t('receipt.updated'))
    } else {
      await createReceiptApi(payload)
      ElMessage.success(t('receipt.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ReceiptRecord) {
  try {
    await ElMessageBox.confirm(
      t('receipt.deleteConfirm', { code: row.receiptCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteReceiptApi(row.id)
    ElMessage.success(t('receipt.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: ReceiptRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchReceipt(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: ReceiptRecord, column: { type?: string } | undefined, event: Event) {
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

async function openReceivableSide(receivableId?: string | null, _direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openReceivableSide(receivableId)
}

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openCustomerSide(customerId, direction)
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
  if (scope) void exportReceiptsXlsx(scope)
}

function downloadImportTemplate() {
  const example = receiptIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Receipts')
  XLSX.writeFile(wb, 'receipts-import-template.xlsx')
  ElMessage.success(t('receipt.templateDone'))
}

async function exportReceiptsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ReceiptRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('receipt.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => receiptToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Receipts')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `receipts-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('receipt.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('receipt.importFailed'))
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
    ElMessage.warning(t('receipt.importAdminOnly'))
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
        message: t('receipt.importEmpty'),
      })
      return
    }

    const payloads: ReceiptImportPayload[] = []
    for (const raw of rawRows) {
      const parsed = rowToReceiptIoPayload(raw, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              收據編號: String(raw['收據編號'] ?? raw['收据编号'] ?? ''),
              客戶編號: String(raw['客戶編號'] ?? raw['客户编号'] ?? ''),
              客戶名稱: String(raw['客戶名稱'] ?? raw['客户名称'] ?? ''),
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
        const { data } = await importReceiptsApi(batch)
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
              收據編號: it.receiptCode || '',
              客戶編號: it.customerCode || '',
              客戶名稱: it.customerName || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('receipt.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.receipts') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('receipt.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('receipt.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button
            class="room-io-btn"
            :aria-label="t('receipt.dataIo')"
            :loading="importing || exporting"
          >
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('receipt.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('receipt.downloadTemplate') }}</span>
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
              codeColW(t('receipt.fields.receiptCode'), {
                interactive: true,
                samples: list.map((r) => r.receiptCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.receiptCode')"
                sortable
                :sort-order="sortOrderOf('receiptCode')"
                @update:sort-order="(v) => setSort('receiptCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.receiptCode || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('receipt.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.customerName')"
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
            :width="
              codeColW(t('receipt.fields.contractCode'), {
                interactive: true,
                samples: list.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.contractCode')"
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
            :width="
              codeColW(t('receipt.fields.invoiceCode'), {
                interactive: true,
                samples: list.map((r) => r.invoiceCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.invoiceCode')"
                filterable
                sortable
                :options="invoiceCodeFilterOptions"
                :model-value="filters.invoiceCode || []"
                :sort-order="sortOrderOf('invoiceCode')"
                @update:model-value="(v) => setFilter('invoiceCode', v)"
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
              codeColW(t('receipt.fields.receivableCode'), {
                interactive: true,
                samples: list.map((r) => r.receivableCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.receivableCode')"
                filterable
                sortable
                :options="receivableCodeFilterOptions"
                :model-value="filters.receivableCode || []"
                :sort-order="sortOrderOf('receivableCode')"
                @update:model-value="(v) => setFilter('receivableCode', v)"
                @update:sort-order="(v) => setSort('receivableCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.receivableId"
                type="button"
                class="fk-link"
                :title="row.receivableCode"
                @click.stop="openReceivableSide(row.receivableId)"
              >
                {{ row.receivableCode || '—' }}
              </button>
              <span v-else>{{ row.receivableCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receipt.fields.paymentDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.paymentDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('paymentDate')"
                :date-range-value="dateRangeOf('paymentDate')"
                @update:sort-order="(v) => setSort('paymentDate', v)"
                @update:date-range-value="(v) => setDateRange('paymentDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.paymentDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receipt.fields.paymentMethod'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.paymentMethod')"
                filterable
                sortable
                :options="paymentMethodFilterOptions"
                :model-value="filters.paymentMethod || []"
                :sort-order="sortOrderOf('paymentMethod')"
                @update:model-value="(v) => setFilter('paymentMethod', v)"
                @update:sort-order="(v) => setSort('paymentMethod', v)"
              />
            </template>
            <template #default="{ row }">{{ row.paymentMethod || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receipt.fields.amount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.amount')"
                sortable
                :sort-order="sortOrderOf('amount')"
                @update:sort-order="(v) => setSort('amount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('receipt.fields.remark'), { interactive: true, kind: 'long' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.remark')"
                sortable
                :sort-order="sortOrderOf('remark')"
                @update:sort-order="(v) => setSort('remark', v)"
              />
            </template>
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('receipt.fields.voucher1'), { interactive: true, kind: 'long' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.voucher1')"
                sortable
                :sort-order="sortOrderOf('voucher1')"
                @update:sort-order="(v) => setSort('voucher1', v)"
              />
            </template>
            <template #default="{ row }">{{ row.voucher1 || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('receipt.fields.voucher2'), { interactive: true, kind: 'long' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.voucher2')"
                sortable
                :sort-order="sortOrderOf('voucher2')"
                @update:sort-order="(v) => setSort('voucher2', v)"
              />
            </template>
            <template #default="{ row }">{{ row.voucher2 || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('receipt.fields.changeLog'), { interactive: true, kind: 'long' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.changeLog')"
                sortable
                :sort-order="sortOrderOf('changeLog')"
                @update:sort-order="(v) => setSort('changeLog', v)"
              />
            </template>
            <template #default="{ row }">{{ row.changeLog || '—' }}</template>
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
            :label="t('common.actions')"
            :width="receiptActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--edit"
                  :disabled="printingReceiptId === row.id"
                  @mouseenter="prefetchReceiptPdfApi(row.id)"
                  @focus="prefetchReceiptPdfApi(row.id)"
                  @click.stop="onPrintReceipt(row)"
                >
                  {{ t('receipt.printReceipt') }}
                </button>
                <button
                  v-if="perms.update" v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="perms.delete" v-admin-glow="perms.codes.delete"
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

    <ReceiptDetailDrawer
      v-model="drawerVisible"
      :record="current"
      :desktop-direction="detailDirection"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-invoice="(id) => openInvoiceSide(id, 'ltr')"
      @open-receivable="(id) => openReceivableSide(id, 'ltr')"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('receipt.edit') : t('receipt.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="fee-form">
        <div class="form-grid">
          <el-form-item :label="t('receipt.fields.customerName')" required class="span-2">
            <el-select
              v-model="form.customerId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('receipt.fields.customerName')"
            >
              <el-option
                v-for="opt in customerSelectOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.receiptCode')" class="span-2">
            <el-input v-model="form.receiptCode" :placeholder="t('receipt.codeAutoHint')" />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.receivableCode')" class="span-2">
            <el-select
              v-model="form.receivableId"
              clearable
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('receipt.fields.receivableCode')"
              @change="onReceivableSelected"
            >
              <el-option
                v-for="opt in receivableSelectOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.invoiceCode')">
            <el-select
              v-model="form.invoiceId"
              clearable
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('receipt.fields.invoiceCode')"
              @change="onInvoiceSelected"
            >
              <el-option
                v-for="opt in invoiceSelectOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.contractCode')">
            <el-select
              v-model="form.contractId"
              clearable
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('receipt.fields.contractCode')"
              @change="onContractSelected"
            >
              <el-option
                v-for="opt in contractSelectOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.paymentDate')">
            <el-date-picker
              v-model="form.paymentDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.paymentMethod')">
            <el-select v-model="form.paymentMethod" filterable style="width: 100%">
              <el-option
                v-for="m in RECEIPT_PAYMENT_METHODS"
                :key="m"
                :label="m"
                :value="m"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.amount')" class="span-2">
            <el-input-number
              v-model="form.amount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.voucher1')" class="span-2">
            <el-input v-model="form.voucher1" />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.voucher2')" class="span-2">
            <el-input v-model="form.voucher2" />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.changeLog')" class="span-2">
            <el-input v-model="form.changeLog" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" class="lb-btn-primary" @click="saveForm">
          {{ t('common.save') }}
        </el-button>
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
