<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload, Delete, Rank } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createInvoiceApi,
  deleteInvoiceApi,
  batchDeleteInvoicesApi,
  fetchInvoice,
  fetchInvoices,
  fetchInvoiceSourceCounts,
  importInvoicesApi,
  previewInvoiceCodeApi,
  updateInvoiceApi,
} from '@/api/invoices'
import type { InvoiceWritePayload, InvoiceListQuery, InvoiceSourceCounts } from '@/api/invoices'
import { fetchContracts } from '@/api/contracts'
import { fetchCustomers } from '@/api/customers'
import { fetchRooms } from '@/api/rooms'
import { fetchRoomConfigs } from '@/api/room-configs'
import { fetchUsers } from '@/api/users'
import type { InvoiceRecord, InvoiceServiceDetailRecord } from '@/types/invoice'
import type { RoomConfigOption } from '@/types/room-config'
import { useBuildingScopeStore } from '@/stores/buildingScope'
import {
  CONTRACT_INVOICE_TYPES,
  DEFAULT_CONTRACT_INVOICE_TYPE,
  INVOICE_STATUSES,
  INVOICE_TYPE_I18N_KEY,
  SHORT_TERM_INVOICE_TYPE,
  isSystemGeneratedInvoice,
  normalizeContractInvoiceType,
} from '@/types/invoice'
import type { ContractRecord } from '@/types/contract'
import type { CustomerRecord } from '@/types/customer'
import type { RoomRecord } from '@/types/room'
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
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { invoiceBillingKindTone, invoiceStatusTone } from '@/constants/statusBadges'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { EMPTY_FILTER_VALUE, packFilterValues } from '@/utils/columnFilter'
import { measureActionColWidth } from '@/composables/useActionColWidth'
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
import {
  previewInvoicePdfApi,
  prefetchInvoicePdfApi,
  previewInvoiceDraftPdfApi,
  invalidateInvoicePdfCache,
} from '@/api/document-templates'
import type { InvoicePreviewDraft } from '@/api/document-templates'

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
const buildingScope = useBuildingScopeStore()
const isMobile = useIsMobile()
const perms = useResourcePermissions('invoices')
const SELECT_PAGE_SIZE = 20
const SHORT_ROOM_PAGE_SIZE = 20
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
  // 按实际主列按钮测宽（与合约表同一套 CELL_PAD_RIGHT），勿再 Math.max 无关文案
  const labels = [t('invoice.printInvoice'), t('invoice.resendInvoice')]
  if (perms.update) labels.push(t('common.edit'))
  if (perms.delete) labels.push(t('common.delete'))
  return measureActionColWidth(labels)
})

const printingInvoiceId = ref<string | null>(null)
const previewingDraft = ref(false)

/** 占位：后续接入 WhatsApp／Email 手动重发 */
function onResendInvoice(_row: InvoiceRecord) {
  ElMessage.info(t('invoice.resendInvoiceSoon'))
}

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
/** 新增／编辑弹窗：合约下拉（懒加载，随大厦权限／顶栏范围） */
const contractSelectOptions = ref<ContractRecord[]>([])
const contractSelectLoading = ref(false)
const contractSelectLoadingMore = ref(false)
const contractSelectPage = ref(1)
const contractSelectHasMore = ref(true)
const contractSelectKeyword = ref('')
let contractSelectScrollEl: HTMLElement | null = null
let contractSelectScrollHandler: ((e: Event) => void) | null = null
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
  uniqueOptions,
} = useTableSortFilter<InvoiceRecord>()

/** 页头快捷筛选：null=全部；按金可与合约发票叠加 */
const sourceFilter = ref<'contract' | 'short_term' | null>(null)
const depositFilter = ref(false)
const sourceCounts = ref<InvoiceSourceCounts>({
  all: 0,
  contract: 0,
  short_term: 0,
  deposit: 0,
})

const sourceFilterChips = computed(() => [
  {
    key: null as 'contract' | 'short_term' | null,
    label: t('invoice.sourceFilterAll'),
    count: sourceCounts.value.all,
  },
  {
    key: 'contract' as const,
    label: t('invoice.sourceFilterContract'),
    count: sourceCounts.value.contract,
  },
  {
    key: 'short_term' as const,
    label: t('invoice.sourceFilterShortTerm'),
    count: sourceCounts.value.short_term,
  },
])

