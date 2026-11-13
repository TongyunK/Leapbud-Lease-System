<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, Download, Plus, Rank, Search, Upload } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createVacateSettlementApi,
  deleteContractSettlementApi,
  fetchContractSettlement,
  fetchContractSettlements,
  importVacateSettlementsApi,
  updateVacateSettlementApi,
  type ContractSettlementListQuery,
  type VacateDeductionItemPayload,
  type VacateSettlementWritePayload,
} from '@/api/contract-settlements'
import { fetchContract, fetchContracts } from '@/api/contracts'
import type { ContractRecord } from '@/types/contract'
import type { ContractSettlementRecord } from '@/types/contract-settlement'
import {
  CONTRACT_SETTLEMENT_COLLECT_STATUSES,
  CONTRACT_SETTLEMENT_REFUND_STATUSES,
  CONTRACT_SETTLEMENT_TYPES,
} from '@/types/contract-settlement'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { ACTION_COL_ICON, useActionColWidth } from '@/composables/useActionColWidth'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CountListPill from '@/components/CountListPill.vue'
import ContractSettlementDetailDrawer from '@/components/ContractSettlementDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import RelatedWriteoffsDrawer from '@/components/RelatedWriteoffsDrawer.vue'
import RelatedRefundOrdersDrawer from '@/components/RelatedRefundOrdersDrawer.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import RefundOrderDetailDrawer from '@/components/RefundOrderDetailDrawer.vue'
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import ContractSettlementRefundDialog from '@/components/ContractSettlementRefundDialog.vue'
import ContractReceivePaymentDialog from '@/components/ContractReceivePaymentDialog.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import { useOverlayStackZ } from '@/composables/useOverlayStackZ'
import AttachmentField from '@/components/AttachmentField.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import { fetchRefundOrder } from '@/api/refund-orders'
import { fetchCashFlow } from '@/api/cash-flows'
import type { RefundOrderRecord } from '@/types/refund-order'
import type { CashFlowRecord } from '@/types/cash-flow'
import {
  contractSettlementCollectStatusTone,
  contractSettlementRefundStatusTone,
  contractSettlementTypeTone,
} from '@/constants/statusBadges'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import {
  rowToSettlementVacateIoPayload,
  settlementVacateIoTemplateExampleRow,
  settlementVacateToIoRow,
  type SettlementVacateImportPayload,
} from '@/utils/settlementVacateExport'

const { t } = useI18n()
const isMobile = useIsMobile()
const perms = useResourcePermissions('contractSettlements')
const refundPerms = useResourcePermissions('refundOrders')
const receiptPerms = useResourcePermissions('receipts')
const { allocZ } = useOverlayStackZ()
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
const current = ref<ContractSettlementRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const relatedWriteoffsVisible = ref(false)
const relatedRefundOrdersVisible = ref(false)
const relatedListSettlement = ref<ContractSettlementRecord | null>(null)
const refundOrderDrawer = ref(false)
const refundOrderRecord = ref<RefundOrderRecord | null>(null)
const relatedCashFlowsVisible = ref(false)
const cashFlowDrawer = ref(false)
const cashFlowRecord = ref<CashFlowRecord | null>(null)

const formVisible = ref(false)
const editing = ref<ContractSettlementRecord | null>(null)
const refundDialogVisible = ref(false)
const refundSettlement = ref<ContractSettlementRecord | null>(null)
const receivePayVisible = ref(false)
const receivePayContract = ref<ContractRecord | null>(null)
const receivePayZIndex = ref<number | undefined>(undefined)
const relatedReceiptsVisible = ref(false)
const relatedReceiptsContract = ref<ContractRecord | null>(null)
const relatedReceiptsZIndex = ref<number | undefined>(undefined)
const dialogWidth = computed(() => (isMobile.value ? '94%' : '900px'))
const SELECT_PAGE_SIZE = 20

type VacateContractOpt = {
  id: string
  contractCode: string
  customerId: string
  customerName: string
  roomId: string
  roomCode: string
}

type DeductionDraftRow = {
  uid: string
  description: string
  quantity: number
  unitAmount: number
  returnStatus: string
  remark: string
}

const contractSelectOptions = ref<VacateContractOpt[]>([])
const contractSelectLoading = ref(false)
const contractSelectLoadingMore = ref(false)
const contractSelectPage = ref(1)
const contractSelectHasMore = ref(true)
const contractSelectKeyword = ref('')
const stickyContractOption = ref<VacateContractOpt | null>(null)
let contractSelectScrollEl: HTMLElement | null = null
let contractSelectScrollRaf = 0

const DEDUCTION_PAGE_SIZE = 5
const deductionRows = ref<DeductionDraftRow[]>([])
const deductionPage = ref(1)
const dragDeductionUid = ref<string | null>(null)
const dragOverDeductionUid = ref<string | null>(null)
const editingDeductionIndexUid = ref<string | null>(null)
const editingDeductionIndexFrom = ref(-1)
const editingDeductionIndexDraft = ref('')
const deductionIndexInputRef = ref<HTMLInputElement | null>(null)
let deductionIndexCommitLock = false

const returnStatusOptions = computed(() => [
  { value: '', label: t('contractSettlement.returnStatus.none') },
  { value: 'damaged', label: t('depositDeduction.returnStatus.damaged') },
  { value: 'missing', label: t('depositDeduction.returnStatus.missing') },
])

