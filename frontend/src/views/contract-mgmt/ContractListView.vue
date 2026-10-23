<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, Download, Plus, Rank, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createContractApi,
  deleteContractApi,
  batchDeleteContractsApi,
  fetchContract,
  fetchContracts,
  importContractsApi,
  updateContractApi,
} from '@/api/contracts'
import type { ContractListQuery } from '@/api/contracts'
import { fetchCustomers } from '@/api/customers'
import { fetchCustomerRequirements } from '@/api/customer-requirements'
import { fetchRoom, fetchRooms } from '@/api/rooms'
import { fetchUsers } from '@/api/users'
import { fetchContractConfigs } from '@/api/contract-configs'
import type { ContractPeriodRecord, ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import type { ReceivableRecord } from '@/types/receivable'
import type { ReceiptRecord } from '@/types/receipt'
import type { ContractPeriodListRecord } from '@/types/contract-period'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import {
  CONTRACT_PAYMENT_CYCLES,
  CONTRACT_PERIOD_UNITS,
  CONTRACT_STATUSES,
} from '@/types/contract'
import type { ContractConfigOption } from '@/types/contract-config'
import { KEY_DEPOSIT_CODES } from '@/types/contract-config'
import type { CustomerRecord } from '@/types/customer'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import type { RoomRecord } from '@/types/room'
import type { UserRecord } from '@/types/user'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ContractDetailDrawer from '@/components/ContractDetailDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedReceivablesDrawer from '@/components/RelatedReceivablesDrawer.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import RelatedPeriodsDrawer from '@/components/RelatedPeriodsDrawer.vue'
import RelatedTerminationsDrawer from '@/components/RelatedTerminationsDrawer.vue'
import RelatedOtherFeesDrawer from '@/components/RelatedOtherFeesDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import CountListPill from '@/components/CountListPill.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { contractStatusTone } from '@/constants/statusBadges'
import { useActionColWidth, measureActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useImportProgress } from '@/composables/useImportProgress'
import { useUserStore } from '@/stores/user'
import { useBuildingScopeStore } from '@/stores/buildingScope'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { formatDateTime, formatMoney } from '@/utils/format'
import {
  contractIoPayloadToImportItem,
  contractIoTemplateExampleRow,
  contractToIoRow,
  rowToContractIoPayload,
} from '@/utils/contractExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { previewAgreementPdfApi, prefetchAgreementPdfApi, previewAgreementDraftPdfApi } from '@/api/document-templates'

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const buildingScope = useBuildingScopeStore()
const perms = useResourcePermissions('contracts')
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

const contractActionColWidth = computed(() => {
  void locale.value
  if (perms.canEditOrDelete.value) {
    return Math.max(
      actionColWidth.value.three,
      measureActionColWidth([
        t('contract.printAgreement'),
        t('common.edit'),
        t('common.delete'),
      ]),
    )
  }
  return Math.max(
    actionColWidth.value.one,
    measureActionColWidth([t('contract.printAgreement')]),
  )
})

const printingAgreementId = ref<string | null>(null)
const previewingDraft = ref(false)

async function onPrintAgreement(row: ContractRecord) {
  if (!row?.id || printingAgreementId.value) return
  printingAgreementId.value = row.id
  try {
    await previewAgreementPdfApi(row.id, { autoPrint: false })
    ElMessage.success(t('contract.printAgreementPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.printAgreementFailed')
    ElMessage.error(msg)
  } finally {
    printingAgreementId.value = null
  }
}

/** 编辑弹窗预览：使用当前表单（含未保存修改） */
async function onPreviewAgreementDraft() {
  const row = editing.value
  if (!row?.id || previewingDraft.value) return
  if (!form.roomId.trim()) {
    ElMessage.warning(t('contract.roomRequired'))
    return
  }
  if (!form.customerId.trim()) {
    ElMessage.warning(t('contract.customerRequired'))
    return
  }
  previewingDraft.value = true
  try {
    const payload = payloadFromForm()
    await previewAgreementDraftPdfApi(row.id, {
      contractCode: payload.contractCode || row.contractCode,
      roomId: payload.roomId,
      customerId: payload.customerId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      leaseType: payload.leaseType,
      paymentCycle: payload.paymentCycle,
      monthlyRent: payload.monthlyRent,
      roomDeposit: payload.roomDeposit,
      bookingDeposit: payload.bookingDeposit,
      miscDeposit: payload.miscDeposit,
      electricityRate: payload.electricityRate,
      doorKeyQty: payload.doorKeyQty,
      mailboxKeyQty: payload.mailboxKeyQty,
      roomNameText: payload.roomNameText,
      remark: payload.remark,
      periods: payload.periods,
    })
    ElMessage.success(t('contract.printAgreementPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.printAgreementFailed')
    ElMessage.error(msg)
  } finally {
    previewingDraft.value = false
  }
}

const formVisible = ref(false)
const editing = ref<ContractRecord | null>(null)
const roomSelectOptions = ref<RoomRecord[]>([])
/** 僅首屏 / 搜尋重置時驅動 el-select loading，追加加載不用，避免下拉閃動 */
const roomSelectLoading = ref(false)
const roomSelectLoadingMore = ref(false)
const customerSelectOptions = ref<CustomerRecord[]>([])
const customerSelectLoading = ref(false)
const customerSelectLoadingMore = ref(false)
const users = ref<UserRecord[]>([])
const customerRequirements = ref<CustomerRequirementRecord[]>([])
const periodTypeOptions = ref<ContractConfigOption[]>([])
const leaseTypeOptions = ref<ContractConfigOption[]>([])
const keyDepositOptions = ref<ContractConfigOption[]>([])
const keyword = ref('')
/** 下拉無限滾動：首屏 / 每次追加條數 */
const SELECT_PAGE_SIZE = 20
const roomSelectPage = ref(1)
const roomSelectHasMore = ref(true)
const roomSelectKeyword = ref('')
const customerSelectPage = ref(1)
const customerSelectHasMore = ref(true)
const customerSelectKeyword = ref('')
let roomSelectScrollEl: HTMLElement | null = null
let customerSelectScrollEl: HTMLElement | null = null
let roomSelectScrollHandler: ((e: Event) => void) | null = null
let customerSelectScrollHandler: ((e: Event) => void) | null = null

const doorKeyUnitPrice = computed(() => {
  const hit = keyDepositOptions.value.find((o) => o.code === KEY_DEPOSIT_CODES.door)
  return hit?.unitPrice ?? 0
})
const mailboxKeyUnitPrice = computed(() => {
  const hit = keyDepositOptions.value.find((o) => o.code === KEY_DEPOSIT_CODES.mailbox)
  return hit?.unitPrice ?? 0
})

const drawerVisible = ref(false)
const current = ref<ContractRecord | null>(null)
const contractDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)

// 相关记录抽屉
const relatedInvoicesDrawerVisible = ref(false)
const relatedReceivablesDrawerVisible = ref(false)
const relatedReceiptsDrawerVisible = ref(false)
const relatedPeriodsDrawerVisible = ref(false)
const relatedTerminationsDrawerVisible = ref(false)
const relatedOtherFeesDrawerVisible = ref(false)
const relatedDepositDeductionsDrawerVisible = ref(false)
const relatedDepositRefundsDrawerVisible = ref(false)
const relatedInvoicesContract = ref<ContractRecord | null>(null)
const relatedReceivablesContract = ref<ContractRecord | null>(null)
const relatedReceiptsContract = ref<ContractRecord | null>(null)
const relatedPeriodsContract = ref<ContractRecord | null>(null)
const relatedTerminationsContract = ref<ContractRecord | null>(null)
const relatedOtherFeesContract = ref<ContractRecord | null>(null)
const relatedDepositDeductionsContract = ref<ContractRecord | null>(null)
const relatedDepositRefundsContract = ref<ContractRecord | null>(null)

const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  dateRanges,
  sortOrderOf,
  clearAll,
  sortKey,
  sortOrder,
} = useTableSortFilter<ContractRecord>()

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
} = useServerPagedList<ContractRecord, ContractListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const start = range('startDate')
    const end = range('endDate')
    const created = range('createdAt')
    return {
      keyword: kw,
      buildingIds: f.buildingId?.length ? [...f.buildingId] : undefined,
      statuses: f.status?.length ? [...f.status] : undefined,
      roomCodes: f.roomCode?.length ? [...f.roomCode] : undefined,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      salesManagers: f.salesManager?.length ? [...f.salesManager] : undefined,
      leaseTypes: f.leaseType?.length ? [...f.leaseType] : undefined,
      paymentCycles: f.paymentCycle?.length ? [...f.paymentCycle] : undefined,
      sortBy,
      sortDir,
      startDateFrom: start.from,
      startDateTo: start.to,
      endDateFrom: end.from,
      endDateTo: end.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchContracts,
})

