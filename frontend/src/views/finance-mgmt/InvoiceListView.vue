<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createInvoiceApi,
  deleteInvoiceApi,
  batchDeleteInvoicesApi,
  fetchInvoice,
  fetchInvoices,
  importInvoicesApi,
  updateInvoiceApi,
} from '@/api/invoices'
import type { InvoiceWritePayload, InvoiceListQuery } from '@/api/invoices'
import { fetchContracts } from '@/api/contracts'
import { fetchUsers } from '@/api/users'
import type { InvoiceRecord, InvoiceServiceDetailRecord } from '@/types/invoice'
import { INVOICE_STATUSES, INVOICE_TYPES } from '@/types/invoice'
import type { ContractRecord } from '@/types/contract'
import type { UserRecord } from '@/types/user'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import InvoiceDetailDrawer from '@/components/InvoiceDetailDrawer.vue'
import CountListPill from '@/components/CountListPill.vue'
import RelatedReceivablesDrawer from '@/components/RelatedReceivablesDrawer.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import RelatedServiceDetailsDrawer from '@/components/RelatedServiceDetailsDrawer.vue'
import type { ReceivableRecord } from '@/types/receivable'
import type { ReceiptRecord } from '@/types/receipt'
import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { invoiceStatusTone } from '@/constants/statusBadges'
import { useUserStore } from '@/stores/user'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useActionColWidth, measureActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  invoiceIoTemplateExampleRow,
  invoiceToIoRow,
  rowToInvoiceIoPayload,
} from '@/utils/invoiceExport'
import type { InvoiceImportPayload } from '@/utils/invoiceExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { previewInvoicePdfApi, prefetchInvoicePdfApi } from '@/api/document-templates'

type FeeFormRow = {
  uid: string
  id?: string
  description: string
  quantity: number
  unitAmount: number
  remark: string
  sortOrder: number
}

const { t, locale } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const {
  colW,
  textColW,
  codeColW,
  statusColW,
  datetimeColWidth,
  auditUserColWidth,
  tableLayoutKey,
} = useTableColWidth()

const invoiceActionColWidth = computed(() => {
  void locale.value
  if (isAdmin.value) {
    return Math.max(
      actionColWidth.value.three,
      measureActionColWidth([
        t('invoice.printInvoice'),
        t('common.edit'),
        t('common.delete'),
      ]),
    )
  }
  return Math.max(
    actionColWidth.value.one,
    measureActionColWidth([t('invoice.printInvoice')]),
  )
})

const printingInvoiceId = ref<string | null>(null)

async function onPrintInvoice(row: InvoiceRecord) {
  if (!row?.id || printingInvoiceId.value) return
  printingInvoiceId.value = row.id
  try {
    await previewInvoicePdfApi(row.id, { autoPrint: false })
    ElMessage.success(t('invoice.printInvoicePreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('invoice.printInvoiceFailed')
    ElMessage.error(msg)
  } finally {
    printingInvoiceId.value = null
  }
}

const keyword = ref('')
const formVisible = ref(false)
const editing = ref<InvoiceRecord | null>(null)
const contracts = ref<ContractRecord[]>([])
const users = ref<UserRecord[]>([])

const drawerVisible = ref(false)
const relatedReceivablesDrawer = ref(false)
const relatedReceiptsDrawer = ref(false)
const relatedServiceDetailsDrawer = ref(false)
const relatedListInvoice = ref<InvoiceRecord | null>(null)
const current = ref<InvoiceRecord | null>(null)
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
} = useTableSortFilter<InvoiceRecord>()

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
} = useServerPagedList<InvoiceRecord, InvoiceListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const invoice = range('invoiceDate')
    const due = range('paymentDueDate')
    return {
      keyword: kw,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      status: f.status?.[0],
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
  fetchPage: fetchInvoices,
})

