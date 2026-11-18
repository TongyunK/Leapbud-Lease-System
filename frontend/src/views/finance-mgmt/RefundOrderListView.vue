<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, QuestionFilled, Search, Upload } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  deleteRefundOrderApi,
  batchDeleteRefundOrdersApi,
  disburseRefundOrderApi,
  fetchRefundOrder,
  fetchRefundOrders,
  importRefundOrdersApi,
  uploadRefundOrderAttachmentsApi,
  type RefundOrderListQuery,
} from '@/api/refund-orders'
import type { RefundOrderRecord } from '@/types/refund-order'
import {
  REFUND_ORDER_STATUSES,
  canDisburseRefundOrder,
  refundOrderRemaining,
} from '@/types/refund-order'
import { useUserStore } from '@/stores/user'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import MultiAttachmentField from '@/components/MultiAttachmentField.vue'
import type { MultiAttachmentPending } from '@/components/MultiAttachmentField.vue'
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
import RefundOrderDetailDrawer from '@/components/RefundOrderDetailDrawer.vue'
import RefundOrderItemsDialog from '@/components/RefundOrderItemsDialog.vue'
import {
  OVERLAY_ABOVE_FEATURE_MENU_Z,
  useOverlayStackZ,
} from '@/composables/useOverlayStackZ'
import ContractSettlementDetailDrawer from '@/components/ContractSettlementDetailDrawer.vue'
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import { fetchContractSettlement } from '@/api/contract-settlements'
import type { ContractSettlementRecord } from '@/types/contract-settlement'
import type { CashFlowRecord } from '@/types/cash-flow'
import { fetchCashFlow } from '@/api/cash-flows'
import { refundOrderStatusTone } from '@/constants/statusBadges'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import {
  buildRefundDisburseAllocPreview,
  roundMoney2,
} from '@/utils/refundOrderAlloc'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { useImportProgress } from '@/composables/useImportProgress'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import {
  refundOrderIoTemplateExampleRow,
  refundOrderToIoRow,
  rowToRefundOrderIoPayload,
  type RefundOrderImportPayload,
} from '@/utils/refundOrderExport'

const { t } = useI18n()
const perms = useResourcePermissions('refundOrders')
const userStore = useUserStore()
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
const current = ref<RefundOrderRecord | null>(null)
const itemsDialogVisible = ref(false)
const itemsDialogRecord = ref<RefundOrderRecord | null>(null)
const itemsDialogZ = ref<number | undefined>(undefined)
const { allocZ, raiseFloor } = useOverlayStackZ()
const settlementDrawer = ref(false)
const settlementRecord = ref<ContractSettlementRecord | null>(null)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const relatedCashFlowsVisible = ref(false)
const relatedListRefund = ref<RefundOrderRecord | null>(null)
const cashFlowDrawer = ref(false)
const cashFlowRecord = ref<CashFlowRecord | null>(null)

const payVisible = ref(false)
const paying = ref<RefundOrderRecord | null>(null)
const payLoading = ref(false)
const paySaving = ref(false)
const payPendingAttachments = ref<MultiAttachmentPending[]>([])
const payForm = reactive({
  amount: 0,
  refundDate: '',
  paymentMethod: '',
  remark: '',
})

const paymentMethodOptions = computed(() => {
  const cur = payForm.paymentMethod.trim()
  if (cur && !(RECEIPT_PAYMENT_METHODS as readonly string[]).includes(cur)) {
    return [cur, ...RECEIPT_PAYMENT_METHODS]
  }
  return [...RECEIPT_PAYMENT_METHODS]
})

const payRemaining = computed(() =>
  paying.value ? refundOrderRemaining(paying.value) : 0,
)

const payNowClamped = computed(() => {
  const n = roundMoney2(Math.max(0, Number(payForm.amount) || 0))
  return Math.min(n, payRemaining.value)
})

