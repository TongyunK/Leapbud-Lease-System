<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, QuestionFilled, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createReceiptApi,
  deleteReceiptApi,
  batchDeleteReceiptsApi,
  deleteReceiptAttachmentApi,
  fetchReceipt,
  fetchReceiptKindCounts,
  fetchReceipts,
  importReceiptsApi,
  updateReceiptApi,
  uploadReceiptAttachmentsApi,
} from '@/api/receipts'
import type { ReceiptKindCounts, ReceiptWritePayload, ReceiptListQuery } from '@/api/receipts'
import { fetchCustomers } from '@/api/customers'
import { fetchContracts } from '@/api/contracts'
import { fetchInvoices } from '@/api/invoices'
import { fetchReceivables } from '@/api/receivables'
import type {
  ReceiptAllocationRecord,
  ReceiptAttachmentRecord,
  ReceiptRecord,
} from '@/types/receipt'
import { RECEIPT_KINDS, RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import { isPdfAttachment, isImageAttachment } from '@/utils/attachmentUrl'
import { packFilterValues } from '@/utils/columnFilter'
import StatusBadge from '@/components/StatusBadge.vue'
import CountListPill from '@/components/CountListPill.vue'
import { receiptKindTone } from '@/constants/statusBadges'
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
import { useBuildingScopeStore } from '@/stores/buildingScope'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import { ACTION_COL_ICON, measureActionColWidth } from '@/composables/useActionColWidth'
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
const buildingScope = useBuildingScopeStore()
const isMobile = useIsMobile()
const perms = useResourcePermissions('receipts')
const receiptActionColWidth = computed(() => {
  void locale.value
  // 按实际主列按钮测宽（与合约表同一套 CELL_PAD_RIGHT）
  const labels = [ACTION_COL_ICON, t('receipt.printReceipt'), t('receipt.sendReceipt')]
  if (perms.update) labels.push(t('common.edit'))
  if (perms.delete) labels.push(t('common.delete'))
  return measureActionColWidth(labels)
})

const printingReceiptId = ref<string | null>(null)

/** 占位：后续接入 WhatsApp／Email 发送 */
async function onSendReceipt(_row: ReceiptRecord) {
  await ElMessageBox.alert(t('receipt.sendReceiptSoon'), t('receipt.sendReceipt'), {
    type: 'info',
    confirmButtonText: t('common.confirm'),
  })
}

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
  statusColW,
  datetimeColWidth,
  auditUserColWidth,
  tableLayoutKey,
} = useTableColWidth()

const keyword = ref('')
const formVisible = ref(false)
const editing = ref<ReceiptRecord | null>(null)

/** 表单下拉：打开再拉首屏 + 滚动追加（禁止全量预拉） */
const SELECT_PAGE_SIZE = 20
type ReceiptCustomerOpt = Pick<CustomerRecord, 'id' | 'customerCode' | 'name'>
type ReceiptContractOpt = Pick<ContractRecord, 'id' | 'contractCode' | 'customerId' | 'customerName'>
type ReceiptInvoiceOpt = Pick<
  InvoiceRecord,
  'id' | 'invoiceCode' | 'customerId' | 'contractId' | 'customerName'
>
type ReceiptReceivableOpt = Pick<
  ReceivableRecord,
  | 'id'
  | 'receivableCode'
  | 'customerId'
  | 'contractId'
  | 'invoiceId'
  | 'customerName'
  | 'receivableAmount'
>

const customerSelectOptions = ref<ReceiptCustomerOpt[]>([])
const customerSelectLoading = ref(false)
const customerSelectLoadingMore = ref(false)
const customerSelectPage = ref(1)
const customerSelectHasMore = ref(true)
const customerSelectKeyword = ref('')
let customerSelectScrollEl: HTMLElement | null = null
let customerSelectScrollHandler: ((e: Event) => void) | null = null

const contractSelectOptions = ref<ReceiptContractOpt[]>([])
const contractSelectLoading = ref(false)
const contractSelectLoadingMore = ref(false)
const contractSelectPage = ref(1)
const contractSelectHasMore = ref(true)
const contractSelectKeyword = ref('')
let contractSelectScrollEl: HTMLElement | null = null
let contractSelectScrollHandler: ((e: Event) => void) | null = null

const invoiceSelectOptions = ref<ReceiptInvoiceOpt[]>([])
const invoiceSelectLoading = ref(false)
const invoiceSelectLoadingMore = ref(false)
const invoiceSelectPage = ref(1)
const invoiceSelectHasMore = ref(true)
const invoiceSelectKeyword = ref('')
let invoiceSelectScrollEl: HTMLElement | null = null
let invoiceSelectScrollHandler: ((e: Event) => void) | null = null

const receivableSelectOptions = ref<ReceiptReceivableOpt[]>([])
const receivableSelectLoading = ref(false)
const receivableSelectLoadingMore = ref(false)
const receivableSelectPage = ref(1)
const receivableSelectHasMore = ref(true)
const receivableSelectKeyword = ref('')
let receivableSelectScrollEl: HTMLElement | null = null
let receivableSelectScrollHandler: ((e: Event) => void) | null = null

/** 清空后仍保留曾选项，避免 seed 项一点 × 就从下拉消失 */
const stickyContractOption = ref<ReceiptContractOpt | null>(null)
const stickyInvoiceOption = ref<ReceiptInvoiceOpt | null>(null)
const stickyReceivableOption = ref<ReceiptReceivableOpt | null>(null)