const tableHeaderConditionCount = computed(() => {
  let n = 0
  for (const selected of Object.values(filters)) {
    if (selected?.length) n += 1
  }
  for (const range of Object.values(dateRanges)) {
    if (range?.[0] && range?.[1]) n += 1
  }
  if (sortKey.value && sortOrder.value) n += 1
  return n
})

function onClearTableHeaderFilters() {
  onClearFilters()
}

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ContractRecord>()
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteContractsApi(chunk), setBatchProgress)
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
  CONTRACT_STATUSES.map((s) => ({
    value: s,
    label: t(`contract.status.${s}`),
  })),
)

const roomCodeFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const r of list.value) {
    const code = r.roomCode?.trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    opts.push({ value: code, label: code })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const c of list.value) {
    const name = c.customerName?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const salesManagerFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const u of users.value) {
    const label = userLabel(u)
    if (!label || seen.has(label)) continue
    seen.add(label)
    opts.push({ value: label, label })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const leaseTypeFilterOptions = computed(() =>
  leaseTypeOptions.value
    .map((o) => o.label.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map((label) => ({ value: label, label })),
)

const paymentCycleFilterOptions = computed(() =>
  CONTRACT_PAYMENT_CYCLES.map((s) => ({
    value: s,
    label: s,
  })),
)

function userLabel(u: UserRecord) {
  return u.displayName?.trim() || u.account
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '900px'))

type PeriodFormRow = Pick<
  ContractPeriodRecord,
  'dateType' | 'dateUnit' | 'dateValue' | 'startDate' | 'endDate'
> & { uid: string }

function newPeriodUid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultPeriodRow(): PeriodFormRow {
  const first = periodTypeOptions.value[0]?.label || '使用期'
  return {
    uid: newPeriodUid(),
    dateType: first,
    dateUnit: '月',
    dateValue: 12,
    startDate: '',
    endDate: '',
  }
}

const periods = ref<PeriodFormRow[]>([defaultPeriodRow()])

const emptyForm = () => ({
  contractCode: '',
  roomId: '',
  customerId: '',
  salesManagerId: '' as string,
  requirementId: '' as string,
  startDate: '',
  endDate: '',
  actualEndDate: '',
  leaseType: '',
  occupancyMode: 'whole' as 'whole' | 'part',
  partLabel: '',
  status: CONTRACT_STATUSES[0],
  roomDeposit: null as number | null,
  monthlyRent: null as number | null,
  bookingDeposit: null as number | null,
  paymentCycle: CONTRACT_PAYMENT_CYCLES[0],
  electricityRate: null as number | null,
  miscDeposit: null as number | null,
  doorKeyQty: 0,
  mailboxKeyQty: 0,
  roomNameText: '',
  subleaseMark: '',
  attachment: '',
  remark: '',
})

const form = reactive(emptyForm())

const selectedRoom = computed(() =>
  roomSelectOptions.value.find((r) => r.id === form.roomId.trim()) || null,
)

const roomPartOptions = computed(() => {
  const room = selectedRoom.value
  if (!room) return [] as { label: string; value: string; disabled: boolean }[]
  if (room.leaseCapability !== 'flexible') return []
  const labels = room.splitLabels?.length ? room.splitLabels : ['A', 'B']
  const occupied = new Set(
    (room.occupancy?.slots || []).filter((s) => s.occupied).map((s) => s.label),
  )
  // 編輯時當前份位仍可選
  const current = form.partLabel.trim().toUpperCase()
  return labels.map((label) => ({
    label,
    value: label,
    disabled: occupied.has(label) && label !== current,
  }))
})

const canWholeLease = computed(() => {
  const room = selectedRoom.value
  if (!room) return true
  // 只能整租 / 只能分租（独立后缀房）均按整间占用
  if (room.occupancy?.wholeOccupied && !editing.value) return false
  if (room.occupancy?.slots?.some((s) => s.occupied) && !editing.value) return false
  return true
})

const canPartLease = computed(() => {
  const room = selectedRoom.value
  if (!room) return true
  // 仅可整可分可在同一房间内选 A/B/C
  return room.leaseCapability === 'flexible'
})

const computedDoorKeyDeposit = computed(() =>
  Math.round((Number(form.doorKeyQty) || 0) * doorKeyUnitPrice.value * 100) / 100,
)
const computedMailboxKeyDeposit = computed(() =>
  Math.round((Number(form.mailboxKeyQty) || 0) * mailboxKeyUnitPrice.value * 100) / 100,
)

function roomOptionLabel(r: Pick<RoomRecord, 'roomCode' | 'name' | 'buildingName'>) {
  const parts = [r.roomCode]
  if (r.name?.trim()) parts.push(r.name)
  // 全局已篩選某一大廈時，下拉無需再重複顯示所屬大廈
  if (!buildingScope.selectedId && r.buildingName?.trim()) parts.push(r.buildingName)
  return parts.join(' · ')
}

function customerOptionLabel(c: Pick<CustomerRecord, 'customerCode' | 'name'>) {
  return `${c.customerCode} · ${c.name}`
}

function seedRoomOption(row: ContractRecord): RoomRecord | null {
  if (!row.roomId) return null
  return {
    id: row.roomId,
    roomCode: row.roomCode || row.roomId,
    name: row.roomName || row.roomNameText || '',
    buildingId: row.buildingId || '',
    buildingName: row.buildingName || '',
  } as RoomRecord
}

function seedCustomerOption(row: ContractRecord): CustomerRecord | null {
  if (!row.customerId) return null
  return {
    id: row.customerId,
    customerCode: row.customerCode || row.customerId,
    name: row.customerName || row.customerId,
    buildingId: row.buildingId,
  } as CustomerRecord
}

function keepSelectedInOptions<T extends { id: string }>(
  items: T[],
  selectedId: string,
  current: T[],
): T[] {
  if (!selectedId || items.some((x) => x.id === selectedId)) return items
  const keep = current.find((x) => x.id === selectedId)
  return keep ? [keep, ...items] : items
}

/** 追加去重：原地 push，避免替換數組引用導致下拉重繪閃動 */
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

async function loadRoomsPage(reset: boolean) {
  if (reset) {
    if (roomSelectLoading.value) return
    roomSelectLoading.value = true
  } else {
    if (roomSelectLoading.value || roomSelectLoadingMore.value || !roomSelectHasMore.value) return
    roomSelectLoadingMore.value = true
  }
  const page = reset ? 1 : roomSelectPage.value
  const scrollEl = roomSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchRooms({
      keyword: roomSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    if (reset) {
      roomSelectOptions.value = keepSelectedInOptions(
        data.items,
        form.roomId.trim(),
        roomSelectOptions.value,
      )
    } else {
      appendUniqueById(roomSelectOptions.value, data.items)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    roomSelectPage.value = page + 1
    roomSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      roomSelectOptions.value = keepSelectedInOptions(
        [],
        form.roomId.trim(),
        roomSelectOptions.value,
      )
      roomSelectHasMore.value = false
    }
  } finally {
    if (reset) roomSelectLoading.value = false
    else roomSelectLoadingMore.value = false
  }
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
    const bid = buildingScope.selectedId
    const pageItems = bid ? data.items.filter((c) => c.buildingId === bid) : data.items
    if (reset) {
      customerSelectOptions.value = keepSelectedInOptions(
        pageItems,
        form.customerId.trim(),
        customerSelectOptions.value,
      )
    } else {
      appendUniqueById(customerSelectOptions.value, pageItems)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    customerSelectPage.value = page + 1
    customerSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
    if (bid && customerSelectHasMore.value && pageItems.length === 0) {
      // 本頁全被濾掉但後端還有資料 → 自動續拉，避免滾動空白
      customerSelectLoadingMore.value = false
      await loadCustomersPage(false)
      return
    }
  } catch {
    if (reset) {
      customerSelectOptions.value = keepSelectedInOptions(
        [],
        form.customerId.trim(),
        customerSelectOptions.value,
      )
      customerSelectHasMore.value = false
    }
  } finally {
    if (reset) customerSelectLoading.value = false
    else customerSelectLoadingMore.value = false
  }
}

/** 遠程搜尋（輸入關鍵字時重置分頁） */
function searchRoomsRemote(query: string) {
  roomSelectKeyword.value = query.trim()
  roomSelectHasMore.value = true
  void loadRoomsPage(true)
}

function searchCustomersRemote(query: string) {
  customerSelectKeyword.value = query.trim()
  customerSelectHasMore.value = true
  void loadCustomersPage(true)
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

async function onRoomSelectVisible(open: boolean) {
  unbindSelectScroll(roomSelectScrollEl, roomSelectScrollHandler)
  roomSelectScrollEl = null
  roomSelectScrollHandler = null
  if (!open) return
  roomSelectKeyword.value = ''
  roomSelectHasMore.value = true
  await loadRoomsPage(true)
  const bound = await attachSelectScroll('contract-room-select-popper', () => {
    void loadRoomsPage(false)
  })
  roomSelectScrollEl = bound.el
  roomSelectScrollHandler = bound.handler
}

async function onCustomerSelectVisible(open: boolean) {
  unbindSelectScroll(customerSelectScrollEl, customerSelectScrollHandler)
  customerSelectScrollEl = null
  customerSelectScrollHandler = null
  if (!open) return
  customerSelectKeyword.value = ''
  customerSelectHasMore.value = true
  await loadCustomersPage(true)
  const bound = await attachSelectScroll('contract-customer-select-popper', () => {
    void loadCustomersPage(false)
  })
  customerSelectScrollEl = bound.el
  customerSelectScrollHandler = bound.handler
}

const requirementSelectOptions = computed(() => {
  const cid = form.customerId.trim()
  if (!cid) return []
  const base = customerRequirements.value.filter((r) => r.customerId === cid)
  const currentId = form.requirementId.trim()
  if (currentId && !base.some((r) => r.id === currentId)) {
    const hit =
      editing.value?.requirementId === currentId
        ? editing.value
        : list.value.find((c) => c.requirementId === currentId)
    if (hit?.requirementCode) {
      return [
        {
          id: currentId,
          requirementCode: hit.requirementCode,
          customerId: cid,
        } as CustomerRequirementRecord,
        ...base,
      ]
    }
  }
  return base
})

async function loadRequirementsForCustomer(customerId: string) {
  if (!customerId.trim()) {
    customerRequirements.value = []
    return
  }
  try {
    const { data } = await fetchCustomerRequirements({ customerId })
    customerRequirements.value = data.items
  } catch {
    customerRequirements.value = []
  }
}

watch(
  () => form.customerId,
  async (cid, prev) => {
    if (cid !== prev) form.requirementId = ''
    await loadRequirementsForCustomer(cid)
  },
)

function onRoomSelectChange(roomId: string) {
  const room = roomSelectOptions.value.find((r) => r.id === roomId)
  if (!room) return
  form.roomNameText = room.name || ''
  if (form.monthlyRent == null) form.monthlyRent = room.monthlyRent ?? null
  if (room.leaseCapability === 'whole_only' || room.leaseCapability === 'part_only') {
    form.occupancyMode = 'whole'
    form.partLabel = ''
    form.subleaseMark = ''
    return
  }
  if (room.occupancy?.wholeOccupied || room.occupancy?.slots?.some((s) => s.occupied)) {
    form.occupancyMode = 'part'
    const free = (room.splitLabels || ['A', 'B']).find(
      (label) => !(room.occupancy?.slots || []).some((s) => s.label === label && s.occupied),
    )
    form.partLabel = free || ''
    form.subleaseMark = form.partLabel
  } else {
    form.occupancyMode = 'whole'
    form.partLabel = ''
    form.subleaseMark = ''
  }
}

watch(
  () => [form.occupancyMode, form.partLabel] as const,
  ([mode, part]) => {
    if (mode === 'part') form.subleaseMark = String(part || '').trim().toUpperCase()
    else form.subleaseMark = ''
  },
)

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
  if (scope) {
    exportContractsXlsx(scope)
  }
}

function downloadImportTemplate() {
  const example = contractIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contracts')
  XLSX.writeFile(wb, 'contracts-import-template.xlsx')
  ElMessage.success(t('contract.templateDone'))
}

async function exportContractsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ContractRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('contract.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => contractToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `contracts-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('contract.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('contract.importFailed'))
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
    ElMessage.warning(t('contract.importAdminOnly'))
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
        message: t('contract.importEmpty'),
      })
      return
    }

    const items = []
    for (const row of rawRows) {
      const parsed = rowToContractIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
              房間編號: String(row['房間編號'] ?? row['房间编号'] ?? row['房號'] ?? ''),
              客戶名稱: String(row['客戶名稱'] ?? row['客户名称'] ?? ''),
              客戶編號: String(row['客戶編號'] ?? row['客户编号'] ?? ''),
            },
          },
        ])
        continue
      }
      items.push(contractIoPayloadToImportItem(parsed))
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(items, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importContractsApi(batch)
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
    failImport(t('contract.importFailed'))
  }
}