const codeLayoutKey = computed(() =>
  [
    codeColW(t('invoice.fields.invoiceCode'), {
      interactive: true,
      samples: list.value.map((r) => r.invoiceCode),
    }),
    codeColW(t('invoice.fields.contractCode'), {
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
} = useTableSelection<InvoiceRecord>()
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
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteInvoicesApi(chunk),
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

const statusFilterOptions = computed(() =>
  INVOICE_STATUSES.map((s) => ({
    value: s,
    label: statusLabel(s),
  })),
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

const userFilterOptions = computed(() =>
  users.value.map((u) => ({
    value: u.id,
    label: userOptionLabel(u),
  })),
)

const selectedContract = computed(() =>
  contracts.value.find((c) => c.id === form.contractId) || null,
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '920px'))

function defaultFeeRow(): FeeFormRow {
  return {
    uid: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitAmount: 0,
    remark: '',
    sortOrder: 0,
  }
}

const emptyForm = () => ({
  contractId: '' as string,
  invoiceCode: '',
  invoiceType: INVOICE_TYPES[0] as string,
  description: '',
  amount: null as number | null,
  status: INVOICE_STATUSES[0] as string,
  invoiceDate: '',
  paymentDueDate: '',
  salesManagerId: '' as string,
  relatedReceivableRef: '',
  attachment: '',
  roomNameText: '',
  notes: '',
  whatsappNumber: '',
  shortTermRentalCode: '',
  remark: '',
})

const form = reactive(emptyForm())
const feeRows = ref<FeeFormRow[]>([])

function feeSubtotal(row: Pick<FeeFormRow, 'quantity' | 'unitAmount'>): number {
  return (Number(row.quantity) || 0) * (Number(row.unitAmount) || 0)
}

function addFeeRow() {
  feeRows.value.push(defaultFeeRow())
}

function removeFeeRow(idx: number) {
  feeRows.value.splice(idx, 1)
}

function userOptionLabel(u: UserRecord) {
  const name = u.displayName?.trim()
  return name || u.account
}

function statusLabel(status: string) {
  const key = `invoice.status.${status}`
  return t(key) === key ? status : t(key)
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    會議室短租: t('invoice.types.meetingRoomShort'),
    Deposit: t('invoice.types.deposit'),
    '1, Charging Period': t('invoice.types.chargingPeriod'),
    '10, Other charges': t('invoice.types.otherCharges'),
  }
  return map[type] || type
}

async function loadContracts() {
  const { data } = await fetchContracts()
  contracts.value = data.items
}

async function loadUsers() {
  const { data } = await fetchUsers()
  users.value = data
}

onMounted(async () => {
  await Promise.all([loadContracts(), loadUsers(), loadList()])
})

watch(
  () => form.contractId,
  (id) => {
    if (!id || editing.value) return
    const c = contracts.value.find((x) => x.id === id)
    if (!c) return
    form.salesManagerId = c.salesManagerId || ''
    form.roomNameText = c.roomNameText || c.roomName || ''
  },
)

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  feeRows.value = []
  formVisible.value = true
}

function openEdit(row: InvoiceRecord) {
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    invoiceCode: row.invoiceCode || '',
    invoiceType: row.invoiceType || INVOICE_TYPES[0],
    description: row.description || '',
    amount: row.amount,
    status: row.status || INVOICE_STATUSES[0],
    invoiceDate: row.invoiceDate || '',
    paymentDueDate: row.paymentDueDate || '',
    salesManagerId: row.salesManagerId || '',
    relatedReceivableRef: row.relatedReceivableRef || '',
    attachment: row.attachment || '',
    roomNameText: row.roomNameText || '',
    notes: row.notes || '',
    whatsappNumber: row.whatsappNumber || '',
    shortTermRentalCode: row.shortTermRentalCode || '',
    remark: row.remark || '',
  })
  feeRows.value = (row.serviceDetails ?? []).map((f) => ({
    uid: crypto.randomUUID(),
    id: f.id,
    description: f.description || '',
    quantity: f.quantity ?? 0,
    unitAmount: f.unitAmount ?? 0,
    remark: f.remark || '',
    sortOrder: f.sortOrder ?? 0,
  }))
  formVisible.value = true
}

