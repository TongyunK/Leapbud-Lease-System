<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createCustomerRequirementApi,
  deleteCustomerRequirementApi,
  batchDeleteCustomerRequirementsApi,
  purgeCustomerRequirementApi,
  batchPurgeCustomerRequirementsApi,
  fetchCustomerRequirement,
  fetchCustomerRequirements,
  importCustomerRequirementsApi,
  updateCustomerRequirementApi,
} from '@/api/customer-requirements'
import type { CustomerRequirementImportItem, CustomerRequirementListQuery } from '@/api/customer-requirements'
import { fetchCustomers } from '@/api/customers'
import { fetchRoomConfigs } from '@/api/room-configs'
import { fetchRooms } from '@/api/rooms'
import { fetchUsers } from '@/api/users'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import {
  CUSTOMER_REQUIREMENT_RENTAL_TYPES,
  CUSTOMER_REQUIREMENT_STATUSES,
} from '@/types/customer-requirement'
import type { CustomerRecord } from '@/types/customer'
import type { RoomConfigOption } from '@/types/room-config'
import type { RoomRecord } from '@/types/room'
import type { UserRecord } from '@/types/user'
import type { BuildingRecord } from '@/types/building'
import { fetchBuildings } from '@/api/buildings'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import AttachmentField from '@/components/AttachmentField.vue'
import CustomerRequirementDetailDrawer from '@/components/CustomerRequirementDetailDrawer.vue'
import CountListPill from '@/components/CountListPill.vue'
import {
  customerRequirementRentalTypeTone,
  customerRequirementStatusTone,
  customerStatusTone,
  roomStatusTone,
} from '@/constants/statusBadges'
import RelatedContractsDrawer from '@/components/RelatedContractsDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import type { ContractRecord } from '@/types/contract'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import { ACTION_COL_ICON, measureActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney, formatNumber2 } from '@/utils/format'
import { EMPTY_FILTER_VALUE, packFilterValues } from '@/utils/columnFilter'
import {
  displayLeaseDuration,
  formatLeaseDuration,
  parseLeaseDuration,
  type LeaseDurationUnit,
} from '@/utils/leaseDuration'
import {
  customerRequirementIoTemplateExampleRow,
  customerRequirementToIoRow,
  rowToCustomerRequirementIoPayload,
} from '@/utils/customerRequirementExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import type { ContractCreatePrefill } from '@/utils/contractCreatePrefill'
import { OVERLAY_ABOVE_FEATURE_MENU_Z, useOverlayStackZ } from '@/composables/useOverlayStackZ'

/** 异步加载合约页（嵌入仅开新增弹窗，避免首屏拖入整表） */
const ContractListView = defineAsyncComponent(
  () => import('@/views/contract-mgmt/ContractListView.vue'),
)

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const perms = useResourcePermissions('customerRequirements')
const contractPerms = useResourcePermissions('contracts')
const { allocZ } = useOverlayStackZ()