async function loadOptions() {
  // 房間 / 客戶改為彈窗下拉遠程懶加載，避免進入頁面就全量拉取
  const [userRes, periodRes, leaseRes, keyRes] = await Promise.all([
    fetchUsers(),
    fetchContractConfigs({ type: 'periodType', activeOnly: true }),
    fetchContractConfigs({ type: 'leaseType', activeOnly: true }),
    fetchContractConfigs({ type: 'keyDeposit', activeOnly: true }),
  ])
  users.value = userRes.data.filter((u) => u.status === 'active')
  periodTypeOptions.value = periodRes.data
  leaseTypeOptions.value = leaseRes.data
  keyDepositOptions.value = keyRes.data
}

onMounted(() => {
  void loadList()
  void loadOptions()
})

function openCreate() {
  if (!perms.create.value) return
  editing.value = null
  Object.assign(form, emptyForm())
  form.leaseType = leaseTypeOptions.value[0]?.label || ''
  // 銷售經理默認當前登錄用戶
  const uid = userStore.user?.id?.trim() || ''
  if (uid) form.salesManagerId = uid
  periods.value = [defaultPeriodRow()]
  periodPage.value = 1
  customerRequirements.value = []
  roomSelectOptions.value = []
  customerSelectOptions.value = []
  roomSelectPage.value = 1
  roomSelectHasMore.value = true
  roomSelectKeyword.value = ''
  customerSelectPage.value = 1
  customerSelectHasMore.value = true
  customerSelectKeyword.value = ''
  formVisible.value = true
}