function newDeductionUid() {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultDeductionRow(): DeductionDraftRow {
  return {
    uid: newDeductionUid(),
    description: '',
    quantity: 1,
    unitAmount: 0,
    returnStatus: '',
    remark: '',
  }
}

function deductionSubtotal(row: DeductionDraftRow) {
  return Math.round((Number(row.quantity) || 0) * (Number(row.unitAmount) || 0) * 100) / 100
}

const pagedDeductions = computed(() => {
  const start = (deductionPage.value - 1) * DEDUCTION_PAGE_SIZE
  return deductionRows.value.slice(start, start + DEDUCTION_PAGE_SIZE).map((row, i) => ({
    row,
    index: start + i,
  }))
})

const showDeductionPager = computed(() => deductionRows.value.length > DEDUCTION_PAGE_SIZE)

function goToDeductionIndex(absoluteIdx: number) {
  deductionPage.value = Math.floor(absoluteIdx / DEDUCTION_PAGE_SIZE) + 1
}

function addDeductionRow() {
  deductionRows.value.push(defaultDeductionRow())
  goToDeductionIndex(deductionRows.value.length - 1)
}

function removeDeductionRow(index: number) {
  deductionRows.value.splice(index, 1)
  const maxPage = Math.max(1, Math.ceil(deductionRows.value.length / DEDUCTION_PAGE_SIZE) || 1)
  if (deductionPage.value > maxPage) deductionPage.value = maxPage
}

async function startEditDeductionIndex(uid: string, currentIndex: number) {
  if (deductionRows.value.length <= 1) return
  deductionIndexCommitLock = false
  editingDeductionIndexUid.value = uid
  editingDeductionIndexFrom.value = currentIndex
  editingDeductionIndexDraft.value = String(currentIndex + 1)
  await nextTick()
  const el = deductionIndexInputRef.value
  if (!el) return
  el.focus()
  el.select()
}

function cancelEditDeductionIndex() {
  editingDeductionIndexUid.value = null
  editingDeductionIndexFrom.value = -1
  editingDeductionIndexDraft.value = ''
}

function commitEditDeductionIndex() {
  if (deductionIndexCommitLock) return
  deductionIndexCommitLock = true
  const uid = editingDeductionIndexUid.value
  const fromIdx = editingDeductionIndexFrom.value
  const draft = String(editingDeductionIndexDraft.value ?? '').trim()
  cancelEditDeductionIndex()
  if (!uid || fromIdx < 0) {
    deductionIndexCommitLock = false
    return
  }
  const total = deductionRows.value.length
  const raw = Number.parseInt(draft, 10)
  if (!Number.isFinite(raw)) {
    deductionIndexCommitLock = false
    return
  }
  const toIdx = Math.min(total, Math.max(1, raw)) - 1
  const list = deductionRows.value
  if (list[fromIdx]?.uid !== uid) {
    deductionIndexCommitLock = false
    return
  }
  if (toIdx !== fromIdx) {
    const [item] = list.splice(fromIdx, 1)
    if (item) list.splice(toIdx, 0, item)
  }
  goToDeductionIndex(toIdx)
  deductionIndexCommitLock = false
}

function onDeductionIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    commitEditDeductionIndex()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancelEditDeductionIndex()
  }
}

function onDeductionDragStart(uid: string, e: DragEvent) {
  dragDeductionUid.value = uid
  e.dataTransfer?.setData('text/plain', uid)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDeductionDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragDeductionUid.value && dragDeductionUid.value !== uid) {
    dragOverDeductionUid.value = uid
  }
}

function onDeductionDrop(targetUid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragDeductionUid.value || e.dataTransfer?.getData('text/plain')
  dragDeductionUid.value = null
  dragOverDeductionUid.value = null
  if (!fromUid || fromUid === targetUid) return
  const from = deductionRows.value.findIndex((r) => r.uid === fromUid)
  const to = deductionRows.value.findIndex((r) => r.uid === targetUid)
  if (from < 0 || to < 0) return
  const [moved] = deductionRows.value.splice(from, 1)
  if (!moved) return
  deductionRows.value.splice(to, 0, moved)
}

function onDeductionDragEnd() {
  dragDeductionUid.value = null
  dragOverDeductionUid.value = null
}

function appendUniqueById<T extends { id: string }>(prev: T[], next: T[]) {
  const seen = new Set(prev.map((x) => x.id))
  for (const item of next) {
    if (seen.has(item.id)) continue
    prev.push(item)
    seen.add(item.id)
  }
}

function keepSelectedInOptions(
  items: VacateContractOpt[],
  selectedId: string,
  prev: VacateContractOpt[],
  sticky: VacateContractOpt | null,
) {
  const out = [...items]
  const id = selectedId.trim()
  if (!id) return out
  if (out.some((x) => x.id === id)) return out
  const hit = sticky?.id === id ? sticky : prev.find((x) => x.id === id)
  if (hit) out.unshift(hit)
  return out
}

async function restoreSelectScroll(el: HTMLElement | null, top: number) {
  await nextTick()
  if (el) el.scrollTop = top
}

function unbindContractSelectScroll() {
  if (contractSelectScrollEl) {
    contractSelectScrollEl.removeEventListener('scroll', onContractSelectScroll)
    contractSelectScrollEl = null
  }
  if (contractSelectScrollRaf) {
    cancelAnimationFrame(contractSelectScrollRaf)
    contractSelectScrollRaf = 0
  }
}

function onContractSelectScroll() {
  if (contractSelectScrollRaf) return
  contractSelectScrollRaf = requestAnimationFrame(() => {
    contractSelectScrollRaf = 0
    const el = contractSelectScrollEl
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      void loadContractsPage(false)
    }
  })
}