async function loadSourceCounts() {
  try {
    const { data } = await fetchInvoiceSourceCounts()
    sourceCounts.value = {
      all: data.all ?? 0,
      contract: data.contract ?? 0,
      short_term: data.short_term ?? 0,
      deposit: data.deposit ?? 0,
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
} = useServerPagedList<InvoiceRecord, InvoiceListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const invoice = range('invoiceDate')
    const due = range('paymentDueDate')
    const depositOnly =
      sourceFilter.value === 'contract' && depositFilter.value ? true : undefined
    return {
      keyword: kw,
      invoiceCodes: packFilterValues(f.invoiceCode),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      buildingNames: buildingScope.selectedId ? undefined : packFilterValues(f.buildingName),
      roomNames: packFilterValues(f.roomName),
      invoiceTypes: packFilterValues(f.invoiceType),
      amounts: packFilterValues(f.amount),
      status: packFilterValues(f.status)?.join(','),
      salesManagers: packFilterValues(f.salesManager),
      sources: packFilterValues(f.source),
      billingKind: packFilterValues(f.billingKind)?.join(','),
      createdBys: packFilterValues(f.createdBy),
      source: sourceFilter.value || undefined,
      depositOnly,
      sortBy,
      sortDir,
      invoiceDateFrom: invoice.from,
      invoiceDateTo: invoice.to,
      invoiceDateEmpty: (f.invoiceDate || []).includes(EMPTY_FILTER_VALUE) || undefined,
      paymentDueDateFrom: due.from,
      paymentDueDateTo: due.to,
      paymentDueDateEmpty: (f.paymentDueDate || []).includes(EMPTY_FILTER_VALUE) || undefined,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      createdAtEmpty: (f.createdAt || []).includes(EMPTY_FILTER_VALUE) || undefined,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchInvoices,
})

function setSourceFilter(key: 'contract' | 'short_term' | null) {
  if (sourceFilter.value === key) return
  sourceFilter.value = key
  if (key !== 'contract') depositFilter.value = false
  resetPage()
  void loadList()
}

function toggleDepositFilter() {
  if (sourceFilter.value !== 'contract') return
  depositFilter.value = !depositFilter.value
  resetPage()
  void loadList()
}

async function reloadListAndCounts() {
  await Promise.all([loadList(), loadSourceCounts()])
}

const invoiceConditionCount = computed(
  () => activeConditionCount.value + (depositFilter.value ? 1 : 0),
)

function onClearInvoiceFilters() {
  depositFilter.value = false
  onClearFilters()
}

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
      (chunk) => batchDeleteInvoicesApi(chunk),
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

const statusFilterOptions = computed(() =>
  INVOICE_STATUSES.map((s) => ({
    value: s,
    label: statusLabel(s),
  })),
)

/** 类型列宽：按当前语言全部类型文案测宽（勿用 textColW name 下限过宽） */
const invoiceTypeWidthLabels = computed(() => [
  t('invoice.types.meetingRoomShort'),
  t('invoice.types.deposit'),
  t('invoice.types.others'),
  t('invoice.types.chargingPeriod'),
])

const billingKindFilterOptions = computed(() => [
  { value: 'manual', label: t('invoice.billingKind.manual') },
  { value: 'auto', label: t('invoice.billingKind.auto') },
])

const invoiceTypeFilterOptions = computed(() => {
  const values = [
    ...CONTRACT_INVOICE_TYPES,
    SHORT_TERM_INVOICE_TYPE,
    '10, Other charges',
  ]
  return values.map((value) => ({ value, label: typeLabel(value) || value }))
})

const sourceColumnFilterOptions = computed(() => [
  { value: 'contract', label: t('invoice.source.contract') },
  { value: 'short_term', label: t('invoice.source.short_term') },
])

function uniqueListOptions(
  get: (row: InvoiceRecord) => string | number | null | undefined,
  labelOf?: (value: string) => string,
) {
  return uniqueOptions(list.value, get, labelOf)
}

const invoiceCodeFilterOptions = computed(() =>
  uniqueListOptions((r) => r.invoiceCode),
)
const contractCodeFilterOptions = computed(() =>
  uniqueListOptions((r) => r.contractCode),
)
const roomNameFilterOptions = computed(() =>
  uniqueListOptions((r) => r.roomName || r.roomCode),
)
const amountFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.amount == null ? '' : String(r.amount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const salesManagerFilterOptions = computed(() =>
  uniqueListOptions((r) => r.salesManager),
)
const createdByFilterOptions = computed(() =>
  uniqueListOptions((r) => r.createdBy),
)
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

const buildingFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const b of buildingScope.options) {
    const name = b.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const userFilterOptions = computed(() =>
  users.value.map((u) => ({
    value: u.id,
    label: userOptionLabel(u),
  })),
)

const selectedContract = computed(() =>
  contractSelectOptions.value.find((c) => c.id === form.contractId) || null,
)

function contractOptionLabel(
  c: Pick<ContractRecord, 'contractCode' | 'customerName' | 'roomCode'>,
) {
  return `${c.contractCode} · ${c.customerName} · ${c.roomCode}`
}

function shortCustomerOptionLabel(c: Pick<CustomerRecord, 'customerCode' | 'name'>) {
  return `${c.customerCode || ''} ${c.name || ''}`.trim()
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '920px'))

function defaultFeeRow(partial?: Partial<FeeFormRow>): FeeFormRow {
  return {
    uid: newFeeUid(),
    description: '',
    quantity: 1,
    unitAmount: 0,
    remark: '',
    sortOrder: 0,
    ...partial,
  }
}

/** 新增发票（合约／短租）预填两条服务细节，方便用户改金额 */
function defaultCreateFeeRows(today: string): FeeFormRow[] {
  return [
    defaultFeeRow({ description: 'Deposit', sortOrder: 0 }),
    defaultFeeRow({
      description: `1, Charging Period\n${today}`,
      sortOrder: 1,
    }),
  ]
}

const emptyForm = () => ({
  contractId: '' as string,
  invoiceCode: '',
  invoiceType: DEFAULT_CONTRACT_INVOICE_TYPE as string,
  description: '',
  amount: 0 as number | null,
  status: INVOICE_STATUSES[0] as string,
  invoiceDate: '',
  paymentDueDate: '',
  salesManagerId: '' as string,
  remark: '',
  customerId: '' as string,
  roomId: '' as string,
  rentalStartDate: '' as string,
  rentalEndDate: '' as string,
  rentalDurationText: '' as string,
  referredByCustomerId: '' as string,
  roomInfoText: '' as string,
})

const form = reactive(emptyForm())
/** 表单来源：合约发票 / 短租发票 */
const formSource = ref<'contract' | 'short_term'>('contract')
const isShortTermForm = computed(() => formSource.value === 'short_term')
const shortCustomers = ref<CustomerRecord[]>([])
const shortRooms = ref<RoomRecord[]>([])
const shortCustomerLoading = ref(false)
const shortCustomerLoadingMore = ref(false)
const shortCustomerPage = ref(1)
const shortCustomerHasMore = ref(true)
const shortCustomerKeyword = ref('')
let shortCustomerScrollEl: HTMLElement | null = null
let shortCustomerScrollHandler: ((e: Event) => void) | null = null
const shortRoomLoading = ref(false)
const shortRoomLoadingMore = ref(false)
const shortRoomPage = ref(1)
const shortRoomHasMore = ref(true)
const shortRoomKeyword = ref('')
/** 短租房间下拉：面积档位筛选（空=全部） */
const shortRoomSizeRangeId = ref('')
/** 短租房间下拉：大厦筛选（空=全部；全局已锁大厦时不用） */
const shortRoomBuildingId = ref('')
const shortRoomSizeOptions = ref<RoomConfigOption[]>([])
/** 短租房间下拉实例：筛选交互时用于重新展开 */
const shortRoomSelectRef = ref<{
  focus: () => void
  blur: () => void
  toggleMenu: (event?: Event) => void
} | null>(null)
let shortRoomScrollEl: HTMLElement | null = null
let shortRoomScrollHandler: ((e: Event) => void) | null = null
/** 内层大厦/面积筛选交互中：父下拉若被 click-outside 关掉则立刻重开 */
let shortRoomSuppressClose = false
let shortRoomSuppressCloseTimer: ReturnType<typeof setTimeout> | null = null

/** 顶栏未锁单一大厦时，房间下拉内再提供大厦筛选 */
const shortRoomShowBuildingFilter = computed(
  () => !buildingScope.selectedId && buildingScope.options.length > 1,
)
const feeRows = ref<FeeFormRow[]>([])
const FEE_PAGE_SIZE = 5
const feePage = ref(1)
const feeTotalPages = computed(() =>
  Math.max(1, Math.ceil(feeRows.value.length / FEE_PAGE_SIZE) || 1),
)
const pagedFeeRows = computed(() => {
  const start = (feePage.value - 1) * FEE_PAGE_SIZE
  return feeRows.value.slice(start, start + FEE_PAGE_SIZE).map((row, i) => ({
    row,
    index: start + i,
  }))
})

function clampFeePage() {
  feePage.value = Math.min(Math.max(1, feePage.value), feeTotalPages.value)
}

function feeSubtotal(row: Pick<FeeFormRow, 'quantity' | 'unitAmount'>): number {
  return (Number(row.quantity) || 0) * (Number(row.unitAmount) || 0)
}

/** 开票金额 = 服务细节各行小计之和（自动汇总，不可手改） */
const feeAmountTotal = computed(() => {
  const sum = feeRows.value.reduce((acc, r) => acc + feeSubtotal(r), 0)
  return Math.round((sum + Number.EPSILON) * 100) / 100
})

watch(
  feeAmountTotal,
  (n) => {
    form.amount = n
  },
  { immediate: true },
)

function addFeeRow() {
  feeRows.value.push(defaultFeeRow())
  feePage.value = Math.ceil(feeRows.value.length / FEE_PAGE_SIZE)
}

function removeFeeRow(idx: number) {
  if (feeRows.value.length <= 1) {
    ElMessage.warning(t('invoice.serviceDetailMinOne'))
    return
  }
  feeRows.value.splice(idx, 1)
  clampFeePage()
}

function goToFeeIndex(absoluteIdx: number) {
  feePage.value = Math.floor(absoluteIdx / FEE_PAGE_SIZE) + 1
}

const editingFeeIndexUid = ref<string | null>(null)
const editingFeeIndexFrom = ref(-1)
const editingFeeIndexDraft = ref('')
const feeIndexInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
let feeIndexCommitLock = false
const dragFeeUid = ref<string | null>(null)
const dragOverFeeUid = ref<string | null>(null)

function resolveFeeIndexInput(): HTMLInputElement | null {
  const el = feeIndexInputRef.value
  if (!el) return null
  return Array.isArray(el) ? el[0] ?? null : el
}

function unbindFeeIndexOutside() {
  document.removeEventListener('pointerdown', onFeeIndexOutsidePointerDown, true)
}

function onFeeIndexOutsidePointerDown(e: Event) {
  const input = resolveFeeIndexInput()
  if (!input || !editingFeeIndexUid.value) return
  const t = e.target
  if (t instanceof Node && (input === t || input.contains(t))) return
  // 点任意别处：先写入 DOM 值再提交（不依赖 blur，避免被 overflow 裁切后失焦异常）
  commitEditFeeIndex()
}

async function startEditFeeIndex(uid: string, currentIndex: number) {
  if (feeRows.value.length <= 1) return
  unbindFeeIndexOutside()
  feeIndexCommitLock = false
  editingFeeIndexUid.value = uid
  editingFeeIndexFrom.value = currentIndex
  editingFeeIndexDraft.value = String(currentIndex + 1)
  await nextTick()
  const el = resolveFeeIndexInput()
  if (!el) return
  el.focus()
  el.select()
  document.addEventListener('pointerdown', onFeeIndexOutsidePointerDown, true)
}

function cancelEditFeeIndex() {
  unbindFeeIndexOutside()
  editingFeeIndexUid.value = null
  editingFeeIndexFrom.value = -1
  editingFeeIndexDraft.value = ''
}

function commitEditFeeIndex() {
  if (feeIndexCommitLock) return
  feeIndexCommitLock = true
  const input = resolveFeeIndexInput()
  if (input) {
    editingFeeIndexDraft.value = String(input.value ?? '').replace(/\D/g, '')
  }
  const uid = editingFeeIndexUid.value
  const fromIdx = editingFeeIndexFrom.value
  const draft = String(editingFeeIndexDraft.value ?? '').trim()
  cancelEditFeeIndex()
  if (!uid || fromIdx < 0) {
    feeIndexCommitLock = false
    return
  }
  const total = feeRows.value.length
  const raw = Number.parseInt(draft, 10)
  if (!Number.isFinite(raw)) {
    feeIndexCommitLock = false
    return
  }
  const toIdx = Math.min(total, Math.max(1, raw)) - 1
  const list = feeRows.value
  if (list[fromIdx]?.uid !== uid) {
    feeIndexCommitLock = false
    return
  }
  if (toIdx !== fromIdx) {
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
  }
  goToFeeIndex(toIdx)
  feeIndexCommitLock = false
}

function onFeeIndexDraftInput(e: Event) {
  const el = e.target as HTMLInputElement | null
  editingFeeIndexDraft.value = String(el?.value ?? '').replace(/\D/g, '')
}

function onFeeIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    commitEditFeeIndex()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancelEditFeeIndex()
  }
}

function onFeeDragStart(uid: string, e: DragEvent) {
  dragFeeUid.value = uid
  e.dataTransfer?.setData('text/plain', uid)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onFeeDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragFeeUid.value && dragFeeUid.value !== uid) {
    dragOverFeeUid.value = uid
  }
}

function onFeeDrop(targetUid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragFeeUid.value || e.dataTransfer?.getData('text/plain')
  dragFeeUid.value = null
  dragOverFeeUid.value = null
  if (!fromUid || fromUid === targetUid) return
  const list = feeRows.value
  const fromIdx = list.findIndex((r) => r.uid === fromUid)
  const toIdx = list.findIndex((r) => r.uid === targetUid)
  if (fromIdx < 0 || toIdx < 0) return
  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)
}

function onFeeDragEnd() {
  dragFeeUid.value = null
  dragOverFeeUid.value = null
}