function periodDurationLabel(p: PeriodFormRow): string {
  const n = Number(p.dateValue) || 0
  return `${n}${p.dateUnit === '日' ? t('contract.periodUnits.日') : t('contract.periodUnits.月')}`
}

/** 合约期表格每页条数：超过后换页显示 */
const PERIOD_PAGE_SIZE = 10
const periodPage = ref(1)

const periodTotalPages = computed(() =>
  Math.max(1, Math.ceil(periods.value.length / PERIOD_PAGE_SIZE) || 1),
)

const pagedPeriods = computed(() => {
  const start = (periodPage.value - 1) * PERIOD_PAGE_SIZE
  return periods.value.slice(start, start + PERIOD_PAGE_SIZE).map((p, i) => ({
    p,
    index: start + i,
  }))
})

function clampPeriodPage() {
  periodPage.value = Math.min(Math.max(1, periodPage.value), periodTotalPages.value)
}

function addPeriod() {
  periods.value.push(defaultPeriodRow())
  periodPage.value = Math.ceil(periods.value.length / PERIOD_PAGE_SIZE)
}

function removePeriod(idx: number) {
  periods.value.splice(idx, 1)
  if (!periods.value.length) {
    addPeriod()
    return
  }
  clampPeriodPage()
}

/** 双击序号改位置：跨页移动行（draft 必须保持字符串，避免 type=number 把 v-model 变成 number） */
const editingPeriodIndexUid = ref<string | null>(null)
const editingPeriodIndexFrom = ref(-1)
const editingPeriodIndexDraft = ref('')
const periodIndexInputRef = ref<HTMLInputElement | null>(null)
let periodIndexCommitLock = false

function goToPeriodIndex(absoluteIdx: number) {
  periodPage.value = Math.floor(absoluteIdx / PERIOD_PAGE_SIZE) + 1
}

async function startEditPeriodIndex(uid: string, currentIndex: number) {
  if (periods.value.length <= 1) return
  periodIndexCommitLock = false
  editingPeriodIndexUid.value = uid
  editingPeriodIndexFrom.value = currentIndex
  editingPeriodIndexDraft.value = String(currentIndex + 1)
  await nextTick()
  const el = periodIndexInputRef.value
  if (!el) return
  el.focus()
  el.select()
}

function cancelEditPeriodIndex() {
  editingPeriodIndexUid.value = null
  editingPeriodIndexFrom.value = -1
  editingPeriodIndexDraft.value = ''
}

function commitEditPeriodIndex() {
  if (periodIndexCommitLock) return
  periodIndexCommitLock = true
  const uid = editingPeriodIndexUid.value
  const fromIdx = editingPeriodIndexFrom.value
  const draft = String(editingPeriodIndexDraft.value ?? '').trim()
  cancelEditPeriodIndex()
  if (!uid || fromIdx < 0) {
    periodIndexCommitLock = false
    return
  }
  const total = periods.value.length
  const raw = Number.parseInt(draft, 10)
  if (!Number.isFinite(raw)) {
    periodIndexCommitLock = false
    return
  }
  const toIdx = Math.min(total, Math.max(1, raw)) - 1
  const list = periods.value
  if (list[fromIdx]?.uid !== uid) {
    periodIndexCommitLock = false
    return
  }
  if (toIdx !== fromIdx) {
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
  }
  goToPeriodIndex(toIdx)
  periodIndexCommitLock = false
}

function onPeriodIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    commitEditPeriodIndex()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancelEditPeriodIndex()
  }
}

const dragPeriodUid = ref<string | null>(null)
const dragOverPeriodUid = ref<string | null>(null)

function onPeriodDragStart(uid: string, e: DragEvent) {
  dragPeriodUid.value = uid
  e.dataTransfer?.setData('text/plain', uid)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onPeriodDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragPeriodUid.value && dragPeriodUid.value !== uid) {
    dragOverPeriodUid.value = uid
  }
}

function onPeriodDrop(targetUid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragPeriodUid.value || e.dataTransfer?.getData('text/plain')
  dragPeriodUid.value = null
  dragOverPeriodUid.value = null
  if (!fromUid || fromUid === targetUid) return
  const list = periods.value
  const fromIdx = list.findIndex((p) => p.uid === fromUid)
  const toIdx = list.findIndex((p) => p.uid === targetUid)
  if (fromIdx < 0 || toIdx < 0) return
  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)
}

function onPeriodDragEnd() {
  dragPeriodUid.value = null
  dragOverPeriodUid.value = null
}