const drawerVisible = ref(false)
const current = ref<ReceiptRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const relatedCashFlowsVisible = ref(false)
const relatedListReceipt = ref<ReceiptRecord | null>(null)
const cashFlowDrawer = ref(false)
const cashFlowRecord = ref<CashFlowRecord | null>(null)

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
} = useTableSortFilter<ReceiptRecord>()

/** 页头快捷筛选：全部 / 发票收据 / 定金收据（互斥） */
const kindChipFilter = ref<'all' | 'invoice' | 'booking_deposit'>('all')
const kindChipCounts = ref<ReceiptKindCounts>({
  all: 0,
  invoice: 0,
  booking_deposit: 0,
})

const kindChips = computed(() => [
  {
    key: 'all' as const,
    label: t('receipt.kindFilterAll'),
    count: kindChipCounts.value.all,
  },
  {
    key: 'invoice' as const,
    label: t('receipt.kind.invoice'),
    count: kindChipCounts.value.invoice,
  },
  {
    key: 'booking_deposit' as const,
    label: t('receipt.kind.booking_deposit'),
    count: kindChipCounts.value.booking_deposit,
  },
])

async function loadKindChipCounts() {
  try {
    const { data } = await fetchReceiptKindCounts()
    kindChipCounts.value = {
      all: data.all ?? 0,
      invoice: data.invoice ?? 0,
      booking_deposit: data.booking_deposit ?? 0,
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
} = useServerPagedList<ReceiptRecord, ReceiptListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const payment = range('paymentDate')
    const chipKey = kindChipFilter.value
    return {
      keyword: kw,
      customerNames: packFilterValues(f.customerName),
      paymentMethod: packFilterValues(f.paymentMethod),
      kinds:
        chipKey === 'all' ? packFilterValues(f.kind) : [chipKey],
      cashFlowCounts: packFilterValues(f.cashFlowCount),
      receiptCodes: packFilterValues(f.receiptCode),
      contractCodes: packFilterValues(f.contractCode),
      invoiceCodes: packFilterValues(f.invoiceCode),
      receivableCodes: packFilterValues(f.receivableCode),
      amounts: packFilterValues(f.amount),
      remarks: packFilterValues(f.remark),
      changeLogs: packFilterValues(f.changeLog),
      createdBys: packFilterValues(f.createdBy),
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

const cashFlowCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.cashFlowCount ?? 0)),
)

async function reloadListAndCounts() {
  await Promise.all([loadList(), loadKindChipCounts()])
}

function setKindChipFilter(key: 'all' | 'invoice' | 'booking_deposit') {
  if (kindChipFilter.value === key) return
  kindChipFilter.value = key
  if (filters.kind?.length) setFilter('kind', [])
  resetPage()
  void loadList()
}

function onClearReceiptFilters() {
  kindChipFilter.value = 'all'
  onClearFilters()
  void loadKindChipCounts()
}

const receiptConditionCount = computed(
  () => activeConditionCount.value + (kindChipFilter.value !== 'all' ? 1 : 0),
)

function openCashFlowsSide(row: ReceiptRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  relatedListReceipt.value = row
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
      (chunk) => batchDeleteReceiptsApi(chunk),
      setBatchProgress,
    )
    finishBatch(ok, fail)
    clearSelection()
    await Promise.all([loadList(), loadKindChipCounts()])
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

/** 表头筛选：从当前列表页聚合，避免全量拉选项 */
function uniqLabelOptions(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const raw of values) {
    const v = raw?.trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    opts.push({ value: v, label: v })
  }
  return opts
}

const receiptCodeFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.receiptCode)),
)
const amountFilterOptions = computed(() =>
  uniqLabelOptions(
    list.value.map((r) => (r.amount == null ? '' : String(r.amount))),
  ).map((o) => ({ ...o, label: moneyOrDash(Number(o.value)) })),
)
const remarkFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.remark)),
)
const changeLogFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.changeLog)),
)
const createdByFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.createdBy)),
)

const customerNameFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.customerName)).sort((a, b) =>
    a.label.localeCompare(b.label, 'zh-Hant'),
  ),
)

const paymentMethodFilterOptions = computed(() =>
  RECEIPT_PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
)

const kindFilterOptions = computed(() =>
  RECEIPT_KINDS.map((k) => ({ value: k, label: t(`receipt.kind.${k}`) })),
)

function kindLabel(kind?: string | null) {
  const k = (kind || 'invoice').trim()
  const key = `receipt.kind.${k}`
  return t(key) === key ? k : t(key)
}

const contractCodeFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.contractCode)),
)

const invoiceCodeFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.invoiceCode)),
)

const receivableCodeFilterOptions = computed(() =>
  uniqLabelOptions(list.value.map((r) => r.receivableCode)),
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  customerId: '' as string,
  receiptCode: '',
  kind: 'invoice' as string,
  contractId: '' as string,
  invoiceId: '' as string,
  receivableId: '' as string,
  paymentDate: '',
  paymentMethod: RECEIPT_PAYMENT_METHODS[0] as string,
  amount: null as number | null,
  remark: '',
  changeLog: '',
})

const form = reactive(emptyForm())
/** 编辑多应收合并收据时的分摊只读行 */
const formAllocations = ref<ReceiptAllocationRecord[]>([])
const formExistingAttachments = ref<ReceiptAttachmentRecord[]>([])
const formPendingAttachments = ref<Array<{ key: string; file: File }>>([])
const formRemovedAttachmentIds = ref<string[]>([])
const attachmentFileInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)

const isMultiAllocationEdit = computed(
  () => !!editing.value && formAllocations.value.length > 1,
)

