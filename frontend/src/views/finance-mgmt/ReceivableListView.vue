<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createReceivableApi,
  deleteReceivableApi,
  batchDeleteReceivablesApi,
  fetchReceivable,
  fetchReceivableQuickCounts,
  fetchReceivables,
  importReceivablesApi,
  updateReceivableApi,
} from '@/api/receivables'
import type {
  ReceivableWritePayload,
  ReceivableListQuery,
  ReceivableQuickCounts,
} from '@/api/receivables'

import { fetchInvoices } from '@/api/invoices'
import { fetchReceipt, fetchReceipts } from '@/api/receipts'
import type { ReceivableRecord, ReceivableReceiptSummary } from '@/types/receivable'
import type { InvoiceRecord } from '@/types/invoice'
import type { ReceiptAttachmentRecord, ReceiptRecord } from '@/types/receipt'
import ReceiptAttachmentList from '@/components/ReceiptAttachmentList.vue'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import ReceivableDetailDrawer from '@/components/ReceivableDetailDrawer.vue'
import ReceivableReceivePaymentDialog from '@/components/ReceivableReceivePaymentDialog.vue'
import CountListPill from '@/components/CountListPill.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import type { CashFlowRecord } from '@/types/cash-flow'
import { fetchCashFlow } from '@/api/cash-flows'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import {
  receivableValidityKey,
  receivableValidityTone,
} from '@/constants/statusBadges'
import { ACTION_COL_ICON, measureActionColWidth } from '@/composables/useActionColWidth'
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

const { t, locale } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const perms = useResourcePermissions('receivables')
const receiptPerms = useResourcePermissions('receipts')
const receivableActionColWidth = computed(() => {
  void locale.value
  const labels: string[] = [ACTION_COL_ICON]
  if (receiptPerms.create) labels.push(t('receivable.receivePayment'))
  if (perms.update) labels.push(t('common.edit'))
  if (perms.delete) labels.push(t('common.delete'))
  return measureActionColWidth(labels)
})
const {
  colW,
  textColW,
  codeColW,
  statusColW,
  datetimeColWidth,
  auditUserColWidth,
  tableLayoutKey,
} = useTableColWidth()
const receiptLinkTableEn = computed(() => String(locale.value).toLowerCase().startsWith('en'))
const validityLabels = computed(() => [
  t('receivable.quickFilterActive'),
  t('receivable.quickFilterInvalid'),
])
function validityLabel(invoiceStatus: string | null | undefined) {
  return receivableValidityKey(invoiceStatus) === 'invalid'
    ? t('receivable.quickFilterInvalid')
    : t('receivable.quickFilterActive')
}

const keyword = ref('')
const formVisible = ref(false)
const editing = ref<ReceivableRecord | null>(null)
const SELECT_PAGE_SIZE = 20
/** 表单发票下拉（懒加载；禁止全量预拉以免弹窗卡死） */
const invoiceSelectOptions = ref<InvoiceRecord[]>([])
const invoiceSelectLoading = ref(false)
const invoiceSelectLoadingMore = ref(false)
const invoiceSelectPage = ref(1)
const invoiceSelectHasMore = ref(true)
const invoiceSelectKeyword = ref('')
let invoiceSelectScrollEl: HTMLElement | null = null
let invoiceSelectScrollHandler: ((e: Event) => void) | null = null
/** 表单关联收据（一对多；交互对齐合约期表格） */
type LinkedReceiptFormRow = {
  uid: string
  receiptId: string
  receiptCode: string
  paymentDate: string
  paymentMethod: string
  amount: number | null
  remark: string
  attachmentCount: number
  attachments: ReceiptAttachmentRecord[]
}
let linkedReceiptUidSeq = 0
function nextLinkedReceiptUid() {
  linkedReceiptUidSeq += 1
  return `lr-${Date.now()}-${linkedReceiptUidSeq}`
}
function defaultLinkedReceiptRow(): LinkedReceiptFormRow {
  return {
    uid: nextLinkedReceiptUid(),
    receiptId: '',
    receiptCode: '',
    paymentDate: '',
    paymentMethod: '',
    amount: null,
    remark: '',
    attachmentCount: 0,
    attachments: [],
  }
}
const linkedReceipts = ref<LinkedReceiptFormRow[]>([])
/** 定金抵扣动账（计入已收，与现金收据并列） */
const linkedDepositApplies = ref<Array<{ id: string; amount: number }>>([])
const RECEIPT_LINK_PAGE_SIZE = 5
const receiptLinkPage = ref(1)
const receiptSelectOptions = ref<ReceiptRecord[]>([])
const receiptSelectLoading = ref(false)
const receiptSelectLoadingMore = ref(false)
const receiptSelectPage = ref(1)
const receiptSelectHasMore = ref(true)
const receiptSelectKeyword = ref('')
let receiptSelectScrollEl: HTMLElement | null = null
let receiptSelectScrollHandler: ((e: Event) => void) | null = null

const drawerVisible = ref(false)
const relatedReceiptsDrawer = ref(false)
const relatedCashFlowsVisible = ref(false)
const relatedListReceivable = ref<ReceivableRecord | null>(null)
const cashFlowDrawer = ref(false)
const cashFlowRecord = ref<CashFlowRecord | null>(null)
const current = ref<ReceivableRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const receivePayVisible = ref(false)
const receivePayTarget = ref<ReceivableRecord | null>(null)