function serviceDetailsPayload(): InvoiceServiceDetailRecord[] {
  return feeRows.value
    .filter((r) => r.description.trim())
    .map((r, idx) => ({
      description: r.description.trim(),
      quantity: Number(r.quantity) || 0,
      unitAmount: Number(r.unitAmount) || 0,
      subtotal: feeSubtotal(r),
      remark: r.remark?.trim() || undefined,
      sortOrder: idx,
    }))
}

function payloadFromForm(): InvoiceWritePayload {
  return {
    contractId: form.contractId.trim(),
    invoiceCode: form.invoiceCode.trim() || undefined,
    invoiceType: form.invoiceType || undefined,
    description: form.description.trim() || undefined,
    amount: form.amount == null ? undefined : Number(form.amount) || 0,
    status: form.status || undefined,
    invoiceDate: form.invoiceDate || undefined,
    paymentDueDate: form.paymentDueDate || undefined,
    salesManagerId: form.salesManagerId.trim() || null,
    relatedReceivableRef: form.relatedReceivableRef.trim() || undefined,
    attachment: form.attachment.trim() || undefined,
    roomNameText: form.roomNameText.trim() || undefined,
    notes: form.notes.trim() || undefined,
    whatsappNumber: form.whatsappNumber.trim() || undefined,
    shortTermRentalCode: form.shortTermRentalCode.trim() || undefined,
    remark: form.remark.trim() || undefined,
    serviceDetails: serviceDetailsPayload(),
  }
}