const contractCreateEmbedOpen = ref(false)
const contractCreatePrefill = ref<ContractCreatePrefill | null>(null)
const contractCreateZ = ref<number | undefined>(undefined)
/** 跟進 / 取消 / 刪除：按权限与当前语言文案测宽 */
const requirementActionColWidth = computed(() => {
  void locale.value
  const labels: string[] = [ACTION_COL_ICON]
  if (perms.update) labels.push(t('customerRequirement.followUp'))
  if (perms.delete) labels.push(t('common.cancel'))
  if (perms.purge) labels.push(t('common.delete'))
  return measureActionColWidth(labels)
})
const { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const formVisible = ref(false)
const editing = ref<CustomerRequirementRecord | null>(null)
const drawerVisible = ref(false)
const relatedContractsDrawer = ref(false)
const relatedListRequirement = ref<CustomerRequirementRecord | null>(null)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const current = ref<CustomerRequirementRecord | null>(null)
const customers = ref<CustomerRecord[]>([])
const users = ref<UserRecord[]>([])
const sizeOptions = ref<RoomConfigOption[]>([])
const acOptions = ref<RoomConfigOption[]>([])
const windowOptions = ref<RoomConfigOption[]>([])
const keyword = ref('')
const buildings = ref<BuildingRecord[]>([])
const requirementDrawerDirection = ref<'ltr' | 'rtl'>('rtl')

function userOptionLabel(u: UserRecord) {
  const name = u.displayName?.trim()
  return name || u.account
}

const sortFilter = useTableSortFilter<CustomerRequirementRecord>()
const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  sortOrderOf,
  activeConditionCount,
  sortKey,
  sortOrder,
  dateRanges,
  uniqueOptions,
} = sortFilter

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
  resetPage,
} = useServerPagedList<CustomerRequirementRecord, CustomerRequirementListQuery>({
  keyword,
  sortFilter,
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => ({
    keyword: kw,
    statuses: packFilterValues(f.status),
    rentalTypes: packFilterValues(f.rentalType),
    customerNames: packFilterValues(f.customerName),
    salesManagers: packFilterValues(f.salesManager),
    requirementCodes: packFilterValues(f.requirementCode),
    leaseDurations: packFilterValues(f.leaseDuration),
    budgets: packFilterValues(f.budget),
    sizeConfigLabels: packFilterValues(f.sizeConfigLabel),
    acConfigLabels: packFilterValues(f.acConfigLabel),
    windowConfigLabels: packFilterValues(f.windowConfigLabel),
    sortBy,
    sortDir,
    requirementDateFrom: range('requirementDate').from,
    requirementDateTo: range('requirementDate').to,
    requirementDateEmpty:
      (f.requirementDate || []).includes(EMPTY_FILTER_VALUE) || undefined,
    createdAtFrom: range('createdAt').from,
    createdAtTo: range('createdAt').to,
    createdAtEmpty: (f.createdAt || []).includes(EMPTY_FILTER_VALUE) || undefined,
    createdBys: packFilterValues(f.createdBy),
    page: p,
    pageSize: ps,
  }),
  fetchPage: fetchCustomerRequirements,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<CustomerRequirementRecord>()
const batchDeleting = ref(false)
const selectAllLoading = ref(false)
/** 批量取消 / 批量删除共用进度弹窗，按操作切换文案前缀 */
const batchUiKey = ref('customerRequirement.batchCancelUi')
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

async function onBatchCancel() {
  if (!perms.batchDelete || !selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(
      t('customerRequirement.batchCancelConfirm', { n: selectedIds.value.length }),
      t('customerRequirement.batchCancel'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  const ids = [...selectedIds.value]
  batchDeleting.value = true
  batchUiKey.value = 'customerRequirement.batchCancelUi'
  beginBatch(ids.length)
  try {
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteCustomerRequirementsApi(chunk),
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

async function onBatchPurge() {
  if (!perms.batchPurge || !selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(
      t('customerRequirement.batchPurgeConfirm', { n: selectedIds.value.length }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  const ids = [...selectedIds.value]
  batchDeleting.value = true
  batchUiKey.value = 'common.batchDeleteUi'
  beginBatch(ids.length)
  try {
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchPurgeCustomerRequirementsApi(chunk),
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

function uniqueListOptions(
  get: (row: CustomerRequirementRecord) => string | number | null | undefined,
  labelOf?: (value: string) => string,
) {
  return uniqueOptions(list.value, get, labelOf)
}

const requirementCodeFilterOptions = computed(() => uniqueListOptions((r) => r.requirementCode))
const leaseDurationFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => r.leaseDuration,
    (v) => displayLeaseDuration(v, t) || v,
  ),
)
const budgetFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.budget == null ? '' : String(r.budget)),
    (v) => formatMoney(Number(v)),
  ),
)

const statusFilterOptions = computed(() =>
  CUSTOMER_REQUIREMENT_STATUSES.map((s) => ({
    value: s,
    label: t(`customerRequirement.status.${s}`),
  })),
)
const rentalTypeFilterOptions = computed(() =>
  CUSTOMER_REQUIREMENT_RENTAL_TYPES.map((s) => ({
    value: s,
    label: t(`customerRequirement.rentalType.${s}`),
  })),
)

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

const salesManagerFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const u of users.value) {
    const label = userOptionLabel(u)
    if (!label || seen.has(label)) continue
    seen.add(label)
    opts.push({ value: label, label })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const sizeConfigFilterOptions = computed(() =>
  sizeOptions.value
    .map((o) => ({ value: o.label, label: o.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant')),
)
const acConfigFilterOptions = computed(() =>
  acOptions.value
    .map((o) => ({ value: o.label, label: o.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant')),
)
const windowConfigFilterOptions = computed(() =>
  windowOptions.value
    .map((o) => ({ value: o.label, label: o.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant')),
)
const createdByFilterOptions = computed(() => uniqueListOptions((r) => r.createdBy))

const dialogWidth = computed(() => (isMobile.value ? '94%' : '860px'))

const matchedRooms = ref<RoomRecord[]>([])
const matchedRoomsLoading = ref(false)
/** 匹配房间单选（快捷新增合约一般只选一间） */
const matchedSelectedRoomId = ref('')
const matchedSelectedRoom = computed(
  () => matchedRooms.value.find((r) => r.id === matchedSelectedRoomId.value) ?? null,
)
const matchedRoomTableKey = computed(
  () => `matched-${tableLayoutKey.value}-${form.leaseDurationUnit}`,
)

/** 匹配房间 → 本页叠开新增合约弹窗并预填（不关闭跟进／新增需求弹窗） */
async function onMatchedRoomsCreateContract() {
  if (!contractPerms.create) {
    await ElMessageBox.alert(
      t('customerRequirement.createContractNoPerm'),
      t('contract.create'),
      { type: 'warning' },
    )
    return
  }
  const room = matchedSelectedRoom.value
  const customer = selectedCustomer.value
  if (!room?.id) {
    await ElMessageBox.alert(
      t('customerRequirement.createContractNeedRoom'),
      t('contract.create'),
      { type: 'warning' },
    )
    return
  }
  if (!customer?.id && !form.customerId.trim()) {
    await ElMessageBox.alert(
      t('customerRequirement.customerRequired'),
      t('contract.create'),
      { type: 'warning' },
    )
    return
  }
  const customerId = (customer?.id || form.customerId).trim()
  contractCreatePrefill.value = {
    customerId,
    customerCode: customer?.customerCode || '',
    customerName: customer?.name || '',
    buildingId: customer?.buildingId || room.buildingId || '',
    roomId: room.id,
    roomCode: room.roomCode || '',
    roomName: room.name || '',
    buildingName: room.buildingName || '',
    monthlyRent: room.monthlyRent ?? null,
    requirementId: editing.value?.id || '',
    requirementCode: editing.value?.requirementCode || form.requirementCode || '',
    salesManagerId: form.salesManagerId || currentUserId(),
    leaseDurationAmount: form.leaseDurationAmount,
    leaseDurationUnit: form.leaseDurationUnit,
    remark: form.remark.trim() || '',
  }
  contractCreateZ.value = allocZ(OVERLAY_ABOVE_FEATURE_MENU_Z)
  contractCreateEmbedOpen.value = true
}

function onContractCreateEmbedClose() {
  contractCreateEmbedOpen.value = false
  contractCreatePrefill.value = null
}

function onContractCreateEmbedCreated() {
  // 跟进中需求：刷新列表合约数；弹窗保持打开
  if (editing.value?.id) void loadList()
}
let matchedRoomsTimer: ReturnType<typeof setTimeout> | null = null
let matchedRoomsReqSeq = 0

function todayIso() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const form = reactive({
  requirementCode: '',
  customerId: '',
  salesManagerId: '' as string,
  requirementDate: todayIso(),
  status: '未跟進',
  rentalType: 'long' as (typeof CUSTOMER_REQUIREMENT_RENTAL_TYPES)[number],
  leaseDurationAmount: null as number | null,
  leaseDurationUnit: 'month' as LeaseDurationUnit,
  budget: null as number | null,
  content: '',
  remark: '',
  attachment: '',
  sizeConfigId: '' as string,
  acConfigId: '' as string,
  windowConfigId: '' as string,
})

/** 年/月 → 月租；日 → 日租；時 → 時租 */
const matchedRentLabel = computed(() => {
  const u = form.leaseDurationUnit
  if (u === 'day') return t('room.fields.dailyRent')
  if (u === 'hour') return t('room.fields.hourlyRent')
  return t('room.fields.monthlyRent')
})

/** 預算單位：年/月按月，日按日，時按時 */
const budgetUnitLabel = computed(() => {
  const u = form.leaseDurationUnit
  if (u === 'day') return t('customerRequirement.budgetUnit.day')
  if (u === 'hour') return t('customerRequirement.budgetUnit.hour')
  return t('customerRequirement.budgetUnit.month')
})

/** 用户手动改过需求内容后，不再用选项覆盖 */
const contentManual = ref(false)
const lastAutoContent = ref('')
let applyingAutoContent = false

function configLabelOf(options: { id: string; label: string }[], id?: string | null) {
  const key = String(id ?? '').trim()
  if (!key) return ''
  return options.find((o) => o.id === key)?.label?.trim() || ''
}

function buildAutoContent() {
  const parts: string[] = []
  parts.push(t(`customerRequirement.rentalType.${form.rentalType}`))
  const durationText = displayLeaseDuration(
    formatLeaseDuration(form.leaseDurationAmount, form.leaseDurationUnit),
    t,
  )
  if (durationText) {
    parts.push(t('customerRequirement.contentAuto.duration', { duration: durationText }))
  }
  if (form.budget != null && Number.isFinite(form.budget) && form.budget >= 0) {
    parts.push(
      t('customerRequirement.contentAuto.budget', {
        amount: formatMoney(form.budget),
        unit: budgetUnitLabel.value,
      }),
    )
  }
  const sizeLabel = configLabelOf(sizeOptions.value, form.sizeConfigId)
  if (sizeLabel) {
    parts.push(t('customerRequirement.contentAuto.size', { label: sizeLabel }))
  }
  const acLabel = configLabelOf(acOptions.value, form.acConfigId)
  if (acLabel) {
    parts.push(t('customerRequirement.contentAuto.ac', { label: acLabel }))
  }
  const windowLabel = configLabelOf(windowOptions.value, form.windowConfigId)
  if (windowLabel) {
    parts.push(t('customerRequirement.contentAuto.window', { label: windowLabel }))
  }
  return parts.join(t('customerRequirement.contentAuto.join'))
}

function syncAutoContent() {
  if (contentManual.value) return
  const next = buildAutoContent()
  if (form.content.trim() && form.content !== lastAutoContent.value) {
    contentManual.value = true
    return
  }
  applyingAutoContent = true
  form.content = next
  lastAutoContent.value = next
  queueMicrotask(() => {
    applyingAutoContent = false
  })
}

function onContentInput() {
  if (applyingAutoContent) return
  const cur = form.content
  if (!cur.trim() || cur === lastAutoContent.value) {
    contentManual.value = false
    if (!cur.trim()) syncAutoContent()
    return
  }
  contentManual.value = true
}

watch(
  () =>
    [
      form.rentalType,
      form.leaseDurationAmount,
      form.leaseDurationUnit,
      form.budget,
      form.sizeConfigId,
      form.acConfigId,
      form.windowConfigId,
      locale.value,
    ] as const,
  () => {
    syncAutoContent()
  },
)

function roomRentAmount(row: {
  monthlyRent?: number
  dailyRent?: number
  hourlyRent?: number
}) {
  const u = form.leaseDurationUnit
  if (u === 'day') return Number(row.dailyRent) || 0
  if (u === 'hour') return Number(row.hourlyRent) || 0
  return Number(row.monthlyRent) || 0
}

function matchedRoomsSortBy(): string {
  const u = form.leaseDurationUnit
  if (u === 'day') return 'dailyRent'
  if (u === 'hour') return 'hourlyRent'
  return 'monthlyRent'
}

async function loadOptions() {
  const [custRes, userRes, confRes, buildingsRes] = await Promise.all([
    fetchCustomers(),
    fetchUsers(),
    fetchRoomConfigs({ activeOnly: true }),
    fetchBuildings({ activeOnly: false }),
  ])
  customers.value = custRes.data.items
  users.value = userRes.data.filter((u) => u.status === 'active')
  buildings.value = buildingsRes.data.items
  const configs = confRes.data
  sizeOptions.value = configs.filter((c) => c.type === 'size')
  acOptions.value = configs.filter((c) => c.type === 'ac')
  windowOptions.value = configs.filter((c) => c.type === 'window')
}

/** 下拉选项：保证当前登录用户始终可选（避免默认值因不在列表中被清空） */
const salesManagerOptions = computed(() => {
  const list = [...users.value]
  const me = userStore.user
  const myId = me?.id?.trim()
  if (myId && !list.some((u) => u.id === myId)) {
    list.unshift({
      id: myId,
      account: me?.account || myId,
      displayName: me?.displayName || me?.account || myId,
      role: me?.role || '',
      roleName: me?.roleName,
      roles: me?.roles,
      status: 'active',
      phone: '',
      email: '',
      createdBy: '',
      createdAt: '',
      updatedBy: '',
      updatedAt: '',
    })
  }
  return list
})

function currentUserId() {
  return userStore.user?.id?.trim() || ''
}

onMounted(() => {
  void loadList()
  void loadOptions()
})

const selectedCustomer = computed(() =>
  customers.value.find((c) => c.id === form.customerId.trim()) ?? null,
)

function customerStatusLabel(status?: string | null) {
  if (!status?.trim()) return '—'
  const key = `customer.status.${status}`
  return t(key) === key ? status : t(key)
}

async function loadMatchedRooms() {
  if (!formVisible.value) {
    matchedRooms.value = []
    return
  }
  const seq = ++matchedRoomsReqSeq
  matchedRoomsLoading.value = true
  try {
    const sizeId = String(form.sizeConfigId ?? '').trim()
    const acLabel = acOptions.value.find((o) => o.id === form.acConfigId)?.label?.trim()
    const windowLabel = windowOptions.value.find((o) => o.id === form.windowConfigId)?.label?.trim()
    const buildingId = selectedCustomer.value?.buildingId?.trim() || undefined
    const { data } = await fetchRooms({
      status: 'idle',
      buildingId,
      sizeRangeIds: sizeId ? [sizeId] : undefined,
      acConfigs: acLabel ? [acLabel] : undefined,
      windowConfigs: windowLabel ? [windowLabel] : undefined,
      sortBy: matchedRoomsSortBy(),
      sortDir: 'asc',
      page: 1,
      pageSize: 100,
    })
    if (seq !== matchedRoomsReqSeq) return
    let items = data.items || []
    const budget = form.budget
    if (budget != null && Number(budget) > 0) {
      items = items.filter((r) => roomRentAmount(r) <= Number(budget))
    }
    matchedRooms.value = items
  } catch {
    if (seq === matchedRoomsReqSeq) matchedRooms.value = []
  } finally {
    if (seq === matchedRoomsReqSeq) matchedRoomsLoading.value = false
  }
}

function scheduleLoadMatchedRooms() {
  if (matchedRoomsTimer) clearTimeout(matchedRoomsTimer)
  matchedRoomsTimer = setTimeout(() => {
    void loadMatchedRooms()
  }, 280)
}

watch(
  () =>
    [
      formVisible.value,
      form.customerId,
      form.sizeConfigId,
      form.acConfigId,
      form.windowConfigId,
      form.budget,
      form.leaseDurationUnit,
      selectedCustomer.value?.buildingId,
    ] as const,
  ([open]) => {
    if (!open) {
      matchedRooms.value = []
      matchedSelectedRoomId.value = ''
      matchedRoomsLoading.value = false
      return
    }
    scheduleLoadMatchedRooms()
  },
)

watch(matchedRooms, () => {
  matchedSelectedRoomId.value = ''
})

async function openCreate() {
  if (!perms.create) return
  editing.value = null
  if (!users.value.length) {
    try {
      await loadOptions()
    } catch {
      /* ignore */
    }
  }
  const myId = currentUserId()
  contentManual.value = false
  lastAutoContent.value = ''
  Object.assign(form, {
    requirementCode: '',
    customerId: '',
    salesManagerId: myId,
    requirementDate: todayIso(),
    status: '未跟進',
    rentalType: 'long',
    leaseDurationAmount: null,
    leaseDurationUnit: 'month' as LeaseDurationUnit,
    budget: null,
    content: '',
    remark: '',
    attachment: '',
    sizeConfigId: '',
    acConfigId: '',
    windowConfigId: '',
  })
  formVisible.value = true
  // destroy-on-close 重挂载后，若选项尚未就绪可能冲掉默认值，再写一次
  if (myId) form.salesManagerId = myId
  syncAutoContent()
}

function openEdit(row: CustomerRequirementRecord) {
  if (!perms.update) return
  editing.value = row
  const lease = parseLeaseDuration(row.leaseDuration)
  const rentalType =
    row.rentalType === 'short' ? 'short' : ('long' as (typeof CUSTOMER_REQUIREMENT_RENTAL_TYPES)[number])
  Object.assign(form, {
    requirementCode: row.requirementCode,
    customerId: row.customerId,
    salesManagerId: row.salesManagerId || '',
    requirementDate: row.requirementDate || todayIso(),
    status: row.status || '未跟進',
    rentalType,
    leaseDurationAmount: lease.amount,
    leaseDurationUnit: lease.unit,
    budget: row.budget,
    content: row.content || '',
    remark: row.remark || '',
    attachment: row.attachment || '',
    sizeConfigId: row.sizeConfigId || '',
    acConfigId: row.acConfigId || '',
    windowConfigId: row.windowConfigId || '',
  })
  // 已有手写内容则保留；为空则按选项自动生成
  contentManual.value = Boolean((row.content || '').trim())
  lastAutoContent.value = ''
  formVisible.value = true
  if (!contentManual.value) syncAutoContent()
}

function payloadFromForm() {
  return {
    // 需求编号不可改：新建由后端自动编号，编辑不提交编号字段
    customerId: form.customerId.trim(),
    salesManagerId: String(form.salesManagerId ?? '').trim() || null,
    requirementDate: form.requirementDate || null,
    status: form.status,
    rentalType: form.rentalType,
    leaseDuration: formatLeaseDuration(form.leaseDurationAmount, form.leaseDurationUnit),
    budget: form.budget,
    content: form.content.trim(),
    remark: form.remark.trim(),
    attachment: form.attachment.trim(),
    sizeConfigId: String(form.sizeConfigId ?? '').trim() || null,
    acConfigId: String(form.acConfigId ?? '').trim() || null,
    windowConfigId: String(form.windowConfigId ?? '').trim() || null,
  }
}

async function saveForm() {
  if (!form.customerId.trim()) {
    ElMessage.warning(t('customerRequirement.customerRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateCustomerRequirementApi(editing.value.id, payload)
      ElMessage.success(t('customerRequirement.updated'))
    } else {
      await createCustomerRequirementApi(payload)
      ElMessage.success(t('customerRequirement.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onCancel(row: CustomerRequirementRecord) {
  if (!perms.delete) return
  if (row.status === '已取消') {
    await ElMessageBox.alert(
      t('customerRequirement.alreadyCancelled'),
      t('common.cancel'),
      { type: 'info' },
    )
    return
  }
  try {
    await ElMessageBox.confirm(
      t('customerRequirement.cancelConfirm', { code: row.requirementCode }),
      t('common.cancel'),
      { type: 'warning' },
    )
    await deleteCustomerRequirementApi(row.id)
    await ElMessageBox.alert(t('customerRequirement.cancelled'), t('common.cancel'), {
      type: 'success',
    })
    await loadList()
  } catch {
    /* dismiss */
  }
}

async function onPurge(row: CustomerRequirementRecord) {
  if (!perms.purge) return
  try {
    await ElMessageBox.confirm(
      t('customerRequirement.deleteConfirm', { code: row.requirementCode }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await purgeCustomerRequirementApi(row.id)
    await ElMessageBox.alert(t('customerRequirement.deleted'), t('common.deleteTitle'), {
      type: 'success',
    })
    await loadList()
  } catch {
    /* dismiss */
  }
}

function statusLabel(status: string) {
  const key = `customerRequirement.status.${status}`
  return t(key) === key ? status : t(key)
}

function rentalTypeLabel(rentalType: string) {
  const key = `customerRequirement.rentalType.${rentalType}`
  return t(key) === key ? rentalType : t(key)
}

function userLabel(u: UserRecord) {
  return u.displayName?.trim() || u.account
}

async function openDetail(row: CustomerRequirementRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchCustomerRequirement(row.id)
    current.value = data
    requirementDrawerDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openContractsSide(row: CustomerRequirementRecord) {
  if (!row.contractCount) return
  relatedListRequirement.value = row
  relatedContractsDrawer.value = true
}
function onOpenContractFromRelated(row: ContractRecord) {
  void relationDrawers.value?.openContractSide(row.id)
}

function onRowClick(row: CustomerRequirementRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  void openDetail(row, 'rtl')
}

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openCustomerSide(customerId, direction)
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
  if (scope) {
    exportRequirementsXlsx(scope)
  }
}

function downloadImportTemplate() {
  const example = customerRequirementIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Requirements')
  XLSX.writeFile(wb, 'customer-requirements-import-template.xlsx')
  ElMessage.success(t('customerRequirement.templateDone'))
}

async function exportRequirementsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: CustomerRequirementRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('customerRequirement.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => customerRequirementToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Requirements')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `customer-requirements-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('customerRequirement.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('customerRequirement.importFailed'))
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
    ElMessage.warning(t('customerRequirement.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'updated', 'skipped', 'unlinked', 'failed'],
  })
  try {
    setImportPreparing()
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rawRows.length) {
      finishImport({
        tone: 'warning',
        message: t('customerRequirement.importEmpty'),
      })
      return
    }

    const payloads: CustomerRequirementImportItem[] = []
    for (const row of rawRows) {
      const parsed = rowToCustomerRequirementIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              需求編號: String(row['需求編號'] ?? row['需求编号'] ?? ''),
              客戶編號: String(row['客戶編號'] ?? row['客户编号'] ?? ''),
              客戶名稱: String(row['客戶名稱'] ?? row['客户名称'] ?? row['公司名稱'] ?? row['公司名称'] ?? ''),
            },
          },
        ])
        continue
      }
      payloads.push({
        requirementCode: parsed.requirementCode || undefined,
        customerCode: parsed.customerCode || undefined,
        customerName: parsed.customerName || undefined,
        salesManager: parsed.salesManager || undefined,
        requirementDate: parsed.requirementDate || null,
        status: parsed.status,
        rentalType: parsed.rentalType || undefined,
        leaseDuration: parsed.leaseDuration,
        budget: parsed.budget,
        content: parsed.content,
        remark: parsed.remark,
        attachment: parsed.attachment,
        sizeConfig: parsed.sizeConfig || undefined,
        acConfig: parsed.acConfig || undefined,
        windowConfig: parsed.windowConfig || undefined,
      })
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(payloads, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importCustomerRequirementsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.updated) bumpImport('updated', data.updated)
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
              需求編號: it.requirementCode || '',
              客戶編號: it.customerCode || '',
              客戶名稱: it.customerName || '',
            },
          })),
        )
      }
    }

    await loadList()
    resetPage()
    finishImport()
  } catch {
    failImport(t('customerRequirement.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <RefreshListButton :loading="loading" @refresh="loadList" />
      <h2>{{ t('menu.customerRequirements') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('customerRequirement.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('customerRequirement.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('customerRequirement.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('customerRequirement.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('customerRequirement.downloadTemplate') }}</span>
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

    <div class="table-card" v-loading="loading || importing">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${requirementActionColWidth}`"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
          style="width: 100%"
          class="requirement-table--clickable"
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
            :min-width="codeColW(t('customerRequirement.fields.requirementCode'), { interactive: true, samples: list.map((r) => r.requirementCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.requirementCode')"
                filterable
                sortable
                :options="requirementCodeFilterOptions"
                :model-value="filters.requirementCode || []"
                :sort-order="sortOrderOf('requirementCode')"
                @update:model-value="(v) => setFilter('requirementCode', v)"
                @update:sort-order="(v) => setSort('requirementCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.requirementCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('customerRequirement.fields.customerName'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.customerName')"
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
            :min-width="colW(t('customerRequirement.fields.salesManager'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.salesManager')"
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
            :min-width="colW(t('customerRequirement.fields.requirementDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.requirementDate')"
                sortable
                date-range
                :model-value="filters.requirementDate || []"
                :sort-order="sortOrderOf('requirementDate')"
                :date-range-value="dateRangeOf('requirementDate')"
                @update:sort-order="(v) => setSort('requirementDate', v)"
                @update:model-value="(v) => setFilter('requirementDate', v)"
                @update:date-range-value="(v) => setDateRange('requirementDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.requirementDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('customerRequirement.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.status')"
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
                :tone="customerRequirementStatusTone(row.status)"
                :label="statusLabel(row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('customerRequirement.fields.rentalType'),
                rentalTypeFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.rentalType')"
                filterable
                sortable
                :options="rentalTypeFilterOptions"
                :model-value="filters.rentalType || []"
                :sort-order="sortOrderOf('rentalType')"
                @update:model-value="(v) => setFilter('rentalType', v)"
                @update:sort-order="(v) => setSort('rentalType', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="customerRequirementRentalTypeTone(row.rentalType)"
                :label="rentalTypeLabel(row.rentalType || 'long')"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.leaseDuration'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.leaseDuration')"
                filterable
                sortable
                :options="leaseDurationFilterOptions"
                :model-value="filters.leaseDuration || []"
                :sort-order="sortOrderOf('leaseDuration')"
                @update:model-value="(v) => setFilter('leaseDuration', v)"
                @update:sort-order="(v) => setSort('leaseDuration', v)"
              />
            </template>
            <template #default="{ row }">
              {{ displayLeaseDuration(row.leaseDuration, t) || '—' }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.budget'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.budget')"
                filterable
                sortable
                :options="budgetFilterOptions"
                :model-value="filters.budget || []"
                :sort-order="sortOrderOf('budget')"
                @update:model-value="(v) => setFilter('budget', v)"
                @update:sort-order="(v) => setSort('budget', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.budget == null ? '—' : formatMoney(row.budget) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.sizeConfig'), { interactive: true, contentMin: 100 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.sizeConfig')"
                filterable
                sortable
                :options="sizeConfigFilterOptions"
                :model-value="filters.sizeConfigLabel || []"
                :sort-order="sortOrderOf('sizeConfigLabel')"
                @update:model-value="(v) => setFilter('sizeConfigLabel', v)"
                @update:sort-order="(v) => setSort('sizeConfigLabel', v)"
              />
            </template>
            <template #default="{ row }">{{ row.sizeConfigLabel || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.acConfig'), { interactive: true, contentMin: 90 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.acConfig')"
                filterable
                sortable
                :options="acConfigFilterOptions"
                :model-value="filters.acConfigLabel || []"
                :sort-order="sortOrderOf('acConfigLabel')"
                @update:model-value="(v) => setFilter('acConfigLabel', v)"
                @update:sort-order="(v) => setSort('acConfigLabel', v)"
              />
            </template>
            <template #default="{ row }">{{ row.acConfigLabel || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.windowConfig'), { interactive: true, contentMin: 90 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.windowConfig')"
                filterable
                sortable
                :options="windowConfigFilterOptions"
                :model-value="filters.windowConfigLabel || []"
                :sort-order="sortOrderOf('windowConfigLabel')"
                @update:model-value="(v) => setFilter('windowConfigLabel', v)"
                @update:sort-order="(v) => setSort('windowConfigLabel', v)"
              />
            </template>
            <template #default="{ row }">{{ row.windowConfigLabel || '—' }}</template>
          </el-table-column>
          <el-table-column
            prop="content"
            :label="t('customerRequirement.fields.content')"
            :min-width="textColW(t('customerRequirement.fields.content'), { kind: 'long' })"
            show-overflow-tooltip
          />
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.contractCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.contractCount')"
                sortable
                :sort-order="sortOrderOf('contractCount')"
                @update:sort-order="(v) => setSort('contractCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.contractCount ?? 0" @click="openContractsSide(row)" />
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
            :width="requirementActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <ActionDetailButton @click="openDetail(row as CustomerRequirementRecord)" />
                <button
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="openEdit(row as CustomerRequirementRecord)"
                >
                  {{ t('customerRequirement.followUp') }}
                </button>
                <button
                  v-if="perms.delete && (row as CustomerRequirementRecord).status !== '已取消'"
                  v-admin-glow="perms.codes.delete"
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onCancel(row as CustomerRequirementRecord)"
                >
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-if="perms.purge"
                  v-admin-glow="perms.codes.purge"
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onPurge(row as CustomerRequirementRecord)"
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
          <template v-if="perms.batchDelete || perms.batchPurge" #batch>
            <button
              v-if="perms.batchDelete"
              v-admin-glow="perms.codes.batchDelete"
              type="button"
              class="lb-pager__batch-btn"
              :disabled="batchDeleting || selectAllLoading"
              @click="onBatchCancel"
            >
              {{ t('customerRequirement.batchCancel') }}
            </button>
            <button
              v-if="perms.batchPurge"
              v-admin-glow="perms.codes.batchPurge"
              type="button"
              class="lb-pager__batch-btn"
              :disabled="batchDeleting || selectAllLoading"
              @click="onBatchPurge"
            >
              {{ t('common.batchDelete') }}
            </button>
          </template>
        </TablePagination>
      </div>
    </div>

    <CustomerRequirementDetailDrawer
      v-model="drawerVisible"
      :requirement="current"
      :desktop-direction="requirementDrawerDirection"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-contracts="openContractsSide"
    />
    <RelatedContractsDrawer
      v-model="relatedContractsDrawer"
      :requirement-id="relatedListRequirement?.id"
      :title-context="relatedListRequirement?.requirementCode || ''"
      desktop-direction="ltr"
      @open-contract="onOpenContractFromRelated"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id, 'ltr')"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr')"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

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

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('customerRequirement.edit') : t('customerRequirement.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item
            v-if="editing"
            :label="t('customerRequirement.fields.requirementCode')"
          >
            <el-input v-model="form.requirementCode" disabled />
          </el-form-item>
          <el-form-item
            v-if="editing"
            :label="t('customerRequirement.fields.salesManager')"
          >
            <el-select
              v-model="form.salesManagerId"
              filterable
              clearable
              value-on-clear=""
              fit-input-width
              style="width: 100%"
              popper-class="req-sales-manager-select-popper"
              :placeholder="t('customerRequirement.fields.salesManager')"
            >
              <el-option
                v-for="u in salesManagerOptions"
                :key="u.id"
                :label="userLabel(u)"
                :value="u.id"
                :title="userLabel(u)"
              >
                <span class="select-option-ellipsis" :title="userLabel(u)">{{ userLabel(u) }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.customerName')" required>
            <SelectWithViewAction
              clearable
              :disabled="!form.customerId"
              @view="openCustomerSide(form.customerId, 'ltr')"
            >
              <el-select
                clearable
                value-on-clear=""
                v-model="form.customerId"
                filterable
                fit-input-width
                style="width: 100%"
                popper-class="req-customer-select-popper"
                :placeholder="t('customerRequirement.fields.customerName')"
              >
                <el-option
                  v-for="c in customers"
                  :key="c.id"
                  :label="`${c.customerCode} · ${c.name}`"
                  :value="c.id"
                  :title="`${c.customerCode} · ${c.name}`"
                >
                  <span class="select-option-ellipsis" :title="`${c.customerCode} · ${c.name}`">
                    {{ c.customerCode }} · {{ c.name }}
                  </span>
                </el-option>
              </el-select>
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.customerStatus')">
            <div class="customer-status-ro">
              <StatusBadge
                v-if="selectedCustomer?.status"
                :tone="customerStatusTone(selectedCustomer.status)"
                :label="customerStatusLabel(selectedCustomer.status)"
              />
              <span v-else class="customer-status-empty">—</span>
            </div>
          </el-form-item>
          <el-form-item
            v-if="editing"
            :label="t('customerRequirement.fields.requirementDate')"
          >
            <el-date-picker
              v-model="form.requirementDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item
            v-if="editing"
            :label="t('customerRequirement.fields.status')"
          >
            <el-select clearable value-on-clear="" fit-input-width v-model="form.status" style="width: 100%">
              <el-option
                v-for="s in CUSTOMER_REQUIREMENT_STATUSES"
                :key="s"
                :label="t(`customerRequirement.status.${s}`)"
                :value="s"
              />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-grid form-grid--3">
          <el-form-item :label="t('customerRequirement.fields.rentalType')" required>
            <el-select clearable value-on-clear="" fit-input-width v-model="form.rentalType" style="width: 100%">
              <el-option
                v-for="rt in CUSTOMER_REQUIREMENT_RENTAL_TYPES"
                :key="rt"
                :label="t(`customerRequirement.rentalType.${rt}`)"
                :value="rt"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.leaseDuration')">
            <div class="lease-duration-row">
              <el-input-number
                v-model="form.leaseDurationAmount"
                :min="1"
                :precision="0"
                controls-position="right"
                class="lease-duration-row__amount"
              />
              <el-select clearable value-on-clear="" fit-input-width v-model="form.leaseDurationUnit" class="lease-duration-row__unit">
                <el-option
                  value="year"
                  :label="t('customerRequirement.leaseUnit.year')"
                />
                <el-option
                  value="month"
                  :label="t('customerRequirement.leaseUnit.month')"
                />
                <el-option
                  value="day"
                  :label="t('customerRequirement.leaseUnit.day')"
                />
                <el-option
                  value="hour"
                  :label="t('customerRequirement.leaseUnit.hour')"
                />
              </el-select>
            </div>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.budget')">
            <div class="budget-row">
              <el-input-number
                v-model="form.budget"
                :min="0"
                :precision="2"
                controls-position="right"
                class="budget-row__amount"
              />
              <span class="budget-row__unit">{{ budgetUnitLabel }}</span>
            </div>
          </el-form-item>
        </div>
        <div class="form-grid form-grid--3">
          <el-form-item :label="t('customerRequirement.fields.sizeConfig')">
            <el-select
              fit-input-width
              v-model="form.sizeConfigId"
              clearable
              filterable
              value-on-clear=""
              style="width: 100%"
            >
              <el-option
                v-for="o in sizeOptions"
                :key="o.id"
                :label="o.label"
                :value="o.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.acConfig')">
            <el-select
              fit-input-width
              v-model="form.acConfigId"
              clearable
              filterable
              value-on-clear=""
              style="width: 100%"
            >
              <el-option v-for="o in acOptions" :key="o.id" :label="o.label" :value="o.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.windowConfig')">
            <el-select
              fit-input-width
              v-model="form.windowConfigId"
              clearable
              filterable
              value-on-clear=""
              style="width: 100%"
            >
              <el-option
                v-for="o in windowOptions"
                :key="o.id"
                :label="o.label"
                :value="o.id"
              />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item :label="t('customerRequirement.fields.content')">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="2"
            @input="onContentInput"
          />
        </el-form-item>
        <el-form-item :label="t('customerRequirement.fields.remark')">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('customerRequirement.fields.attachment')">
          <AttachmentField v-model="form.attachment" />
        </el-form-item>

        <section class="matched-rooms">
          <div class="matched-rooms__head">
            <h3>{{ t('customerRequirement.sections.matchedRooms') }}</h3>
            <div class="matched-rooms__head-actions">
              <el-button
                v-if="contractPerms.create"
                v-admin-glow="contractPerms.codes.create"
                type="primary"
                :icon="Plus"
                class="lb-btn-primary"
                size="small"
                :disabled="!matchedSelectedRoom"
                @click="onMatchedRoomsCreateContract"
              >
                {{ t('contract.create') }}
              </el-button>
              <span class="matched-rooms__count">
                {{ t('customerRequirement.matchedRoomsCount', { n: matchedRooms.length }) }}
              </span>
            </div>
          </div>
          <div v-loading="matchedRoomsLoading" class="matched-rooms__body">
            <p v-if="!matchedRoomsLoading && !matchedRooms.length" class="matched-rooms__empty">
              {{ t('customerRequirement.matchedRoomsEmpty') }}
            </p>
            <el-table
              v-else
              :key="matchedRoomTableKey"
              class="matched-rooms__table"
              :data="matchedRooms"
              row-key="id"
              stripe
              border
              height="292"
              style="width: 100%"
            >
              <el-table-column width="42" align="center" header-align="center">
                <template #default="{ row }">
                  <el-radio
                    v-model="matchedSelectedRoomId"
                    :value="row.id"
                    class="matched-room-radio"
                    @click.stop
                  />
                </template>
              </el-table-column>
              <el-table-column
                type="index"
                label="#"
                width="52"
                align="center"
                header-align="center"
              />
              <el-table-column
                prop="name"
                :label="t('room.fields.name')"
                :min-width="colW(t('room.fields.name'), { contentMin: 120 })"
              >
                <template #default="{ row }">
                  <button
                    type="button"
                    class="fk-link"
                    @click.stop="relationDrawers?.openRoomSide(row.id, 'ltr')"
                  >
                    {{ row.name || '—' }}
                  </button>
                </template>
              </el-table-column>
              <el-table-column
                prop="buildingName"
                :label="t('room.fields.building')"
                :min-width="colW(t('room.fields.building'), { contentMin: 140 })"
                show-overflow-tooltip
              />
              <el-table-column
                :label="t('room.fields.status')"
                :min-width="colW(t('room.fields.status'), { contentMin: 92 })"
              >
                <template #default="{ row }">
                  <StatusBadge
                    :tone="roomStatusTone(row.status)"
                    :label="t(`room.status.${row.status}`)"
                  />
                </template>
              </el-table-column>
              <el-table-column
                :label="matchedRentLabel"
                :min-width="colW(matchedRentLabel, { contentMin: 100 })"
                align="right"
              >
                <template #default="{ row }">{{ formatMoney(roomRentAmount(row)) }}</template>
              </el-table-column>
              <el-table-column
                :label="t('room.fields.sizeSqft')"
                :min-width="colW(t('room.fields.sizeSqft'), { contentMin: 88 })"
                align="right"
              >
                <template #default="{ row }">{{ formatNumber2(row.sizeSqft) }}</template>
              </el-table-column>
              <el-table-column
                :label="t('room.fields.acConfig')"
                :min-width="colW(t('room.fields.acConfig'), { contentMin: 96 })"
                show-overflow-tooltip
              >
                <template #default="{ row }">{{ row.acConfig || '—' }}</template>
              </el-table-column>
              <el-table-column
                :label="t('room.fields.windowConfig')"
                :min-width="colW(t('room.fields.windowConfig'), { contentMin: 72 })"
                show-overflow-tooltip
              >
                <template #default="{ row }">{{ row.windowConfig || '—' }}</template>
              </el-table-column>
            </el-table>
          </div>
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
          <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">
            {{ t('common.save') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 本页叠开新增合约（不跳转、不关闭上方需求弹窗） -->
    <ContractListView
      v-if="contractCreateEmbedOpen"
      embed-create-only
      :embed-prefill="contractCreatePrefill"
      :embed-z-index="contractCreateZ"
      @embed-close="onContractCreateEmbedClose"
      @embed-created="onContractCreateEmbedCreated"
    />

    <BatchProgressDialog
      v-model="batchState.visible"
      :ui-key="batchUiKey"
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

.requirement-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.form-grid--3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.customer-status-ro {
  min-height: 32px;
  display: flex;
  align-items: center;
}

.customer-status-empty {
  color: var(--lb-muted, #666);
}

.lease-duration-row {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: center;
}

.lease-duration-row__amount {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.lease-duration-row__amount :deep(.el-input__wrapper) {
  width: 100%;
}

.lease-duration-row__unit {
  flex: 0 0 88px;
  width: 88px;
}

.budget-row {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: center;
}

.budget-row__amount {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.budget-row__amount :deep(.el-input__wrapper) {
  width: 100%;
}

.budget-row__unit {
  flex: 0 0 auto;
  min-width: 3.2em;
  color: var(--lb-muted, #666);
  font-size: 0.9rem;
  white-space: nowrap;
}

.matched-rooms {
  margin-top: 8px;
  margin-bottom: 16px;
  padding-top: 12px;
  padding-bottom: 4px;
  border-top: 1px solid var(--lb-border, #e0e0e0);
}

.matched-rooms__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.matched-rooms__head h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--lb-brand, #0f4a32);
}

.matched-rooms__head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.matched-rooms__count {
  font-size: 0.82rem;
  color: var(--lb-muted, #666);
  white-space: nowrap;
}

.matched-rooms__body {
  min-height: 120px;
}

.matched-rooms__empty {
  margin: 0;
  padding: 28px 12px;
  text-align: center;
  font-size: 0.86rem;
  color: var(--lb-muted, #666);
  background: rgba(15, 74, 50, 0.03);
  border: 1px dashed var(--lb-border, #e6e6e6);
  border-radius: 10px;
}

.matched-rooms__table {
  width: 100%;
}

.matched-room-radio {
  height: auto;
  margin-right: 0;
}

.matched-room-radio :deep(.el-radio__label) {
  display: none;
}

.room-io-file {
  display: none;
}

.select-option-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .form-grid,
  .form-grid--3 {
    grid-template-columns: 1fr;
  }
}
</style>