function openReceivePayment(row: ReceivableRecord) {
  const due = Number(row.receivableAmount ?? 0)
  if (!Number.isFinite(due) || due <= 0.009) {
    void ElMessageBox.alert(t('receivable.receivePaymentFullyPaid'), t('receivable.receivePayment'), {
      type: 'info',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (!receiptPerms.create) {
    void ElMessageBox.alert(t('receivable.receivePaymentNoPerm'), t('receivable.receivePayment'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  receivePayTarget.value = row
  receivePayVisible.value = true
}

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
} = useTableSortFilter<ReceivableRecord>()

/**
 * 页头快捷筛选：
 * - 全部 / 有效 / 失效：互斥（默认有效；按所属发票是否已取消）
 * - 待收款 / 已逾期：可叠加开关（AND；落在当前有效性范围内）
 */
const outstandingFilter = ref(false)
const overdueFilter = ref(false)
const validityFilter = ref<'all' | 'active' | 'invalid'>('active')
const quickCounts = ref<ReceivableQuickCounts>({
  all: 0,
  outstanding: 0,
  overdue: 0,
  active: 0,
  invalid: 0,
})

const validityFilterChips = computed(() => [
  {
    key: 'all' as const,
    label: t('receivable.quickFilterAll'),
    count: quickCounts.value.all,
  },
  {
    key: 'active' as const,
    label: t('receivable.quickFilterActive'),
    count: quickCounts.value.active,
  },
  {
    key: 'invalid' as const,
    label: t('receivable.quickFilterInvalid'),
    count: quickCounts.value.invalid,
  },
])

async function loadQuickCounts() {
  try {
    const { data } = await fetchReceivableQuickCounts({ validity: validityFilter.value })
    quickCounts.value = {
      all: data.all ?? 0,
      outstanding: data.outstanding ?? 0,
      overdue: data.overdue ?? 0,
      active: data.active ?? 0,
      invalid: data.invalid ?? 0,
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
} = useServerPagedList<ReceivableRecord, ReceivableListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const invoice = range('invoiceDate')
    const due = range('paymentDueDate')
    return {
      keyword: kw,
      invoiceCodes: packFilterValues(f.invoiceCode),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      invoiceAmounts: packFilterValues(f.invoiceAmount),
      receivedAmounts: packFilterValues(f.receivedAmount),
      refundedAmounts: packFilterValues(f.refundedAmount),
      receivableAmounts: packFilterValues(f.receivableAmount),
      createdBys: packFilterValues(f.createdBy),
      sortBy,
      sortDir,
      invoiceDateFrom: invoice.from,
      invoiceDateTo: invoice.to,
      paymentDueDateFrom: due.from,
      paymentDueDateTo: due.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      outstanding: outstandingFilter.value || undefined,
      overdue: overdueFilter.value || undefined,
      validity: validityFilter.value,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchReceivables,
})

function toggleOutstandingFilter() {
  outstandingFilter.value = !outstandingFilter.value
  resetPage()
  void loadList()
}

function toggleOverdueFilter() {
  overdueFilter.value = !overdueFilter.value
  resetPage()
  void loadList()
}

function setValidityFilter(key: 'all' | 'active' | 'invalid') {
  if (validityFilter.value === key) return
  validityFilter.value = key
  resetPage()
  void reloadListAndCounts()
}

const receivableConditionCount = computed(
  () =>
    activeConditionCount.value +
    (outstandingFilter.value ? 1 : 0) +
    (overdueFilter.value ? 1 : 0) +
    (validityFilter.value === 'invalid' || validityFilter.value === 'all' ? 1 : 0),
)

function onClearReceivableFilters() {
  outstandingFilter.value = false
  overdueFilter.value = false
  validityFilter.value = 'active'
  onClearFilters()
  void loadQuickCounts()
}

async function reloadListAndCounts() {
  await Promise.all([loadList(), loadQuickCounts()])
}

async function refreshEditingFormReceipts() {
  const id = editing.value?.id
  if (!id) return
  try {
    const [{ data: ar }, { data: rcpt }] = await Promise.all([
      fetchReceivable(id),
      fetchReceipts({ receivableId: id, page: 1, pageSize: 100 }),
    ])
    editing.value = ar
    form.receivedAmount = ar.receivedAmount ?? 0
    form.refundedAmount = ar.refundedAmount ?? 0
    form.receivableAmount = ar.receivableAmount
    form.invoiceAmount = ar.invoiceAmount
    linkedReceipts.value = mapReceiptsToLinkedRows(
      rcpt.items?.length ? rcpt.items : ar.receipts || [],
    )
    clampReceiptLinkPage()
    seedReceiptOptionsFromLinked()
  } catch {
    /* keep current form rows */
  }
}

async function onReceivePaymentCollected() {
  await reloadListAndCounts()
  if (formVisible.value && editing.value) {
    await refreshEditingFormReceipts()
  }
}

/** 编辑弹窗内「新增收据」→ 收款弹窗（生成收据）；已有行只读，改内容请去收据管理 */
async function openAddReceiptFromForm() {
  if (!editing.value?.id) {
    await ElMessageBox.alert(t('receivable.addReceiptAfterSave'), t('receivable.addReceipt'), {
      type: 'info',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  try {
    const { data } = await fetchReceivable(editing.value.id)
    editing.value = data
    form.receivedAmount = data.receivedAmount ?? 0
    form.refundedAmount = data.refundedAmount ?? 0
    form.receivableAmount = data.receivableAmount
    openReceivePayment(data)
  } catch {
    openReceivePayment(editing.value)
  }
}

const codeLayoutKey = computed(() =>
  [
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
      (chunk) => batchDeleteReceivablesApi(chunk),
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

function invoiceOptionLabel(
  inv: Pick<InvoiceRecord, 'invoiceCode' | 'customerName' | 'contractCode'>,
) {
  return `${inv.invoiceCode} · ${inv.customerName} · ${inv.contractCode}`
}

function uniqueListOptions(
  get: (row: ReceivableRecord) => string | number | null | undefined,
  labelOf?: (value: string) => string,
) {
  return uniqueOptions(list.value, get, labelOf)
}

const invoiceCodeFilterOptions = computed(() => uniqueListOptions((r) => r.invoiceCode))
const contractCodeFilterOptions = computed(() => uniqueListOptions((r) => r.contractCode))
const invoiceAmountFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.invoiceAmount == null ? '' : String(r.invoiceAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const receivedAmountFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.receivedAmount == null ? '' : String(r.receivedAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const refundedAmountFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.refundedAmount == null ? '' : String(r.refundedAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const receivableAmountFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.receivableAmount == null ? '' : String(r.receivableAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const createdByFilterOptions = computed(() => uniqueListOptions((r) => r.createdBy))

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const row of list.value) {
    const name = row.customerName?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const selectedInvoice = computed(
  () => invoiceSelectOptions.value.find((inv) => inv.id === form.invoiceId) || null,
)

function keepSelectedInOptions<T extends { id: string }>(
  items: T[],
  selectedId: string | null | undefined,
  current: T[],
): T[] {
  const sid = String(selectedId ?? '').trim()
  if (!sid || items.some((x) => x.id === sid)) return items
  const keep = current.find((x) => x.id === sid)
  return keep ? [keep, ...items] : items
}

function appendUniqueById<T extends { id: string }>(prev: T[], next: T[]): void {
  if (!next.length) return
  const seen = new Set(prev.map((x) => x.id))
  for (const item of next) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    prev.push(item)
  }
}

function unbindSelectScroll(el: HTMLElement | null, handler: ((e: Event) => void) | null) {
  if (el && handler) el.removeEventListener('scroll', handler)
}

function bindSelectScroll(
  popperClass: string,
  onReachEnd: () => void,
): { el: HTMLElement | null; handler: ((e: Event) => void) | null } {
  const popper = document.querySelector(`.${popperClass}`)
  const wrap =
    (popper?.querySelector('.el-select-dropdown__wrap') as HTMLElement | null) ||
    (popper?.querySelector('.el-scrollbar__wrap') as HTMLElement | null)
  if (!wrap) return { el: null, handler: null }
  let ticking = false
  const handler = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      if (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight <= 28) onReachEnd()
    })
  }
  wrap.addEventListener('scroll', handler, { passive: true })
  return { el: wrap, handler }
}

async function restoreSelectScroll(el: HTMLElement | null, top: number) {
  if (!el) return
  await nextTick()
  el.scrollTop = top
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '880px'))

const emptyForm = () => ({
  invoiceId: '' as string,
  receivableCode: '',
  invoiceDate: '',
  paymentDueDate: '',
  invoiceAmount: null as number | null,
  receivedAmount: 0 as number | null,
  refundedAmount: 0 as number | null,
  receivableAmount: null as number | null,
  remark: '',
})

const form = reactive(emptyForm())
const receivableAmountTouched = ref(false)
const receivedAmountTouched = ref(false)

function recalcReceivableAmount() {
  if (receivableAmountTouched.value) return
  const inv = Number(form.invoiceAmount) || 0
  const recv = Number(form.receivedAmount) || 0
  const refunded = Number(form.refundedAmount) || 0
  form.receivableAmount = Math.round((inv - recv + refunded) * 100) / 100
}

function syncReceivedFromLinkedReceipts() {
  if (receivedAmountTouched.value) return
  const cash = linkedReceipts.value.reduce((acc, row) => {
    if (!row.receiptId) return acc
    return acc + (Number(row.amount) || 0)
  }, 0)
  const apply = linkedDepositApplies.value.reduce(
    (acc, row) => acc + (Number(row.amount) || 0),
    0,
  )
  form.receivedAmount = Math.round((cash + apply) * 100) / 100
  receivableAmountTouched.value = false
  recalcReceivableAmount()
}

const receiptLinkTotalPages = computed(() =>
  Math.max(1, Math.ceil(linkedReceipts.value.length / RECEIPT_LINK_PAGE_SIZE) || 1),
)

const pagedLinkedReceipts = computed(() => {
  const start = (receiptLinkPage.value - 1) * RECEIPT_LINK_PAGE_SIZE
  return linkedReceipts.value.slice(start, start + RECEIPT_LINK_PAGE_SIZE).map((row, i) => ({
    row,
    index: start + i,
  }))
})

function clampReceiptLinkPage() {
  receiptLinkPage.value = Math.min(Math.max(1, receiptLinkPage.value), receiptLinkTotalPages.value)
}


function usedReceiptIdsExcept(uid: string): Set<string> {
  const used = new Set<string>()
  for (const r of linkedReceipts.value) {
    if (r.uid === uid) continue
    if (r.receiptId) used.add(r.receiptId)
  }
  return used
}

function clearLinkedReceiptRow(row: LinkedReceiptFormRow) {
  row.receiptCode = ''
  row.paymentDate = ''
  row.paymentMethod = ''
  row.amount = null
  row.remark = ''
  row.attachmentCount = 0
  row.attachments = []
}

function applyReceiptToLinkedRow(
  row: LinkedReceiptFormRow,
  receipt: ReceiptRecord | ReceivableReceiptSummary,
) {
  row.receiptCode = receipt.receiptCode || ''
  row.paymentDate = receipt.paymentDate || ''
  row.paymentMethod =
    'paymentMethod' in receipt ? receipt.paymentMethod || '' : row.paymentMethod
  row.amount = receipt.amount
  row.remark = receipt.remark || ''
  if ('attachments' in receipt && Array.isArray(receipt.attachments)) {
    row.attachments = [...receipt.attachments]
    row.attachmentCount = receipt.attachments.length
  } else if ('attachmentCount' in receipt && receipt.attachmentCount != null) {
    row.attachmentCount = Number(receipt.attachmentCount) || 0
    if (!row.attachments.length) row.attachments = []
  } else {
    row.attachmentCount = 0
    row.attachments = []
  }
}

const receiptAttDialogVisible = ref(false)
const receiptAttDialogLoading = ref(false)
const receiptAttDialogCode = ref('')
const receiptAttDialogReceiptId = ref('')
const receiptAttDialogItems = ref<ReceiptAttachmentRecord[]>([])

async function openLinkedReceiptAttachments(row: LinkedReceiptFormRow) {
  if (!row.receiptId || row.attachmentCount <= 0) return
  receiptAttDialogCode.value = row.receiptCode || row.receiptId
  receiptAttDialogReceiptId.value = row.receiptId
  receiptAttDialogItems.value = [...(row.attachments || [])]
  receiptAttDialogVisible.value = true
  if (receiptAttDialogItems.value.length >= row.attachmentCount) return
  receiptAttDialogLoading.value = true
  try {
    const { data } = await fetchReceipt(row.receiptId)
    if (row.receiptId !== receiptAttDialogReceiptId.value) return
    applyReceiptToLinkedRow(row, data)
    pinReceiptOption(data)
    receiptAttDialogItems.value = [...(data.attachments || [])]
  } catch {
    /* 保留已有列表 */
  } finally {
    receiptAttDialogLoading.value = false
  }
}

function pinReceiptOption(receipt: ReceiptRecord) {
  const idx = receiptSelectOptions.value.findIndex((x) => x.id === receipt.id)
  if (idx >= 0) receiptSelectOptions.value[idx] = receipt
  else receiptSelectOptions.value.unshift(receipt)
}

/** 下拉缓存可能缺附件：选中后拉收据详情补全备注 / 凭证数 */
async function onLinkedReceiptPicked(row: LinkedReceiptFormRow) {
  const id = row.receiptId.trim()
  if (!id) {
    clearLinkedReceiptRow(row)
    syncReceivedFromLinkedReceipts()
    return
  }
  const cached = receiptSelectOptions.value.find((r) => r.id === id)
  if (cached) applyReceiptToLinkedRow(row, cached)
  else row.receiptCode = row.receiptCode || id
  syncReceivedFromLinkedReceipts()
  try {
    const { data } = await fetchReceipt(id)
    if (row.receiptId.trim() !== id) return
    applyReceiptToLinkedRow(row, data)
    pinReceiptOption(data)
    syncReceivedFromLinkedReceipts()
  } catch {
    /* 保留缓存回填 */
  }
}

const dragLinkedReceiptUid = ref<string | null>(null)
const dragOverLinkedReceiptUid = ref<string | null>(null)

function onLinkedReceiptDragStart(uid: string, e: DragEvent) {
  dragLinkedReceiptUid.value = uid
  e.dataTransfer?.setData('text/plain', uid)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onLinkedReceiptDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragLinkedReceiptUid.value && dragLinkedReceiptUid.value !== uid) {
    dragOverLinkedReceiptUid.value = uid
  }
}

function onLinkedReceiptDrop(uid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragLinkedReceiptUid.value || e.dataTransfer?.getData('text/plain')
  dragLinkedReceiptUid.value = null
  dragOverLinkedReceiptUid.value = null
  if (!fromUid || fromUid === uid) return
  const list = linkedReceipts.value
  const fromIdx = list.findIndex((r) => r.uid === fromUid)
  const toIdx = list.findIndex((r) => r.uid === uid)
  if (fromIdx < 0 || toIdx < 0) return
  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)
}

function onLinkedReceiptDragEnd() {
  dragLinkedReceiptUid.value = null
  dragOverLinkedReceiptUid.value = null
}

const editingLinkedReceiptIndexUid = ref<string | null>(null)
const editingLinkedReceiptIndexFrom = ref(-1)
const editingLinkedReceiptIndexDraft = ref('')
const linkedReceiptIndexInputRef = ref<HTMLInputElement | null>(null)
let linkedReceiptIndexCommitLock = false

async function startEditLinkedReceiptIndex(uid: string, currentIndex: number) {
  if (linkedReceipts.value.length <= 1) return
  linkedReceiptIndexCommitLock = false
  editingLinkedReceiptIndexUid.value = uid
  editingLinkedReceiptIndexFrom.value = currentIndex
  editingLinkedReceiptIndexDraft.value = String(currentIndex + 1)
  await nextTick()
  const el = linkedReceiptIndexInputRef.value
  if (!el) return
  el.focus()
  el.select()
}

function cancelEditLinkedReceiptIndex() {
  editingLinkedReceiptIndexUid.value = null
  editingLinkedReceiptIndexFrom.value = -1
  editingLinkedReceiptIndexDraft.value = ''
}

function commitEditLinkedReceiptIndex() {
  if (linkedReceiptIndexCommitLock) return
  linkedReceiptIndexCommitLock = true
  const uid = editingLinkedReceiptIndexUid.value
  const fromIdx = editingLinkedReceiptIndexFrom.value
  const draft = String(editingLinkedReceiptIndexDraft.value ?? '').trim()
  cancelEditLinkedReceiptIndex()
  if (!uid || fromIdx < 0) {
    linkedReceiptIndexCommitLock = false
    return
  }
  const total = linkedReceipts.value.length
  const raw = Number.parseInt(draft, 10)
  if (!Number.isFinite(raw)) {
    linkedReceiptIndexCommitLock = false
    return
  }
  const toIdx = Math.min(total, Math.max(1, raw)) - 1
  const list = linkedReceipts.value
  if (list[fromIdx]?.uid !== uid) {
    linkedReceiptIndexCommitLock = false
    return
  }
  if (toIdx !== fromIdx) {
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
    receiptLinkPage.value = Math.floor(toIdx / RECEIPT_LINK_PAGE_SIZE) + 1
  }
  linkedReceiptIndexCommitLock = false
}

function onLinkedReceiptIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitEditLinkedReceiptIndex()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEditLinkedReceiptIndex()
  }
}

function mapReceiptsToLinkedRows(
  items: Array<ReceivableReceiptSummary | ReceiptRecord>,
): LinkedReceiptFormRow[] {
  return items.map((r) => {
    const attachments =
      'attachments' in r && Array.isArray(r.attachments) ? [...r.attachments] : []
    const attachmentCount =
      attachments.length ||
      ('attachmentCount' in r && r.attachmentCount != null
        ? Number(r.attachmentCount) || 0
        : 0)
    return {
      uid: nextLinkedReceiptUid(),
      receiptId: r.id,
      receiptCode: r.receiptCode || '',
      paymentDate: r.paymentDate || '',
      paymentMethod: 'paymentMethod' in r ? r.paymentMethod || '' : '',
      amount: r.amount,
      remark: r.remark || '',
      attachmentCount,
      attachments,
    }
  })
}

function seedReceiptOptionsFromLinked() {
  const seeded: ReceiptRecord[] = []
  for (const row of linkedReceipts.value) {
    if (!row.receiptId) continue
    if (seeded.some((x) => x.id === row.receiptId)) continue
    seeded.push({
      id: row.receiptId,
      receiptCode: row.receiptCode,
      kind: 'invoice',
      customerId: '',
      customerCode: '',
      customerName: '',
      contractId: null,
      contractCode: '',
      invoiceId: null,
      invoiceCode: '',
      receivableId: editing.value?.id || null,
      receivableCode: editing.value?.receivableCode || '',
      paymentDate: row.paymentDate,
      paymentMethod: row.paymentMethod,
      amount: row.amount,
      remark: row.remark || null,
      attachments: row.attachments?.length
        ? [...row.attachments]
        : Array.from({ length: row.attachmentCount }, (_, i) => ({
            id: `seed-att-${row.receiptId}-${i}`,
            receiptId: row.receiptId,
            fileName: '',
            sortOrder: i,
          })),
      changeLog: null,
      createdBy: '',
      updatedBy: '',
      createdAt: '',
      updatedAt: '',
    })
  }
  receiptSelectOptions.value = seeded
}

/** 下拉展开时的辅助信息；选中框仅显示收据编号 */
function receiptOptionHint(r: Pick<ReceiptRecord, 'receiptCode' | 'paymentDate' | 'amount'>) {
  const amt = r.amount == null ? '' : formatMoney(r.amount)
  return [r.paymentDate, amt].filter(Boolean).join(' · ')
}

async function loadReceiptsPage(reset: boolean) {
  if (reset) {
    if (receiptSelectLoading.value) return
    receiptSelectLoading.value = true
  } else {
    if (
      receiptSelectLoading.value ||
      receiptSelectLoadingMore.value ||
      !receiptSelectHasMore.value
    ) {
      return
    }
    receiptSelectLoadingMore.value = true
  }
  const page = reset ? 1 : receiptSelectPage.value
  const prevTop = receiptSelectScrollEl?.scrollTop ?? 0
  const selectedIds = linkedReceipts.value.map((r) => r.receiptId).filter(Boolean)
  try {
    const { data } = await fetchReceipts({
      keyword: receiptSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const items = data.items || []
    if (reset) {
      const kept = [...receiptSelectOptions.value]
      receiptSelectOptions.value = items.slice()
      for (const sid of selectedIds) {
        if (receiptSelectOptions.value.some((x) => x.id === sid)) continue
        const keep = kept.find((x) => x.id === sid)
        if (keep) receiptSelectOptions.value.unshift(keep)
      }
    } else {
      appendUniqueById(receiptSelectOptions.value, items)
      await restoreSelectScroll(receiptSelectScrollEl, prevTop)
    }
    receiptSelectPage.value = page + 1
    receiptSelectHasMore.value = items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      seedReceiptOptionsFromLinked()
      receiptSelectHasMore.value = false
    }
  } finally {
    if (reset) receiptSelectLoading.value = false
    else receiptSelectLoadingMore.value = false
  }
}

function searchReceiptsRemote(query: string) {
  receiptSelectKeyword.value = query.trim()
  receiptSelectHasMore.value = true
  void loadReceiptsPage(true)
}

async function onReceiptSelectVisible(open: boolean) {
  if (!open) {
    unbindSelectScroll(receiptSelectScrollEl, receiptSelectScrollHandler)
    receiptSelectScrollEl = null
    receiptSelectScrollHandler = null
    return
  }
  receiptSelectKeyword.value = ''
  receiptSelectHasMore.value = true
  await loadReceiptsPage(true)
  await nextTick()
  const bound = bindSelectScroll('receivable-receipt-select-popper', () => {
    void loadReceiptsPage(false)
  })
  receiptSelectScrollEl = bound.el
  receiptSelectScrollHandler = bound.handler
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
  receivedAmountTouched.value = true
  recalcReceivableAmount()
}

function onReceivableAmountManual() {
  receivableAmountTouched.value = true
}

async function loadInvoicesPage(reset: boolean) {
  if (reset) {
    if (invoiceSelectLoading.value) return
    invoiceSelectLoading.value = true
  } else {
    if (
      invoiceSelectLoading.value ||
      invoiceSelectLoadingMore.value ||
      !invoiceSelectHasMore.value
    ) {
      return
    }
    invoiceSelectLoadingMore.value = true
  }
  const page = reset ? 1 : invoiceSelectPage.value
  const prevTop = invoiceSelectScrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchInvoices({
      keyword: invoiceSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const items = data.items || []
    if (reset) {
      invoiceSelectOptions.value = keepSelectedInOptions(
        items,
        form.invoiceId,
        invoiceSelectOptions.value,
      )
    } else {
      appendUniqueById(invoiceSelectOptions.value, items)
      await restoreSelectScroll(invoiceSelectScrollEl, prevTop)
    }
    invoiceSelectPage.value = page + 1
    invoiceSelectHasMore.value = items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      invoiceSelectOptions.value = keepSelectedInOptions(
        [],
        form.invoiceId,
        invoiceSelectOptions.value,
      )
      invoiceSelectHasMore.value = false
    }
  } finally {
    if (reset) invoiceSelectLoading.value = false
    else invoiceSelectLoadingMore.value = false
  }
}

function searchInvoicesRemote(query: string) {
  invoiceSelectKeyword.value = query.trim()
  invoiceSelectHasMore.value = true
  void loadInvoicesPage(true)
}

async function onInvoiceSelectVisible(open: boolean) {
  unbindSelectScroll(invoiceSelectScrollEl, invoiceSelectScrollHandler)
  invoiceSelectScrollEl = null
  invoiceSelectScrollHandler = null
  if (!open) return
  invoiceSelectKeyword.value = ''
  invoiceSelectHasMore.value = true
  await loadInvoicesPage(true)
  await nextTick()
  const bound = bindSelectScroll('receivable-invoice-select-popper', () => {
    void loadInvoicesPage(false)
  })
  invoiceSelectScrollEl = bound.el
  invoiceSelectScrollHandler = bound.handler
}

function seedFormSelectsFromRow(row: ReceivableRecord) {
  invoiceSelectOptions.value = row.invoiceId
    ? [
        {
          id: row.invoiceId,
          invoiceCode: row.invoiceCode || '',
          customerId: row.customerId || '',
          customerName: row.customerName || '',
          contractId: row.contractId || '',
          contractCode: row.contractCode || '',
          invoiceDate: row.invoiceDate || '',
          paymentDueDate: row.paymentDueDate || '',
          amount: row.invoiceAmount,
        } as InvoiceRecord,
      ]
    : []
}

onMounted(async () => {
  await reloadListAndCounts()
})

onBeforeUnmount(() => {
  unbindSelectScroll(invoiceSelectScrollEl, invoiceSelectScrollHandler)
  unbindSelectScroll(receiptSelectScrollEl, receiptSelectScrollHandler)
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  receivableAmountTouched.value = false
  receivedAmountTouched.value = false
  linkedReceipts.value = []
  linkedDepositApplies.value = []
  receiptLinkPage.value = 1
  receiptSelectOptions.value = []
  receiptSelectKeyword.value = ''
  receiptSelectHasMore.value = true
  invoiceSelectOptions.value = []
  invoiceSelectKeyword.value = ''
  invoiceSelectHasMore.value = true
  formVisible.value = true
}

async function openEdit(row: ReceivableRecord) {
  editing.value = row
  Object.assign(form, {
    invoiceId: row.invoiceId || '',
    receivableCode: row.receivableCode || '',
    invoiceDate: row.invoiceDate || '',
    paymentDueDate: row.paymentDueDate || '',
    invoiceAmount: row.invoiceAmount,
    receivedAmount: row.receivedAmount ?? 0,
    refundedAmount: row.refundedAmount ?? 0,
    receivableAmount: row.receivableAmount,
    remark: row.remark || '',
  })
  receivableAmountTouched.value = true
  receivedAmountTouched.value = true
  linkedReceipts.value = []
  linkedDepositApplies.value = (row.bookingDepositApplies || []).map((a) => ({
    id: a.id,
    amount: Number(a.amount) || 0,
  }))
  receiptLinkPage.value = 1
  seedFormSelectsFromRow(row)
  invoiceSelectHasMore.value = true
  receiptSelectHasMore.value = true
  formVisible.value = true
  try {
    // 收据列表含 attachments，作为表格回填真相（摘要接口可能缺凭证数）
    const { data: rcpt } = await fetchReceipts({
      receivableId: row.id,
      page: 1,
      pageSize: 100,
    })
    if (rcpt.items?.length) {
      linkedReceipts.value = mapReceiptsToLinkedRows(rcpt.items)
      for (const item of rcpt.items) pinReceiptOption(item)
    } else {
      const { data } = await fetchReceivable(row.id)
      linkedReceipts.value = mapReceiptsToLinkedRows(data.receipts || [])
      linkedDepositApplies.value = (data.bookingDepositApplies || []).map((a) => ({
        id: a.id,
        amount: Number(a.amount) || 0,
      }))
      await Promise.all(
        linkedReceipts.value.map(async (lr) => {
          if (!lr.receiptId) return
          try {
            const { data: full } = await fetchReceipt(lr.receiptId)
            applyReceiptToLinkedRow(lr, full)
            pinReceiptOption(full)
          } catch {
            /* keep summary */
          }
        }),
      )
    }
    if (!linkedDepositApplies.value.length) {
      try {
        const { data } = await fetchReceivable(row.id)
        linkedDepositApplies.value = (data.bookingDepositApplies || []).map((a) => ({
          id: a.id,
          amount: Number(a.amount) || 0,
        }))
      } catch {
        /* keep */
      }
    }
  } catch {
    try {
      const { data } = await fetchReceivable(row.id)
      linkedReceipts.value = mapReceiptsToLinkedRows(data.receipts || [])
      linkedDepositApplies.value = (data.bookingDepositApplies || []).map((a) => ({
        id: a.id,
        amount: Number(a.amount) || 0,
      }))
    } catch {
      linkedReceipts.value = []
      linkedDepositApplies.value = []
    }
  }
  if (!receiptSelectOptions.value.length) seedReceiptOptionsFromLinked()
}

function payloadFromForm(): ReceivableWritePayload {
  const receiptIds = linkedReceipts.value.map((r) => r.receiptId.trim()).filter(Boolean)
  return {
    invoiceId: form.invoiceId.trim(),
    // 编号界面隐藏，由后端自动生成；编辑亦不改编号
    invoiceDate: form.invoiceDate || undefined,
    paymentDueDate: form.paymentDueDate || undefined,
    invoiceAmount: form.invoiceAmount == null ? undefined : Number(form.invoiceAmount) || 0,
    receivedAmount: form.receivedAmount == null ? undefined : Number(form.receivedAmount) || 0,
    receivableAmount:
      form.receivableAmount == null ? undefined : Number(form.receivableAmount) || 0,
    receiptIds,
    remark: form.remark.trim() || undefined,
  }
}

async function saveForm() {
  if (!form.invoiceId.trim()) {
    await ElMessageBox.alert(t('receivable.invoiceRequired'), t('common.confirm'), {
      type: 'warning',
    })
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateReceivableApi(editing.value.id, payload)
      await ElMessageBox.alert(t('receivable.updated'), t('common.confirm'), { type: 'success' })
    } else {
      await createReceivableApi(payload)
      await ElMessageBox.alert(t('receivable.created'), t('common.confirm'), { type: 'success' })
    }
    formVisible.value = false
    await reloadListAndCounts()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ReceivableRecord) {
  try {
    await ElMessageBox.confirm(
      t('receivable.deleteConfirm', { code: row.invoiceCode || row.receivableCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteReceivableApi(row.id)
    ElMessage.success(t('receivable.deleted'))
    await reloadListAndCounts()
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
function openCashFlowsSide(row: ReceivableRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  relatedListReceivable.value = row
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
function onOpenReceiptFromRelated(row: ReceiptRecord) {
  void relationDrawers.value?.openReceiptSide(row.id)
}

function openLinkedReceiptDetail(receiptId: string) {
  if (!receiptId) return
  void relationDrawers.value?.openReceiptSide(receiptId)
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
  if (!perms.import) {
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

    await reloadListAndCounts()
    finishImport()
  } catch {
    failImport(t('receivable.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <RefreshListButton :loading="loading" @refresh="() => void reloadListAndCounts()" />
      <h2>{{ t('menu.receivables') }}</h2>
      <div class="building-chips-rail">
        <div class="building-chips" role="tablist" :aria-label="t('receivable.quickFilterAria')">
          <button
            v-for="chip in validityFilterChips"
            :key="chip.key"
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': validityFilter === chip.key }"
            :aria-selected="validityFilter === chip.key"
            @click="setValidityFilter(chip.key)"
          >
            <span class="building-chip__name">{{ chip.label }}</span>
            <span class="building-chip__count">({{ chip.count }})</span>
          </button>
          <span class="building-chips__sep" aria-hidden="true">|</span>
          <button
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': outstandingFilter }"
            :aria-selected="outstandingFilter"
            @click="toggleOutstandingFilter"
          >
            <span class="building-chip__name">{{ t('receivable.quickFilterOutstanding') }}</span>
            <span class="building-chip__count">({{ quickCounts.outstanding }})</span>
          </button>
          <span class="building-chips__sep" aria-hidden="true">|</span>
          <button
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': overdueFilter }"
            :aria-selected="overdueFilter"
            @click="toggleOverdueFilter"
          >
            <span class="building-chip__name">{{ t('receivable.quickFilterOverdue') }}</span>
            <span class="building-chip__count">({{ quickCounts.overdue }})</span>
          </button>
        </div>
      </div>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('receivable.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="receivableConditionCount" @clear="onClearReceivableFilters" />
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
          :key="`${tableLayoutKey}-${codeLayoutKey}-${receivableActionColWidth}`"
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
              codeColW(t('receivable.fields.invoiceCode'), {
                interactive: true,
                samples: list.map((r) => r.invoiceCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.invoiceCode')"
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
            :min-width="
              statusColW(t('receivable.fields.validity'), validityLabels, {
                interactive: false,
              })
            "
          >
            <template #header>
              <span>{{ t('receivable.fields.validity') }}</span>
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="receivableValidityTone(row.invoiceStatus)"
                :label="validityLabel(row.invoiceStatus)"
              />
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
                :model-value="filters.invoiceDate || []"
                :sort-order="sortOrderOf('invoiceDate')"
                :date-range-value="dateRangeOf('invoiceDate')"
                @update:sort-order="(v) => setSort('invoiceDate', v)"
                @update:model-value="(v) => setFilter('invoiceDate', v)"
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
                :model-value="filters.paymentDueDate || []"
                :sort-order="sortOrderOf('paymentDueDate')"
                :date-range-value="dateRangeOf('paymentDueDate')"
                @update:sort-order="(v) => setSort('paymentDueDate', v)"
                @update:model-value="(v) => setFilter('paymentDueDate', v)"
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
                filterable
                sortable
                :options="invoiceAmountFilterOptions"
                :model-value="filters.invoiceAmount || []"
                :sort-order="sortOrderOf('invoiceAmount')"
                @update:model-value="(v) => setFilter('invoiceAmount', v)"
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
                filterable
                sortable
                :options="receivedAmountFilterOptions"
                :model-value="filters.receivedAmount || []"
                :sort-order="sortOrderOf('receivedAmount')"
                @update:model-value="(v) => setFilter('receivedAmount', v)"
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
                filterable
                sortable
                :options="receivableAmountFilterOptions"
                :model-value="filters.receivableAmount || []"
                :sort-order="sortOrderOf('receivableAmount')"
                @update:model-value="(v) => setFilter('receivableAmount', v)"
                @update:sort-order="(v) => setSort('receivableAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.receivableAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receivable.fields.refundedAmount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receivable.fields.refundedAmount')"
                filterable
                sortable
                :options="refundedAmountFilterOptions"
                :model-value="filters.refundedAmount || []"
                :sort-order="sortOrderOf('refundedAmount')"
                @update:model-value="(v) => setFilter('refundedAmount', v)"
                @update:sort-order="(v) => setSort('refundedAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.refundedAmount) }}</template>
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
          <el-table-column
            :min-width="colW(t('receivable.fields.cashFlowCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader :label="t('receivable.fields.cashFlowCount')" />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.cashFlowCount ?? 0" @click="openCashFlowsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column :min-width="auditUserColWidth" show-overflow-tooltip>
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
            v-if="perms.canEditOrDelete || receiptPerms.create"
            :label="t('common.actions')"
            :width="receivableActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <ActionDetailButton @click="openDetail(row)" />
                <button
                  v-if="receiptPerms.create"
                  v-admin-glow="receiptPerms.codes.create"
                  type="button"
                  class="action-pill action-pill--accent"
                  :disabled="Number(row.receivableAmount ?? 0) <= 0.009"
                  @click.stop="openReceivePayment(row)"
                >
                  {{ t('receivable.receivePayment') }}
                </button>
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
      @open-receipts="openReceiptsSide"
      @open-receipt="openLinkedReceiptDetail"
      @open-cash-flows="openCashFlowsSide"
    />
    <ReceivableReceivePaymentDialog
      v-model="receivePayVisible"
      :receivable="receivePayTarget"
      @collected="onReceivePaymentCollected"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-invoice="(id) => openInvoiceSide(id, 'ltr')"
      @open-contract="(id) => openContractSide(id, 'ltr')"
    />
    <RelatedReceiptsDrawer
      v-model="relatedReceiptsDrawer"
      :receivable-id="relatedListReceivable?.id"
      :title-context="relatedListReceivable?.invoiceCode || relatedListReceivable?.receivableCode || ''"
      desktop-direction="ltr"
      @open-receipt="onOpenReceiptFromRelated"
      @open-receipt-by-id="openLinkedReceiptDetail"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
      @changed="reloadListAndCounts"
    />
    <RelatedEntityDrawers ref="relationDrawers" @changed="reloadListAndCounts" />
    <RelatedCashFlowsDrawer
      v-model="relatedCashFlowsVisible"
      :receivable-id="relatedListReceivable?.id"
      :title-context="
        relatedListReceivable?.invoiceCode || relatedListReceivable?.receivableCode || ''
      "
      desktop-direction="ltr"
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
            <SelectWithViewAction
              :disabled="!form.invoiceId"
              @view="openInvoiceSide(form.invoiceId, 'ltr')"
            >
              <el-select
                v-model="form.invoiceId"
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="receivable-invoice-select-popper"
                :placeholder="t('receivable.fields.invoiceCode')"
                :disabled="!!editing"
                :remote-method="searchInvoicesRemote"
                :loading="invoiceSelectLoading"
                @visible-change="onInvoiceSelectVisible"
                @change="onInvoiceSelected"
              >
                <el-option
                  v-for="inv in invoiceSelectOptions"
                  :key="inv.id"
                  :label="invoiceOptionLabel(inv)"
                  :value="inv.id"
                  :title="invoiceOptionLabel(inv)"
                >
                  <span class="select-option-ellipsis" :title="invoiceOptionLabel(inv)">
                    {{ invoiceOptionLabel(inv) }}
                  </span>
                </el-option>
                <template #empty>
                  <div class="receivable-select-empty">{{ t('receivable.invoiceSelectEmpty') }}</div>
                </template>
              </el-select>
            </SelectWithViewAction>
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
          <el-form-item :label="t('receivable.fields.receivableAmount')">
            <el-input-number
              v-model="form.receivableAmount"
              :precision="2"
              :controls="false"
              style="width: 100%"
              @change="onReceivableAmountManual"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.fields.refundedAmount')">
            <el-input-number
              v-model="form.refundedAmount"
              :min="0"
              :precision="2"
              :controls="false"
              disabled
              style="width: 100%"
            />
          </el-form-item>
        </div>

        <section class="form-section form-section--receipts">
          <div class="period-section-head">
            <div class="period-section-head__left">
              <h3>{{ t('receivable.sections.relatedReceipts') }}</h3>
              <el-button
                v-if="receiptPerms.create"
                v-admin-glow="receiptPerms.codes.create"
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="period-add-btn"
                :disabled="!editing"
                @click="openAddReceiptFromForm"
              >
                {{ t('receivable.addReceipt') }}
              </el-button>
            </div>
            <div
              v-if="linkedReceipts.length > RECEIPT_LINK_PAGE_SIZE"
              class="period-table-pager"
            >
              <el-pagination
                v-model:current-page="receiptLinkPage"
                :page-size="RECEIPT_LINK_PAGE_SIZE"
                :total="linkedReceipts.length"
                layout="total, prev, pager, next"
                small
                background
                class="period-pager"
              />
            </div>
          </div>
          <div class="period-table-wrap">
            <div
              class="period-table receipt-link-table receipt-link-table--readonly"
              :class="{ 'period-table--en': receiptLinkTableEn }"
              role="table"
              :style="{ '--period-page-size': RECEIPT_LINK_PAGE_SIZE }"
            >
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">
                  #
                </div>
                <div class="period-table__cell period-table__cell--code" role="columnheader">
                  {{ t('receipt.fields.receiptCode') }}
                </div>
                <div class="period-table__cell period-table__cell--date" role="columnheader">
                  {{ t('receipt.fields.paymentDate') }}
                </div>
                <div class="period-table__cell period-table__cell--method" role="columnheader">
                  {{ t('receipt.fields.paymentMethod') }}
                </div>
                <div class="period-table__cell period-table__cell--amount" role="columnheader">
                  {{ t('receipt.fields.amount') }}
                </div>
                <div class="period-table__cell period-table__cell--remark" role="columnheader">
                  {{ t('receipt.fields.remark') }}
                </div>
                <div class="period-table__cell period-table__cell--attach" role="columnheader">
                  {{ t('receipt.fields.attachments') }}
                </div>
              </div>
              <div
                class="period-table__body"
                :class="{
                  'period-table__body--fixed': linkedReceipts.length > RECEIPT_LINK_PAGE_SIZE,
                }"
              >
                <div
                  v-if="!linkedReceipts.length"
                  class="receipt-link-table__empty"
                  role="row"
                >
                  {{ t('receivable.receiptTableEmpty') }}
                </div>
                <div
                  v-for="{ row, index } in pagedLinkedReceipts"
                  :key="row.uid"
                  class="period-table__row"
                  role="row"
                >
                  <div class="period-table__cell period-table__cell--index" role="cell">
                    <span class="period-row__index period-row__index--static">{{ index + 1 }}</span>
                  </div>
                  <div class="period-table__cell period-table__cell--code" role="cell">
                    <button
                      v-if="row.receiptId"
                      type="button"
                      class="fk-link"
                      @click="openLinkedReceiptDetail(row.receiptId)"
                    >
                      {{ row.receiptCode || '—' }}
                    </button>
                    <span v-else>{{ row.receiptCode || '—' }}</span>
                  </div>
                  <div class="period-table__cell period-table__cell--date" role="cell">
                    <el-input :model-value="row.paymentDate || '—'" disabled />
                  </div>
                  <div class="period-table__cell period-table__cell--method" role="cell">
                    <el-input :model-value="row.paymentMethod || '—'" disabled />
                  </div>
                  <div class="period-table__cell period-table__cell--amount" role="cell">
                    <span class="receipt-link-amount">
                      {{ row.amount == null ? '—' : formatMoney(row.amount) }}
                    </span>
                  </div>
                  <div class="period-table__cell period-table__cell--remark" role="cell">
                    <el-input
                      :model-value="row.remark || '—'"
                      disabled
                      :title="row.remark || undefined"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--attach" role="cell">
                    <CountListPill
                      :count="row.attachmentCount"
                      @click="openLinkedReceiptAttachments(row)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="form-grid">
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

    <el-dialog
      v-model="receiptAttDialogVisible"
      class="lb-dialog"
      :title="t('receivable.receiptAttachmentsTitle', { code: receiptAttDialogCode })"
      :width="isMobile ? '94%' : '480px'"
      append-to-body
      destroy-on-close
    >
      <div v-loading="receiptAttDialogLoading" class="receipt-att-dialog-body">
        <ReceiptAttachmentList
          v-if="receiptAttDialogReceiptId"
          :receipt-id="receiptAttDialogReceiptId"
          :attachments="receiptAttDialogItems"
        />
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="receiptAttDialogVisible = false">{{ t('common.close') }}</el-button>
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

.receivable-select-empty {
  padding: 12px 14px;
  color: #6b7c72;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
}

.form-section--receipts {
  margin: 6px 0 14px;
  padding-bottom: 4px;
}

.period-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  min-height: 28px;
}

.period-section-head__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.period-section-head h3 {
  margin: 0;
  font-size: 0.92rem;
  color: #2f3f36;
}

.period-add-btn {
  --el-button-bg-color: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  --el-button-border-color: color-mix(in srgb, var(--lb-brand) 35%, #fff);
  --el-button-text-color: var(--lb-brand);
  --el-button-hover-bg-color: color-mix(in srgb, var(--lb-brand) 18%, #fff);
  --el-button-hover-border-color: var(--lb-brand);
  --el-button-hover-text-color: var(--lb-brand);
  font-weight: 600;
  border-radius: 999px;
  padding: 4px 12px;
  height: 26px;
}

.period-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e4ebe6;
  border-radius: 8px;
  background: #fff;
}

.period-table-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 4px 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #f4f7f5);
  border: 1px solid #e4ebe6;
}

.period-pager.el-pagination {
  --el-pagination-button-bg-color: #fff;
  --el-pagination-hover-color: var(--lb-brand, #0f4a32);
  --el-pagination-button-color: #4a5c54;
  font-weight: 600;
  gap: 2px;
}

.period-pager :deep(.el-pagination__total) {
  margin-right: 4px;
  color: #4a5c54;
  font-size: 0.78rem;
  font-weight: 650;
}

.period-pager :deep(.btn-prev),
.period-pager :deep(.btn-next),
.period-pager :deep(.el-pager li) {
  min-width: 26px !important;
  height: 26px !important;
  line-height: 26px !important;
  border-radius: 7px !important;
  margin: 0 2px !important;
}

.period-pager :deep(.el-pager li.is-active) {
  background: var(--lb-brand, #0f4a32) !important;
  color: #fff !important;
  font-weight: 700;
}

.period-table {
  --period-row-h: 44px;
  --period-page-size: 5;
  display: grid;
  min-width: 820px;
}

.period-table__head,
.period-table__row {
  display: grid;
  grid-template-columns:
    40px
    minmax(128px, 1.1fr)
    minmax(96px, 0.8fr)
    minmax(80px, 0.7fr)
    minmax(80px, 0.65fr)
    minmax(110px, 1.2fr)
    64px;
  align-items: center;
  column-gap: 6px;
  padding: 0 8px;
}

.period-table--en .period-table__head,
.period-table--en .period-table__row {
  grid-template-columns:
    40px
    minmax(136px, 1.1fr)
    minmax(104px, 0.85fr)
    minmax(104px, 0.85fr)
    minmax(88px, 0.7fr)
    minmax(120px, 1.2fr)
    76px;
}

.period-row__index--static {
  cursor: default;
}

.period-table__head {
  min-height: 34px;
  background: #f4f7f5;
  border-bottom: 1px solid #e4ebe6;
  color: #3d4f45;
  font-size: 0.78rem;
  font-weight: 700;
}

.period-table__body {
  background: #fff;
}

.period-table__body--fixed {
  box-sizing: border-box;
  height: calc(var(--period-row-h) * var(--period-page-size));
  min-height: calc(var(--period-row-h) * var(--period-page-size));
  overflow: hidden;
}

.period-table__row {
  box-sizing: border-box;
  min-height: var(--period-row-h);
  height: var(--period-row-h);
  border-bottom: 1px solid #edf2ef;
  transition: background 0.12s ease, box-shadow 0.12s ease;
  background: #fff;
}

.period-table__body:not(.period-table__body--fixed) .period-table__row:last-child {
  border-bottom: none;
}

.period-table__row.is-dragging {
  opacity: 0.45;
}

.period-table__row.is-editing-index {
  position: relative;
  z-index: 4;
  overflow: visible;
}

.period-table__row.is-drag-over {
  background: color-mix(in srgb, var(--lb-brand) 6%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand) 35%, #fff);
}

.period-table__cell {
  display: flex;
  align-items: center;
  min-width: 0;
}

.period-table__cell--index {
  gap: 1px;
  justify-content: flex-start;
  position: relative;
  z-index: 1;
  overflow: visible;
}

.period-table__cell--index.is-editing-index {
  z-index: 5;
}

.period-table__cell--actions,
.period-table__cell--attach {
  justify-content: center;
}

.period-table__cell--amount {
  justify-content: flex-end;
}

.receipt-opt__code {
  font-weight: 650;
}

.receipt-opt__hint {
  color: #7a8a82;
  font-size: 0.86em;
}

.period-table__head .req {
  color: #e35d5d;
  margin-right: 2px;
}

.period-row__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #8a9590;
  cursor: grab;
  flex: 0 0 auto;
}

.period-row__handle:hover {
  background: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  color: var(--lb-brand);
}

.period-row__handle:active {
  cursor: grabbing;
}

.period-row__index {
  appearance: none;
  flex: 0 0 auto;
  min-width: 1rem;
  margin: 0;
  padding: 0 1px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: center;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #5a6b62;
  cursor: text;
  line-height: 1.4;
}

.period-row__index-input {
  width: 2.2rem;
  height: 22px;
  padding: 0 4px;
  border: 1px solid color-mix(in srgb, var(--lb-brand) 40%, #cfd8d3);
  border-radius: 5px;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #2f3f36;
  outline: none;
}

.receipt-link-table__empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--lb-muted, #6a7a70);
  font-size: 0.84rem;
}

.receipt-link-amount {
  width: 100%;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #3d4f45;
  font-size: 0.84rem;
}

.receipt-att-dialog-body {
  min-height: 72px;
}
</style>