function ensureContractOption(inv: InvoiceRecord) {
  if (!inv.contractId) return
  if (contractSelectOptions.value.some((c) => c.id === inv.contractId)) return
  contractSelectOptions.value = [
    {
      id: inv.contractId,
      contractCode: inv.contractCode || '',
      customerId: inv.customerId || '',
      customerName: inv.customerName || '',
      roomId: inv.roomId || '',
      roomCode: inv.roomCode || '',
      roomName: inv.roomName || '',
      roomNameText: inv.roomNameText || '',
      buildingId: null,
      buildingName: '',
      salesManagerId: inv.salesManagerId || '',
    } as ContractRecord,
    ...contractSelectOptions.value,
  ]
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
  const key = INVOICE_TYPE_I18N_KEY[type]
  return key ? t(`invoice.types.${key}`) : type
}

function billingKindLabel(kind?: string | null) {
  return isSystemGeneratedInvoice(kind)
    ? t('invoice.billingKind.auto')
    : t('invoice.billingKind.manual')
}

async function loadUsers() {
  const { data } = await fetchUsers()
  users.value = data
}

function unbindContractSelectScroll() {
  if (contractSelectScrollEl && contractSelectScrollHandler) {
    contractSelectScrollEl.removeEventListener('scroll', contractSelectScrollHandler)
  }
  contractSelectScrollEl = null
  contractSelectScrollHandler = null
}

function bindContractSelectScroll(onReachEnd: () => void) {
  const popper = document.querySelector('.invoice-contract-select-popper')
  const wrap =
    (popper?.querySelector('.el-select-dropdown__wrap') as HTMLElement | null) ||
    (popper?.querySelector('.el-scrollbar__wrap') as HTMLElement | null)
  if (!wrap) return
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
  contractSelectScrollEl = wrap
  contractSelectScrollHandler = handler
}

async function restoreContractSelectScroll(top: number) {
  if (!contractSelectScrollEl) return
  await nextTick()
  contractSelectScrollEl.scrollTop = top
}

/** 合约下拉：后端按可访问大厦 + 顶栏 buildingId 过滤 */
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
  const prevTop = contractSelectScrollEl?.scrollTop ?? 0
  const scopeBid = buildingScope.selectedId || undefined
  try {
    const { data } = await fetchContracts({
      keyword: contractSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
      buildingIds: scopeBid ? [scopeBid] : undefined,
    })
    const items = (data.items || []).filter(
      (c) => !scopeBid || !c.buildingId || c.buildingId === scopeBid,
    )
    if (reset) {
      contractSelectOptions.value = keepSelectedInOptions(
        items,
        form.contractId,
        contractSelectOptions.value,
      )
    } else {
      appendUniqueById(contractSelectOptions.value, items)
      await restoreContractSelectScroll(prevTop)
    }
    contractSelectPage.value = page + 1
    contractSelectHasMore.value = (data.items || []).length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      contractSelectOptions.value = keepSelectedInOptions(
        [],
        form.contractId,
        contractSelectOptions.value,
      )
      contractSelectHasMore.value = false
    }
  } finally {
    if (reset) contractSelectLoading.value = false
    else contractSelectLoadingMore.value = false
  }
}

function searchContractsRemote(query: string) {
  contractSelectKeyword.value = query.trim()
  contractSelectHasMore.value = true
  void loadContractsPage(true)
}

async function onContractSelectVisible(open: boolean) {
  unbindContractSelectScroll()
  if (!open) return
  contractSelectKeyword.value = ''
  contractSelectHasMore.value = true
  await loadContractsPage(true)
  await nextTick()
  bindContractSelectScroll(() => {
    void loadContractsPage(false)
  })
}

onMounted(async () => {
  if (!buildingScope.loaded) {
    try {
      await buildingScope.load()
    } catch {
      /* ignore */
    }
  }
  await Promise.all([loadUsers(), loadList(), loadSourceCounts()])
})

watch(
  () => form.contractId,
  (id) => {
    if (!id || editing.value) return
    // 销售经理跟随合约；合约未指定时回退当前登录用户
    const c = contractSelectOptions.value.find((x) => x.id === id)
    const fromContract = c?.salesManagerId?.trim() || ''
    const meId = userStore.user?.id?.trim() || ''
    form.salesManagerId = fromContract || meId
    if (form.salesManagerId) ensureSalesManagerOption(form.salesManagerId)
    // 选合约后刷新带房间后缀的编号预览
    void refreshInvoiceCodePreview({ contractId: id })
  },
)