async function openEdit(row: ContractRecord) {
  if (!perms.update.value) return
  editing.value = row
  Object.assign(form, {
    contractCode: row.contractCode,
    roomId: row.roomId,
    customerId: row.customerId,
    salesManagerId: row.salesManagerId || '',
    requirementId: row.requirementId || '',
    startDate: row.startDate || '',
    endDate: row.endDate || '',
    actualEndDate: row.actualEndDate || '',
    leaseType: row.leaseType || leaseTypeOptions.value[0]?.label || '',
    occupancyMode: (row.occupancyMode === 'part' ? 'part' : 'whole') as 'whole' | 'part',
    partLabel: row.partLabel || row.subleaseMark || '',
    status: row.status || CONTRACT_STATUSES[0],
    roomDeposit: row.roomDeposit,
    monthlyRent: row.monthlyRent,
    bookingDeposit: row.bookingDeposit,
    paymentCycle: row.paymentCycle || CONTRACT_PAYMENT_CYCLES[0],
    electricityRate: row.electricityRate,
    miscDeposit: row.miscDeposit,
    doorKeyQty: row.doorKeyQty ?? 0,
    mailboxKeyQty: row.mailboxKeyQty ?? 0,
    roomNameText: row.roomNameText || row.roomName || '',
    subleaseMark: row.subleaseMark || '',
    attachment: row.attachment || '',
    remark: row.remark || '',
  })
  periods.value = row.periods?.length
    ? row.periods.map((p) => ({
        uid: p.id || newPeriodUid(),
        dateType: p.dateType,
        dateUnit: p.dateUnit,
        dateValue: p.dateValue,
        startDate: p.startDate || '',
        endDate: p.endDate || '',
      }))
    : [defaultPeriodRow()]
  periodPage.value = 1
  const seededRoom = seedRoomOption(row)
  const seededCustomer = seedCustomerOption(row)
  roomSelectOptions.value = seededRoom ? [seededRoom] : []
  customerSelectOptions.value = seededCustomer ? [seededCustomer] : []
  roomSelectPage.value = 1
  roomSelectHasMore.value = true
  roomSelectKeyword.value = ''
  customerSelectPage.value = 1
  customerSelectHasMore.value = true
  customerSelectKeyword.value = ''
  if (row.roomId) {
    try {
      const { data } = await fetchRoom(row.roomId)
      roomSelectOptions.value = keepSelectedInOptions([data], row.roomId, roomSelectOptions.value)
    } catch {
      /* keep seed */
    }
  }
  await loadRequirementsForCustomer(row.customerId)
  formVisible.value = true
}

function payloadFromForm() {
  return {
    // 新增不传编号，由后端按「房间编号-YYYYMMDD」生成；编辑保留原编号
    contractCode: editing.value ? form.contractCode.trim() || undefined : undefined,
    roomId: form.roomId.trim(),
    customerId: form.customerId.trim(),
    salesManagerId: form.salesManagerId.trim() || null,
    requirementId: form.requirementId.trim() || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    actualEndDate: form.actualEndDate || null,
    leaseType: form.leaseType.trim() || undefined,
    occupancyMode: form.occupancyMode,
    partLabel: form.occupancyMode === 'part' ? form.partLabel.trim().toUpperCase() : '',
    status: form.status,
    roomDeposit: form.roomDeposit,
    monthlyRent: form.monthlyRent,
    bookingDeposit: form.bookingDeposit,
    paymentCycle: form.paymentCycle.trim() || undefined,
    electricityRate: form.electricityRate,
    miscDeposit: form.miscDeposit,
    doorKeyQty: form.doorKeyQty,
    mailboxKeyQty: form.mailboxKeyQty,
    roomNameText: form.roomNameText.trim(),
    subleaseMark:
      form.occupancyMode === 'part' ? form.partLabel.trim().toUpperCase() : form.subleaseMark.trim(),
    attachment: form.attachment.trim(),
    remark: form.remark.trim(),
    periods: periods.value
      .filter((p) => p.startDate && p.endDate)
      .map((p, i) => ({
        dateType: p.dateType,
        dateUnit: p.dateUnit,
        dateValue: Number(p.dateValue) || 0,
        startDate: p.startDate,
        endDate: p.endDate,
        sortOrder: i,
      })),
  }
}