async function saveForm() {
  if (!form.contractId.trim()) {
    ElMessage.warning(t('invoice.contractRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateInvoiceApi(editing.value.id, payload)
      ElMessage.success(t('invoice.updated'))
    } else {
      await createInvoiceApi(payload)
      ElMessage.success(t('invoice.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: InvoiceRecord) {
  try {
    await ElMessageBox.confirm(
      t('invoice.deleteConfirm', { code: row.invoiceCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteInvoiceApi(row.id)
    ElMessage.success(t('invoice.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: InvoiceRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchInvoice(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openReceivablesSide(row: InvoiceRecord) {
  if (!row.receivableCount) return
  relatedListInvoice.value = row
  relatedReceivablesDrawer.value = true
}
function openReceiptsSide(row: InvoiceRecord) {
  if (!row.receiptCount) return
  relatedListInvoice.value = row
  relatedReceiptsDrawer.value = true
}
function openServiceDetailsSide(row: InvoiceRecord) {
  if (!row.serviceDetailCount) return
  relatedListInvoice.value = row
  relatedServiceDetailsDrawer.value = true
}
function onOpenReceivableFromRelated(row: ReceivableRecord) {
  void relationDrawers.value?.openReceivableSide(row.id)
}
function onOpenReceiptFromRelated(row: ReceiptRecord) {
  void relationDrawers.value?.openReceiptSide(row.id)
}
function onOpenServiceDetailFromRelated(row: InvoiceServiceDetailListRecord) {
  void relationDrawers.value?.openServiceDetailSide(row.id)
}

function onRowClick(row: InvoiceRecord, column: { type?: string } | undefined, event: Event) {
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
  if (scope) void exportInvoicesXlsx(scope)
}

function downloadImportTemplate() {
  const example = invoiceIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
  XLSX.writeFile(wb, 'invoices-import-template.xlsx')
  ElMessage.success(t('invoice.templateDone'))
}

async function exportInvoicesXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: InvoiceRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('invoice.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('invoice.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => invoiceToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `invoices-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('invoice.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('invoice.importFailed'))
  } finally {
    exporting.value = false
  }
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAdmin.value) {
    ElMessage.warning(t('invoice.importAdminOnly'))
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
        message: t('invoice.importEmpty'),
      })
      return
    }

    const payloads: InvoiceImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToInvoiceIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
              發票編號: String(row['發票編號'] ?? row['发票编号'] ?? ''),
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
        const { data } = await importInvoicesApi(batch)
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
              合約編號: it.contractCode || '',
              發票編號: it.invoiceCode || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('invoice.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.invoices') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('invoice.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('invoice.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('invoice.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('invoice.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('invoice.downloadTemplate') }}</span>
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
          empty-text="—"
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
            :width="codeColW(t('invoice.fields.invoiceCode'), { interactive: true, samples: list.map((r) => r.invoiceCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.invoiceCode')"
                sortable
                :sort-order="sortOrderOf('invoiceCode')"
                @update:sort-order="(v) => setSort('invoiceCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.invoiceCode || '—' }}</template>
          </el-table-column>
          <el-table-column
            :width="codeColW(t('invoice.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.contractCode')"
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
            :min-width="textColW(t('invoice.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.customerName')"
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
            :min-width="codeColW(t('invoice.fields.roomName'), { interactive: true, samples: list.map((r) => r.roomName || r.roomCode) })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.roomName')"
                sortable
                :sort-order="sortOrderOf('roomName')"
                @update:sort-order="(v) => setSort('roomName', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.roomId"
                type="button"
                class="fk-link"
                :title="row.roomName || row.roomCode"
                @click.stop="openRoomSide(row.roomId)"
              >
                {{ row.roomName || row.roomCode || '—' }}
              </button>
              <span v-else>{{ row.roomName || row.roomCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('invoice.fields.invoiceType'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.invoiceType')"
                sortable
                :sort-order="sortOrderOf('invoiceType')"
                @update:sort-order="(v) => setSort('invoiceType', v)"
              />
            </template>
            <template #default="{ row }">{{ typeLabel(row.invoiceType) || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('invoice.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.status')"
                filterable
                sortable
                :options="statusFilterOptions"
                :model-value="filters.status || []"
                :sort-order="sortOrderOf('status')"
                @update:model-value="(v) => setFilter('status', v)"
                @update:sort-order="(v) => setSort('status', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="invoiceStatusTone(row.status)"
                :label="statusLabel(row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoice.fields.amount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.amount')"
                sortable
                :sort-order="sortOrderOf('amount')"
                @update:sort-order="(v) => setSort('amount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoice.fields.invoiceDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.invoiceDate')"
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
            :min-width="colW(t('invoice.fields.paymentDueDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.paymentDueDate')"
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
            :min-width="colW(t('invoice.fields.salesManager'), { interactive: true, contentMin: 100 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.salesManager')"
                sortable
                :sort-order="sortOrderOf('salesManager')"
                @update:sort-order="(v) => setSort('salesManager', v)"
              />
            </template>
            <template #default="{ row }">{{ row.salesManager || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('invoice.fields.description')"
            :min-width="textColW(t('invoice.fields.description'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('invoice.fields.remark')"
            :min-width="textColW(t('invoice.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoice.fields.serviceDetailCount'), { interactive: true, contentMin: 96 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.serviceDetailCount')"
                sortable
                :sort-order="sortOrderOf('serviceDetailCount')"
                @update:sort-order="(v) => setSort('serviceDetailCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.serviceDetailCount ?? 0"
                @click="openServiceDetailsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoice.fields.receivableCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.receivableCount')"
                sortable
                :sort-order="sortOrderOf('receivableCount')"
                @update:sort-order="(v) => setSort('receivableCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.receivableCount ?? 0" @click="openReceivablesSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoice.fields.receiptCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.receiptCount')"
                sortable
                :sort-order="sortOrderOf('receiptCount')"
                @update:sort-order="(v) => setSort('receiptCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.receiptCount ?? 0" @click="openReceiptsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          >
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
            :width="invoiceActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--edit"
                  :disabled="printingInvoiceId === row.id"
                  @mouseenter="prefetchInvoicePdfApi(row.id)"
                  @focus="prefetchInvoicePdfApi(row.id)"
                  @click.stop="onPrintInvoice(row)"
                >
                  {{ t('invoice.printInvoice') }}
                </button>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="isAdmin"
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

    <InvoiceDetailDrawer
      v-model="drawerVisible"
      :record="current"
      :desktop-direction="detailDirection"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-receivables="openReceivablesSide"
      @open-receipts="openReceiptsSide"
      @open-service-details="openServiceDetailsSide"
    />
    <RelatedServiceDetailsDrawer
      v-model="relatedServiceDetailsDrawer"
      :invoice-id="relatedListInvoice?.id"
      :title-context="relatedListInvoice?.invoiceCode || ''"
      desktop-direction="ltr"
      @open-service-detail="onOpenServiceDetailFromRelated"
    />
    <RelatedReceivablesDrawer
      v-model="relatedReceivablesDrawer"
      :invoice-id="relatedListInvoice?.id"
      :title-context="relatedListInvoice?.invoiceCode || ''"
      desktop-direction="ltr"
      @open-receivable="onOpenReceivableFromRelated"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
    />
    <RelatedReceiptsDrawer
      v-model="relatedReceiptsDrawer"
      :invoice-id="relatedListInvoice?.id"
      :title-context="relatedListInvoice?.invoiceCode || ''"
      desktop-direction="ltr"
      @open-receipt="onOpenReceiptFromRelated"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('invoice.edit') : t('invoice.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="invoice-form">
        <div class="form-grid">
          <el-form-item :label="t('invoice.fields.contractCode')" required class="span-2">
            <el-select
              v-model="form.contractId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('invoice.fields.contractCode')"
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
          <el-form-item :label="t('invoice.fields.customerName')">
            <el-input
              :model-value="selectedContract?.customerName || editing?.customerName || ''"
              readonly
              :placeholder="t('invoice.autoFromContract')"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.roomName')">
            <el-input
              :model-value="
                selectedContract
                  ? `${selectedContract.roomCode}${selectedContract.roomName ? ' · ' + selectedContract.roomName : ''}`
                  : editing
                    ? `${editing.roomCode}${editing.roomName ? ' · ' + editing.roomName : ''}`
                    : ''
              "
              readonly
              :placeholder="t('invoice.autoFromContract')"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.invoiceCode')" class="span-2">
            <el-input
              v-model="form.invoiceCode"
              :placeholder="t('invoice.codeAutoHint')"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.invoiceType')">
            <el-select v-model="form.invoiceType" style="width: 100%">
              <el-option
                v-for="s in INVOICE_TYPES"
                :key="s"
                :label="typeLabel(s)"
                :value="s"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option
                v-for="s in INVOICE_STATUSES"
                :key="s"
                :label="statusLabel(s)"
                :value="s"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.amount')">
            <el-input-number
              v-model="form.amount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.salesManager')">
            <el-select
              v-model="form.salesManagerId"
              clearable
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('invoice.fields.salesManager')"
            >
              <el-option
                v-for="opt in userFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.invoiceDate')">
            <el-date-picker
              v-model="form.invoiceDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.paymentDueDate')">
            <el-date-picker
              v-model="form.paymentDueDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.description')" class="span-2">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.roomNameText')">
            <el-input v-model="form.roomNameText" />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.whatsappNumber')">
            <el-input v-model="form.whatsappNumber" />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.shortTermRentalCode')">
            <el-input v-model="form.shortTermRentalCode" />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.relatedReceivableRef')">
            <el-input v-model="form.relatedReceivableRef" />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.attachment')" class="span-2">
            <el-input v-model="form.attachment" />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.notes')" class="span-2">
            <el-input v-model="form.notes" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>

        <section class="form-section form-section--fees">
          <div class="fee-section-head">
            <h3>{{ t('invoice.sections.serviceDetails') }}</h3>
            <el-button type="primary" plain class="fee-add-btn" :icon="Plus" @click="addFeeRow">
              {{ t('invoice.addServiceDetailRow') }}
            </el-button>
          </div>
          <div v-if="feeRows.length" class="fee-table-wrap">
            <div class="fee-table" role="table">
              <div class="fee-table__head" role="row">
                <div class="fee-table__cell fee-table__cell--index" role="columnheader">#</div>
                <div class="fee-table__cell fee-table__cell--desc" role="columnheader">
                  <span class="req">*</span>{{ t('invoice.fields.feeDescription') }}
                </div>
                <div class="fee-table__cell fee-table__cell--qty" role="columnheader">
                  {{ t('invoice.fields.feeQuantity') }}
                </div>
                <div class="fee-table__cell fee-table__cell--unit" role="columnheader">
                  {{ t('invoice.fields.feeUnitAmount') }}
                </div>
                <div class="fee-table__cell fee-table__cell--subtotal" role="columnheader">
                  {{ t('invoice.fields.feeSubtotal') }}
                </div>
                <div class="fee-table__cell fee-table__cell--remark" role="columnheader">
                  {{ t('invoice.fields.feeRemark') }}
                </div>
                <div class="fee-table__cell fee-table__cell--actions" role="columnheader"></div>
              </div>
              <div
                v-for="(fee, idx) in feeRows"
                :key="fee.uid"
                class="fee-table__row"
                role="row"
              >
                <div class="fee-table__cell fee-table__cell--index" role="cell">{{ idx + 1 }}</div>
                <div class="fee-table__cell fee-table__cell--desc" role="cell">
                  <el-input v-model="fee.description" type="textarea" :rows="2" />
                </div>
                <div class="fee-table__cell fee-table__cell--qty" role="cell">
                  <el-input-number
                    v-model="fee.quantity"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    style="width: 100%"
                  />
                </div>
                <div class="fee-table__cell fee-table__cell--unit" role="cell">
                  <el-input-number
                    v-model="fee.unitAmount"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    style="width: 100%"
                  />
                </div>
                <div class="fee-table__cell fee-table__cell--subtotal" role="cell">
                  <span class="fee-subtotal">{{ formatMoney(feeSubtotal(fee)) }}</span>
                </div>
                <div class="fee-table__cell fee-table__cell--remark" role="cell">
                  <el-input v-model="fee.remark" />
                </div>
                <div class="fee-table__cell fee-table__cell--actions" role="cell">
                  <el-button type="danger" link :icon="Delete" @click="removeFeeRow(idx)" />
                </div>
              </div>
            </div>
          </div>
          <p v-else class="fee-empty">{{ t('invoice.noServiceDetailRows') }}</p>
        </section>
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

.invoice-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.invoice-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}

.form-section--fees {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #edf2ef;
}

.fee-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.fee-section-head h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.fee-add-btn {
  flex-shrink: 0;
}

.fee-table-wrap {
  overflow-x: auto;
}

.fee-table {
  min-width: 720px;
  border: 1px solid #edf2ef;
  border-radius: 8px;
}

.fee-table__head,
.fee-table__row {
  display: grid;
  grid-template-columns: 36px minmax(140px, 1.4fr) 88px 100px 100px minmax(100px, 1fr) 40px;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
}

.fee-table__head {
  background: #f7faf8;
  font-size: 12px;
  font-weight: 600;
  color: #5a6b63;
  border-bottom: 1px solid #edf2ef;
}

.fee-table__row {
  border-bottom: 1px solid #f0f4f2;
}

.fee-table__row:last-child {
  border-bottom: none;
}

.fee-table__cell {
  min-width: 0;
}

.fee-table__cell--index,
.fee-table__cell--subtotal,
.fee-table__cell--actions {
  text-align: center;
}

.fee-table__head .req {
  color: #e14b4b;
  margin-right: 2px;
}

.fee-subtotal {
  font-variant-numeric: tabular-nums;
}

.fee-empty {
  margin: 0;
  color: #8a9a93;
  font-size: 0.875rem;
}

.fee-table__row :deep(.el-input__wrapper),
.fee-table__row :deep(.el-input-number) {
  width: 100%;
}

.room-io-file {
  display: none;
}
</style>