function bindContractSelectScroll() {
  unbindContractSelectScroll()
  const wrap = document.querySelector(
    '.vacate-contract-select-popper .el-select-dropdown__wrap, .vacate-contract-select-popper .el-scrollbar__wrap',
  ) as HTMLElement | null
  if (!wrap) return
  contractSelectScrollEl = wrap
  wrap.addEventListener('scroll', onContractSelectScroll, { passive: true })
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
    const items: VacateContractOpt[] = data.items.map((c) => ({
      id: c.id,
      contractCode: c.contractCode,
      customerId: c.customerId,
      customerName: c.customerName,
      roomId: c.roomId,
      roomCode: c.roomCode,
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

function searchContractRemote(query: string) {
  contractSelectKeyword.value = (query || '').trim()
  void loadContractsPage(true)
}

function onContractSelectVisible(open: boolean) {
  if (!open) {
    unbindContractSelectScroll()
    return
  }
  contractSelectKeyword.value = ''
  contractSelectHasMore.value = true
  void loadContractsPage(true).then(() => {
    nextTick(() => bindContractSelectScroll())
  })
}

const listActionColWidth = computed(() =>
  actionColW([
    ACTION_COL_ICON,
    perms.update && t('common.edit'),
    receiptPerms.create && t('contract.receivePayment'),
    refundPerms.update && t('contractSettlement.processRefund'),
    perms.delete && t('common.delete'),
  ]),
)

function canEditSettlement(row: ContractSettlementRecord) {
  return row.type === 'VACATE'
}

function refundStatusOf(row: ContractSettlementRecord) {
  return row.refundStatus || row.status || ''
}

function canProcessRefund(row: ContractSettlementRecord) {
  const st = refundStatusOf(row)
  if (st === 'pending_refund' || st === 'partial') return true
  const due = Number(row.refundDueTotal) || 0
  const got = Number(row.refundedTotal) || 0
  return due - got > 0.009
}

function canCollectPayment(row: ContractSettlementRecord) {
  const st = (row.collectStatus || '').trim()
  if (st === 'pending_collect' || st === 'partial') return true
  const remaining = Number(row.collectRemaining)
  if (Number.isFinite(remaining)) return remaining > 0.009
  const due = Number(row.collectDueTotal) || 0
  const got = Number(row.collectedTotal) || 0
  return due - got > 0.009
}

function openRefund(row: ContractSettlementRecord) {
  if (!canProcessRefund(row)) return
  refundSettlement.value = row
  refundDialogVisible.value = true
}

async function openCollectPayment(row: ContractSettlementRecord) {
  if (!receiptPerms.create) {
    await alertBox(t('contract.receivePaymentNoPerm'))
    return
  }
  const contractId = (row.contractId || '').trim()
  if (!contractId) return
  try {
    const { data } = await fetchContract(contractId)
    receivePayContract.value = data
  } catch {
    await alertBox(t('contract.receivePaymentFailed'), 'error')
    return
  }
  receivePayZIndex.value = allocZ()
  receivePayVisible.value = true
}

function openReceiptsFromReceivePay(contract: ContractRecord) {
  relatedReceiptsContract.value = contract
  relatedReceiptsZIndex.value = allocZ(receivePayZIndex.value)
  relatedReceiptsVisible.value = true
}

function onReceivePayCollected() {
  void loadList()
}

async function onDelete(row: ContractSettlementRecord) {
  try {
    await ElMessageBox.confirm(
      t('contractSettlement.deleteConfirm', { code: row.settlementCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteContractSettlementApi(row.id, { silentError: true })
    await ElMessageBox.alert(t('contractSettlement.deleted'), t('common.tip'), {
      type: 'success',
    })
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

async function onRefundDone() {
  await loadList()
  const id = refundSettlement.value?.id
  if (!id) return
  const next = list.value.find((r) => r.id === id)
  if (next) refundSettlement.value = next
}

const refundStatusOptions = computed(() =>
  CONTRACT_SETTLEMENT_REFUND_STATUSES.map((s) => ({
    value: s,
    label: t(`contractSettlement.refundStatus.${s}`),
  })),
)
const collectStatusOptions = computed(() =>
  CONTRACT_SETTLEMENT_COLLECT_STATUSES.map((s) => ({
    value: s,
    label: t(`contractSettlement.collectStatus.${s}`),
  })),
)
const typeOptions = computed(() =>
  CONTRACT_SETTLEMENT_TYPES.map((s) => ({
    value: s,
    label: t(`contractSettlement.type.${s}`),
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
} = useTableSortFilter<ContractSettlementRecord>()

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
} = useServerPagedList<ContractSettlementRecord, ContractSettlementListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const settlement = range('settlementDate')
    const created = range('createdAt')
    return {
      keyword: kw,
      settlementCodes: packFilterValues(f.settlementCode),
      types: packFilterValues(f.type),
      refundStatuses: packFilterValues(f.refundStatus),
      collectStatuses: packFilterValues(f.collectStatus),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      roomCodes: packFilterValues(f.roomCode),
      reasons: packFilterValues(f.reason),
      doorKeyReturnedQtys: packFilterValues(f.doorKeyReturnedQty),
      smartCardReturnedQtys: packFilterValues(f.smartCardReturnedQty),
      itemCounts: packFilterValues(f.itemCount),
      writeoffCounts: packFilterValues(f.writeoffCount),
      refundOrderCounts: packFilterValues(f.refundOrderCount),
      refundDueTotals: packFilterValues(f.refundDueTotal),
      refundedTotals: packFilterValues(f.refundedTotal),
      refundRemainings: packFilterValues(f.refundRemaining),
      collectDueTotals: packFilterValues(f.collectDueTotal),
      collectedTotals: packFilterValues(f.collectedTotal),
      collectRemainings: packFilterValues(f.collectRemaining),
      createdBys: packFilterValues(f.createdBy),
      sortBy,
      sortDir,
      settlementDateFrom: settlement.from,
      settlementDateTo: settlement.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchContractSettlements,
})

const codeLayoutKey = computed(() =>
  [
    codeColW(t('contractSettlement.fields.settlementCode'), {
      interactive: true,
      samples: list.value.map((r) => r.settlementCode),
    }),
    codeColW(t('contractSettlement.fields.contractCode'), {
      interactive: true,
      samples: list.value.map((r) => r.contractCode),
    }),
  ].join('-'),
)

const settlementCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.settlementCode),
)
const contractCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.contractCode),
)
const customerNameFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.customerName),
)
const roomCodeFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.roomCode))
const reasonFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.reason))
const doorKeyFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.doorKeyReturnedQty ?? 0)),
)
const smartCardFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.smartCardReturnedQty ?? 0)),
)
const itemCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.itemCount ?? 0)),
)
const writeoffCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.writeoffCount ?? 0)),
)
const refundOrderCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.refundOrderCount ?? 0)),
)
function refundRemainingOf(row: ContractSettlementRecord) {
  if (row.refundRemaining != null && Number.isFinite(Number(row.refundRemaining))) {
    return Math.max(0, Math.round(Number(row.refundRemaining) * 100) / 100)
  }
  const due = Number(row.refundDueTotal) || 0
  const got = Number(row.refundedTotal) || 0
  return Math.max(0, Math.round((due - got) * 100) / 100)
}

function collectRemainingOf(row: ContractSettlementRecord) {
  if (row.collectRemaining != null && Number.isFinite(Number(row.collectRemaining))) {
    return Math.max(0, Math.round(Number(row.collectRemaining) * 100) / 100)
  }
  const due = Number(row.collectDueTotal) || 0
  const got = Number(row.collectedTotal) || 0
  return Math.max(0, Math.round((due - got) * 100) / 100)
}

const refundDueFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.refundDueTotal == null ? '' : String(r.refundDueTotal)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const refundedFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.refundedTotal == null ? '' : String(r.refundedTotal)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const refundRemainingFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => String(refundRemainingOf(r)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const collectDueFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.collectDueTotal == null ? '' : String(r.collectDueTotal)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const collectedFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.collectedTotal == null ? '' : String(r.collectedTotal)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const collectRemainingFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => String(collectRemainingOf(r)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))

const selectedContractDisplay = computed(() => {
  const opt = contractSelectOptions.value.find((o) => o.id === form.contractId)
  if (!opt) {
    if (editing.value) {
      return {
        customerName: editing.value.customerName || '—',
        roomCode: editing.value.roomCode || '—',
        customerId: editing.value.customerId || '',
        roomId: editing.value.roomId || '',
      }
    }
    return { customerName: '—', roomCode: '—', customerId: '', roomId: '' }
  }
  return {
    customerName: opt.customerName || '—',
    roomCode: opt.roomCode || '—',
    customerId: opt.customerId || '',
    roomId: opt.roomId || '',
  }
})

const emptyForm = () => ({
  contractId: '' as string,
  terminationDate: '',
  reason: '',
  noticeAttachment: '',
  doorKeyReturnedQty: 0,
  smartCardReturnedQty: 0,
  siteCondition: '',
  remark: '',
})

const form = reactive(emptyForm())