function resetFormAttachments() {
  formExistingAttachments.value = []
  formPendingAttachments.value = []
  formRemovedAttachmentIds.value = []
}

function onPickAttachments(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) {
      ElMessage.warning(t('attachment.tooLarge'))
      continue
    }
    formPendingAttachments.value.push({
      key: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
    })
  }
}

function removePendingAttachment(key: string) {
  formPendingAttachments.value = formPendingAttachments.value.filter((p) => p.key !== key)
}

function removeExistingAttachment(id: string) {
  formExistingAttachments.value = formExistingAttachments.value.filter((a) => a.id !== id)
  if (!formRemovedAttachmentIds.value.includes(id)) {
    formRemovedAttachmentIds.value.push(id)
  }
}

function attachmentExtLabel(fileName: string) {
  const ext = (fileName.split('.').pop() || '').toUpperCase()
  if (!ext || ext.length > 5) return 'FILE'
  return ext
}

function attachmentIconClass(fileName: string) {
  if (isPdfAttachment(fileName)) return 'receipt-form-att__icon--pdf'
  if (isImageAttachment(fileName)) return 'receipt-form-att__icon--img'
  return 'receipt-form-att__icon--file'
}

function keepSelectedInOptions<T extends { id: string }>(
  items: T[],
  selectedId: string | null | undefined,
  current: T[],
  sticky?: T | null,
): T[] {
  const sid = String(selectedId ?? '').trim()
  const out = [...items]
  const seen = new Set(out.map((x) => x.id))
  const keepers: T[] = []
  if (sid && !seen.has(sid)) {
    const keep = current.find((x) => x.id === sid) || (sticky?.id === sid ? sticky : null)
    if (keep) keepers.push(keep)
  }
  if (sticky?.id && !seen.has(sticky.id) && sticky.id !== sid) {
    keepers.push(sticky)
  }
  return keepers.length ? [...keepers, ...out] : out
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

function unbindSelectScroll(
  el: HTMLElement | null,
  handler: ((e: Event) => void) | null,
): void {
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

async function attachSelectScroll(popperClass: string, onReachEnd: () => void) {
  await nextTick()
  let bound = bindSelectScroll(popperClass, onReachEnd)
  if (!bound.el) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    bound = bindSelectScroll(popperClass, onReachEnd)
  }
  return bound
}

function customerOptionLabel(c: ReceiptCustomerOpt) {
  return `${c.customerCode} · ${c.name}`
}
function contractOptionLabel(c: ReceiptContractOpt) {
  return `${c.contractCode} · ${c.customerName}`
}
function invoiceOptionLabel(inv: ReceiptInvoiceOpt) {
  return `${inv.invoiceCode} · ${inv.customerName}`
}
function receivableOptionLabel(r: ReceiptReceivableOpt) {
  return `${r.receivableCode} · ${r.customerName}`
}

async function loadCustomersPage(reset: boolean) {
  if (reset) {
    if (customerSelectLoading.value) return
    customerSelectLoading.value = true
  } else {
    if (
      customerSelectLoading.value ||
      customerSelectLoadingMore.value ||
      !customerSelectHasMore.value
    ) {
      return
    }
    customerSelectLoadingMore.value = true
  }
  const page = reset ? 1 : customerSelectPage.value
  const scrollEl = customerSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchCustomers({
      keyword: customerSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const items: ReceiptCustomerOpt[] = data.items.map((c) => ({
      id: c.id,
      customerCode: c.customerCode,
      name: c.name,
    }))
    if (reset) {
      customerSelectOptions.value = keepSelectedInOptions(
        items,
        form.customerId,
        customerSelectOptions.value,
      )
    } else {
      appendUniqueById(customerSelectOptions.value, items)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    customerSelectPage.value = page + 1
    customerSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      customerSelectOptions.value = keepSelectedInOptions(
        [],
        form.customerId,
        customerSelectOptions.value,
      )
      customerSelectHasMore.value = false
    }
  } finally {
    if (reset) customerSelectLoading.value = false
    else customerSelectLoadingMore.value = false
  }
}

async function loadContractsPage(reset: boolean) {
  if (reset) {
    if (contractSelectLoading.value) return
    contractSelectLoading.value = true
  } else {
    if (
      contractSelectLoading.value ||
      contractSelectLoadingMore.value ||
      !contractSelectHasMore.value
    ) {
      return
    }
    contractSelectLoadingMore.value = true
  }
  const page = reset ? 1 : contractSelectPage.value
  const scrollEl = contractSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchContracts({
      keyword: contractSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const items: ReceiptContractOpt[] = data.items.map((c) => ({
      id: c.id,
      contractCode: c.contractCode,
      customerId: c.customerId,
      customerName: c.customerName,
    }))
    if (reset) {
      contractSelectOptions.value = keepSelectedInOptions(
        items,
        form.contractId,
        contractSelectOptions.value,
        stickyContractOption.value,
      )
    } else {
      appendUniqueById(contractSelectOptions.value, items)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    contractSelectPage.value = page + 1
    contractSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      contractSelectOptions.value = keepSelectedInOptions(
        [],
        form.contractId,
        contractSelectOptions.value,
        stickyContractOption.value,
      )
      contractSelectHasMore.value = false
    }
  } finally {
    if (reset) contractSelectLoading.value = false
    else contractSelectLoadingMore.value = false
  }
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
  const scrollEl = invoiceSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchInvoices({
      keyword: invoiceSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const items: ReceiptInvoiceOpt[] = data.items.map((inv) => ({
      id: inv.id,
      invoiceCode: inv.invoiceCode,
      customerId: inv.customerId,
      contractId: inv.contractId,
      customerName: inv.customerName,
    }))
    if (reset) {
      invoiceSelectOptions.value = keepSelectedInOptions(
        items,
        form.invoiceId,
        invoiceSelectOptions.value,
        stickyInvoiceOption.value,
      )
    } else {
      appendUniqueById(invoiceSelectOptions.value, items)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    invoiceSelectPage.value = page + 1
    invoiceSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      invoiceSelectOptions.value = keepSelectedInOptions(
        [],
        form.invoiceId,
        invoiceSelectOptions.value,
        stickyInvoiceOption.value,
      )
      invoiceSelectHasMore.value = false
    }
  } finally {
    if (reset) invoiceSelectLoading.value = false
    else invoiceSelectLoadingMore.value = false
  }
}

async function loadReceivablesPage(reset: boolean) {
  if (reset) {
    if (receivableSelectLoading.value) return
    receivableSelectLoading.value = true
  } else {
    if (
      receivableSelectLoading.value ||
      receivableSelectLoadingMore.value ||
      !receivableSelectHasMore.value
    ) {
      return
    }
    receivableSelectLoadingMore.value = true
  }
  const page = reset ? 1 : receivableSelectPage.value
  const scrollEl = receivableSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchReceivables({
      keyword: receivableSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const items: ReceiptReceivableOpt[] = data.items.map((r) => ({
      id: r.id,
      receivableCode: r.receivableCode,
      customerId: r.customerId,
      contractId: r.contractId,
      invoiceId: r.invoiceId,
      customerName: r.customerName,
      receivableAmount: r.receivableAmount,
    }))
    if (reset) {
      receivableSelectOptions.value = keepSelectedInOptions(
        items,
        form.receivableId,
        receivableSelectOptions.value,
        stickyReceivableOption.value,
      )
    } else {
      appendUniqueById(receivableSelectOptions.value, items)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    receivableSelectPage.value = page + 1
    receivableSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      receivableSelectOptions.value = keepSelectedInOptions(
        [],
        form.receivableId,
        receivableSelectOptions.value,
        stickyReceivableOption.value,
      )
      receivableSelectHasMore.value = false
    }
  } finally {
    if (reset) receivableSelectLoading.value = false
    else receivableSelectLoadingMore.value = false
  }
}

watch(
  () => form.contractId,
  (id) => {
    const sid = String(id ?? '').trim()
    if (!sid) return
    const hit = contractSelectOptions.value.find((c) => c.id === sid)
    if (hit) stickyContractOption.value = hit
  },
)
watch(
  () => form.invoiceId,
  (id) => {
    const sid = String(id ?? '').trim()
    if (!sid) return
    const hit = invoiceSelectOptions.value.find((c) => c.id === sid)
    if (hit) stickyInvoiceOption.value = hit
  },
)
watch(
  () => form.receivableId,
  (id) => {
    const sid = String(id ?? '').trim()
    if (!sid) return
    const hit = receivableSelectOptions.value.find((c) => c.id === sid)
    if (hit) stickyReceivableOption.value = hit
  },
)

function searchCustomersRemote(query: string) {
  customerSelectKeyword.value = query.trim()
  customerSelectHasMore.value = true
  void loadCustomersPage(true)
}
function searchContractsRemote(query: string) {
  contractSelectKeyword.value = query.trim()
  contractSelectHasMore.value = true
  void loadContractsPage(true)
}
function searchInvoicesRemote(query: string) {
  invoiceSelectKeyword.value = query.trim()
  invoiceSelectHasMore.value = true
  void loadInvoicesPage(true)
}
function searchReceivablesRemote(query: string) {
  receivableSelectKeyword.value = query.trim()
  receivableSelectHasMore.value = true
  void loadReceivablesPage(true)
}

async function onCustomerSelectVisible(open: boolean) {
  unbindSelectScroll(customerSelectScrollEl, customerSelectScrollHandler)
  customerSelectScrollEl = null
  customerSelectScrollHandler = null
  if (!open) return
  customerSelectKeyword.value = ''
  customerSelectHasMore.value = true
  await loadCustomersPage(true)
  const bound = await attachSelectScroll('receipt-customer-select-popper', () => {
    void loadCustomersPage(false)
  })
  customerSelectScrollEl = bound.el
  customerSelectScrollHandler = bound.handler
}

async function onContractSelectVisible(open: boolean) {
  unbindSelectScroll(contractSelectScrollEl, contractSelectScrollHandler)
  contractSelectScrollEl = null
  contractSelectScrollHandler = null
  if (!open) return
  contractSelectKeyword.value = ''
  contractSelectHasMore.value = true
  await loadContractsPage(true)
  const bound = await attachSelectScroll('receipt-contract-select-popper', () => {
    void loadContractsPage(false)
  })
  contractSelectScrollEl = bound.el
  contractSelectScrollHandler = bound.handler
}

async function onInvoiceSelectVisible(open: boolean) {
  unbindSelectScroll(invoiceSelectScrollEl, invoiceSelectScrollHandler)
  invoiceSelectScrollEl = null
  invoiceSelectScrollHandler = null
  if (!open) return
  invoiceSelectKeyword.value = ''
  invoiceSelectHasMore.value = true
  await loadInvoicesPage(true)
  const bound = await attachSelectScroll('receipt-invoice-select-popper', () => {
    void loadInvoicesPage(false)
  })
  invoiceSelectScrollEl = bound.el
  invoiceSelectScrollHandler = bound.handler
}

async function onReceivableSelectVisible(open: boolean) {
  unbindSelectScroll(receivableSelectScrollEl, receivableSelectScrollHandler)
  receivableSelectScrollEl = null
  receivableSelectScrollHandler = null
  if (!open) return
  receivableSelectKeyword.value = ''
  receivableSelectHasMore.value = true
  await loadReceivablesPage(true)
  const bound = await attachSelectScroll('receipt-receivable-select-popper', () => {
    void loadReceivablesPage(false)
  })
  receivableSelectScrollEl = bound.el
  receivableSelectScrollHandler = bound.handler
}

function onReceivableSelected() {
  const row = receivableSelectOptions.value.find((r) => r.id === form.receivableId)
  if (!row) return
  if (!form.customerId) form.customerId = row.customerId || ''
  if (!form.contractId) form.contractId = row.contractId || ''
  if (!form.invoiceId) form.invoiceId = row.invoiceId || ''
  if (form.amount == null && row.receivableAmount != null) form.amount = row.receivableAmount
  if (row.customerId && !customerSelectOptions.value.some((c) => c.id === row.customerId)) {
    customerSelectOptions.value = [
      {
        id: row.customerId,
        customerCode: '',
        name: row.customerName || row.customerId,
      },
      ...customerSelectOptions.value,
    ]
  }
  if (row.contractId && !contractSelectOptions.value.some((c) => c.id === row.contractId)) {
    contractSelectOptions.value = [
      {
        id: row.contractId,
        contractCode: '',
        customerId: row.customerId,
        customerName: row.customerName,
      },
      ...contractSelectOptions.value,
    ]
  }
  if (row.invoiceId && !invoiceSelectOptions.value.some((c) => c.id === row.invoiceId)) {
    invoiceSelectOptions.value = [
      {
        id: row.invoiceId,
        invoiceCode: '',
        customerId: row.customerId,
        contractId: row.contractId,
        customerName: row.customerName,
      },
      ...invoiceSelectOptions.value,
    ]
  }
}

function onInvoiceSelected() {
  const row = invoiceSelectOptions.value.find((inv) => inv.id === form.invoiceId)
  if (!row) return
  if (!form.customerId) form.customerId = row.customerId || ''
  if (!form.contractId) form.contractId = row.contractId || ''
  if (row.customerId && !customerSelectOptions.value.some((c) => c.id === row.customerId)) {
    customerSelectOptions.value = [
      {
        id: row.customerId,
        customerCode: '',
        name: row.customerName || row.customerId,
      },
      ...customerSelectOptions.value,
    ]
  }
  if (row.contractId && !contractSelectOptions.value.some((c) => c.id === row.contractId)) {
    contractSelectOptions.value = [
      {
        id: row.contractId,
        contractCode: '',
        customerId: row.customerId,
        customerName: row.customerName,
      },
      ...contractSelectOptions.value,
    ]
  }
}

function onContractSelected() {
  const row = contractSelectOptions.value.find((c) => c.id === form.contractId)
  if (!row) return
  if (!form.customerId) form.customerId = row.customerId || ''
  if (row.customerId && !customerSelectOptions.value.some((c) => c.id === row.customerId)) {
    customerSelectOptions.value = [
      {
        id: row.customerId,
        customerCode: '',
        name: row.customerName || row.customerId,
      },
      ...customerSelectOptions.value,
    ]
  }
}

function resetFormSelectOptions() {
  customerSelectOptions.value = []
  contractSelectOptions.value = []
  invoiceSelectOptions.value = []
  receivableSelectOptions.value = []
  stickyContractOption.value = null
  stickyInvoiceOption.value = null
  stickyReceivableOption.value = null
  customerSelectKeyword.value = ''
  contractSelectKeyword.value = ''
  invoiceSelectKeyword.value = ''
  receivableSelectKeyword.value = ''
  customerSelectHasMore.value = true
  contractSelectHasMore.value = true
  invoiceSelectHasMore.value = true
  receivableSelectHasMore.value = true
}

function seedFormSelectsFromRow(row: ReceiptRecord) {
  customerSelectOptions.value = row.customerId
    ? [
        {
          id: row.customerId,
          customerCode: row.customerCode || '',
          name: row.customerName || row.customerId,
        },
      ]
    : []
  contractSelectOptions.value = row.contractId
    ? [
        {
          id: row.contractId,
          contractCode: row.contractCode || '',
          customerId: row.customerId,
          customerName: row.customerName,
        },
      ]
    : []
  invoiceSelectOptions.value = row.invoiceId
    ? [
        {
          id: row.invoiceId,
          invoiceCode: row.invoiceCode || '',
          customerId: row.customerId,
          contractId: row.contractId || '',
          customerName: row.customerName,
        },
      ]
    : []
  receivableSelectOptions.value = row.receivableId
    ? [
        {
          id: row.receivableId,
          receivableCode: row.receivableCode || '',
          customerId: row.customerId,
          contractId: row.contractId || '',
          invoiceId: row.invoiceId || '',
          customerName: row.customerName,
          receivableAmount: row.amount,
        },
      ]
    : []
}

onMounted(async () => {
  await Promise.all([loadList(), loadKindChipCounts()])
})

onBeforeUnmount(() => {
  unbindSelectScroll(customerSelectScrollEl, customerSelectScrollHandler)
  unbindSelectScroll(contractSelectScrollEl, contractSelectScrollHandler)
  unbindSelectScroll(invoiceSelectScrollEl, invoiceSelectScrollHandler)
  unbindSelectScroll(receivableSelectScrollEl, receivableSelectScrollHandler)
})

watch(
  () => buildingScope.viewKey,
  () => {
    void loadKindChipCounts()
  },
)

function openCreate() {
  editing.value = null
  formAllocations.value = []
  Object.assign(form, emptyForm())
  resetFormAttachments()
  resetFormSelectOptions()
  formVisible.value = true
}

async function openEdit(row: ReceiptRecord) {
  editing.value = row
  let detail = row
  try {
    const { data } = await fetchReceipt(row.id)
    if (data) detail = data
  } catch {
    /* 列表行兜底 */
  }
  editing.value = detail
  const allocs = [...(detail.allocations || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )
  formAllocations.value = allocs
  const primaryReceivableId =
    detail.receivableId || (allocs.length === 1 ? allocs[0]!.receivableId : '') || ''
  Object.assign(form, {
    customerId: detail.customerId || '',
    receiptCode: detail.receiptCode || '',
    kind: detail.kind || 'invoice',
    contractId: detail.contractId || '',
    invoiceId: detail.invoiceId || '',
    receivableId: primaryReceivableId,
    paymentDate: detail.paymentDate || '',
    paymentMethod: detail.paymentMethod || RECEIPT_PAYMENT_METHODS[0],
    amount: detail.amount,
    remark: detail.remark || '',
    changeLog: detail.changeLog || '',
  })
  formExistingAttachments.value = [...(detail.attachments || [])]
  formPendingAttachments.value = []
  formRemovedAttachmentIds.value = []
  seedFormSelectsFromRow(detail)
  if (allocs.length === 1 && allocs[0] && !detail.receivableId) {
    const a = allocs[0]
    receivableSelectOptions.value = [
      {
        id: a.receivableId,
        receivableCode: a.receivableCode,
        invoiceCode: a.invoiceCode,
        customerName: detail.customerName,
        contractCode: detail.contractCode,
      } as ReceivableRecord,
    ]
  }
  formVisible.value = true
}

function payloadFromForm(): ReceiptWritePayload {
  // 多摊收据：不可改金额／应收／收款方式（与后端校验一致），只允许改备注等
  if (isMultiAllocationEdit.value) {
    return {
      customerId: form.customerId.trim() || undefined,
      receiptCode: form.receiptCode.trim() || undefined,
      kind: form.kind || undefined,
      contractId: form.contractId.trim() || null,
      paymentDate: form.paymentDate || undefined,
      remark: form.remark.trim() || undefined,
      changeLog: form.changeLog.trim() || undefined,
    }
  }
  return {
    customerId: form.customerId.trim() || undefined,
    receiptCode: form.receiptCode.trim() || undefined,
    kind: form.kind || undefined,
    contractId: form.contractId.trim() || null,
    invoiceId: form.invoiceId.trim() || null,
    receivableId: form.receivableId.trim() || null,
    paymentDate: form.paymentDate || undefined,
    paymentMethod: form.paymentMethod || undefined,
    amount: form.amount == null ? undefined : Number(form.amount) || 0,
    remark: form.remark.trim() || undefined,
    changeLog: form.changeLog.trim() || undefined,
  }
}

async function syncFormAttachments(receiptId: string) {
  for (const id of formRemovedAttachmentIds.value) {
    await deleteReceiptAttachmentApi(receiptId, id)
  }
  const pending = formPendingAttachments.value.map((p) => p.file)
  if (pending.length) {
    await uploadReceiptAttachmentsApi(receiptId, pending)
  }
}

async function saveForm() {
  if (
    !form.customerId.trim() &&
    !form.receivableId.trim() &&
    !form.invoiceId.trim() &&
    !isMultiAllocationEdit.value
  ) {
    await ElMessageBox.alert(
      t('receipt.customerRequired'),
      editing.value ? t('receipt.edit') : t('receipt.create'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
      },
    )
    return
  }
  saving.value = true
  try {
    const payload = payloadFromForm()
    let receiptId = editing.value?.id || ''
    if (editing.value) {
      await updateReceiptApi(editing.value.id, payload, { silentError: true })
      receiptId = editing.value.id
      await ElMessageBox.alert(t('receipt.updated'), t('receipt.edit'), {
        type: 'success',
        confirmButtonText: t('common.confirm'),
      })
    } else {
      const { data } = await createReceiptApi(payload, { silentError: true })
      receiptId = data.id
      await ElMessageBox.alert(t('receipt.created'), t('receipt.create'), {
        type: 'success',
        confirmButtonText: t('common.confirm'),
      })
    }
    if (receiptId) {
      await syncFormAttachments(receiptId)
    }
    formVisible.value = false
    formAllocations.value = []
    resetFormAttachments()
    await Promise.all([loadList(), loadKindChipCounts()])
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('common.failed')
    try {
      await ElMessageBox.alert(msg, editing.value ? t('receipt.edit') : t('receipt.create'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      })
    } catch {
      /* dismiss */
    }
  } finally {
    saving.value = false
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
    await Promise.all([loadList(), loadKindChipCounts()])
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
  if (!perms.import) {
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

    await Promise.all([loadList(), loadKindChipCounts()])
    finishImport()
  } catch {
    failImport(t('receipt.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <RefreshListButton :loading="loading" @refresh="() => void reloadListAndCounts()" />
      <h2>{{ t('menu.receipts') }}</h2>
      <div class="building-chips-rail">
        <div class="building-chips" role="tablist" :aria-label="t('receipt.kindFilterAria')">
          <button
            v-for="chip in kindChips"
            :key="chip.key"
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': kindChipFilter === chip.key }"
            :aria-selected="kindChipFilter === chip.key"
            @click="setKindChipFilter(chip.key)"
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
          :placeholder="t('receipt.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="receiptConditionCount" @clear="onClearReceiptFilters" />
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
          :key="`${tableLayoutKey}-${codeLayoutKey}-${receiptActionColWidth}`"
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
                filterable
                sortable
                :options="receiptCodeFilterOptions"
                :model-value="filters.receiptCode || []"
                :sort-order="sortOrderOf('receiptCode')"
                @update:model-value="(v) => setFilter('receiptCode', v)"
                @update:sort-order="(v) => setSort('receiptCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.receiptCode || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('receipt.fields.kind'),
                kindFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.kind')"
                filterable
                sortable
                :options="kindFilterOptions"
                :model-value="filters.kind || []"
                :sort-order="sortOrderOf('kind')"
                @update:model-value="(v) => setFilter('kind', v)"
                @update:sort-order="(v) => setSort('kind', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="receiptKindTone(row.kind)"
                :label="kindLabel(row.kind)"
              />
            </template>
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
                :model-value="filters.paymentDate || []"
                :sort-order="sortOrderOf('paymentDate')"
                :date-range-value="dateRangeOf('paymentDate')"
                @update:sort-order="(v) => setSort('paymentDate', v)"
                @update:model-value="(v) => setFilter('paymentDate', v)"
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
            :min-width="textColW(t('receipt.fields.remark'), { interactive: true, kind: 'long' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.remark')"
                filterable
                sortable
                :options="remarkFilterOptions"
                :model-value="filters.remark || []"
                :sort-order="sortOrderOf('remark')"
                @update:model-value="(v) => setFilter('remark', v)"
                @update:sort-order="(v) => setSort('remark', v)"
              />
            </template>
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receipt.fields.attachments'), { contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader :label="t('receipt.fields.attachments')" />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.attachments?.length ?? 0"
                @click="openDetail(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('receipt.fields.cashFlowCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.cashFlowCount')"
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
            :min-width="textColW(t('receipt.fields.changeLog'), { interactive: true, kind: 'long' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('receipt.fields.changeLog')"
                filterable
                sortable
                :options="changeLogFilterOptions"
                :model-value="filters.changeLog || []"
                :sort-order="sortOrderOf('changeLog')"
                @update:model-value="(v) => setFilter('changeLog', v)"
                @update:sort-order="(v) => setSort('changeLog', v)"
              />
            </template>
            <template #default="{ row }">{{ row.changeLog || '—' }}</template>
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
            :label="t('common.actions')"
            :width="receiptActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <ActionDetailButton @click="openDetail(row)" />
                <button
                  type="button"
                  class="action-pill action-pill--leave"
                  :disabled="printingReceiptId === row.id"
                  @mouseenter="prefetchReceiptPdfApi(row.id)"
                  @focus="prefetchReceiptPdfApi(row.id)"
                  @click.stop="onPrintReceipt(row)"
                >
                  {{ t('receipt.printReceipt') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--info"
                  :title="t('receipt.sendReceiptSoon')"
                  @click.stop="onSendReceipt(row)"
                >
                  {{ t('receipt.sendReceipt') }}
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
      @open-cash-flows="openCashFlowsSide"
      @booking-deposit-changed="() => Promise.all([loadList(), loadKindChipCounts()])"
    />
    <RelatedEntityDrawers
      ref="relationDrawers"
      @changed="() => Promise.all([loadList(), loadKindChipCounts()])"
    />
    <RelatedCashFlowsDrawer
      v-model="relatedCashFlowsVisible"
      :receipt-id="relatedListReceipt?.id"
      :title-context="relatedListReceipt?.receiptCode || ''"
      @open-cash-flow="openCashFlowSide"
    />
    <CashFlowDetailDrawer
      v-model="cashFlowDrawer"
      :record="cashFlowRecord"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id)"
      @open-refund-order="(id) => relationDrawers?.openRefundOrderSide(id)"
    />

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
          <el-form-item :label="t('receipt.fields.receiptCode')">
            <el-input v-model="form.receiptCode" :placeholder="t('receipt.codeAutoHint')" />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.kind')">
            <el-select v-model="form.kind" style="width: 100%">
              <el-option
                v-for="k in RECEIPT_KINDS"
                :key="k"
                :label="kindLabel(k)"
                :value="k"
              />
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="isMultiAllocationEdit"
            class="span-2"
          >
            <template #label>
              <span class="form-label-with-tip">
                {{ t('receipt.sections.allocations') }}
                <el-tooltip :content="t('receipt.multiAllocEditHint')" placement="top">
                  <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <ul class="receipt-alloc-form">
              <li v-for="a in formAllocations" :key="a.id" class="receipt-alloc-form__row">
                <button
                  type="button"
                  class="fk-link"
                  @click="openReceivableSide(a.receivableId, 'ltr')"
                >
                  {{ a.invoiceCode || a.receivableCode || '—' }}
                </button>
                <span class="receipt-alloc-form__code">{{ a.receivableCode || '—' }}</span>
                <strong>{{ moneyOrDash(a.amount) }}</strong>
              </li>
            </ul>
          </el-form-item>
          <el-form-item v-else :label="t('receipt.fields.receivableCode')">
            <SelectWithViewAction
              clearable
              :disabled="!form.receivableId"
              @view="openReceivableSide(form.receivableId, 'ltr')"
            >
              <el-select
                v-model="form.receivableId"
                clearable
                value-on-clear=""
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="receipt-receivable-select-popper"
                :placeholder="t('receipt.fields.receivableCode')"
                :remote-method="searchReceivablesRemote"
                :loading="receivableSelectLoading"
                @visible-change="onReceivableSelectVisible"
                @change="onReceivableSelected"
              >
                <el-option
                  v-for="opt in receivableSelectOptions"
                  :key="opt.id"
                  :label="receivableOptionLabel(opt)"
                  :value="opt.id"
                  :title="receivableOptionLabel(opt)"
                >
                  <span class="select-option-ellipsis" :title="receivableOptionLabel(opt)">
                    {{ receivableOptionLabel(opt) }}
                  </span>
                </el-option>
              </el-select>
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.customerName')" required>
            <SelectWithViewAction
              :disabled="!form.customerId"
              @view="openCustomerSide(form.customerId, 'ltr')"
            >
              <el-select
                v-model="form.customerId"
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="receipt-customer-select-popper"
                :placeholder="t('receipt.fields.customerName')"
                :remote-method="searchCustomersRemote"
                :loading="customerSelectLoading"
                @visible-change="onCustomerSelectVisible"
              >
                <el-option
                  v-for="opt in customerSelectOptions"
                  :key="opt.id"
                  :label="customerOptionLabel(opt)"
                  :value="opt.id"
                  :title="customerOptionLabel(opt)"
                >
                  <span class="select-option-ellipsis" :title="customerOptionLabel(opt)">
                    {{ customerOptionLabel(opt) }}
                  </span>
                </el-option>
              </el-select>
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.contractCode')">
            <SelectWithViewAction
              clearable
              :disabled="!form.contractId"
              @view="openContractSide(form.contractId, 'ltr')"
            >
              <el-select
                v-model="form.contractId"
                clearable
                value-on-clear=""
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="receipt-contract-select-popper"
                :placeholder="t('receipt.fields.contractCode')"
                :remote-method="searchContractsRemote"
                :loading="contractSelectLoading"
                @visible-change="onContractSelectVisible"
                @change="onContractSelected"
              >
                <el-option
                  v-for="opt in contractSelectOptions"
                  :key="opt.id"
                  :label="contractOptionLabel(opt)"
                  :value="opt.id"
                  :title="contractOptionLabel(opt)"
                >
                  <span class="select-option-ellipsis" :title="contractOptionLabel(opt)">
                    {{ contractOptionLabel(opt) }}
                  </span>
                </el-option>
              </el-select>
            </SelectWithViewAction>
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
            <el-select
              v-model="form.paymentMethod"
              filterable
              style="width: 100%"
              :disabled="isMultiAllocationEdit"
            >
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
              :disabled="isMultiAllocationEdit"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.attachments')" class="span-2">
            <div class="receipt-form-att">
              <div
                v-for="att in formExistingAttachments"
                :key="att.id"
                class="receipt-form-att__chip"
              >
                <span
                  class="receipt-form-att__icon"
                  :class="attachmentIconClass(att.fileName)"
                >
                  {{ attachmentExtLabel(att.fileName) }}
                </span>
                <span class="receipt-form-att__name">{{ att.fileName }}</span>
                <button
                  type="button"
                  class="receipt-form-att__remove"
                  :aria-label="t('common.delete')"
                  @click="removeExistingAttachment(att.id)"
                >
                  ×
                </button>
              </div>
              <div
                v-for="p in formPendingAttachments"
                :key="p.key"
                class="receipt-form-att__chip receipt-form-att__chip--pending"
              >
                <span
                  class="receipt-form-att__icon"
                  :class="attachmentIconClass(p.file.name)"
                >
                  {{ attachmentExtLabel(p.file.name) }}
                </span>
                <span class="receipt-form-att__name">{{ p.file.name }}</span>
                <button
                  type="button"
                  class="receipt-form-att__remove"
                  :aria-label="t('common.delete')"
                  @click="removePendingAttachment(p.key)"
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                class="receipt-form-att__add"
                :disabled="saving"
                @click="attachmentFileInput?.click()"
              >
                + {{ t('receipt.addAttachments') }}
              </button>
              <input
                ref="attachmentFileInput"
                type="file"
                class="receipt-form-att__input"
                multiple
                @change="onPickAttachments"
              />
            </div>
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
        <el-button :disabled="saving" @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" class="lb-btn-primary" :loading="saving" @click="saveForm">
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

.form-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form-label-tip {
  color: var(--lb-muted, #6a7a70);
  cursor: help;
  vertical-align: middle;
}

.receipt-alloc-form {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.receipt-alloc-form__row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f4f7f5;
  border: 1px solid #e4ebe6;
}

.receipt-alloc-form__code {
  font-size: 12px;
  color: #6a7a70;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.receipt-alloc-form__row strong {
  font-variant-numeric: tabular-nums;
  color: var(--lb-brand, #0f4a32);
  justify-self: end;
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

.receipt-form-att {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.receipt-form-att__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--lb-border, #d8e0db);
  border-radius: 8px;
  background: #f7faf8;
}

.receipt-form-att__chip--pending {
  border-style: dashed;
  background: #fff;
}

.receipt-form-att__icon {
  flex: 0 0 auto;
  min-width: 28px;
  height: 18px;
  padding: 0 4px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #5a6a62;
}

.receipt-form-att__icon--pdf {
  background: #c0392b;
}

.receipt-form-att__icon--img {
  background: #2a6b4d;
}

.receipt-form-att__icon--file {
  background: #4a5d72;
}

.receipt-form-att__name {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.86rem;
}

.receipt-form-att__remove {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.receipt-form-att__remove:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.receipt-form-att__add {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #3a7bd5;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.receipt-form-att__add:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.receipt-form-att__input {
  display: none;
}
</style>