async function saveForm() {
  if (!form.roomId.trim()) {
    ElMessage.warning(t('contract.roomRequired'))
    return
  }
  if (!form.customerId.trim()) {
    ElMessage.warning(t('contract.customerRequired'))
    return
  }
  if (form.occupancyMode === 'part' && !form.partLabel.trim()) {
    ElMessage.warning(t('contract.partLabelRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateContractApi(editing.value.id, payload)
      ElMessage.success(t('contract.updated'))
    } else {
      await createContractApi(payload)
      ElMessage.success(t('contract.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ContractRecord) {
  if (!perms.delete.value) return
  try {
    await ElMessageBox.confirm(
      t('contract.deleteConfirm', { code: row.contractCode }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteContractApi(row.id)
    ElMessage.success(t('contract.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

function statusLabel(status: string) {
  const key = `contract.status.${status}`
  return t(key) === key ? status : t(key)
}

async function openDetail(row: ContractRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchContract(row.id)
    current.value = data
    contractDrawerDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: ContractRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  void openDetail(row, 'rtl')
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

async function openRequirementSide(requirementId?: string | null) {
  await relationDrawers.value?.openRequirementSide(requirementId)
}

function openInvoicesList(row: ContractRecord) {
  if (!row.invoiceCount) return
  relatedInvoicesContract.value = row
  relatedInvoicesDrawerVisible.value = true
}

function openReceivablesList(row: ContractRecord) {
  if (!row.receivableCount) return
  relatedReceivablesContract.value = row
  relatedReceivablesDrawerVisible.value = true
}

function openReceiptsList(row: ContractRecord) {
  if (!row.receiptCount) return
  relatedReceiptsContract.value = row
  relatedReceiptsDrawerVisible.value = true
}

function openPeriodsList(row: ContractRecord) {
  if (!row.periodCount) return
  relatedPeriodsContract.value = row
  relatedPeriodsDrawerVisible.value = true
}

function openTerminationsList(row: ContractRecord) {
  if (!row.terminationCount) return
  relatedTerminationsContract.value = row
  relatedTerminationsDrawerVisible.value = true
}

function openOtherFeesList(row: ContractRecord) {
  if (!row.otherFeeCount) return
  relatedOtherFeesContract.value = row
  relatedOtherFeesDrawerVisible.value = true
}

function openDepositDeductionsList(row: ContractRecord) {
  if (!row.depositDeductionCount) return
  relatedDepositDeductionsContract.value = row
  relatedDepositDeductionsDrawerVisible.value = true
}

function openDepositRefundsList(row: ContractRecord) {
  if (!row.depositRefundCount) return
  relatedDepositRefundsContract.value = row
  relatedDepositRefundsDrawerVisible.value = true
}

function onOpenInvoiceFromList(invoice: InvoiceRecord) {
  void relationDrawers.value?.openInvoiceSide(invoice.id)
}

function onOpenReceivableFromList(receivable: ReceivableRecord) {
  void relationDrawers.value?.openReceivableSide(receivable.id)
}

function onOpenReceiptFromList(receipt: ReceiptRecord) {
  void relationDrawers.value?.openReceiptSide(receipt.id)
}

function onOpenPeriodFromList(period: ContractPeriodListRecord) {
  void relationDrawers.value?.openPeriodSide(period.id)
}

function onOpenTerminationFromList(termination: LeaseTerminationRecord) {
  void relationDrawers.value?.openTerminationSide(termination.id)
}

function onOpenOtherFeeFromList(fee: ContractOtherFeeRecord) {
  void relationDrawers.value?.openOtherFeeSide(fee.id, 'contractOtherFee')
}

function onOpenDepositDeductionFromList(fee: ContractOtherFeeRecord) {
  void relationDrawers.value?.openOtherFeeSide(fee.id, 'depositDeduction')
}

function onOpenDepositRefundFromList(record: DepositRefundRecord) {
  void relationDrawers.value?.openDepositRefundSide(record.id)
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.contracts') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('contract.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="tableHeaderConditionCount" @clear="onClearTableHeaderFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('contract.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('contract.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('contract.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('contract.downloadTemplate') }}</span>
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
          :key="tableLayoutKey"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
          style="width: 100%"
          class="contract-table--clickable"
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
            :min-width="codeColW(t('contract.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.contractCode')"
                sortable
                :sort-order="sortOrderOf('contractCode')"
                @update:sort-order="(v) => setSort('contractCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.contractCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('contract.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.roomCode')"
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
                @click.stop="openRoomSide(row.roomId)"
              >
                {{ row.roomCode || '—' }}
              </button>
              <span v-else>{{ row.roomCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('contract.fields.customerName'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.customerName')"
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
                @click.stop="openCustomerSide(row.customerId)"
              >
                {{ row.customerName || '—' }}
              </button>
              <span v-else>{{ row.customerName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.salesManager'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.salesManager')"
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
            :min-width="colW(t('contract.fields.startDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.startDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('startDate')"
                :date-range-value="dateRangeOf('startDate')"
                @update:sort-order="(v) => setSort('startDate', v)"
                @update:date-range-value="(v) => setDateRange('startDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.startDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.endDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.endDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('endDate')"
                :date-range-value="dateRangeOf('endDate')"
                @update:sort-order="(v) => setSort('endDate', v)"
                @update:date-range-value="(v) => setDateRange('endDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.endDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('contract.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.status')"
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
                :tone="contractStatusTone(row.status)"
                :label="statusLabel(row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.leaseType'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.leaseType')"
                filterable
                sortable
                :options="leaseTypeFilterOptions"
                :model-value="filters.leaseType || []"
                :sort-order="sortOrderOf('leaseType')"
                @update:model-value="(v) => setFilter('leaseType', v)"
                @update:sort-order="(v) => setSort('leaseType', v)"
              />
            </template>
            <template #default="{ row }">{{ row.leaseType || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.monthlyRent'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.monthlyRent')"
                sortable
                :sort-order="sortOrderOf('monthlyRent')"
                @update:sort-order="(v) => setSort('monthlyRent', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.monthlyRent == null ? '—' : formatMoney(row.monthlyRent) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.paymentCycle'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.paymentCycle')"
                filterable
                sortable
                :options="paymentCycleFilterOptions"
                :model-value="filters.paymentCycle || []"
                :sort-order="sortOrderOf('paymentCycle')"
                @update:model-value="(v) => setFilter('paymentCycle', v)"
                @update:sort-order="(v) => setSort('paymentCycle', v)"
              />
            </template>
            <template #default="{ row }">{{ row.paymentCycle || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.invoiceCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.invoiceCount')"
                sortable
                :sort-order="sortOrderOf('invoiceCount')"
                @update:sort-order="(v) => setSort('invoiceCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.invoiceCount ?? 0"
                @click="openInvoicesList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.receivableCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.receivableCount')"
                sortable
                :sort-order="sortOrderOf('receivableCount')"
                @update:sort-order="(v) => setSort('receivableCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receivableCount ?? 0"
                @click="openReceivablesList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.receiptCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.receiptCount')"
                sortable
                :sort-order="sortOrderOf('receiptCount')"
                @update:sort-order="(v) => setSort('receiptCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receiptCount ?? 0"
                @click="openReceiptsList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.periodCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.periodCount')"
                sortable
                :sort-order="sortOrderOf('periodCount')"
                @update:sort-order="(v) => setSort('periodCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.periodCount ?? 0" @click="openPeriodsList(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.terminationCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.terminationCount')"
                sortable
                :sort-order="sortOrderOf('terminationCount')"
                @update:sort-order="(v) => setSort('terminationCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.terminationCount ?? 0" @click="openTerminationsList(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.otherFeeCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.otherFeeCount')"
                sortable
                :sort-order="sortOrderOf('otherFeeCount')"
                @update:sort-order="(v) => setSort('otherFeeCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.otherFeeCount ?? 0" @click="openOtherFeesList(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.depositDeductionCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.depositDeductionCount')"
                sortable
                :sort-order="sortOrderOf('depositDeductionCount')"
                @update:sort-order="(v) => setSort('depositDeductionCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.depositDeductionCount ?? 0"
                @click="openDepositDeductionsList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.depositRefundCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.depositRefundCount')"
                sortable
                :sort-order="sortOrderOf('depositRefundCount')"
                @update:sort-order="(v) => setSort('depositRefundCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.depositRefundCount ?? 0"
                @click="openDepositRefundsList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="createdBy"
            :label="t('common.createdBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
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
            :width="contractActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--edit"
                  :disabled="printingAgreementId === (row as ContractRecord).id"
                  @mouseenter="prefetchAgreementPdfApi((row as ContractRecord).id)"
                  @focus="prefetchAgreementPdfApi((row as ContractRecord).id)"
                  @click="onPrintAgreement(row as ContractRecord)"
                >
                  {{ t('contract.printAgreement') }}
                </button>
                <button
                  v-if="perms.update" v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="openEdit(row as ContractRecord)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="perms.delete" v-admin-glow="perms.codes.delete"
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onDelete(row as ContractRecord)"
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

    <ContractDetailDrawer
      v-model="drawerVisible"
      :contract="current"
      :desktop-direction="contractDrawerDirection"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-building="openBuildingSide"
      @open-requirement="openRequirementSide"
      @open-invoices="openInvoicesList"
      @open-receivables="openReceivablesList"
      @open-receipts="openReceiptsList"
      @open-periods="openPeriodsList"
      @open-terminations="openTerminationsList"
      @open-other-fees="openOtherFeesList"
      @open-deposit-deductions="openDepositDeductionsList"
      @open-deposit-refunds="openDepositRefundsList"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <RelatedInvoicesDrawer
      v-model="relatedInvoicesDrawerVisible"
      :contract="relatedInvoicesContract"
      desktop-direction="ltr"
      @open-invoice="onOpenInvoiceFromList"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
    />
    <RelatedReceivablesDrawer
      v-model="relatedReceivablesDrawerVisible"
      :contract="relatedReceivablesContract"
      desktop-direction="ltr"
      @open-receivable="onOpenReceivableFromList"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
    />
    <RelatedReceiptsDrawer
      v-model="relatedReceiptsDrawerVisible"
      :contract="relatedReceiptsContract"
      desktop-direction="ltr"
      @open-receipt="onOpenReceiptFromList"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
    />
    <RelatedPeriodsDrawer
      v-model="relatedPeriodsDrawerVisible"
      :contract="relatedPeriodsContract"
      desktop-direction="ltr"
      @open-period="onOpenPeriodFromList"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr')"
    />
    <RelatedTerminationsDrawer
      v-model="relatedTerminationsDrawerVisible"
      :contract="relatedTerminationsContract"
      desktop-direction="ltr"
      @open-termination="onOpenTerminationFromList"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr')"
    />
    <RelatedOtherFeesDrawer
      v-model="relatedOtherFeesDrawerVisible"
      :contract="relatedOtherFeesContract"
      desktop-direction="ltr"
      @open-fee="onOpenOtherFeeFromList"
      @open-termination="(id) => relationDrawers?.openTerminationSide(id)"
    />
    <RelatedOtherFeesDrawer
      v-model="relatedDepositDeductionsDrawerVisible"
      :contract="relatedDepositDeductionsContract"
      mode="depositDeduction"
      desktop-direction="ltr"
      @open-fee="onOpenDepositDeductionFromList"
      @open-termination="(id) => relationDrawers?.openTerminationSide(id)"
    />
    <RelatedDepositRefundsDrawer
      v-model="relatedDepositRefundsDrawerVisible"
      :contract="relatedDepositRefundsContract"
      desktop-direction="ltr"
      @open-deposit-refund="onOpenDepositRefundFromList"
    />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('contract.edit') : t('contract.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <section class="form-section">
          <h3>{{ t('contract.sections.basic') }}</h3>
          <div class="form-grid">
            <el-form-item v-if="editing" :label="t('contract.fields.contractCode')">
              <el-input v-model="form.contractCode" disabled />
            </el-form-item>
            <el-form-item :label="t('contract.fields.roomCode')" required>
              <el-select
                v-model="form.roomId"
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="contract-room-select-popper"
                :placeholder="t('contract.fields.roomCode')"
                :remote-method="searchRoomsRemote"
                :loading="roomSelectLoading"
                @visible-change="onRoomSelectVisible"
                @change="onRoomSelectChange"
              >
                <el-option
                  v-for="r in roomSelectOptions"
                  :key="r.id"
                  :label="roomOptionLabel(r)"
                  :value="r.id"
                  :title="roomOptionLabel(r)"
                >
                  <span class="select-option-ellipsis" :title="roomOptionLabel(r)">
                    {{ roomOptionLabel(r) }}
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.customerName')" required>
              <el-select
                v-model="form.customerId"
                filterable
                remote
                reserve-keyword
                fit-input-width
                style="width: 100%"
                popper-class="contract-customer-select-popper"
                :placeholder="t('contract.fields.customerName')"
                :remote-method="searchCustomersRemote"
                :loading="customerSelectLoading"
                @visible-change="onCustomerSelectVisible"
              >
                <el-option
                  v-for="c in customerSelectOptions"
                  :key="c.id"
                  :label="customerOptionLabel(c)"
                  :value="c.id"
                  :title="customerOptionLabel(c)"
                >
                  <span class="select-option-ellipsis" :title="customerOptionLabel(c)">
                    {{ customerOptionLabel(c) }}
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.salesManager')">
              <el-select
                v-model="form.salesManagerId"
                filterable
                clearable
                style="width: 100%"
                :placeholder="t('contract.fields.salesManager')"
              >
                <el-option v-for="u in users" :key="u.id" :label="userLabel(u)" :value="u.id" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.requirementCode')">
              <el-select
                v-model="form.requirementId"
                filterable
                clearable
                style="width: 100%"
                :disabled="!form.customerId"
                :placeholder="t('contract.fields.requirementCode')"
              >
                <el-option
                  v-for="req in requirementSelectOptions"
                  :key="req.id"
                  :label="req.requirementCode"
                  :value="req.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.startDate')">
              <el-date-picker
                v-model="form.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.endDate')">
              <el-date-picker
                v-model="form.endDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.actualEndDate')">
              <el-date-picker
                v-model="form.actualEndDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.leaseType')">
              <el-select v-model="form.leaseType" filterable style="width: 100%">
                <el-option
                  v-for="lt in leaseTypeOptions"
                  :key="lt.id"
                  :label="lt.label"
                  :value="lt.label"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.occupancyMode')">
              <el-radio-group
                v-model="form.occupancyMode"
                class="lb-yesno-seg"
                :disabled="
                  !form.roomId ||
                  selectedRoom?.leaseCapability === 'whole_only' ||
                  selectedRoom?.leaseCapability === 'part_only'
                "
              >
                <el-radio-button value="whole" :disabled="!canWholeLease">
                  {{ t('contract.occupancyWhole') }}
                </el-radio-button>
                <el-radio-button value="part" :disabled="!canPartLease">
                  {{ t('contract.occupancyPart') }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item
              v-if="form.occupancyMode === 'part'"
              :label="t('contract.fields.partLabel')"
              required
            >
              <el-select
                v-model="form.partLabel"
                style="width: 100%"
                :placeholder="t('contract.fields.partLabel')"
              >
                <el-option
                  v-for="opt in roomPartOptions"
                  :key="opt.value"
                  :label="opt.disabled ? `${opt.label}（${t('room.occupancy.busy')}）` : opt.label"
                  :value="opt.value"
                  :disabled="opt.disabled"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.status')">
              <el-select v-model="form.status" style="width: 100%">
                <el-option
                  v-for="s in CONTRACT_STATUSES"
                  :key="s"
                  :label="t(`contract.status.${s}`)"
                  :value="s"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.roomNameText')">
              <el-input v-model="form.roomNameText" />
            </el-form-item>
          </div>
        </section>

        <section class="form-section form-section--periods">
          <div class="period-section-head">
            <div class="period-section-head__left">
              <h3>{{ t('contract.sections.periods') }}</h3>
              <el-button
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="period-add-btn"
                @click="addPeriod"
              >
                {{ t('contract.addPeriod') }}
              </el-button>
            </div>
            <div v-if="periods.length > PERIOD_PAGE_SIZE" class="period-table-pager">
              <el-pagination
                v-model:current-page="periodPage"
                :page-size="PERIOD_PAGE_SIZE"
                :total="periods.length"
                layout="total, prev, pager, next"
                small
                background
                class="period-pager"
              />
            </div>
          </div>
          <div class="period-table-wrap">
            <div class="period-table" role="table">
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
                <div class="period-table__cell period-table__cell--type" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.dateType') }}
                </div>
                <div class="period-table__cell period-table__cell--unit" role="columnheader">
                  {{ t('contract.fields.dateUnit') }}
                </div>
                <div class="period-table__cell period-table__cell--value" role="columnheader">
                  {{ t('contract.fields.dateValue') }}
                </div>
                <div class="period-table__cell period-table__cell--duration" role="columnheader">
                  {{ t('contract.fields.duration') }}
                </div>
                <div class="period-table__cell period-table__cell--start" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.periodStart') }}
                </div>
                <div class="period-table__cell period-table__cell--to" role="columnheader"></div>
                <div class="period-table__cell period-table__cell--end" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.periodEnd') }}
                </div>
                <div class="period-table__cell period-table__cell--actions" role="columnheader"></div>
              </div>
              <div
                class="period-table__body"
                :class="{ 'period-table__body--fixed': periods.length > PERIOD_PAGE_SIZE }"
              >
                <div
                  v-for="{ p, index } in pagedPeriods"
                  :key="p.uid"
                  class="period-table__row"
                  role="row"
                  :class="{
                    'is-dragging': dragPeriodUid === p.uid,
                    'is-drag-over': dragOverPeriodUid === p.uid,
                    'is-editing-index': editingPeriodIndexUid === p.uid,
                  }"
                  @dragover="onPeriodDragOver(p.uid, $event)"
                  @drop="onPeriodDrop(p.uid, $event)"
                  @dragleave="dragOverPeriodUid === p.uid && (dragOverPeriodUid = null)"
                >
                  <div
                    class="period-table__cell period-table__cell--index"
                    :class="{ 'is-editing-index': editingPeriodIndexUid === p.uid }"
                    role="cell"
                  >
                    <button
                      type="button"
                      class="period-row__handle"
                      draggable="true"
                      :title="t('contract.dragPeriod')"
                      aria-label="drag"
                      @dragstart="onPeriodDragStart(p.uid, $event)"
                      @dragend="onPeriodDragEnd"
                    >
                      <el-icon :size="14"><Rank /></el-icon>
                    </button>
                    <input
                      v-if="editingPeriodIndexUid === p.uid"
                      ref="periodIndexInputRef"
                      :value="editingPeriodIndexDraft"
                      class="period-row__index-input"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="4"
                      :aria-label="t('contract.editPeriodIndex')"
                      @input="editingPeriodIndexDraft = ($event.target as HTMLInputElement).value.replace(/\D/g, '')"
                      @keydown="onPeriodIndexKeydown"
                      @blur="commitEditPeriodIndex"
                    />
                    <button
                      v-else
                      type="button"
                      class="period-row__index"
                      :title="t('contract.editPeriodIndexHint')"
                      @dblclick.stop="startEditPeriodIndex(p.uid, index)"
                    >
                      {{ index + 1 }}
                    </button>
                  </div>
                  <div class="period-table__cell period-table__cell--type" role="cell">
                    <el-select v-model="p.dateType" style="width: 100%">
                      <el-option
                        v-for="pt in periodTypeOptions"
                        :key="pt.id"
                        :label="pt.label"
                        :value="pt.label"
                      />
                    </el-select>
                  </div>
                  <div class="period-table__cell period-table__cell--unit" role="cell">
                    <el-select v-model="p.dateUnit" style="width: 100%">
                      <el-option
                        v-for="u in CONTRACT_PERIOD_UNITS"
                        :key="u"
                        :label="t(`contract.periodUnits.${u}`)"
                        :value="u"
                      />
                    </el-select>
                  </div>
                  <div class="period-table__cell period-table__cell--value" role="cell">
                    <el-input-number
                      v-model="p.dateValue"
                      :min="0"
                      :controls="false"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--duration" role="cell">
                    <span class="period-row__duration">{{ periodDurationLabel(p) }}</span>
                  </div>
                  <div class="period-table__cell period-table__cell--start" role="cell">
                    <el-date-picker
                      v-model="p.startDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      :placeholder="t('contract.fields.periodStart')"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--to" role="cell">
                    <span class="period-row__to">至</span>
                  </div>
                  <div class="period-table__cell period-table__cell--end" role="cell">
                    <el-date-picker
                      v-model="p.endDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      :placeholder="t('contract.fields.periodEnd')"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--actions" role="cell">
                    <el-button type="danger" link :icon="Delete" @click="removePeriod(index)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('contract.sections.finance') }}</h3>
          <div class="form-grid">
            <el-form-item :label="t('contract.fields.monthlyRent')">
              <el-input-number
                v-model="form.monthlyRent"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.roomDeposit')">
              <el-input-number
                v-model="form.roomDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.bookingDeposit')">
              <el-input-number
                v-model="form.bookingDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.miscDeposit')">
              <el-input-number
                v-model="form.miscDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.doorKeyQty')">
              <div class="key-deposit-field">
                <el-input-number
                  v-model="form.doorKeyQty"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
                <p class="key-deposit-field__hint">
                  {{ t('contract.fields.keyDepositHint') }}：
                  {{ formatMoney(computedDoorKeyDeposit) }}
                  <span v-if="doorKeyUnitPrice">（{{ formatMoney(doorKeyUnitPrice) }}/把）</span>
                </p>
              </div>
            </el-form-item>
            <el-form-item :label="t('contract.fields.mailboxKeyQty')">
              <div class="key-deposit-field">
                <el-input-number
                  v-model="form.mailboxKeyQty"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
                <p class="key-deposit-field__hint">
                  {{ t('contract.fields.keyDepositHint') }}：
                  {{ formatMoney(computedMailboxKeyDeposit) }}
                  <span v-if="mailboxKeyUnitPrice">（{{ formatMoney(mailboxKeyUnitPrice) }}/把）</span>
                </p>
              </div>
            </el-form-item>
            <el-form-item :label="t('contract.fields.electricityRate')">
              <el-input-number
                v-model="form.electricityRate"
                :min="0"
                :precision="4"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.paymentCycle')">
              <el-select
                v-model="form.paymentCycle"
                filterable
                allow-create
                default-first-option
                style="width: 100%"
              >
                <el-option
                  v-for="pc in CONTRACT_PAYMENT_CYCLES"
                  :key="pc"
                  :label="pc"
                  :value="pc"
                />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('contract.sections.extra') }}</h3>
          <el-form-item :label="t('contract.fields.attachment')">
            <el-input
              v-model="form.attachment"
              class="path-input"
              readonly
              placeholder="/upload/..."
            />
          </el-form-item>
          <el-form-item :label="t('contract.fields.remark')">
            <el-input v-model="form.remark" type="textarea" :rows="3" />
          </el-form-item>
        </section>

        <AuditDetailSection
          v-if="editing"
          :created-by="editing.createdBy"
          :created-at="editing.createdAt"
          :updated-by="editing.updatedBy"
          :updated-at="editing.updatedAt"
        />
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button
            v-if="editing"
            :loading="previewingDraft"
            @click="onPreviewAgreementDraft"
          >
            {{ t('contract.previewAgreement') }}
          </el-button>
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

.contract-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.path-input :deep(.el-input__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.select-option-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.form-section--periods {
  margin-bottom: 14px;
  padding-bottom: 6px;
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
  display: grid;
  min-width: 780px;
}

.period-table__head,
.period-table__row {
  display: grid;
  grid-template-columns:
    52px
    minmax(118px, 1.2fr)
    72px
    72px
    72px
    minmax(128px, 1fr)
    28px
    minmax(128px, 1fr)
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

.period-table__body {
  background: #fff;
}

.period-table__body--fixed {
  box-sizing: border-box;
  height: calc(var(--period-row-h) * 10);
  min-height: calc(var(--period-row-h) * 10);
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

.period-table__cell--to,
.period-table__cell--actions,
.period-table__cell--duration {
  justify-content: center;
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

/* 编辑时输入框略向右浮出，不永久撑宽序号列 */
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

.period-row__duration {
  color: var(--lb-muted);
  font-size: 0.8rem;
  white-space: nowrap;
}

.period-row__to {
  color: #8a9590;
  font-size: 0.8rem;
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

.period-table__row :deep(.el-date-editor.el-input) {
  width: 100%;
}

.key-deposit-field {
  width: 100%;
}

.key-deposit-field__hint {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--lb-muted);
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