function moneyOrDash(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

async function alertBox(msg: string, type: 'warning' | 'error' | 'success' = 'warning') {
  await ElMessageBox.alert(msg, t('menu.contractSettlements'), {
    type,
    confirmButtonText: t('common.confirm'),
  }).catch(() => undefined)
}

async function openDetail(row: ContractSettlementRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchContractSettlement(row.id)
    current.value = data
  } catch {
    current.value = row
  }
  detailDirection.value = direction
  drawerVisible.value = true
}

function onRowClick(
  row: ContractSettlementRecord,
  column: { type?: string } | undefined,
  event: Event,
) {
  if (column?.type === 'selection' || column?.type === 'index') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .fk-link, input, textarea')) return
  void openDetail(row, 'rtl')
}

function openItemsSide(row: ContractSettlementRecord) {
  if (!(row.itemCount ?? 0)) return
  void openDetail(row)
}

function openWriteoffsSide(row: ContractSettlementRecord) {
  if (!(row.writeoffCount ?? 0)) return
  relatedListSettlement.value = row
  relatedWriteoffsVisible.value = true
}

function openRefundOrdersSide(row: ContractSettlementRecord) {
  if (!(row.refundOrderCount ?? 0)) return
  relatedListSettlement.value = row
  relatedRefundOrdersVisible.value = true
}

async function openRefundOrderSide(row: RefundOrderRecord) {
  try {
    const { data } = await fetchRefundOrder(row.id)
    refundOrderRecord.value = data
  } catch {
    refundOrderRecord.value = row
  }
  refundOrderDrawer.value = true
}

async function openRefundOrderFromRefundDialog(
  id: string,
  _opts?: { zIndex?: number },
) {
  if (!id) return
  try {
    const { data } = await fetchRefundOrder(id)
    refundOrderRecord.value = data
  } catch {
    return
  }
  refundOrderDrawer.value = true
}

function openCashFlowsFromRefund(row: RefundOrderRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  refundOrderRecord.value = row
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

async function openSettlementSide(id: string) {
  try {
    const { data } = await fetchContractSettlement(id)
    current.value = data
    drawerVisible.value = true
  } catch {
    /* ignore */
  }
}

function seedContractOption(row: {
  contractId: string
  contractCode: string
  customerId: string
  customerName: string
  roomId: string
  roomCode: string
}) {
  if (!row.contractId) {
    stickyContractOption.value = null
    return
  }
  stickyContractOption.value = {
    id: row.contractId,
    contractCode: row.contractCode,
    customerId: row.customerId,
    customerName: row.customerName,
    roomId: row.roomId,
    roomCode: row.roomCode,
  }
  if (!contractSelectOptions.value.some((c) => c.id === row.contractId)) {
    contractSelectOptions.value = [stickyContractOption.value, ...contractSelectOptions.value]
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  deductionRows.value = []
  deductionPage.value = 1
  stickyContractOption.value = null
  contractSelectOptions.value = []
  formVisible.value = true
}

async function openEdit(row: ContractSettlementRecord) {
  if (row.type !== 'VACATE') {
    void alertBox(t('contractSettlement.vacateOnlyEdit'))
    return
  }
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    terminationDate: row.terminationDate || '',
    reason: row.reason || '',
    noticeAttachment: row.noticeAttachment || '',
    doorKeyReturnedQty: row.doorKeyReturnedQty ?? 0,
    smartCardReturnedQty: row.smartCardReturnedQty ?? 0,
    siteCondition: row.siteCondition || '',
    remark: row.remark || '',
  })
  seedContractOption(row)
  deductionRows.value = []
  deductionPage.value = 1
  formVisible.value = true
  try {
    const { data } = await fetchContractSettlement(row.id)
    editing.value = data
    const items = (data.items || []).filter(
      (it) =>
        (it.itemType === 'DAMAGE_DEDUCTION' || it.itemType === 'PENALTY_DEDUCTION') &&
        (it.remark || '').trim() !== 'booking_offset_excess',
    )
    deductionRows.value = items.map((it) => ({
      uid: it.id || newDeductionUid(),
      description: it.description || '',
      quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
      unitAmount:
        Number(it.unitAmount) > 0
          ? Number(it.unitAmount)
          : Number(it.quantity) > 0
            ? Math.round((Number(it.amount) / Number(it.quantity)) * 100) / 100
            : Number(it.amount) || 0,
      returnStatus: it.returnStatus || (it.itemType === 'DAMAGE_DEDUCTION' ? 'damaged' : ''),
      remark: it.remark || '',
    }))
  } catch {
    /* keep header fields */
  }
}

function payloadFromForm(): VacateSettlementWritePayload {
  const deductionItems: VacateDeductionItemPayload[] = deductionRows.value
    .map((row, i) => {
      const description = row.description.trim()
      const quantity = Math.max(0, Number(row.quantity) || 0)
      const unitAmount = Math.max(0, Number(row.unitAmount) || 0)
      const amount = Math.round(quantity * unitAmount * 100) / 100
      if (!description || amount <= 0.009) return null
      return {
        description,
        quantity,
        unitAmount,
        amount,
        returnStatus: row.returnStatus || undefined,
        remark: row.remark.trim() || undefined,
        sortOrder: i,
      }
    })
    .filter((x): x is VacateDeductionItemPayload => Boolean(x))

  return {
    contractId: form.contractId.trim() || undefined,
    terminationDate: form.terminationDate || undefined,
    reason: form.reason.trim() || undefined,
    noticeAttachment: form.noticeAttachment.trim() || undefined,
    doorKeyReturnedQty: Math.max(0, Math.floor(Number(form.doorKeyReturnedQty) || 0)),
    smartCardReturnedQty: Math.max(0, Math.floor(Number(form.smartCardReturnedQty) || 0)),
    siteCondition: form.siteCondition.trim() || undefined,
    remark: form.remark.trim() || undefined,
    deductionItems,
  }
}