async function refreshInvoiceCodePreview(opts?: { contractId?: string; roomId?: string }) {
  if (editing.value) return
  try {
    const { data } = await previewInvoiceCodeApi(opts)
    if (formVisible.value && !editing.value) {
      form.invoiceCode = data?.code?.trim() || ''
    }
  } catch {
    /* 预览失败时保留占位提示 */
  }
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ensureSalesManagerOption(userId: string) {
  const id = userId.trim()
  if (!id || users.value.some((u) => u.id === id)) return
  const me = userStore.user
  if (!me || me.id !== id) return
  users.value = [
    {
      id: me.id,
      account: me.account,
      displayName: me.displayName || '',
    } as UserRecord,
    ...users.value,
  ]
}

function resetCreateFormDefaults(source: 'contract' | 'short_term') {
  formSource.value = source
  Object.assign(form, emptyForm())
  form.invoiceType =
    source === 'short_term' ? SHORT_TERM_INVOICE_TYPE : DEFAULT_CONTRACT_INVOICE_TYPE
  const meId = userStore.user?.id?.trim() || ''
  form.salesManagerId = meId
  const today = todayYmd()
  form.invoiceDate = today
  form.paymentDueDate = today
  if (source === 'short_term') form.rentalStartDate = today
  ensureSalesManagerOption(meId)
  feeRows.value = defaultCreateFeeRows(today)
  feePage.value = 1
  stickyShortCustomers.value = []
}

function openCreate() {
  editing.value = null
  // 列表正筛短租／合约时，新增弹窗跟列表来源；「全部」仍默认合约
  const source = sourceFilter.value === 'short_term' ? 'short_term' : 'contract'
  resetCreateFormDefaults(source)
  contractSelectOptions.value = []
  contractSelectKeyword.value = ''
  contractSelectHasMore.value = true
  shortCustomers.value = []
  shortCustomerKeyword.value = ''
  shortCustomerHasMore.value = true
  formVisible.value = true
  if (source === 'short_term') {
    shortRoomSizeRangeId.value = ''
    shortRoomBuildingId.value = ''
    shortRoomKeyword.value = ''
    // 客户／房间下拉打开时再懒加载，不预拉
  }
  void refreshInvoiceCodePreview()
}

/** 新增弹窗内切换合约 / 短租标签页（编辑时不可切换） */
function onCreateSourceTabChange(name: string | number) {
  if (editing.value) return
  const next = name === 'short_term' ? 'short_term' : 'contract'
  if (next === formSource.value) return
  resetCreateFormDefaults(next)
  if (next === 'short_term') {
    shortRoomSizeRangeId.value = ''
    shortRoomBuildingId.value = ''
    shortRoomKeyword.value = ''
    shortCustomers.value = []
    shortCustomerKeyword.value = ''
    shortCustomerHasMore.value = true
    // 未选房间时先预览裸号；选房间后再带房间后缀
    void refreshInvoiceCodePreview()
  } else {
    void refreshInvoiceCodePreview()
  }
}

/** 清空后仍保留曾选客户，避免 seed 项从下拉消失 */
const stickyShortCustomers = ref<CustomerRecord[]>([])

function pinShortCustomer(row: CustomerRecord) {
  if (!row?.id) return
  if (stickyShortCustomers.value.some((c) => c.id === row.id)) return
  stickyShortCustomers.value = [...stickyShortCustomers.value, row]
}

function mergeStickyShortCustomers(items: CustomerRecord[]) {
  const seen = new Set(items.map((c) => c.id))
  const extra = stickyShortCustomers.value.filter((c) => !seen.has(c.id))
  return extra.length ? [...extra, ...items] : items
}

function unbindShortCustomerScroll() {
  if (shortCustomerScrollEl && shortCustomerScrollHandler) {
    shortCustomerScrollEl.removeEventListener('scroll', shortCustomerScrollHandler)
  }
  shortCustomerScrollEl = null
  shortCustomerScrollHandler = null
}

function bindShortCustomerScroll(onReachEnd: () => void) {
  const popper = document.querySelector('.invoice-short-customer-select-popper')
  const wrap =
    (popper?.querySelector('.el-select-dropdown__wrap') as HTMLElement | null) ||
    (popper?.querySelector('.el-scrollbar__wrap') as HTMLElement | null)
  if (!wrap) return
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
  shortCustomerScrollEl = wrap
  shortCustomerScrollHandler = handler
}

async function restoreShortCustomerScroll(top: number) {
  if (!shortCustomerScrollEl) return
  await nextTick()
  shortCustomerScrollEl.scrollTop = top
}

/** 短租客户下拉：打开首屏 + 滚到底追加（后端按可访问大厦过滤） */
async function loadShortCustomersPage(reset: boolean) {
  if (reset) {
    if (shortCustomerLoading.value) return
    shortCustomerLoading.value = true
  } else {
    if (
      shortCustomerLoading.value ||
      shortCustomerLoadingMore.value ||
      !shortCustomerHasMore.value
    ) {
      return
    }
    shortCustomerLoadingMore.value = true
  }
  const page = reset ? 1 : shortCustomerPage.value
  const prevTop = shortCustomerScrollEl?.scrollTop ?? 0
  const scopeBid = buildingScope.selectedId || undefined
  try {
    const { data } = await fetchCustomers({
      keyword: shortCustomerKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const items = (data.items || []).filter(
      (c) => !scopeBid || !c.buildingId || c.buildingId === scopeBid,
    )
    if (reset) {
      let next = keepSelectedInOptions(items, form.customerId, shortCustomers.value)
      next = keepSelectedInOptions(next, form.referredByCustomerId, shortCustomers.value)
      shortCustomers.value = mergeStickyShortCustomers(next)
    } else {
      appendUniqueById(shortCustomers.value, items)
      await restoreShortCustomerScroll(prevTop)
    }
    shortCustomerPage.value = page + 1
    shortCustomerHasMore.value = (data.items || []).length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      shortCustomers.value = mergeStickyShortCustomers(
        keepSelectedInOptions([], form.customerId, shortCustomers.value),
      )
      shortCustomerHasMore.value = false
    }
  } finally {
    if (reset) shortCustomerLoading.value = false
    else shortCustomerLoadingMore.value = false
  }
}

function searchShortCustomersRemote(query: string) {
  shortCustomerKeyword.value = query.trim()
  shortCustomerHasMore.value = true
  void loadShortCustomersPage(true)
}

async function onShortCustomerSelectVisible(open: boolean) {
  unbindShortCustomerScroll()
  if (!open) return
  shortCustomerKeyword.value = ''
  shortCustomerHasMore.value = true
  await loadShortCustomersPage(true)
  await nextTick()
  bindShortCustomerScroll(() => {
    void loadShortCustomersPage(false)
  })
}

/** @deprecated 兼容旧调用 */
async function loadShortCustomerOptions(keyword = '') {
  shortCustomerKeyword.value = String(keyword || '').trim()
  shortCustomerHasMore.value = true
  await loadShortCustomersPage(true)
}

watch(
  () => [form.customerId, form.referredByCustomerId] as const,
  ([customerId, referredId]) => {
    for (const id of [customerId, referredId]) {
      const sid = String(id ?? '').trim()
      if (!sid) continue
      const hit = shortCustomers.value.find((c) => c.id === sid)
      if (hit) pinShortCustomer(hit)
    }
  },
)

function shortRoomOptionLabel(r: Pick<RoomRecord, 'roomCode' | 'name' | 'buildingName'>) {
  const parts = [r.roomCode]
  if (r.name?.trim()) parts.push(r.name)
  if (!buildingScope.selectedId && r.buildingName?.trim()) parts.push(r.buildingName)
  return parts.join(' · ')
}

function shortRoomSizeLabel(r: Pick<RoomRecord, 'sizeSqft'>) {
  const n = Number(r.sizeSqft)
  if (!Number.isFinite(n) || n <= 0) return ''
  return t('invoice.shortRoomSizeBadge', { n })
}

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

function unbindShortRoomScroll() {
  if (shortRoomScrollEl && shortRoomScrollHandler) {
    shortRoomScrollEl.removeEventListener('scroll', shortRoomScrollHandler)
  }
  shortRoomScrollEl = null
  shortRoomScrollHandler = null
}

function bindShortRoomScroll(onReachEnd: () => void) {
  const popper = document.querySelector('.invoice-short-room-select-popper')
  const wrap =
    (popper?.querySelector('.el-select-dropdown__wrap') as HTMLElement | null) ||
    (popper?.querySelector('.el-scrollbar__wrap') as HTMLElement | null)
  if (!wrap) return
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
  shortRoomScrollEl = wrap
  shortRoomScrollHandler = handler
}

async function restoreShortRoomScroll(top: number) {
  if (!shortRoomScrollEl) return
  await nextTick()
  shortRoomScrollEl.scrollTop = top
}

function buildShortRoomSelectQuery(page: number) {
  const sizeId = shortRoomSizeRangeId.value.trim()
  const buildingId =
    buildingScope.selectedId || shortRoomBuildingId.value.trim() || undefined
  return {
    keyword: shortRoomKeyword.value || undefined,
    page,
    pageSize: SHORT_ROOM_PAGE_SIZE,
    allowShortTerm: true as const,
    /** 仅闲置：已有占用中合约／短租中的房间不可选 */
    occupancySummaries: ['idle'] as string[],
    sizeRangeIds: sizeId ? [sizeId] : undefined,
    buildingId: buildingId || undefined,
  }
}

async function ensureShortRoomFilterOptions() {
  if (!shortRoomSizeOptions.value.length) {
    try {
      const { data } = await fetchRoomConfigs({ type: 'size', activeOnly: true })
      shortRoomSizeOptions.value = data || []
    } catch {
      shortRoomSizeOptions.value = []
    }
  }
  if (!buildingScope.loaded) {
    try {
      await buildingScope.load()
    } catch {
      /* ignore */
    }
  }
}

async function loadShortRoomsPage(reset: boolean) {
  if (reset) {
    if (shortRoomLoading.value) return
    shortRoomLoading.value = true
  } else {
    if (shortRoomLoading.value || shortRoomLoadingMore.value || !shortRoomHasMore.value) return
    shortRoomLoadingMore.value = true
  }
  const page = reset ? 1 : shortRoomPage.value
  const prevTop = shortRoomScrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchRooms(buildShortRoomSelectQuery(page))
    const items = data.items || []
    if (reset) {
      shortRooms.value = keepSelectedInOptions(items, form.roomId, shortRooms.value)
    } else {
      appendUniqueById(shortRooms.value, items)
      await restoreShortRoomScroll(prevTop)
    }
    shortRoomPage.value = page + 1
    shortRoomHasMore.value = items.length >= SHORT_ROOM_PAGE_SIZE
  } catch {
    if (reset) {
      shortRooms.value = keepSelectedInOptions([], form.roomId, shortRooms.value)
      shortRoomHasMore.value = false
    }
  } finally {
    if (reset) shortRoomLoading.value = false
    else shortRoomLoadingMore.value = false
  }
}

function searchShortRoomsRemote(query: string) {
  shortRoomKeyword.value = query.trim()
  shortRoomHasMore.value = true
  void loadShortRoomsPage(true)
}

function setShortRoomSizeRange(id: string) {
  const next = String(id ?? '').trim()
  if (shortRoomSizeRangeId.value === next) return
  shortRoomSizeRangeId.value = next
  shortRoomHasMore.value = true
  void loadShortRoomsPage(true)
}

function setShortRoomBuilding(id: string) {
  const next = String(id ?? '').trim()
  if (shortRoomBuildingId.value === next) return
  shortRoomBuildingId.value = next
  shortRoomHasMore.value = true
  void loadShortRoomsPage(true)
}

function armShortRoomSuppressClose() {
  shortRoomSuppressClose = true
  if (shortRoomSuppressCloseTimer) clearTimeout(shortRoomSuppressCloseTimer)
  shortRoomSuppressCloseTimer = setTimeout(() => {
    shortRoomSuppressClose = false
    shortRoomSuppressCloseTimer = null
  }, 500)
}

function onShortRoomFilterVisible(_open: boolean) {
  // 打开／选完关闭时都武装，避免内层选项 click 被当成父级 outside
  armShortRoomSuppressClose()
}

function onShortRoomSizeFilterChange(id: string | null | undefined) {
  armShortRoomSuppressClose()
  setShortRoomSizeRange(String(id ?? ''))
}

function onShortRoomBuildingFilterChange(id: string | null | undefined) {
  armShortRoomSuppressClose()
  setShortRoomBuilding(String(id ?? ''))
}

function reopenShortRoomSelect() {
  const sel = shortRoomSelectRef.value
  if (!sel) return
  // filterable 下若 expanded 仍为 true 但面板已藏，直接 toggle 会被吞掉；先 blur 清状态再打开
  sel.blur()
  void nextTick(() => {
    sel.focus()
    sel.toggleMenu()
  })
}

async function onShortRoomSelectVisible(open: boolean) {
  if (!open) {
    unbindShortRoomScroll()
    if (shortRoomSuppressClose) {
      shortRoomSuppressClose = false
      if (shortRoomSuppressCloseTimer) {
        clearTimeout(shortRoomSuppressCloseTimer)
        shortRoomSuppressCloseTimer = null
      }
      await nextTick()
      reopenShortRoomSelect()
      return
    }
    return
  }
  await ensureShortRoomFilterOptions()
  shortRoomKeyword.value = ''
  shortRoomHasMore.value = true
  await loadShortRoomsPage(true)
  await nextTick()
  bindShortRoomScroll(() => {
    void loadShortRoomsPage(false)
  })
}

/** @deprecated 兼容旧调用名：打开下拉首屏 */
async function loadShortRoomOptions(keyword = '') {
  shortRoomKeyword.value = String(keyword || '').trim()
  shortRoomHasMore.value = true
  await ensureShortRoomFilterOptions()
  await loadShortRoomsPage(true)
}

function onShortRoomChange(roomId: string) {
  const room = shortRooms.value.find((r) => r.id === roomId)
  // 仅内部带出 roomNameText 供保存/预览；表单不再展示「房间信息/尺寸」
  form.roomInfoText = room
    ? [room.roomCode, room.name].filter(Boolean).join(' · ')
    : ''
}

watch(
  () => form.roomId,
  (id) => {
    if (!isShortTermForm.value) return
    onShortRoomChange(id)
    // 短租：选房间后预览「自动编号-房间编号」；清空房间则回退裸号预览
    if (!editing.value) {
      const rid = String(id ?? '').trim()
      void refreshInvoiceCodePreview(rid ? { roomId: rid } : undefined)
    }
  },
)

watch(
  () => buildingScope.viewKey,
  () => {
    shortRoomBuildingId.value = ''
    // 顶栏大厦变更：表单下拉按新范围重拉；选中项若不属于新范围则清空
    const scopeBid = buildingScope.selectedId
    if (form.contractId) {
      const c = contractSelectOptions.value.find((x) => x.id === form.contractId)
      if (scopeBid && c?.buildingId && c.buildingId !== scopeBid) {
        form.contractId = ''
      }
    }
    if (form.customerId && isShortTermForm.value) {
      const cust = shortCustomers.value.find((x) => x.id === form.customerId)
      if (scopeBid && cust?.buildingId && cust.buildingId !== scopeBid) {
        form.customerId = ''
      }
    }
    if (form.roomId && isShortTermForm.value) {
      const room = shortRooms.value.find((x) => x.id === form.roomId)
      if (scopeBid && room?.buildingId && room.buildingId !== scopeBid) {
        form.roomId = ''
      }
    }
    contractSelectHasMore.value = true
    contractSelectOptions.value = keepSelectedInOptions(
      [],
      form.contractId,
      contractSelectOptions.value,
    )
    shortCustomerHasMore.value = true
    shortCustomers.value = mergeStickyShortCustomers(
      keepSelectedInOptions([], form.customerId, shortCustomers.value),
    )
    if (!formVisible.value) return
    if (isShortTermForm.value) {
      shortRoomHasMore.value = true
      void loadShortCustomersPage(true)
      void loadShortRoomsPage(true)
    } else {
      void loadContractsPage(true)
    }
  },
)

onBeforeUnmount(() => {
  unbindShortRoomScroll()
  unbindShortCustomerScroll()
  unbindContractSelectScroll()
  if (shortRoomSuppressCloseTimer) {
    clearTimeout(shortRoomSuppressCloseTimer)
    shortRoomSuppressCloseTimer = null
  }
})

function newFeeUid() {
  try {
    return crypto.randomUUID()
  } catch {
    return `fee-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

function applyInvoiceToForm(row: InvoiceRecord) {
  editing.value = row
  formSource.value = row.source === 'short_term' ? 'short_term' : 'contract'
  if (formSource.value === 'contract') ensureContractOption(row)
  Object.assign(form, {
    contractId: row.contractId || '',
    invoiceCode: row.invoiceCode || '',
    invoiceType:
      row.source === 'short_term'
        ? row.invoiceType || SHORT_TERM_INVOICE_TYPE
        : normalizeContractInvoiceType(row.invoiceType),
    amount: row.amount,
    status: row.status || INVOICE_STATUSES[0],
    invoiceDate: row.invoiceDate || '',
    paymentDueDate: row.paymentDueDate || '',
    salesManagerId: row.salesManagerId || '',
    remark: row.remark || '',
    customerId: row.customerId || '',
    roomId: row.roomId || '',
    rentalStartDate: row.rentalStartDate || '',
    rentalEndDate: row.rentalEndDate || '',
    rentalDurationText: row.rentalDurationText || '',
    referredByCustomerId: row.referredByCustomerId || '',
    roomInfoText: [row.roomCode, row.roomName].filter(Boolean).join(' · ') || row.roomNameText || '',
  })
  if (form.salesManagerId) ensureSalesManagerOption(form.salesManagerId)
  if (formSource.value === 'short_term') {
    stickyShortCustomers.value = []
    if (row.customerId) {
      let hit = shortCustomers.value.find((c) => c.id === row.customerId)
      if (!hit) {
        hit = {
          id: row.customerId,
          customerCode: row.customerCode || '',
          name: row.customerName || '',
        } as CustomerRecord
        shortCustomers.value = [hit, ...shortCustomers.value]
      }
      pinShortCustomer(hit)
    }
    if (row.referredByCustomerId) {
      let hit = shortCustomers.value.find((c) => c.id === row.referredByCustomerId)
      if (!hit) {
        hit = {
          id: row.referredByCustomerId,
          customerCode: row.referredByCustomerCode || '',
          name: row.referredByCustomerName || '',
        } as CustomerRecord
        shortCustomers.value = [hit, ...shortCustomers.value]
      }
      pinShortCustomer(hit)
    }
    if (row.roomId && !shortRooms.value.some((r) => r.id === row.roomId)) {
      shortRooms.value = [
        {
          id: row.roomId,
          roomCode: row.roomCode || '',
          name: row.roomName || '',
          sizeSqft: row.roomSizeSqft ?? 0,
          allowShortTerm: true,
        } as RoomRecord,
        ...shortRooms.value,
      ]
    }
  }
  const details = Array.isArray(row.serviceDetails) ? row.serviceDetails : []
  feeRows.value = details.map((f) => ({
    uid: newFeeUid(),
    id: f.id,
    description: f.description || '',
    quantity: f.quantity ?? 0,
    unitAmount: f.unitAmount ?? 0,
    remark: f.remark || '',
    sortOrder: f.sortOrder ?? 0,
  }))
  feePage.value = 1
}

async function openEdit(row: InvoiceRecord) {
  // 先用列表行立刻打开，避免详情请求失败/偏慢时「点了没反应」
  try {
    applyInvoiceToForm(row)
  } catch (e) {
    console.error('[invoice openEdit] apply list row failed', e)
    ElMessage.error(t('invoice.edit') + ' failed')
    return
  }
  formVisible.value = true
  if (formSource.value === 'short_term') {
    shortCustomerHasMore.value = true
    shortRoomHasMore.value = true
    // 已选客户／房间由 applyInvoiceToForm seed；下拉打开时再懒加载
  }
  try {
    const { data } = await fetchInvoice(row.id)
    if (!formVisible.value || editing.value?.id !== row.id || !data?.id) return
    applyInvoiceToForm(data)
  } catch {
    /* 保留列表回填；错误由 interceptor 提示 */
  }
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

function draftFromForm(): InvoicePreviewDraft {
  const details = serviceDetailsPayload()
  const contract = selectedContract.value
  const customerId = isShortTermForm.value
    ? form.customerId.trim()
    : form.customerId.trim() || contract?.customerId || editing.value?.customerId || ''
  const roomId = isShortTermForm.value
    ? form.roomId.trim()
    : form.roomId.trim() || contract?.roomId || editing.value?.roomId || ''
  const roomNameText =
    form.roomInfoText.trim() ||
    (contract
      ? [contract.roomCode, contract.roomName].filter(Boolean).join(' · ')
      : '') ||
    editing.value?.roomNameText ||
    undefined
  return {
    contractId: isShortTermForm.value
      ? undefined
      : form.contractId.trim() || editing.value?.contractId || undefined,
    customerId: customerId || undefined,
    roomId: roomId || undefined,
    invoiceCode: form.invoiceCode.trim() || undefined,
    invoiceType: form.invoiceType || undefined,
    description: isShortTermForm.value
      ? form.rentalDurationText.trim() || undefined
      : form.invoiceType || undefined,
    amount: form.amount == null ? 0 : Number(form.amount) || 0,
    invoiceDate: form.invoiceDate || null,
    paymentDueDate: form.paymentDueDate || null,
    status: editing.value ? form.status || undefined : '已開票',
    roomNameText,
    remark: form.remark.trim() || undefined,
    serviceDetails: details,
  }
}

async function onPreviewInvoiceDraft() {
  if (previewingDraft.value) return
  if (isShortTermForm.value) {
    if (!form.customerId.trim()) {
      ElMessage.warning(t('invoice.customerRequired'))
      return
    }
    if (!form.roomId.trim()) {
      ElMessage.warning(t('invoice.roomRequired'))
      return
    }
  } else if (!form.contractId.trim()) {
    ElMessage.warning(t('invoice.contractRequired'))
    return
  }
  if (!String(form.invoiceDate || '').trim()) {
    ElMessage.warning(t('invoice.invoiceDateRequired'))
    return
  }
  if (!String(form.paymentDueDate || '').trim()) {
    ElMessage.warning(t('invoice.paymentDueDateRequired'))
    return
  }
  const draft = draftFromForm()
  if (!draft.customerId || !draft.roomId) {
    ElMessage.warning(t('invoice.previewNeedCustomerRoom'))
    return
  }
  previewingDraft.value = true
  try {
    await previewInvoiceDraftPdfApi(draft, editing.value?.id || null)
    ElMessage.success(t('invoice.printInvoicePreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('invoice.printInvoiceFailed')
    ElMessage.error(msg)
  } finally {
    previewingDraft.value = false
  }
}

function payloadFromForm(): InvoiceWritePayload {
  if (isShortTermForm.value) {
    return {
      source: 'short_term',
      customerId: form.customerId.trim(),
      roomId: form.roomId.trim(),
      invoiceCode: editing.value ? form.invoiceCode.trim() || undefined : undefined,
      invoiceType: SHORT_TERM_INVOICE_TYPE,
      // 界面已隐藏发票描述；新增时用租期描述作打印回退，编辑不传以免清空
      description: editing.value
        ? undefined
        : form.rentalDurationText.trim() || undefined,
      amount: form.amount == null ? undefined : Number(form.amount) || 0,
      status: editing.value ? form.status || undefined : '已開票',
      invoiceDate: form.invoiceDate || undefined,
      paymentDueDate: form.paymentDueDate || undefined,
      salesManagerId: form.salesManagerId.trim() || null,
      rentalStartDate: form.rentalStartDate || undefined,
      rentalEndDate: form.rentalEndDate || undefined,
      rentalDurationText: form.rentalDurationText.trim() || undefined,
      referredByCustomerId: form.referredByCustomerId.trim() || null,
      roomNameText: form.roomInfoText.trim() || undefined,
      remark: form.remark.trim() || undefined,
      serviceDetails: serviceDetailsPayload(),
    }
  }
  // 房间名称文本 / WhatsApp / 短租编号 / 应收帐引用 / 开票附件 / notes：
  // 旧系统兼容或打印快照字段，表单不再编辑；新增由后端从合约带出，编辑不传以免清空库内旧值
  return {
    source: 'contract',
    contractId: form.contractId.trim(),
    // 新增不传编号，由后端自动编号；编辑才带表单值
    invoiceCode: editing.value ? form.invoiceCode.trim() || undefined : undefined,
    invoiceType: form.invoiceType || undefined,
    // 界面已隐藏发票描述；新增写英文类型作打印回退，编辑不传以免覆盖系统自动周期文案
    description: editing.value ? undefined : form.invoiceType || undefined,
    amount: form.amount == null ? undefined : Number(form.amount) || 0,
    // 新增提交即为已开票；编辑用表单状态
    status: editing.value ? form.status || undefined : '已開票',
    invoiceDate: form.invoiceDate || undefined,
    paymentDueDate: form.paymentDueDate || undefined,
    salesManagerId: form.salesManagerId.trim() || null,
    remark: form.remark.trim() || undefined,
    serviceDetails: serviceDetailsPayload(),
  }
}

async function saveForm() {
  if (isShortTermForm.value) {
    if (!form.customerId.trim()) {
      ElMessage.warning(t('invoice.customerRequired'))
      return
    }
    if (!form.salesManagerId.trim()) {
      ElMessage.warning(t('invoice.salesManagerRequired'))
      return
    }
    if (!form.roomId.trim()) {
      ElMessage.warning(t('invoice.roomRequired'))
      return
    }
    if (!form.rentalStartDate?.trim() || !form.rentalEndDate?.trim()) {
      ElMessage.warning(t('invoice.rentalDatesRequired'))
      return
    }
  } else if (!form.contractId.trim()) {
    ElMessage.warning(t('invoice.contractRequired'))
    return
  }
  if (!String(form.invoiceDate || '').trim()) {
    ElMessage.warning(t('invoice.invoiceDateRequired'))
    return
  }
  if (!String(form.paymentDueDate || '').trim()) {
    ElMessage.warning(t('invoice.paymentDueDateRequired'))
    return
  }
  if (!serviceDetailsPayload().length) {
    ElMessage.warning(t('invoice.serviceDetailMinOne'))
    return
  }
  try {
    const payload = payloadFromForm()
    const silent = isShortTermForm.value
    if (editing.value) {
      await updateInvoiceApi(editing.value.id, payload, { silentError: silent })
      invalidateInvoicePdfCache(editing.value.id)
      ElMessage.success(t('invoice.updated'))
    } else {
      await createInvoiceApi(payload, { silentError: silent })
      ElMessage.success(t('invoice.created'))
    }
    formVisible.value = false
    await reloadListAndCounts()
  } catch (e) {
    if (!isShortTermForm.value) return
    const raw =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { message?: string | string[] } } }).response?.data
            ?.message
        : undefined
    const msg = Array.isArray(raw)
      ? raw.join('; ')
      : typeof raw === 'string' && raw.trim()
        ? raw
        : e instanceof Error && e.message
          ? e.message
          : 'Request failed'
    try {
      await ElMessageBox.alert(msg, t('invoice.createShortTerm'), {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
      })
    } catch {
      /* dismiss */
    }
  }
}

function invoiceSourceLabel(row: InvoiceRecord) {
  return row.source === 'short_term'
    ? t('invoice.source.short_term')
    : t('invoice.source.contract')
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
    await reloadListAndCounts()
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

async function openBuildingSide(buildingId?: string | null) {
  await relationDrawers.value?.openBuildingSide(buildingId)
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
  if (!perms.import) {
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

    await reloadListAndCounts()
    finishImport()
  } catch {
    failImport(t('invoice.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <RefreshListButton :loading="loading" @refresh="() => void reloadListAndCounts()" />
      <h2>{{ t('menu.invoices') }}</h2>
      <div class="building-chips-rail">
        <div class="building-chips" role="tablist" :aria-label="t('invoice.sourceFilterAria')">
          <button
            v-for="chip in sourceFilterChips"
            :key="chip.key ?? 'all'"
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': sourceFilter === chip.key }"
            :aria-selected="sourceFilter === chip.key"
            @click="setSourceFilter(chip.key)"
          >
            <span class="building-chip__name">{{ chip.label }}</span>
            <span class="building-chip__count">({{ chip.count }})</span>
          </button>
          <template v-if="sourceFilter === 'contract'">
            <span class="building-chips__sep" aria-hidden="true">|</span>
            <button
              type="button"
              class="building-chip"
              role="tab"
              :class="{ 'is-active': depositFilter }"
              :aria-selected="depositFilter"
              @click="toggleDepositFilter"
            >
              <span class="building-chip__name">{{ t('invoice.sourceFilterDeposit') }}</span>
              <span class="building-chip__count">({{ sourceCounts.deposit }})</span>
            </button>
          </template>
        </div>
      </div>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('invoice.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="invoiceConditionCount" @clear="onClearInvoiceFilters" />
        <el-button
          v-if="perms.create"
          v-admin-glow="perms.codes.create"
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
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
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
          :key="`${tableLayoutKey}-${codeLayoutKey}-${invoiceActionColWidth}`"
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
            :width="codeColW(t('invoice.fields.invoiceCode'), { interactive: true, samples: list.map((r) => r.invoiceCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.invoiceCode')"
                filterable
                sortable
                :options="invoiceCodeFilterOptions"
                :model-value="filters.invoiceCode || []"
                :sort-order="sortOrderOf('invoiceCode')"
                @update:model-value="(v) => setFilter('invoiceCode', v)"
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
            v-if="!buildingScope.selectedId"
            prop="buildingName"
            :min-width="colW(t('invoice.fields.buildingName'), { interactive: true, contentMin: 140 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.buildingName')"
                filterable
                sortable
                :options="buildingFilterOptions"
                :model-value="filters.buildingName || []"
                :sort-order="sortOrderOf('buildingName')"
                @update:model-value="(v) => setFilter('buildingName', v)"
                @update:sort-order="(v) => setSort('buildingName', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.buildingId"
                type="button"
                class="fk-link"
                @click.stop="openBuildingSide(row.buildingId)"
              >
                {{ row.buildingName || '—' }}
              </button>
              <span v-else>{{ row.buildingName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('invoice.fields.roomName'), { interactive: true, samples: list.map((r) => r.roomName || r.roomCode) })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.roomName')"
                filterable
                sortable
                :options="roomNameFilterOptions"
                :model-value="filters.roomName || []"
                :sort-order="sortOrderOf('roomName')"
                @update:model-value="(v) => setFilter('roomName', v)"
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
            :min-width="
              statusColW(t('invoice.fields.invoiceType'), invoiceTypeWidthLabels, {
                interactive: true,
              })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.invoiceType')"
                filterable
                sortable
                :options="invoiceTypeFilterOptions"
                :model-value="filters.invoiceType || []"
                :sort-order="sortOrderOf('invoiceType')"
                @update:model-value="(v) => setFilter('invoiceType', v)"
                @update:sort-order="(v) => setSort('invoiceType', v)"
              />
            </template>
            <template #default="{ row }">{{ typeLabel(row.invoiceType) || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoice.fields.amount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.amount')"
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
            :min-width="colW(t('invoice.fields.invoiceDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.invoiceDate')"
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
            :min-width="colW(t('invoice.fields.paymentDueDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.paymentDueDate')"
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
            :min-width="colW(t('invoice.fields.salesManager'), { interactive: true, contentMin: 100 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.salesManager')"
                filterable
                sortable
                :options="salesManagerFilterOptions"
                :model-value="filters.salesManager || []"
                :sort-order="sortOrderOf('salesManager')"
                @update:model-value="(v) => setFilter('salesManager', v)"
                @update:sort-order="(v) => setSort('salesManager', v)"
              />
            </template>
            <template #default="{ row }">{{ row.salesManager || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('invoice.fields.remark')"
            :min-width="textColW(t('invoice.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="statusColW(t('invoice.fields.source'), [t('invoice.source.contract'), t('invoice.source.short_term')])"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.source')"
                filterable
                sortable
                :options="sourceColumnFilterOptions"
                :model-value="filters.source || []"
                :sort-order="sortOrderOf('source')"
                @update:model-value="(v) => setFilter('source', v)"
                @update:sort-order="(v) => setSort('source', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="row.source === 'short_term' ? 'signing' : 'idle'"
                :label="invoiceSourceLabel(row)"
              />
            </template>
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
            :min-width="
              statusColW(
                t('invoice.fields.billingKind'),
                billingKindFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoice.fields.billingKind')"
                filterable
                sortable
                :sort-order="sortOrderOf('billingKind')"
                :options="billingKindFilterOptions"
                :model-value="filters.billingKind || []"
                @update:sort-order="(v) => setSort('billingKind', v)"
                @update:model-value="(v) => setFilter('billingKind', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="invoiceBillingKindTone(row.billingKind)"
                :label="billingKindLabel(row.billingKind)"
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
            :width="invoiceActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--leave"
                  :disabled="printingInvoiceId === row.id"
                  @mouseenter="prefetchInvoicePdfApi(row.id)"
                  @focus="prefetchInvoicePdfApi(row.id)"
                  @click.stop="onPrintInvoice(row)"
                >
                  {{ t('invoice.printInvoice') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--info"
                  :title="t('invoice.resendInvoiceSoon')"
                  @click.stop="onResendInvoice(row)"
                >
                  {{ t('invoice.resendInvoice') }}
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
      @changed="reloadListAndCounts"
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
      @changed="reloadListAndCounts"
    />
    <RelatedEntityDrawers ref="relationDrawers" @changed="reloadListAndCounts" />

    <el-dialog
      v-model="formVisible"
      :title="
        editing
          ? isShortTermForm
            ? t('invoice.editShortTerm')
            : t('invoice.edit')
          : t('invoice.create')
      "
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <div v-if="!editing" class="invoice-source-switch">
        <el-radio-group
          :model-value="formSource"
          class="lb-yesno-seg invoice-source-seg"
          @change="onCreateSourceTabChange"
        >
          <el-radio-button value="contract">{{ t('invoice.createContract') }}</el-radio-button>
          <el-radio-button value="short_term">{{ t('invoice.createShortTerm') }}</el-radio-button>
        </el-radio-group>
      </div>
      <el-form label-position="top" class="invoice-form">
        <div v-if="isShortTermForm" class="form-grid">
          <el-form-item :label="t('invoice.fields.invoiceCode')">
            <el-input
              v-model="form.invoiceCode"
              disabled
              :placeholder="editing ? undefined : t('invoice.codeAutoHint')"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.customerName')" required>
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
                popper-class="invoice-short-customer-select-popper"
                :remote-method="searchShortCustomersRemote"
                :loading="shortCustomerLoading"
                :placeholder="t('invoice.fields.customerName')"
                @visible-change="onShortCustomerSelectVisible"
              >
                <el-option
                  v-for="c in shortCustomers"
                  :key="c.id"
                  :label="shortCustomerOptionLabel(c)"
                  :value="c.id"
                  :title="shortCustomerOptionLabel(c)"
                >
                  <span class="select-option-ellipsis" :title="shortCustomerOptionLabel(c)">
                    {{ shortCustomerOptionLabel(c) }}
                  </span>
                </el-option>
                <template #empty>
                  <div class="invoice-short-room-empty">{{ t('invoice.shortCustomerEmpty') }}</div>
                </template>
              </el-select>
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.salesManager')" required>
            <el-select
              v-model="form.salesManagerId"
              filterable
              style="width: 100%"
              :placeholder="t('invoice.fields.salesManager')"
            >
              <el-option
                v-for="u in users"
                :key="u.id"
                :label="userOptionLabel(u)"
                :value="u.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.roomName')" required>
            <SelectWithViewAction
              :disabled="!form.roomId"
              @view="openRoomSide(form.roomId, 'ltr')"
            >
              <el-select
                ref="shortRoomSelectRef"
                v-model="form.roomId"
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="invoice-short-room-select-popper"
                :remote-method="searchShortRoomsRemote"
                :loading="shortRoomLoading"
                :placeholder="t('invoice.fields.roomName')"
                :disabled="!!editing"
                @visible-change="onShortRoomSelectVisible"
              >
                <template #header>
                  <div
                    class="invoice-short-room-filters"
                    role="group"
                    :aria-label="t('invoice.shortRoomFilterAria')"
                    @mousedown.stop="armShortRoomSuppressClose"
                    @click.stop
                  >
                    <el-select
                      v-if="shortRoomShowBuildingFilter"
                      :model-value="shortRoomBuildingId || undefined"
                      size="small"
                      clearable
                      filterable
                      :teleported="false"
                      class="invoice-short-room-filter-select"
                      popper-class="invoice-short-room-filter-popper"
                      :placeholder="t('invoice.shortRoomFilterBuildingAll')"
                      @visible-change="onShortRoomFilterVisible"
                      @change="onShortRoomBuildingFilterChange"
                    >
                      <el-option
                        v-for="b in buildingScope.options"
                        :key="b.id"
                        :label="b.name"
                        :value="b.id"
                      />
                    </el-select>
                    <el-select
                      :model-value="shortRoomSizeRangeId || undefined"
                      size="small"
                      clearable
                      :teleported="false"
                      class="invoice-short-room-filter-select"
                      popper-class="invoice-short-room-filter-popper"
                      :placeholder="t('invoice.shortRoomFilterSizeAll')"
                      @visible-change="onShortRoomFilterVisible"
                      @change="onShortRoomSizeFilterChange"
                    >
                      <el-option
                        v-for="o in shortRoomSizeOptions"
                        :key="o.id"
                        :label="o.label"
                        :value="o.id"
                      />
                    </el-select>
                  </div>
                </template>
                <el-option
                  v-for="r in shortRooms"
                  :key="r.id"
                  :label="shortRoomOptionLabel(r)"
                  :value="r.id"
                  :title="shortRoomOptionLabel(r)"
                >
                  <div class="contract-room-option">
                    <span class="select-option-ellipsis" :title="shortRoomOptionLabel(r)">
                      {{ shortRoomOptionLabel(r) }}
                    </span>
                    <span
                      v-if="shortRoomSizeLabel(r)"
                      class="invoice-short-room-option__size"
                    >
                      {{ shortRoomSizeLabel(r) }}
                    </span>
                  </div>
                </el-option>
                <!-- remote + 无选项时 EP 会藏下拉且 expanded 卡死；有 empty 槽才会保持展开 -->
                <template #empty>
                  <div class="invoice-short-room-empty">{{ t('invoice.shortRoomEmpty') }}</div>
                </template>
              </el-select>
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.invoiceDate')" required>
            <el-date-picker
              v-model="form.invoiceDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.paymentDueDate')" required>
            <el-date-picker
              v-model="form.paymentDueDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.rentalStartDate')" required>
            <el-date-picker
              v-model="form.rentalStartDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.rentalEndDate')" required>
            <el-date-picker
              v-model="form.rentalEndDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.amount')" required>
            <el-input-number
              :model-value="feeAmountTotal"
              :min="0"
              :precision="2"
              :controls="false"
              disabled
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item v-if="editing" :label="t('invoice.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option
                v-for="s in INVOICE_STATUSES"
                :key="s"
                :label="statusLabel(s)"
                :value="s"
              />
            </el-select>
          </el-form-item>
        </div>

        <div v-else class="form-grid">
          <!-- 发票编号在合约左侧：新增预览自动编号（不可编辑，灰色）；选合约后带房间后缀；编辑只读原号 -->
          <el-form-item :label="t('invoice.fields.invoiceCode')">
            <el-input
              v-model="form.invoiceCode"
              disabled
              :placeholder="editing ? undefined : t('invoice.codeAutoHint')"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.contractCode')" required>
            <SelectWithViewAction
              :disabled="!form.contractId"
              @view="openContractSide(form.contractId, 'ltr')"
            >
              <el-select
                v-model="form.contractId"
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="invoice-contract-select-popper"
                :placeholder="t('invoice.fields.contractCode')"
                :disabled="!!editing"
                :remote-method="searchContractsRemote"
                :loading="contractSelectLoading"
                @visible-change="onContractSelectVisible"
              >
                <el-option
                  v-for="c in contractSelectOptions"
                  :key="c.id"
                  :label="contractOptionLabel(c)"
                  :value="c.id"
                  :title="contractOptionLabel(c)"
                >
                  <span class="select-option-ellipsis" :title="contractOptionLabel(c)">
                    {{ contractOptionLabel(c) }}
                  </span>
                </el-option>
                <template #empty>
                  <div class="invoice-short-room-empty">{{ t('invoice.contractSelectEmpty') }}</div>
                </template>
              </el-select>
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.customerName')">
            <SelectWithViewAction
              control="input"
              :disabled="!(selectedContract?.customerId || editing?.customerId)"
              @view="
                openCustomerSide(selectedContract?.customerId || editing?.customerId, 'ltr')
              "
            >
              <el-input
                :model-value="selectedContract?.customerName || editing?.customerName || ''"
                disabled
              />
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.roomName')">
            <SelectWithViewAction
              control="input"
              :disabled="!(selectedContract?.roomId || editing?.roomId)"
              @view="openRoomSide(selectedContract?.roomId || editing?.roomId, 'ltr')"
            >
              <el-input
                :model-value="
                  selectedContract
                    ? `${selectedContract.roomCode}${selectedContract.roomName ? ' · ' + selectedContract.roomName : ''}`
                    : editing
                      ? `${editing.roomCode}${editing.roomName ? ' · ' + editing.roomName : ''}`
                      : ''
                "
                disabled
              />
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.invoiceType')">
            <el-select v-model="form.invoiceType" style="width: 100%">
              <el-option
                v-for="s in CONTRACT_INVOICE_TYPES"
                :key="s"
                :label="typeLabel(s)"
                :value="s"
              />
            </el-select>
          </el-form-item>
          <!-- 新增固定已开票，不展示；编辑可改状态 -->
          <el-form-item v-if="editing" :label="t('invoice.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option
                v-for="s in INVOICE_STATUSES"
                :key="s"
                :label="statusLabel(s)"
                :value="s"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('invoice.fields.amount')" required>
            <el-input-number
              :model-value="feeAmountTotal"
              :min="0"
              :precision="2"
              :controls="false"
              disabled
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.invoiceDate')" required>
            <el-date-picker
              v-model="form.invoiceDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoice.fields.paymentDueDate')" required>
            <el-date-picker
              v-model="form.paymentDueDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>

        <section class="form-section form-section--fees">
          <div class="period-section-head">
            <div class="period-section-head__left">
              <h3>{{ t('invoice.sections.serviceDetails') }}</h3>
              <el-button
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="period-add-btn"
                @click="addFeeRow"
              >
                {{ t('invoice.addServiceDetailRow') }}
              </el-button>
            </div>
            <div v-if="feeRows.length > FEE_PAGE_SIZE" class="period-table-pager">
              <el-pagination
                v-model:current-page="feePage"
                :page-size="FEE_PAGE_SIZE"
                :total="feeRows.length"
                layout="total, prev, pager, next"
                small
                background
                class="period-pager"
              />
            </div>
          </div>
          <div class="period-table-wrap">
            <div
              class="period-table fee-table"
              role="table"
              :style="{ '--period-page-size': FEE_PAGE_SIZE }"
            >
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
                <div class="period-table__cell fee-table__cell--desc" role="columnheader">
                  <span class="req">*</span>{{ t('invoice.fields.feeDescription') }}
                </div>
                <div class="period-table__cell fee-table__cell--qty" role="columnheader">
                  <span class="req">*</span>{{ t('invoice.fields.feeQuantity') }}
                </div>
                <div class="period-table__cell fee-table__cell--unit" role="columnheader">
                  <span class="req">*</span>{{ t('invoice.fields.feeUnitAmount') }}
                </div>
                <div class="period-table__cell fee-table__cell--sub" role="columnheader">
                  {{ t('invoice.fields.feeSubtotal') }}
                </div>
                <div class="period-table__cell fee-table__cell--remark" role="columnheader">
                  {{ t('invoice.fields.feeRemark') }}
                </div>
                <div class="period-table__cell fee-table__cell--actions" role="columnheader"></div>
              </div>
              <div
                class="period-table__body"
                :class="{ 'period-table__body--fixed': feeRows.length > FEE_PAGE_SIZE }"
              >
                <div
                  v-for="{ row: fee, index: idx } in pagedFeeRows"
                  :key="fee.uid"
                  class="period-table__row"
                  role="row"
                  :class="{
                    'is-dragging': dragFeeUid === fee.uid,
                    'is-drag-over': dragOverFeeUid === fee.uid,
                    'is-editing-index': editingFeeIndexUid === fee.uid,
                  }"
                  @dragover="onFeeDragOver(fee.uid, $event)"
                  @drop="onFeeDrop(fee.uid, $event)"
                  @dragleave="dragOverFeeUid === fee.uid && (dragOverFeeUid = null)"
                >
                  <div
                    class="period-table__cell period-table__cell--index"
                    :class="{ 'is-editing-index': editingFeeIndexUid === fee.uid }"
                    role="cell"
                  >
                    <button
                      type="button"
                      class="period-row__handle"
                      draggable="true"
                      :title="t('invoice.dragServiceDetail')"
                      aria-label="drag"
                      @dragstart="onFeeDragStart(fee.uid, $event)"
                      @dragend="onFeeDragEnd"
                    >
                      <el-icon :size="14"><Rank /></el-icon>
                    </button>
                    <input
                      v-if="editingFeeIndexUid === fee.uid"
                      ref="feeIndexInputRef"
                      :value="editingFeeIndexDraft"
                      class="period-row__index-input"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="4"
                      :aria-label="t('invoice.editServiceDetailIndex')"
                      @input="onFeeIndexDraftInput"
                      @keydown="onFeeIndexKeydown"
                      @blur="commitEditFeeIndex"
                    />
                    <button
                      v-else
                      type="button"
                      class="period-row__index"
                      :title="t('invoice.editServiceDetailIndexHint')"
                      @dblclick.stop="startEditFeeIndex(fee.uid, idx)"
                    >
                      {{ idx + 1 }}
                    </button>
                  </div>
                  <div class="period-table__cell fee-table__cell--desc" role="cell">
                    <el-input
                      v-model="fee.description"
                      type="textarea"
                      :rows="2"
                      resize="none"
                      class="fee-table__textarea"
                      :placeholder="t('invoice.fields.feeDescription')"
                    />
                  </div>
                  <div class="period-table__cell fee-table__cell--qty" role="cell">
                    <el-input-number
                      v-model="fee.quantity"
                      :min="0"
                      :precision="2"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell fee-table__cell--unit" role="cell">
                    <el-input-number
                      v-model="fee.unitAmount"
                      :min="0"
                      :precision="2"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell fee-table__cell--sub" role="cell">
                    {{ formatMoney(feeSubtotal(fee)) }}
                  </div>
                  <div class="period-table__cell fee-table__cell--remark" role="cell">
                    <el-input
                      v-model="fee.remark"
                      type="textarea"
                      :rows="2"
                      resize="none"
                      class="fee-table__textarea"
                      :placeholder="t('invoice.fields.feeRemark')"
                    />
                  </div>
                  <div class="period-table__cell fee-table__cell--actions" role="cell">
                    <el-button type="danger" link :icon="Delete" @click="removeFeeRow(idx)" />
                  </div>
                </div>
                <div v-if="!feeRows.length" class="fee-table__empty">
                  {{ t('invoice.noServiceDetailRows') }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <el-form-item :label="t('invoice.fields.remark')" class="invoice-form__remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button :loading="previewingDraft" @click="onPreviewInvoiceDraft">
            {{ t('invoice.previewInvoice') }}
          </el-button>
          <el-button :disabled="previewingDraft" @click="formVisible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button
            type="primary"
            class="lb-btn-primary"
            :disabled="previewingDraft"
            @click="saveForm"
          >
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

.invoice-source-switch {
  display: flex;
  justify-content: flex-start;
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #f4f7f5);
  border: 1px solid #e4ebe6;
}

.invoice-source-seg.lb-yesno-seg {
  width: 100%;
  max-width: 420px;
}

.invoice-source-seg :deep(.el-radio-button) {
  flex: 1 1 0;
}

.invoice-source-seg :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 14px;
  font-weight: 650;
  font-size: 0.88rem;
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
  margin-bottom: 10px;
  padding-top: 8px;
  padding-bottom: 6px;
  border-top: 1px solid #edf2ef;
}

.invoice-form__remark {
  margin-top: 4px;
  margin-bottom: 0;
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

.period-pager :deep(.btn-prev:hover:not(:disabled)),
.period-pager :deep(.btn-next:hover:not(:disabled)),
.period-pager :deep(.el-pager li:hover:not(.is-active)) {
  color: var(--lb-brand, #0f4a32);
}

.period-table {
  --period-row-h: 44px;
  --period-page-size: 5;
  display: grid;
  min-width: 720px;
}

/* 服务细节：描述/备注固定两行高度，可换行，超出框内纵向滚动 */
.fee-table.period-table {
  --period-row-h: 72px;
  --fee-textarea-h: 48px;
}

.fee-table.period-table .period-table__head,
.fee-table.period-table .period-table__row {
  display: grid;
  /* 序号列：介于原 52 与过窄 36 之间，把手+数字不被挡，仍比原来省空隙 */
  grid-template-columns:
    44px
    minmax(152px, 1.75fr)
    112px
    112px
    80px
    minmax(128px, 1.3fr)
    36px;
  align-items: center;
  column-gap: 4px;
  padding: 0 6px;
}

.fee-table .period-table__cell--index {
  gap: 0;
}

.fee-table .period-row__handle {
  width: 16px;
}

.fee-table .period-row__index {
  min-width: 0.9rem;
  padding: 0;
}

/* 序号列变窄后，绝对定位输入框勿溢出到描述列（会被 body overflow 裁切，导致点外部无法 blur 提交） */
.fee-table .period-row__index-input {
  position: static;
  left: auto;
  top: auto;
  transform: none;
  width: 1.65rem;
  min-width: 1.65rem;
  flex: 0 0 auto;
}

.fee-table.period-table .period-table__row {
  padding-top: 6px;
  padding-bottom: 6px;
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

.fee-table__cell--actions {
  justify-content: center;
}

.fee-table .period-table__row .fee-table__cell--sub {
  justify-content: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #3d4f45;
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

.period-row__index:hover {
  background: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  color: var(--lb-brand);
}

.period-row__index-input {
  box-sizing: border-box;
  position: absolute;
  left: 18px;
  top: 50%;
  z-index: 6;
  width: 2.4rem;
  min-width: 2.4rem;
  height: 24px;
  margin: 0;
  padding: 0 3px;
  border: 1px solid var(--lb-brand, #0f4a32);
  border-radius: 5px;
  background: #fff;
  color: #0f4a32;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 22px;
  outline: none;
  transform: translateY(-50%);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lb-brand, #0f4a32) 18%, transparent);
}

.fee-table__empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--lb-muted, #6a7a70);
  font-size: 0.84rem;
}

.fee-table__cell--desc,
.fee-table__cell--remark {
  align-self: stretch;
}

.fee-table__textarea {
  width: 100%;
}

.fee-table__textarea :deep(.el-textarea__inner) {
  box-sizing: border-box;
  height: var(--fee-textarea-h) !important;
  min-height: var(--fee-textarea-h) !important;
  max-height: var(--fee-textarea-h) !important;
  line-height: 1.35;
  padding: 4px 8px;
  resize: none;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 0 0 1px #dbe4df inset;
}

.period-table__row :deep(.el-input__wrapper),
.period-table__row :deep(.el-select__wrapper) {
  min-height: 30px;
  box-shadow: 0 0 0 1px #dbe4df inset;
}

.period-table__row :deep(.el-input-number) {
  width: 100%;
}

.period-table__row :deep(.el-input-number .el-input__wrapper) {
  padding-left: 8px;
  padding-right: 8px;
}

.period-table__row :deep(.el-input-number.is-controls-right .el-input__wrapper) {
  padding-right: 36px;
}

.room-io-file {
  display: none;
}
</style>