/** 本次打款按明细 FIFO 自动分摊预览（与结算侧办理退款一致） */
const payAllocPreview = computed(() => {
  const row = paying.value
  if (!row) return []
  return buildRefundDisburseAllocPreview(row.items || [], {
    alreadyPaid: Number(row.paidAmount) || 0,
    payNow: payNowClamped.value,
  })
})

const showPayAllocPreview = computed(() =>
  payAllocPreview.value.some((r) => r.refundPart > 0.009),
)

const statusOptions = computed(() =>
  REFUND_ORDER_STATUSES.map((s) => ({
    value: s,
    label: t(`refundOrder.status.${s}`),
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
} = useTableSortFilter<RefundOrderRecord>()

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
} = useServerPagedList<RefundOrderRecord, RefundOrderListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    return {
      keyword: kw,
      sortBy,
      sortDir,
      refundCodes: packFilterValues(f.refundCode),
      statuses: packFilterValues(f.status),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      settlementCodes: packFilterValues(f.settlementCode),
      itemCounts: packFilterValues(f.itemCount),
      attachmentCounts: packFilterValues(f.attachmentCount),
      cashFlowCounts: packFilterValues(f.cashFlowCount),
      amounts: packFilterValues(f.amount),
      paidAmounts: packFilterValues(f.paidAmount),
      remainingAmounts: packFilterValues(f.remainingAmount),
      createdBys: packFilterValues(f.createdBy),
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchRefundOrders,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<RefundOrderRecord>()
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
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteRefundOrdersApi(chunk),
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

const listActionColWidth = computed(() =>
  actionColW([
    ACTION_COL_ICON,
    perms.update && t('refundOrder.markPaid'),
    perms.delete && t('common.delete'),
  ]),
)

const codeLayoutKey = computed(() =>
  [
    codeColW(t('refundOrder.fields.refundCode'), {
      interactive: true,
      samples: list.value.map((r) => r.refundCode),
    }),
    codeColW(t('refundOrder.fields.contractCode'), {
      interactive: true,
      samples: list.value.map((r) => r.contractCode),
    }),
  ].join('-'),
)

const refundCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.refundCode),
)
const contractCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.contractCode),
)
const customerNameFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.customerName),
)
const settlementCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.settlementCode),
)
const itemCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.itemCount ?? r.items?.length ?? 0)),
)
const attachmentCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.attachmentCount ?? r.attachments?.length ?? 0)),
)
const cashFlowCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.cashFlowCount ?? 0)),
)
const amountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.amount == null ? '' : String(r.amount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const paidAmountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.paidAmount == null ? '' : String(r.paidAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const remainingAmountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => String(refundOrderRemaining(r)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))

function moneyOrDash(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function openDetail(row: RefundOrderRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchRefundOrder(row.id)
    current.value = data
  } catch {
    current.value = row
  }
  drawerVisible.value = true
  void direction
}

function onRowClick(
  row: RefundOrderRecord,
  column: { type?: string } | undefined,
  event: Event,
) {
  if (column?.type === 'selection' || column?.type === 'index') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .fk-link, input, textarea')) return
  void openDetail(row, 'rtl')
}

async function openPay(row: RefundOrderRecord) {
  if (!canDisburseRefundOrder(row.status)) return
  paying.value = row
  payForm.amount = refundOrderRemaining(row)
  payForm.refundDate = todayYmd()
  payForm.paymentMethod = row.paymentMethod || ''
  payForm.remark = ''
  payPendingAttachments.value = []
  payVisible.value = true
  payLoading.value = true
  try {
    const { data } = await fetchRefundOrder(row.id)
    paying.value = data
    payForm.amount = refundOrderRemaining(data)
    if (!payForm.paymentMethod && data.paymentMethod) {
      payForm.paymentMethod = data.paymentMethod
    }
  } catch {
    /* 列表行无明细时仍可打款，仅无分摊预览 */
  } finally {
    payLoading.value = false
  }
}

async function onDelete(row: RefundOrderRecord) {
  try {
    await ElMessageBox.confirm(
      t('refundOrder.deleteConfirm', { code: row.refundCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteRefundOrderApi(row.id, { silentError: true })
    await ElMessageBox.alert(t('refundOrder.deleted'), t('common.tip'), { type: 'success' })
    await loadList()
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
        ?.message ||
      (e as { message?: string })?.message ||
      t('common.error')
    await ElMessageBox.alert(String(msg), t('common.tip'), { type: 'error' })
  }
}

function onPayAttachmentsAdd(files: File[]) {
  for (const file of files) {
    payPendingAttachments.value.push({
      key: `${Date.now()}_${file.name}_${Math.random().toString(36).slice(2, 8)}`,
      file,
    })
  }
}

function onPayAttachmentRemovePending(key: string) {
  payPendingAttachments.value = payPendingAttachments.value.filter((p) => p.key !== key)
}

async function submitPay() {
  if (!paying.value) return
  const amount = Math.round((Number(payForm.amount) || 0) * 100) / 100
  const maxPay = payRemaining.value
  if (amount <= 0.009) {
    await ElMessageBox.alert(t('refundOrder.needInstallmentAmount'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  if (amount > maxPay + 0.009) {
    await ElMessageBox.alert(
      t('refundOrder.amountExceedRemaining', { amount: formatMoney(maxPay) }),
      t('common.tip'),
      { type: 'warning' },
    )
    return
  }
  if (!payForm.refundDate) {
    await ElMessageBox.alert(t('refundOrder.needRefundDate'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  paySaving.value = true
  const refundOrderId = paying.value.id
  try {
    await disburseRefundOrderApi(
      refundOrderId,
      {
        amount,
        refundDate: payForm.refundDate,
        paymentMethod: payForm.paymentMethod.trim() || undefined,
        handlerId: userStore.user?.id?.trim() || null,
        remark: payForm.remark.trim() || undefined,
      },
      { silentError: true },
    )
    const files = payPendingAttachments.value.map((p) => p.file)
    if (files.length) {
      try {
        await uploadRefundOrderAttachmentsApi(refundOrderId, files)
      } catch {
        payVisible.value = false
        await ElMessageBox.alert(
          t('refundOrder.attachmentsUploadFailed'),
          t('common.tip'),
          { type: 'warning' },
        )
        await loadList()
        return
      }
    }
    payVisible.value = false
    await ElMessageBox.alert(t('refundOrder.markPaidDone'), t('common.success'), {
      type: 'success',
    })
    await loadList()
  } catch (e) {
    const msg =
      e instanceof Error && e.message ? e.message : t('refundOrder.markPaidFailed')
    await ElMessageBox.alert(msg, t('common.error'), { type: 'error' })
  } finally {
    paySaving.value = false
  }
}

async function openItemsSide(row: RefundOrderRecord) {
  if (!(row.itemCount ?? row.items?.length ?? 0)) return
  itemsDialogZ.value = allocZ(OVERLAY_ABOVE_FEATURE_MENU_Z)
  try {
    const { data } = await fetchRefundOrder(row.id)
    itemsDialogRecord.value = data
  } catch {
    itemsDialogRecord.value = row
  }
  itemsDialogVisible.value = true
}

function onItemsDialogOpenReceivable(id: string) {
  if (itemsDialogZ.value != null) raiseFloor(itemsDialogZ.value)
  relationDrawers.value?.openReceivableSide(id, { zIndex: itemsDialogZ.value })
}

function onItemsDialogOpenReceipt(id: string) {
  if (itemsDialogZ.value != null) raiseFloor(itemsDialogZ.value)
  relationDrawers.value?.openReceiptSide(id, { zIndex: itemsDialogZ.value })
}

function openAttachmentsSide(row: RefundOrderRecord) {
  if (!(row.attachmentCount ?? row.attachments?.length ?? 0)) return
  void openDetail(row)
}

function openCashFlowsSide(row: RefundOrderRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  relatedListRefund.value = row
  relatedCashFlowsVisible.value = true
}

async function openCashFlowSide(row: CashFlowRecord) {
  try {
    const { data } = await fetchCashFlow(row.id)
    cashFlowRecord.value = data
  } catch {
    cashFlowRecord.value = row
  }
  cashFlowDrawer.value = true
}

async function openSettlement(id: string) {
  try {
    const { data } = await fetchContractSettlement(id)
    settlementRecord.value = data
    settlementDrawer.value = true
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('common.loadFailed')
    await ElMessageBox.alert(msg, t('common.error'), { type: 'error' })
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
  if (scope) void exportRefundOrdersXlsx(scope)
}

function downloadImportTemplate() {
  const example = refundOrderIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'RefundOrders')
  XLSX.writeFile(wb, 'refund-orders-import-template.xlsx')
  void ElMessageBox.alert(t('refundOrder.templateDone'), t('common.tip'), { type: 'success' })
}

async function exportRefundOrdersXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: RefundOrderRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      await ElMessageBox.alert(t('refundOrder.exportEmpty'), t('common.tip'), { type: 'warning' })
      return
    }
    const sheetRows = rows.map((r) => refundOrderToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'RefundOrders')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `refund-orders-${exportFileSuffix(scope)}-${day}.xlsx`)
    await ElMessageBox.alert(t('refundOrder.exportDone', { n: rows.length }), t('common.tip'), {
      type: 'success',
    })
  } catch {
    await ElMessageBox.alert(t('refundOrder.importFailed'), t('common.tip'), { type: 'error' })
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
    await ElMessageBox.alert(t('refundOrder.importAdminOnly'), t('common.tip'), { type: 'warning' })
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
        message: t('refundOrder.importEmpty'),
      })
      return
    }

    const payloads: RefundOrderImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToRefundOrderIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              結算編號: String(row['合約終止結算單'] ?? row['终止结算编号'] ?? ''),
              退款編號: String(row['退款編號'] ?? row['退款编号'] ?? ''),
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
        const { data } = await importRefundOrdersApi(batch)
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
              結算編號: it.settlementCode || '',
              退款編號: it.refundCode || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('refundOrder.importFailed'))
  }
}

onMounted(() => {
  void loadList()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <RefreshListButton :loading="loading" @refresh="loadList" />
      <h2>{{ t('menu.refundOrders') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('refundOrder.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('refundOrder.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('refundOrder.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('refundOrder.downloadTemplate') }}</span>
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
              codeColW(t('refundOrder.fields.refundCode'), {
                interactive: true,
                samples: list.map((r) => r.refundCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.refundCode')"
                filterable
                sortable
                :options="refundCodeFilterOptions"
                :model-value="filters.refundCode || []"
                :sort-order="sortOrderOf('refundCode')"
                @update:model-value="(v) => setFilter('refundCode', v)"
                @update:sort-order="(v) => setSort('refundCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.refundCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('refundOrder.fields.status'),
                statusOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.status')"
                filterable
                sortable
                :options="statusOptions"
                :model-value="filters.status || []"
                :sort-order="sortOrderOf('status')"
                @update:model-value="(v) => setFilter('status', v)"
                @update:sort-order="(v) => setSort('status', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="refundOrderStatusTone(row.status)"
                :label="t(`refundOrder.status.${row.status}`, row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('refundOrder.fields.contractCode'), {
                interactive: true,
                samples: list.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.contractCode')"
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
              textColW(t('refundOrder.fields.customerName'), {
                interactive: true,
                kind: 'name',
              })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.customerName')"
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
          <el-table-column
            :min-width="
              codeColW(t('refundOrder.fields.settlementCode'), {
                interactive: true,
                samples: list.map((r) => r.settlementCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.settlementCode')"
                filterable
                sortable
                :options="settlementCodeFilterOptions"
                :model-value="filters.settlementCode || []"
                :sort-order="sortOrderOf('settlementCode')"
                @update:model-value="(v) => setFilter('settlementCode', v)"
                @update:sort-order="(v) => setSort('settlementCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.settlementId"
                type="button"
                class="fk-link"
                @click.stop="openSettlement(row.settlementId)"
              >
                {{ row.settlementCode || '—' }}
              </button>
              <template v-else>{{ row.settlementCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.itemCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.itemCount')"
                filterable
                sortable
                :options="itemCountFilterOptions"
                :model-value="filters.itemCount || []"
                :sort-order="sortOrderOf('itemCount')"
                @update:model-value="(v) => setFilter('itemCount', v)"
                @update:sort-order="(v) => setSort('itemCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.itemCount ?? row.items?.length ?? 0"
                @click="openItemsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.attachmentCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.attachmentCount')"
                filterable
                sortable
                :options="attachmentCountFilterOptions"
                :model-value="filters.attachmentCount || []"
                :sort-order="sortOrderOf('attachmentCount')"
                @update:model-value="(v) => setFilter('attachmentCount', v)"
                @update:sort-order="(v) => setSort('attachmentCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.attachmentCount ?? row.attachments?.length ?? 0"
                @click="openAttachmentsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.cashFlowCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.cashFlowCount')"
                filterable
                sortable
                :options="cashFlowCountFilterOptions"
                :model-value="filters.cashFlowCount || []"
                :sort-order="sortOrderOf('cashFlowCount')"
                @update:model-value="(v) => setFilter('cashFlowCount', v)"
                @update:sort-order="(v) => setSort('cashFlowCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.cashFlowCount ?? 0" @click="openCashFlowsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.amount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.amount')"
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
            :min-width="colW(t('refundOrder.fields.paidAmount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.paidAmount')"
                filterable
                sortable
                :options="paidAmountFilterOptions"
                :model-value="filters.paidAmount || []"
                :sort-order="sortOrderOf('paidAmount')"
                @update:model-value="(v) => setFilter('paidAmount', v)"
                @update:sort-order="(v) => setSort('paidAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.paidAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.remainingAmount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.remainingAmount')"
                filterable
                sortable
                :options="remainingAmountFilterOptions"
                :model-value="filters.remainingAmount || []"
                :sort-order="sortOrderOf('remainingAmount')"
                @update:model-value="(v) => setFilter('remainingAmount', v)"
                @update:sort-order="(v) => setSort('remainingAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(refundOrderRemaining(row)) }}</template>
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
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--accent"
                  :disabled="!canDisburseRefundOrder(row.status)"
                  @click="openPay(row)"
                >
                  {{ t('refundOrder.markPaid') }}
                </button>
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

    <RefundOrderItemsDialog
      v-model="itemsDialogVisible"
      :record="itemsDialogRecord"
      :z-index="itemsDialogZ"
      @open-receivable="onItemsDialogOpenReceivable"
      @open-receipt="onItemsDialogOpenReceipt"
    />
    <RefundOrderDetailDrawer
      v-model="drawerVisible"
      :record="current"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
      @open-settlement="openSettlement"
      @open-cash-flows="openCashFlowsSide"
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
    <RelatedCashFlowsDrawer
      v-model="relatedCashFlowsVisible"
      :refund-order-id="relatedListRefund?.id"
      :title-context="relatedListRefund?.refundCode || ''"
      @open-cash-flow="openCashFlowSide"
    />
    <CashFlowDetailDrawer
      v-model="cashFlowDrawer"
      :record="cashFlowRecord"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id)"
      @open-refund-order="(id) => relationDrawers?.openRefundOrderSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="payVisible"
      class="lb-dialog"
      :title="t('refundOrder.markPaidTitle')"
      width="640px"
      destroy-on-close
    >
      <div v-loading="payLoading">
        <el-form label-position="top" class="form-grid">
          <el-form-item :label="t('refundOrder.fields.remainingAmount')">
            <el-input :model-value="moneyOrDash(payRemaining)" disabled />
          </el-form-item>
          <el-form-item required>
            <template #label>
              <span class="form-label-with-tip">
                {{ t('refundOrder.fields.installmentAmount') }}
                <el-tooltip
                  :content="t('refundOrder.disburseAmountHint')"
                  placement="top"
                >
                  <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <el-input-number
              v-model="payForm.amount"
              :min="0.01"
              :max="Math.max(0.01, payRemaining || 0.01)"
              :precision="2"
              :step="100"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('refundOrder.fields.refundDate')" required>
            <el-date-picker
              v-model="payForm.refundDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('refundOrder.fields.paymentMethod')">
            <el-select
              fit-input-width
              v-model="payForm.paymentMethod"
              filterable
              clearable
              value-on-clear=""
              :placeholder="t('common.pleaseSelect')"
              style="width: 100%"
            >
              <el-option
                v-for="m in paymentMethodOptions"
                :key="m"
                :label="m"
                :value="m"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('refundOrder.fields.attachments')" class="span-2">
            <MultiAttachmentField
              :pending="payPendingAttachments"
              @add="onPayAttachmentsAdd"
              @remove-pending="onPayAttachmentRemovePending"
            />
          </el-form-item>
          <el-form-item :label="t('common.remark')" class="span-2">
            <el-input v-model="payForm.remark" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>

        <div v-if="showPayAllocPreview" class="refund-alloc">
          <div class="refund-alloc__head">
            <span>{{ t('contract.cancelRefundAllocPreview') }}</span>
            <el-tooltip
              :content="t('contract.cancelRefundAllocFifoHint')"
              placement="top"
              :fallback-placements="['top', 'left', 'right']"
            >
              <el-icon class="refund-alloc__tip" :size="14"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <ul class="refund-alloc__list">
            <li v-for="row in payAllocPreview" :key="row.key" class="refund-alloc__row">
              <span class="refund-alloc__code">{{ row.label }}</span>
              <span class="refund-alloc__parts">
                <span class="refund-alloc__tag is-due">
                  {{ t('contract.cancelRefundAllocDue', { amount: formatMoney(row.due) }) }}
                </span>
                <span v-if="row.refundPart > 0.009" class="refund-alloc__tag is-now">
                  {{
                    t('contract.cancelRefundAllocNow', {
                      amount: formatMoney(row.refundPart),
                    })
                  }}
                </span>
                <span
                  v-if="row.remainAfter <= 0.009 && row.refundPart > 0.009"
                  class="refund-alloc__tag is-settled"
                >
                  {{ t('contract.cancelRefundAllocSettled') }}
                </span>
                <span v-else-if="row.remainAfter > 0.009" class="refund-alloc__tag is-later">
                  {{
                    t('contract.cancelRefundAllocLater', {
                      amount: formatMoney(row.remainAfter),
                    })
                  }}
                </span>
              </span>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <el-button @click="payVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          v-admin-glow="perms.codes.update"
          type="primary"
          class="lb-btn-primary"
          :loading="paySaving || payLoading"
          @click="submitPay"
        >
          {{ t('refundOrder.markPaid') }}
        </el-button>
      </template>
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

.form-label-with-tip {
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

.refund-alloc {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #fff);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #e6e6e6);
}
.refund-alloc__head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #333);
}
.refund-alloc__tip {
  color: var(--lb-muted, #666);
  cursor: help;
}
.refund-alloc__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.refund-alloc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #e6e6e6);
}
.refund-alloc__code {
  min-width: 0;
  font-size: 0.84rem;
  font-weight: 650;
  color: #3a4a42;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.refund-alloc__parts {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.refund-alloc__tag {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px;
  border-radius: 999px;
}
.refund-alloc__tag.is-due {
  color: #5a3d12;
  background: #f3e6d0;
}
.refund-alloc__tag.is-now {
  color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #fff);
}
.refund-alloc__tag.is-settled {
  color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #fff);
}
.refund-alloc__tag.is-later {
  color: #8a2f2f;
  background: #f6e0e0;
}
</style>