async function saveForm() {
  if (!editing.value && !form.contractId.trim()) {
    await alertBox(t('contractSettlement.contractRequired'))
    return
  }
  const incomplete = deductionRows.value.some((r) => {
    const touched =
      Boolean(r.description.trim()) ||
      (Number(r.quantity) || 0) !== 1 ||
      (Number(r.unitAmount) || 0) > 0 ||
      Boolean(r.returnStatus) ||
      Boolean(r.remark.trim())
    if (!touched) return false
    return !r.description.trim() || deductionSubtotal(r) <= 0.009
  })
  if (incomplete) {
    await alertBox(t('contractSettlement.deductionIncomplete'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      const { contractId: _cid, ...updatePayload } = payload
      await updateVacateSettlementApi(editing.value.id, updatePayload)
      await alertBox(t('contractSettlement.updatedVacate'), 'success')
    } else {
      await createVacateSettlementApi(payload)
      await alertBox(t('contractSettlement.createdVacate'), 'success')
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
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
  if (scope) void exportSettlementsXlsx(scope)
}

function downloadImportTemplate() {
  const example = settlementVacateIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'VacateSettlements')
  XLSX.writeFile(wb, 'vacate-settlements-import-template.xlsx')
  void alertBox(t('contractSettlement.templateDone'), 'success')
}

async function exportSettlementsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ContractSettlementRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    const vacateRows = rows.filter((r) => r.type === 'VACATE')
    if (!vacateRows.length) {
      await alertBox(t('contractSettlement.exportEmpty'))
      return
    }
    const sheetRows = vacateRows.map((r) => settlementVacateToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'VacateSettlements')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `vacate-settlements-${exportFileSuffix(scope)}-${day}.xlsx`)
    await alertBox(t('contractSettlement.exportDone', { n: vacateRows.length }), 'success')
  } catch {
    await alertBox(t('contractSettlement.importFailed'), 'error')
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
    await alertBox(t('contractSettlement.importAdminOnly'))
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
        message: t('contractSettlement.importEmpty'),
      })
      return
    }

    const payloads: SettlementVacateImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToSettlementVacateIoPayload(row, t)
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
    let processed = importState.current
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importVacateSettlementsApi(batch)
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
    failImport(t('contractSettlement.importFailed'))
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
      <h2>{{ t('menu.contractSettlements') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('contractSettlement.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="perms.create"
          v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('contractSettlement.createVacate') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button
            class="room-io-btn"
            :aria-label="t('contractSettlement.dataIo')"
            :loading="importing || exporting"
          >
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('contractSettlement.importVacate') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('contractSettlement.downloadTemplate') }}</span>
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
          :key="`${tableLayoutKey}-${codeLayoutKey}-${listActionColWidth}`"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
          scrollbar-always-on
          style="width: 100%"
          @row-click="onRowClick"
        >
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
              codeColW(t('contractSettlement.fields.settlementCode'), {
                interactive: true,
                samples: list.map((r) => r.settlementCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.settlementCode')"
                filterable
                sortable
                :options="settlementCodeFilterOptions"
                :model-value="filters.settlementCode || []"
                :sort-order="sortOrderOf('settlementCode')"
                @update:model-value="(v) => setFilter('settlementCode', v)"
                @update:sort-order="(v) => setSort('settlementCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.settlementCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('contractSettlement.fields.type'),
                typeOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.type')"
                filterable
                sortable
                :options="typeOptions"
                :model-value="filters.type || []"
                :sort-order="sortOrderOf('type')"
                @update:model-value="(v) => setFilter('type', v)"
                @update:sort-order="(v) => setSort('type', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="contractSettlementTypeTone(row.type)"
                :label="t(`contractSettlement.type.${row.type}`, row.type)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('contractSettlement.fields.refundStatus'),
                refundStatusOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.refundStatus')"
                filterable
                sortable
                :options="refundStatusOptions"
                :model-value="filters.refundStatus || []"
                :sort-order="sortOrderOf('refundStatus')"
                @update:model-value="(v) => setFilter('refundStatus', v)"
                @update:sort-order="(v) => setSort('refundStatus', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="contractSettlementRefundStatusTone(refundStatusOf(row))"
                :label="
                  t(
                    `contractSettlement.refundStatus.${refundStatusOf(row)}`,
                    refundStatusOf(row),
                  )
                "
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('contractSettlement.fields.collectStatus'),
                collectStatusOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.collectStatus')"
                filterable
                sortable
                :options="collectStatusOptions"
                :model-value="filters.collectStatus || []"
                :sort-order="sortOrderOf('collectStatus')"
                @update:model-value="(v) => setFilter('collectStatus', v)"
                @update:sort-order="(v) => setSort('collectStatus', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="contractSettlementCollectStatusTone(row.collectStatus)"
                :label="
                  t(
                    `contractSettlement.collectStatus.${row.collectStatus || 'none'}`,
                    row.collectStatus || 'none',
                  )
                "
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('contractSettlement.fields.contractCode'), {
                interactive: true,
                samples: list.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.contractCode')"
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
              textColW(t('contractSettlement.fields.customerName'), {
                interactive: true,
                kind: 'name',
              })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.customerName')"
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
              codeColW(t('contractSettlement.fields.roomCode'), {
                interactive: true,
                samples: list.map((r) => r.roomCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.roomCode')"
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
                @click.stop="relationDrawers?.openRoomSide(row.roomId)"
              >
                {{ row.roomCode || '—' }}
              </button>
              <template v-else>{{ row.roomCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.reason'), { interactive: true, contentMin: 120 })
            "
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.reason')"
                filterable
                sortable
                :options="reasonFilterOptions"
                :model-value="filters.reason || []"
                :sort-order="sortOrderOf('reason')"
                @update:model-value="(v) => setFilter('reason', v)"
                @update:sort-order="(v) => setSort('reason', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.type === 'VACATE' ? row.reason || '—' : '—' }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.doorKeyReturnedQty'), {
                interactive: true,
                contentMin: 72,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.doorKeyReturnedQty')"
                filterable
                sortable
                :options="doorKeyFilterOptions"
                :model-value="filters.doorKeyReturnedQty || []"
                :sort-order="sortOrderOf('doorKeyReturnedQty')"
                @update:model-value="(v) => setFilter('doorKeyReturnedQty', v)"
                @update:sort-order="(v) => setSort('doorKeyReturnedQty', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.type === 'VACATE' ? row.doorKeyReturnedQty ?? 0 : '—' }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.smartCardReturnedQty'), {
                interactive: true,
                contentMin: 72,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.smartCardReturnedQty')"
                filterable
                sortable
                :options="smartCardFilterOptions"
                :model-value="filters.smartCardReturnedQty || []"
                :sort-order="sortOrderOf('smartCardReturnedQty')"
                @update:model-value="(v) => setFilter('smartCardReturnedQty', v)"
                @update:sort-order="(v) => setSort('smartCardReturnedQty', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.type === 'VACATE' ? row.smartCardReturnedQty ?? 0 : '—' }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.itemCount'), { interactive: true, contentMin: 88 })
            "
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.itemCount')"
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
              <CountListPill :count="row.itemCount ?? 0" @click="openItemsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.writeoffCount'), {
                interactive: true,
                contentMin: 80,
              })
            "
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.writeoffCount')"
                filterable
                sortable
                :options="writeoffCountFilterOptions"
                :model-value="filters.writeoffCount || []"
                :sort-order="sortOrderOf('writeoffCount')"
                @update:model-value="(v) => setFilter('writeoffCount', v)"
                @update:sort-order="(v) => setSort('writeoffCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.writeoffCount ?? 0" @click="openWriteoffsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.refundOrderCount'), {
                interactive: true,
                contentMin: 80,
              })
            "
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.refundOrderCount')"
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
              <CountListPill :count="row.refundOrderCount ?? 0" @click="openRefundOrdersSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.refundDueTotal'), {
                interactive: true,
                contentMin: 100,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.refundDueTotal')"
                filterable
                sortable
                :options="refundDueFilterOptions"
                :model-value="filters.refundDueTotal || []"
                :sort-order="sortOrderOf('refundDueTotal')"
                @update:model-value="(v) => setFilter('refundDueTotal', v)"
                @update:sort-order="(v) => setSort('refundDueTotal', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.refundDueTotal) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.refundedTotal'), {
                interactive: true,
                contentMin: 100,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.refundedTotal')"
                filterable
                sortable
                :options="refundedFilterOptions"
                :model-value="filters.refundedTotal || []"
                :sort-order="sortOrderOf('refundedTotal')"
                @update:model-value="(v) => setFilter('refundedTotal', v)"
                @update:sort-order="(v) => setSort('refundedTotal', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.refundedTotal) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.refundRemaining'), {
                interactive: true,
                contentMin: 100,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.refundRemaining')"
                filterable
                sortable
                :options="refundRemainingFilterOptions"
                :model-value="filters.refundRemaining || []"
                :sort-order="sortOrderOf('refundRemaining')"
                @update:model-value="(v) => setFilter('refundRemaining', v)"
                @update:sort-order="(v) => setSort('refundRemaining', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(refundRemainingOf(row)) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.collectDueTotal'), {
                interactive: true,
                contentMin: 100,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.collectDueTotal')"
                filterable
                sortable
                :options="collectDueFilterOptions"
                :model-value="filters.collectDueTotal || []"
                :sort-order="sortOrderOf('collectDueTotal')"
                @update:model-value="(v) => setFilter('collectDueTotal', v)"
                @update:sort-order="(v) => setSort('collectDueTotal', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.collectDueTotal) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.collectedTotal'), {
                interactive: true,
                contentMin: 100,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.collectedTotal')"
                filterable
                sortable
                :options="collectedFilterOptions"
                :model-value="filters.collectedTotal || []"
                :sort-order="sortOrderOf('collectedTotal')"
                @update:model-value="(v) => setFilter('collectedTotal', v)"
                @update:sort-order="(v) => setSort('collectedTotal', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.collectedTotal) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.collectRemaining'), {
                interactive: true,
                contentMin: 100,
              })
            "
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.collectRemaining')"
                filterable
                sortable
                :options="collectRemainingFilterOptions"
                :model-value="filters.collectRemaining || []"
                :sort-order="sortOrderOf('collectRemaining')"
                @update:model-value="(v) => setFilter('collectRemaining', v)"
                @update:sort-order="(v) => setSort('collectRemaining', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(collectRemainingOf(row)) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              colW(t('contractSettlement.fields.terminationDate'), {
                interactive: true,
                contentMin: 108,
              })
            "
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractSettlement.fields.terminationDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('settlementDate')"
                :date-range-value="dateRangeOf('settlementDate')"
                @update:sort-order="(v) => setSort('settlementDate', v)"
                @update:date-range-value="(v) => setDateRange('settlementDate', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.terminationDate || row.settlementDate || '—' }}
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
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  :disabled="!canEditSettlement(row)"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="receiptPerms.create"
                  v-admin-glow="receiptPerms.codes.create"
                  type="button"
                  class="action-pill action-pill--accent"
                  :disabled="!canCollectPayment(row)"
                  :title="
                    canCollectPayment(row) ? undefined : t('contract.vacateReceivableSettledOk')
                  "
                  @click.stop="openCollectPayment(row)"
                >
                  {{ t('contract.receivePayment') }}
                </button>
                <button
                  v-if="refundPerms.update"
                  v-admin-glow="refundPerms.codes.update"
                  type="button"
                  class="action-pill action-pill--accent"
                  :disabled="!canProcessRefund(row)"
                  @click.stop="openRefund(row)"
                >
                  {{ t('contractSettlement.processRefund') }}
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
    </div>

    <TablePagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="pageSizes"
    />

    <ContractSettlementDetailDrawer
      v-model="drawerVisible"
      :record="current"
      :desktop-direction="detailDirection"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
      @open-refund-orders="openRefundOrdersSide"
    />
    <RelatedWriteoffsDrawer
      v-model="relatedWriteoffsVisible"
      :settlement-id="relatedListSettlement?.id"
      :title-context="relatedListSettlement?.settlementCode || ''"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
    />
    <RelatedRefundOrdersDrawer
      v-model="relatedRefundOrdersVisible"
      :settlement-id="relatedListSettlement?.id"
      :title-context="relatedListSettlement?.settlementCode || ''"
      @open-refund-order="openRefundOrderSide"
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
      @open-cash-flow="openCashFlowSide"
    />
    <CashFlowDetailDrawer
      v-model="cashFlowDrawer"
      :record="cashFlowRecord"
      desktop-direction="ltr"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id)"
      @open-refund-order="(id) => relationDrawers?.openRefundOrderSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <ContractSettlementRefundDialog
      v-model="refundDialogVisible"
      :settlement="refundSettlement"
      @done="onRefundDone"
      @open-refund-order="openRefundOrderFromRefundDialog"
    />

    <ContractReceivePaymentDialog
      v-model="receivePayVisible"
      :contract="receivePayContract"
      :z-index="receivePayZIndex"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: receivePayZIndex })"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id, 'ltr', { zIndex: receivePayZIndex })"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id, { zIndex: receivePayZIndex })"
      @open-receipts="openReceiptsFromReceivePay"
      @collected="onReceivePayCollected"
    />
    <RelatedReceiptsDrawer
      v-model="relatedReceiptsVisible"
      :contract="relatedReceiptsContract"
      desktop-direction="ltr"
      :z-index="relatedReceiptsZIndex"
      @open-receipt="(r) => relationDrawers?.openReceiptSide(r.id, { zIndex: relatedReceiptsZIndex })"
      @open-receipt-by-id="(id) => relationDrawers?.openReceiptSide(id, { zIndex: relatedReceiptsZIndex })"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id, { zIndex: relatedReceiptsZIndex })"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: relatedReceiptsZIndex })"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id, { zIndex: relatedReceiptsZIndex })"
    />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('contractSettlement.editVacate') : t('contractSettlement.createVacate')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog vacate-edit-dialog"
    >
      <div class="vacate-dlg">
        <section class="vacate-dlg__section">
          <div class="vacate-dlg__section-head">
            <span class="vacate-dlg__step">1</span>
            <h4>{{ t('contractSettlement.formSections.basic') }}</h4>
          </div>
          <el-form label-position="top" class="vacate-form">
            <div class="form-grid">
              <el-form-item
                :label="t('contractSettlement.fields.contractCode')"
                required
                class="span-2"
              >
                <SelectWithViewAction
                  clearable
                  :disabled="!form.contractId || !!editing"
                  @view="relationDrawers?.openContractSide(form.contractId)"
                >
                  <el-select
                    v-model="form.contractId"
                    filterable
                    remote
                    reserve-keyword
                    clearable
                    value-on-clear=""
                    fit-input-width
                    style="width: 100%"
                    popper-class="vacate-contract-select-popper"
                    :placeholder="t('contractSettlement.fields.contractCode')"
                    :disabled="!!editing"
                    :remote-method="searchContractRemote"
                    :loading="contractSelectLoading"
                    @visible-change="onContractSelectVisible"
                  >
                    <el-option
                      v-for="opt in contractSelectOptions"
                      :key="opt.id"
                      :label="`${opt.contractCode} · ${opt.customerName} · ${opt.roomCode}`"
                      :value="opt.id"
                      :title="`${opt.contractCode} · ${opt.customerName} · ${opt.roomCode}`"
                    >
                      <span
                        class="select-option-ellipsis"
                        :title="`${opt.contractCode} · ${opt.customerName} · ${opt.roomCode}`"
                      >
                        {{ opt.contractCode }} · {{ opt.customerName }} · {{ opt.roomCode }}
                      </span>
                    </el-option>
                    <template #empty>
                      <div class="vacate-select-empty">{{ t('common.noData') }}</div>
                    </template>
                  </el-select>
                </SelectWithViewAction>
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.customerName')">
                <SelectWithViewAction
                  control="input"
                  :disabled="!selectedContractDisplay.customerId"
                  @view="relationDrawers?.openCustomerSide(selectedContractDisplay.customerId)"
                >
                  <el-input :model-value="selectedContractDisplay.customerName" disabled />
                </SelectWithViewAction>
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.roomCode')">
                <SelectWithViewAction
                  control="input"
                  :disabled="!selectedContractDisplay.roomId"
                  @view="relationDrawers?.openRoomSide(selectedContractDisplay.roomId)"
                >
                  <el-input :model-value="selectedContractDisplay.roomCode" disabled />
                </SelectWithViewAction>
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.terminationDate')">
                <el-date-picker
                  v-model="form.terminationDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.reason')">
                <el-input v-model="form.reason" clearable />
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.noticeAttachment')" class="span-2">
                <AttachmentField v-model="form.noticeAttachment" />
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section class="vacate-dlg__section">
          <div class="vacate-dlg__section-head">
            <span class="vacate-dlg__step">2</span>
            <h4>{{ t('contractSettlement.formSections.keysSite') }}</h4>
          </div>
          <el-form label-position="top" class="vacate-form">
            <div class="form-grid">
              <el-form-item :label="t('contractSettlement.fields.doorKeyReturnedQty')">
                <el-input-number
                  v-model="form.doorKeyReturnedQty"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.smartCardReturnedQty')">
                <el-input-number
                  v-model="form.smartCardReturnedQty"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.siteCondition')" class="span-2">
                <el-input v-model="form.siteCondition" type="textarea" :rows="2" resize="none" />
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section class="vacate-dlg__section">
          <div class="vacate-dlg__section-head vacate-dlg__section-head--with-action">
            <div class="vacate-dlg__section-head-main">
              <span class="vacate-dlg__step">3</span>
              <h4>{{ t('contractSettlement.formSections.deductions') }}</h4>
              <el-button
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="vacate-dlg__add-btn"
                @click="addDeductionRow"
              >
                {{ t('contractSettlement.addDeduction') }}
              </el-button>
            </div>
            <div v-if="showDeductionPager" class="vacate-deduction-pager-wrap">
              <el-pagination
                v-model:current-page="deductionPage"
                :page-size="DEDUCTION_PAGE_SIZE"
                :total="deductionRows.length"
                layout="total, prev, pager, next"
                small
                background
                class="vacate-deduction-pager"
              />
            </div>
          </div>
          <div class="vacate-deduction-table-wrap">
            <div
              class="period-table vacate-deduction-table"
              role="table"
              :style="{ '--period-page-size': DEDUCTION_PAGE_SIZE }"
            >
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
                <div class="period-table__cell vacate-deduction-table__cell--desc" role="columnheader">
                  <span class="req">*</span>{{ t('contractSettlement.fields.deductionDesc') }}
                </div>
                <div class="period-table__cell vacate-deduction-table__cell--qty" role="columnheader">
                  <span class="req">*</span>{{ t('contractSettlement.fields.quantity') }}
                </div>
                <div class="period-table__cell vacate-deduction-table__cell--unit" role="columnheader">
                  <span class="req">*</span>{{ t('contractSettlement.fields.unitAmount') }}
                </div>
                <div class="period-table__cell vacate-deduction-table__cell--sub" role="columnheader">
                  {{ t('contractSettlement.fields.deductionSubtotal') }}
                </div>
                <div class="period-table__cell vacate-deduction-table__cell--status" role="columnheader">
                  {{ t('contractSettlement.fields.returnStatus') }}
                </div>
                <div class="period-table__cell vacate-deduction-table__cell--remark" role="columnheader">
                  {{ t('contractSettlement.fields.remark') }}
                </div>
                <div
                  class="period-table__cell vacate-deduction-table__cell--actions"
                  role="columnheader"
                ></div>
              </div>
              <div
                class="period-table__body"
                :class="{ 'period-table__body--fixed': showDeductionPager }"
              >
                <div
                  v-for="{ row, index } in pagedDeductions"
                  :key="row.uid"
                  class="period-table__row"
                  role="row"
                  :class="{
                    'is-dragging': dragDeductionUid === row.uid,
                    'is-drag-over': dragOverDeductionUid === row.uid,
                    'is-editing-index': editingDeductionIndexUid === row.uid,
                  }"
                  @dragover="onDeductionDragOver(row.uid, $event)"
                  @drop="onDeductionDrop(row.uid, $event)"
                  @dragleave="dragOverDeductionUid === row.uid && (dragOverDeductionUid = null)"
                >
                  <div
                    class="period-table__cell period-table__cell--index"
                    :class="{ 'is-editing-index': editingDeductionIndexUid === row.uid }"
                    role="cell"
                  >
                    <button
                      type="button"
                      class="period-row__handle"
                      draggable="true"
                      :title="t('contract.dragLoanItem')"
                      aria-label="drag"
                      @dragstart="onDeductionDragStart(row.uid, $event)"
                      @dragend="onDeductionDragEnd"
                    >
                      <el-icon :size="14"><Rank /></el-icon>
                    </button>
                    <input
                      v-if="editingDeductionIndexUid === row.uid"
                      ref="deductionIndexInputRef"
                      :value="editingDeductionIndexDraft"
                      class="period-row__index-input"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="4"
                      :aria-label="t('contract.editLoanItemIndex')"
                      @input="
                        editingDeductionIndexDraft = ($event.target as HTMLInputElement).value.replace(
                          /\D/g,
                          '',
                        )
                      "
                      @keydown="onDeductionIndexKeydown"
                      @blur="commitEditDeductionIndex"
                    />
                    <button
                      v-else
                      type="button"
                      class="period-row__index"
                      :title="t('contract.editLoanItemIndexHint')"
                      @dblclick.stop="startEditDeductionIndex(row.uid, index)"
                    >
                      {{ index + 1 }}
                    </button>
                  </div>
                  <div class="period-table__cell vacate-deduction-table__cell--desc" role="cell">
                    <el-input
                      v-model="row.description"
                      :placeholder="t('contractSettlement.fields.deductionDesc')"
                    />
                  </div>
                  <div class="period-table__cell vacate-deduction-table__cell--qty" role="cell">
                    <el-input-number
                      v-model="row.quantity"
                      :min="0"
                      :precision="2"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell vacate-deduction-table__cell--unit" role="cell">
                    <el-input-number
                      v-model="row.unitAmount"
                      :min="0"
                      :precision="2"
                      :step="100"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell vacate-deduction-table__cell--sub" role="cell">
                    {{ formatMoney(deductionSubtotal(row)) }}
                  </div>
                  <div class="period-table__cell vacate-deduction-table__cell--status" role="cell">
                    <el-select
                      v-model="row.returnStatus"
                      clearable
                      value-on-clear=""
                      :teleported="false"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="opt in returnStatusOptions"
                        :key="opt.value || 'none'"
                        :label="opt.label"
                        :value="opt.value"
                      />
                    </el-select>
                  </div>
                  <div class="period-table__cell vacate-deduction-table__cell--remark" role="cell">
                    <el-input
                      v-model="row.remark"
                      :placeholder="t('contractSettlement.fields.remark')"
                    />
                  </div>
                  <div class="period-table__cell vacate-deduction-table__cell--actions" role="cell">
                    <el-button type="danger" link :icon="Delete" @click="removeDeductionRow(index)" />
                  </div>
                </div>
                <div v-if="!deductionRows.length" class="vacate-deduction-table__empty">
                  {{ t('contractSettlement.noDeductions') }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="vacate-dlg__section">
          <div class="vacate-dlg__section-head">
            <span class="vacate-dlg__step">4</span>
            <h4>{{ t('contractSettlement.formSections.remark') }}</h4>
          </div>
          <el-form label-position="top" class="vacate-form">
            <el-form-item :label="t('contractSettlement.fields.remark')">
              <el-input v-model="form.remark" type="textarea" :rows="2" resize="none" />
            </el-form-item>
          </el-form>
        </section>
      </div>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          v-if="editing ? perms.update : perms.create"
          v-admin-glow="editing ? perms.codes.update : perms.codes.create"
          type="primary"
          class="lb-btn-primary"
          @click="saveForm"
        >
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
  </div>
</template>

<style scoped>
.room-io-file {
  display: none;
}
.vacate-dlg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vacate-dlg__section {
  margin-bottom: 14px;
}
.vacate-dlg__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 10px;
}
.vacate-dlg__section-head h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
  color: #1f2a24;
}
.vacate-dlg__section-head--with-action {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.vacate-dlg__section-head-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.vacate-dlg__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #0f4a32;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}
.vacate-dlg__add-btn {
  margin-left: 2px;
}
.vacate-form .form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.vacate-form .span-2 {
  grid-column: 1 / -1;
}
.vacate-form :deep(.el-input-number) {
  width: 100%;
}
.vacate-form :deep(.el-input-number.is-controls-right .el-input__wrapper) {
  padding-right: 36px;
}
.vacate-deduction-pager-wrap {
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
.vacate-deduction-pager.el-pagination {
  --el-pagination-button-bg-color: #fff;
  --el-pagination-hover-color: var(--lb-brand, #0f4a32);
  --el-pagination-button-color: #4a5c54;
  font-weight: 600;
  gap: 2px;
}
.vacate-deduction-pager :deep(.el-pagination__total) {
  margin-right: 4px;
  color: #4a5c54;
  font-size: 0.78rem;
  font-weight: 650;
}
.vacate-deduction-pager :deep(.btn-prev),
.vacate-deduction-pager :deep(.btn-next),
.vacate-deduction-pager :deep(.el-pager li) {
  min-width: 26px !important;
  height: 26px !important;
  line-height: 26px !important;
  border-radius: 7px !important;
  margin: 0 2px !important;
}
.vacate-deduction-pager :deep(.el-pager li.is-active) {
  background: var(--lb-brand, #0f4a32) !important;
  color: #fff !important;
  font-weight: 700;
}
.vacate-deduction-pager :deep(.btn-prev:hover:not(:disabled)),
.vacate-deduction-pager :deep(.btn-next:hover:not(:disabled)),
.vacate-deduction-pager :deep(.el-pager li:hover:not(.is-active)) {
  color: var(--lb-brand, #0f4a32);
}
.vacate-deduction-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e4ebe6;
  border-radius: 8px;
  background: #fff;
}
.vacate-deduction-table.period-table {
  --period-row-h: 44px;
  --period-page-size: 5;
  display: grid;
  min-width: 920px;
}
.vacate-deduction-table.period-table .period-table__head,
.vacate-deduction-table.period-table .period-table__row {
  display: grid;
  grid-template-columns:
    52px
    minmax(120px, 1.4fr)
    112px
    120px
    84px
    118px
    minmax(100px, 1fr)
    40px;
  align-items: center;
  column-gap: 6px;
  padding: 0 8px;
}
.period-table__head {
  min-height: 34px;
  background: #f4f7f5;
  border-bottom: 1px solid #e4ebe6;
  color: #3d4f45;
  font-size: 0.78rem;
  font-weight: 700;
}
.period-table__head .req {
  color: #e35d5d;
  margin-right: 2px;
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
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 35%, #fff);
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
.vacate-deduction-table .period-table__row .vacate-deduction-table__cell--sub {
  justify-content: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #3d4f45;
}
.vacate-deduction-table__cell--actions {
  justify-content: center;
}
.vacate-deduction-table__empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--lb-muted, #6a7a70);
  font-size: 0.84rem;
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
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  color: var(--lb-brand, #0f4a32);
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
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  color: var(--lb-brand, #0f4a32);
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
.vacate-select-empty {
  padding: 10px 12px;
  color: #7a8a80;
  font-size: 0.88rem;
}
.select-option-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 720px) {
  .vacate-form .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
/* 退租结算弹窗：小屏更高占用，大屏略收（对齐退租办理） */
.vacate-edit-dialog.el-dialog {
  max-width: calc(100vw - 32px);
}
@media (max-height: 900px) {
  .vacate-edit-dialog.el-dialog {
    margin-top: 3vh !important;
  }
}
</style>
