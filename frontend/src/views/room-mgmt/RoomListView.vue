<script setup lang="ts">
import { fetchBuildings } from '@/api/buildings'
import {
  fetchRooms,
  fetchRoomLeaseCapabilityCounts,
  createRoomApi,
  updateRoomApi,
  deleteRoomApi,
  batchDeleteRoomsApi,
  batchUpdateRoomsApi,
  importRoomsApi,
  uploadRoomImagesApi,
  deleteRoomImageApi,
  fetchRoomImageBlob,
} from '@/api/rooms'
import type {
  RoomBatchUpdatePayload,
  RoomLeaseCapabilityCounts,
  RoomListQuery,
  RoomWritePayload,
} from '@/api/rooms'
import { fetchRoomConfigs, matchSizeOption } from '@/api/room-configs'
import { fetchRoomTypes } from '@/api/room-types'
import type { BuildingRecord } from '@/types/building'
import type {
  RoomFillStatus,
  RoomImageRecord,
  RoomLeaseCapability,
  RoomRecord,
  RoomStatus,
} from '@/types/room'
import RoomOccupancyChips from '@/components/RoomOccupancyChips.vue'
import RoomDetailDrawer from '@/components/RoomDetailDrawer.vue'
import type { RoomConfigOption } from '@/types/room-config'
import type { RoomTypeOption } from '@/types/room-type'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import { EMPTY_FILTER_VALUE, packFilterValues } from '@/utils/columnFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import RoomTypeBadge from '@/components/RoomTypeBadge.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SuperAdminInlineCell from '@/components/SuperAdminInlineCell.vue'
import { ROOM_INLINE_FIELDS, type RoomInlineField } from '@/config/inlineEditWhitelist'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'



import CountListPill from '@/components/CountListPill.vue'
import RelatedContractsDrawer from '@/components/RelatedContractsDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedTerminationsDrawer from '@/components/RelatedTerminationsDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import type { ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import { roomFillStatusTone, roomLeaseCapabilityTone } from '@/constants/statusBadges'
import { formatDateTime, formatMoney, formatNumber2 } from '@/utils/format'
import {
  roomIoTemplateExampleRow,
  roomToIoRow,
  rowToRoomIoPayload,
} from '@/utils/roomExport'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useBuildingScopeStore } from '@/stores/buildingScope'
import { useImportProgress } from '@/composables/useImportProgress'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useActionColWidth } from '@/composables/useActionColWidth'
import {
  measureStatusBadgeColWidth,
  measureTableColWidth,
  useTableColWidth,
} from '@/composables/useTableColWidth'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'

const { t, locale } = useI18n()
const userStore = useUserStore()
const buildingScope = useBuildingScopeStore()
const perms = useResourcePermissions('rooms')
const { actionColW } = useActionColWidth()
const listActionColWidth = computed(() =>
  actionColW([
    t('common.detail'),
    perms.update && t('common.edit'),
    perms.delete && t('common.delete'),
  ]),
)
const { colW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()
const isMobile = useIsMobile()
const useCards = computed(() => isMobile.value)

const keyword = ref('')
const drawerVisible = ref(false)
const relatedContractsDrawer = ref(false)
const relatedInvoicesDrawer = ref(false)
const relatedTerminationsDrawer = ref(false)
const relatedDepositRefundsDrawer = ref(false)
const relatedListRoom = ref<RoomRecord | null>(null)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const formVisible = ref(false)
const saving = ref(false)
const current = ref<RoomRecord | null>(null)
const formExistingImages = ref<RoomImageRecord[]>([])
const formPendingImages = ref<Array<{ key: string; file: File; previewUrl: string }>>([])
const formRemovedImageIds = ref<string[]>([])
const formExistingUrlById = ref<Record<string, string>>({})
const formImagesExpanded = ref(false)
const imageFileInput = ref<HTMLInputElement | null>(null)
const formImageCollapseAt = 6
const formExistingObjectUrls: string[] = []

const formPreviewList = computed(() => {
  const existing = formExistingImages.value
    .map((img) => formExistingUrlById.value[img.id])
    .filter(Boolean) as string[]
  return [...existing, ...formPendingImages.value.map((p) => p.previewUrl)]
})

const formTotalImageCount = computed(
  () => formExistingImages.value.length + formPendingImages.value.length,
)

const formVisibleExisting = computed(() => {
  if (formImagesExpanded.value || formTotalImageCount.value <= formImageCollapseAt) {
    return formExistingImages.value
  }
  return formExistingImages.value.slice(0, formImageCollapseAt)
})

const formVisiblePending = computed(() => {
  if (formImagesExpanded.value || formTotalImageCount.value <= formImageCollapseAt) {
    return formPendingImages.value
  }
  const remain = Math.max(0, formImageCollapseAt - formExistingImages.value.length)
  return formPendingImages.value.slice(0, remain)
})

const formHiddenImageCount = computed(() =>
  Math.max(0, formTotalImageCount.value - formImageCollapseAt),
)

async function loadFormExistingUrls() {
  for (const u of formExistingObjectUrls) URL.revokeObjectURL(u)
  formExistingObjectUrls.length = 0
  const roomId = editing.value?.id
  const next: Record<string, string> = {}
  if (!roomId) {
    formExistingUrlById.value = {}
    return
  }
  await Promise.all(
    formExistingImages.value.map(async (img) => {
      if (img.publicUrl) {
        next[img.id] = img.publicUrl
        return
      }
      try {
        const blob = await fetchRoomImageBlob(roomId, img.id)
        const url = URL.createObjectURL(blob)
        formExistingObjectUrls.push(url)
        next[img.id] = url
      } catch {
        /* skip */
      }
    }),
  )
  formExistingUrlById.value = next
}

function resetFormImages() {
  for (const p of formPendingImages.value) URL.revokeObjectURL(p.previewUrl)
  for (const u of formExistingObjectUrls) URL.revokeObjectURL(u)
  formExistingObjectUrls.length = 0
  formExistingImages.value = []
  formPendingImages.value = []
  formRemovedImageIds.value = []
  formExistingUrlById.value = {}
  formImagesExpanded.value = false
}

function onPickRoomImages(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || []).filter((f) => f.type.startsWith('image/'))
  input.value = ''
  for (const file of files) {
    formPendingImages.value.push({
      key: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    })
  }
}

function removePendingImage(key: string) {
  const idx = formPendingImages.value.findIndex((p) => p.key === key)
  if (idx < 0) return
  URL.revokeObjectURL(formPendingImages.value[idx].previewUrl)
  formPendingImages.value.splice(idx, 1)
}

function removeExistingImage(id: string) {
  formExistingImages.value = formExistingImages.value.filter((img) => img.id !== id)
  if (!formRemovedImageIds.value.includes(id)) formRemovedImageIds.value.push(id)
  const { [id]: _removed, ...rest } = formExistingUrlById.value
  formExistingUrlById.value = rest
}

function formPreviewIndex(url?: string) {
  if (!url) return 0
  const idx = formPreviewList.value.indexOf(url)
  return idx >= 0 ? idx : 0
}
const editing = ref<RoomRecord | null>(null)







const buildings = ref<BuildingRecord[]>([])
const sizeOptions = ref<RoomConfigOption[]>([])
const windowOptions = ref<RoomConfigOption[]>([])
const acOptions = ref<RoomConfigOption[]>([])
const roomTypeOptions = ref<RoomTypeOption[]>([])
const roomTypeToneByLabel = computed(() => {
  const map = new Map<string, string>()
  for (const o of roomTypeOptions.value) map.set(o.label, o.tone)
  return map
})

/** 状态列：闲置中 / 整租中 / 分租中 / 满租 */
const fillStatusOptions: RoomFillStatus[] = ['idle', 'short', 'whole', 'partial', 'full']
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
  uniqueOptions,
} = useTableSortFilter<RoomRecord>()

const roomTypeFilterOptions = computed(() =>
  roomTypeOptions.value.map((o) => ({ value: o.label, label: o.label })),
)
const buildingFilterOptions = computed(() =>
  buildings.value.map((b) => ({ value: b.id, label: b.name })),
)
const statusFilterOptions = computed(() =>
  fillStatusOptions.map((s) => ({ value: s, label: t(`room.fillStatus.${s}`) })),
)
const roomCodeFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.roomCode))
const roomNameFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.name))
const leaseCapabilityColumnFilterOptions = computed(() =>
  (['flexible', 'whole_only', 'part_only'] as const).map((cap) => ({
    value: cap,
    label: leaseCapabilityLabel(cap),
  })),
)
const monthlyRentFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => (r.monthlyRent == null ? '' : String(r.monthlyRent))),
)
const dailyRentFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => (r.dailyRent == null ? '' : String(r.dailyRent))),
)
const hourlyRentFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => (r.hourlyRent == null ? '' : String(r.hourlyRent))),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))
const updatedByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.updatedBy))

function fillStatusOf(row: RoomRecord | null | undefined): RoomFillStatus {
  return row?.occupancy?.summary || 'idle'
}

function leaseCapabilityLabel(cap?: RoomLeaseCapability | string | null) {
  if (cap === 'whole_only') return t('room.leaseCapability.wholeOnlyShort')
  if (cap === 'part_only') return t('room.leaseCapability.partOnlyShort')
  return t('room.leaseCapability.flexibleShort')
}

/**
 * 租用情况列宽：取「表头 / 四态徽章 / 分租徽章+比例胶囊」最大值。
 * 中文比例预留 38；英文 36（刚好放下 Split + 2/3 ∨）。
 */
const occupancyColMinWidth = computed(() => {
  void locale.value
  const headerW = measureTableColWidth(t('room.fields.occupancy'), { interactive: false })
  const lifecycleW = Math.max(
    measureStatusBadgeColWidth(t('room.status.idle')),
    measureStatusBadgeColWidth(t('room.status.signing')),
    measureStatusBadgeColWidth(t('room.status.leased')),
    measureStatusBadgeColWidth(t('room.status.terminating')),
  )
  const splitMeta = String(locale.value).toLowerCase().startsWith('zh') ? 38 : 36
  const splitW = measureStatusBadgeColWidth(t('room.occupancy.split')) + splitMeta
  return Math.max(headerW, lifecycleW, splitW)
})
const sizeRangeFilterOptions = computed(() =>
  [...sizeOptions.value]
    .filter((o) => o.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'zh-Hant'))
    .map((o) => ({ value: o.id, label: o.label })),
)
const windowConfigFilterOptions = computed(() =>
  windowOptions.value
    .filter((o) => o.active)
    .map((o) => ({ value: o.label, label: o.label })),
)
const acConfigFilterOptions = computed(() =>
  acOptions.value.filter((o) => o.active).map((o) => ({ value: o.label, label: o.label })),
)

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
} = useServerPagedList<RoomRecord, RoomListQuery>({
  keyword,
  sortFilter: {
    filters,
    dateRanges,
    dateRangeOf,
    sortKey,
    sortOrder,
    clearAll,
  },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const updated = range('updatedAt')
    return {
      keyword: kw,
      buildingIds: buildingScope.selectedId ? undefined : packFilterValues(f.buildingId),
      leaseCapability: leaseCapabilityFilter.value || undefined,
      leaseCapabilities: !leaseCapabilityFilter.value
        ? packFilterValues(f.leaseCapability)
        : undefined,
      roomCodes: packFilterValues(f.roomCode),
      names: packFilterValues(f.name),
      monthlyRents: packFilterValues(f.monthlyRent),
      dailyRents: packFilterValues(f.dailyRent),
      hourlyRents: packFilterValues(f.hourlyRent),
      occupancySummaries: packFilterValues(f.status),
      roomTypes: packFilterValues(f.roomType),
      sizeRangeIds: packFilterValues(f.sizeRange),
      windowConfigs: packFilterValues(f.windowConfig),
      acConfigs: packFilterValues(f.acConfig),
      createdBys: packFilterValues(f.createdBy),
      updatedBys: packFilterValues(f.updatedBy),
      createdAtEmpty: (f.createdAt || []).includes(EMPTY_FILTER_VALUE) || undefined,
      updatedAtEmpty: (f.updatedAt || []).includes(EMPTY_FILTER_VALUE) || undefined,
      sortBy,
      sortDir,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      updatedAtFrom: updated.from,
      updatedAtTo: updated.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchRooms,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<RoomRecord>()
const batchDeleting = ref(false)
const batchEditVisible = ref(false)
const batchEditing = ref(false)
/** 勾选才写入：未勾选字段不会出现在请求体 */
const batchEditEnable = reactive({
  allowShortTerm: true,
  roomType: false,
  buildingId: false,
  windowConfig: false,
  acConfig: false,
  leaseCapability: false,
  monthlyRent: false,
  dailyRent: false,
  hourlyRent: false,
  sizeSqft: false,
  description: false,
  remark: false,
})
const batchEditForm = reactive({
  allowShortTerm: true,
  roomType: '',
  buildingId: '',
  windowConfig: '',
  acConfig: '',
  leaseCapability: 'flexible' as RoomLeaseCapability,
  splitCount: 2,
  monthlyRent: 0,
  dailyRent: 0,
  hourlyRent: 0,
  sizeSqft: 0,
  description: '',
  remark: '',
})
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteRoomsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadOptions()
    await loadLeaseCapabilityCounts()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

function resetBatchEditForm() {
  batchEditEnable.allowShortTerm = true
  batchEditEnable.roomType = false
  batchEditEnable.buildingId = false
  batchEditEnable.windowConfig = false
  batchEditEnable.acConfig = false
  batchEditEnable.leaseCapability = false
  batchEditEnable.monthlyRent = false
  batchEditEnable.dailyRent = false
  batchEditEnable.hourlyRent = false
  batchEditEnable.sizeSqft = false
  batchEditEnable.description = false
  batchEditEnable.remark = false
  batchEditForm.allowShortTerm = true
  batchEditForm.roomType = ''
  batchEditForm.buildingId = ''
  batchEditForm.windowConfig = ''
  batchEditForm.acConfig = ''
  batchEditForm.leaseCapability = 'flexible'
  batchEditForm.splitCount = 2
  batchEditForm.monthlyRent = 0
  batchEditForm.dailyRent = 0
  batchEditForm.hourlyRent = 0
  batchEditForm.sizeSqft = 0
  batchEditForm.description = ''
  batchEditForm.remark = ''
}

function openBatchEdit() {
  if (!userStore.isSuperAdmin || !selectedIds.value.length) return
  resetBatchEditForm()
  batchEditVisible.value = true
}

function buildBatchUpdatePayload(ids: string[]) {
  const payload: RoomBatchUpdatePayload = { ids }
  if (batchEditEnable.allowShortTerm) payload.allowShortTerm = batchEditForm.allowShortTerm
  if (batchEditEnable.roomType) payload.roomType = batchEditForm.roomType
  if (batchEditEnable.buildingId) payload.buildingId = batchEditForm.buildingId
  if (batchEditEnable.windowConfig) payload.windowConfig = batchEditForm.windowConfig
  if (batchEditEnable.acConfig) payload.acConfig = batchEditForm.acConfig
  if (batchEditEnable.leaseCapability) {
    payload.leaseCapability = batchEditForm.leaseCapability
    if (batchEditForm.leaseCapability === 'flexible') {
      payload.splitCount = batchEditForm.splitCount
    }
  }
  if (batchEditEnable.monthlyRent) payload.monthlyRent = batchEditForm.monthlyRent
  if (batchEditEnable.dailyRent) payload.dailyRent = batchEditForm.dailyRent
  if (batchEditEnable.hourlyRent) payload.hourlyRent = batchEditForm.hourlyRent
  if (batchEditEnable.sizeSqft) payload.sizeSqft = batchEditForm.sizeSqft
  if (batchEditEnable.description) payload.description = batchEditForm.description
  if (batchEditEnable.remark) payload.remark = batchEditForm.remark
  return payload
}

async function onBatchEditSubmit() {
  if (!userStore.isSuperAdmin || !selectedIds.value.length) return
  const enabled = Object.values(batchEditEnable).some(Boolean)
  if (!enabled) {
    ElMessage.warning(t('room.batchEdit.needField'))
    return
  }
  if (batchEditEnable.roomType && !batchEditForm.roomType) {
    ElMessage.warning(t('room.roomTypeRequired'))
    return
  }
  if (batchEditEnable.buildingId && !batchEditForm.buildingId) {
    ElMessage.warning(t('room.buildingRequired'))
    return
  }
  const ids = [...selectedIds.value]
  batchEditing.value = true
  try {
    let updated = 0
    const chunkSize = 100
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const { data } = await batchUpdateRoomsApi(buildBatchUpdatePayload(chunk))
      updated += data.updated || 0
    }
    batchEditVisible.value = false
    if (updated === ids.length) {
      ElMessage.success(t('room.batchEdit.done', { n: updated }))
    } else {
      ElMessage.warning(t('room.batchEdit.partial', { ok: updated, req: ids.length }))
    }
    clearSelection()
    await loadLeaseCapabilityCounts()
    await loadList()
  } finally {
    batchEditing.value = false
  }
}

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

function toneForLabel(label: string) {
  return roomTypeToneByLabel.value.get(label)
}

async function loadOptions() {
  const [buildingsRes, configsRes, typesRes] = await Promise.all([
    fetchBuildings(),
    fetchRoomConfigs({ activeOnly: true }),
    fetchRoomTypes({ activeOnly: true }),
  ])
  buildings.value = buildingsRes.data.items
  const configs = configsRes.data
  sizeOptions.value = configs.filter((c) => c.type === 'size')
  windowOptions.value = configs.filter((c) => c.type === 'window')
  acOptions.value = configs.filter((c) => c.type === 'ac')
  roomTypeOptions.value = typesRes.data
}

onMounted(() => {
  void loadOptions()
  void loadLeaseCapabilityCounts()
  void loadList()
})

watch(
  () => buildingScope.viewKey,
  () => {
    void loadLeaseCapabilityCounts()
  },
)

watch(formVisible, (open) => {
  if (!open) resetFormImages()
})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '860px'))
const drawerSize = computed(() => (isMobile.value ? '92%' : '560px'))

const form = reactive({
  roomCode: '',
  name: '',
  roomType: '',
  buildingId: '',
  status: 'idle' as RoomStatus,
  serialNo: '',
  monthlyRent: 0,
  dailyRent: 0,
  hourlyRent: 0,
  sizeSqft: 0,
  description: '',
  remark: '',
  windowConfig: '',
  acConfig: '',
  subleaseMark: '',
  leaseCapability: 'flexible' as RoomLeaseCapability,
  splitCount: 2,
  allowShortTerm: false,
})

const previewSplitLabels = computed(() => {
  const n = Math.min(26, Math.max(2, Math.floor(Number(form.splitCount) || 2)))
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i))
})

/** 仅「可整可分」配置份位；只能分租用独立后缀房间（如 6SPi09A） */
const formNeedsSplitParts = computed(() => form.leaseCapability === 'flexible')

/** 页头租赁能力胶囊筛选：null=全部 */
const leaseCapabilityFilter = ref<RoomLeaseCapability | null>(null)
const leaseCapabilityCounts = ref<RoomLeaseCapabilityCounts>({
  all: 0,
  flexible: 0,
  whole_only: 0,
  part_only: 0,
})

const leaseCapabilityChips = computed(() => [
  {
    key: null as RoomLeaseCapability | null,
    label: t('room.leaseFilterAll'),
    count: leaseCapabilityCounts.value.all,
  },
  {
    key: 'flexible' as RoomLeaseCapability,
    label: t('room.leaseCapability.flexibleShort'),
    count: leaseCapabilityCounts.value.flexible,
  },
  {
    key: 'whole_only' as RoomLeaseCapability,
    label: t('room.leaseCapability.wholeOnlyShort'),
    count: leaseCapabilityCounts.value.whole_only,
  },
  {
    key: 'part_only' as RoomLeaseCapability,
    label: t('room.leaseCapability.partOnlyShort'),
    count: leaseCapabilityCounts.value.part_only,
  },
])

async function loadLeaseCapabilityCounts() {
  try {
    const { data } = await fetchRoomLeaseCapabilityCounts()
    leaseCapabilityCounts.value = data
  } catch {
    /* interceptor */
  }
}

async function onRefreshList() {
  await Promise.all([loadList(), loadLeaseCapabilityCounts()])
}

function setLeaseCapabilityFilter(cap: RoomLeaseCapability | null) {
  if (leaseCapabilityFilter.value === cap) return
  leaseCapabilityFilter.value = cap
  if (cap) setFilter('leaseCapability', [])
  resetPage()
  void loadList()
}

const matchedSizeOption = computed(() => {
  const n = Number(form.sizeSqft)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return matchSizeOption(sizeOptions.value, n)
})

/** 表单可选大厦：仅当前账号有权限的大厦（与顶栏大厦范围一致） */
const formBuildingOptions = computed(() => {
  const currentId = form.buildingId
  const allowed = buildingScope.options
  const list = allowed.filter((b) => b.active || b.id === currentId)
  // 编辑时若当前归属不在权限内（异常数据），仍展示该项但禁用切换靠校验拦截
  if (currentId && !list.some((b) => b.id === currentId)) {
    const orphan = buildings.value.find((b) => b.id === currentId)
    if (orphan) return [orphan, ...list]
  }
  return list
})

/** 仅一栋可管 / 全局已锁定某大厦且新增：不显示归属字段 */
const showRoomBuildingField = computed(() => {
  if (buildingScope.locked || formBuildingOptions.value.length <= 1) return false
  if (!editing.value && buildingScope.selectedId) return false
  return true
})

function money(n: number) {
  return formatMoney(n)
}

function number2(n: number) {
  return formatNumber2(n)
}

async function onRoomInlineSave(
  row: RoomRecord,
  field: RoomInlineField,
  value: string | number | null,
) {
  if (!(field in ROOM_INLINE_FIELDS)) return
  try {
    const payload = { [field]: value } as Partial<RoomWritePayload>
    const { data } = await updateRoomApi(row.id, payload)
    const idx = list.value.findIndex((r) => r.id === row.id)
    if (idx >= 0) list.value[idx] = { ...list.value[idx], ...data }
    if (current.value?.id === row.id) current.value = { ...current.value, ...data }
    ElMessage.success(t('room.updated'))
  } catch {
    /* interceptor */
  }
}

function openDetail(row: RoomRecord) {
  current.value = row
  drawerVisible.value = true
}

function openContractsSide(row: RoomRecord) {
  if (!row.contractCount) return
  relatedListRoom.value = row
  relatedContractsDrawer.value = true
}
function openInvoicesSide(row: RoomRecord) {
  if (!row.invoiceCount) return
  relatedListRoom.value = row
  relatedInvoicesDrawer.value = true
}
function openTerminationsSide(row: RoomRecord) {
  if (!row.terminationCount) return
  relatedListRoom.value = row
  relatedTerminationsDrawer.value = true
}
function openDepositRefundsSide(row: RoomRecord) {
  if (!row.depositRefundCount) return
  relatedListRoom.value = row
  relatedDepositRefundsDrawer.value = true
}
function onOpenContractFromRelated(row: ContractRecord) {
  void relationDrawers.value?.openContractSide(row.id)
}
function onOpenInvoiceFromRelated(row: InvoiceRecord) {
  void relationDrawers.value?.openInvoiceSide(row.id)
}
function onOpenTerminationFromRelated(row: LeaseTerminationRecord) {
  void relationDrawers.value?.openTerminationSide(row.id)
}
function onOpenDepositRefundFromRelated(row: DepositRefundRecord) {
  void relationDrawers.value?.openDepositRefundSide(row.id)
}

async function openBuildingDetail(buildingId: string) {
  await relationDrawers.value?.openBuildingSide(buildingId)
}





function onRoomRowClick(row: RoomRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  openDetail(row)
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
    void exportRoomsXlsx(scope)
  }
}

function downloadImportTemplate() {
  const example = roomIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rooms')
  XLSX.writeFile(wb, 'rooms-import-template.xlsx')
  ElMessage.success(t('room.templateDone'))
}

async function exportRoomsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: RoomRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('room.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => roomToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rooms')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `rooms-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('room.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('room.importFailed'))
  } finally {
    exporting.value = false
  }
}

function onImportFile(ev: Event) {
  void runImportFile(ev)
}

async function runImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!perms.import) {
    ElMessage.warning(t('room.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'updated', 'skipped', 'unlinked', 'failed'],
  })
  try {
    setImportPreparing()
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rawRows.length) {
      finishImport({ tone: 'warning', message: t('room.importEmpty') })
      return
    }

    const payloads: RoomWritePayload[] = []
    for (const row of rawRows) {
      const parsed = rowToRoomIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              房間編號: String(row['房間編號'] ?? row['房间编号'] ?? row['房號'] ?? ''),
              房間名稱: String(row['房間名稱'] ?? row['房间名称'] ?? ''),
              大廈名稱: String(row['所屬大廈'] ?? row['所属大厦'] ?? row['大廈'] ?? row['大厦'] ?? ''),
            },
          },
        ])
        continue
      }
      payloads.push({
        roomCode: parsed.roomCode,
        name: parsed.name,
        roomType: parsed.roomType,
        buildingName: parsed.buildingName,
        status: parsed.status,
        serialNo: parsed.serialNo,
        monthlyRent: parsed.monthlyRent,
        dailyRent: parsed.dailyRent,
        hourlyRent: parsed.hourlyRent,
        sizeSqft: parsed.sizeSqft,
        windowConfig: parsed.windowConfig,
        acConfig: parsed.acConfig,
        subleaseMark: parsed.subleaseMark,
        description: parsed.description,
        remark: parsed.remark,
        latestContract: parsed.latestContract,
      })
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(payloads, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importRoomsApi(batch)
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
              房間編號: it.roomCode || '',
              房間名稱: it.name || '',
              大廈名稱: it.buildingName || '',
            },
          })),
        )
      }
    }

    await loadOptions()
    await loadLeaseCapabilityCounts()
    await loadList()
    resetPage()
    finishImport()
  } catch {
    failImport(t('room.importFailed'))
  }
}

function openCreate() {
  editing.value = null
  resetFormImages()
  const selectedBuildingId = buildingScope.selectedId
  const defaultBuildingId =
    selectedBuildingId && buildings.value.some((b) => b.id === selectedBuildingId && b.active)
      ? selectedBuildingId
      : ''
  Object.assign(form, {
    roomCode: '',
    name: '',
    roomType: '',
    buildingId: defaultBuildingId,
    status: 'idle',
    serialNo: '',
    monthlyRent: 0,
    dailyRent: 0,
    hourlyRent: 0,
    sizeSqft: 0,
    description: '',
    remark: '',
    windowConfig: '',
    acConfig: '',
    subleaseMark: '',
    leaseCapability: 'flexible',
    splitCount: 2,
    allowShortTerm: false,
  })
  formVisible.value = true
}

function openEdit(row: RoomRecord) {
  editing.value = row
  resetFormImages()
  formExistingImages.value = [...(row.images || [])]
  Object.assign(form, {
    roomCode: row.roomCode,
    name: row.name,
    roomType: row.roomType,
    buildingId: row.buildingId,
    status: row.status,
    serialNo: row.serialNo,
    monthlyRent: row.monthlyRent,
    dailyRent: row.dailyRent,
    hourlyRent: row.hourlyRent,
    sizeSqft: row.sizeSqft,
    description: row.description || '',
    remark: row.remark || '',
    windowConfig: row.windowConfig || '',
    acConfig: row.acConfig || '',
    subleaseMark: row.subleaseMark || '',
    leaseCapability: row.leaseCapability || 'flexible',
    splitCount: Math.max(2, row.splitLabels?.length || 2),
    allowShortTerm: row.allowShortTerm === true,
  })
  formVisible.value = true
  void loadFormExistingUrls()
}

function canDeleteRoom(row: RoomRecord) {
  return !(row.contractCount ?? 0)
}

async function onDelete(row: RoomRecord) {
  if (!canDeleteRoom(row)) {
    ElMessage.warning(t('room.deleteBlockedHasContracts'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('room.deleteConfirm', { code: row.roomCode || row.name }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteRoomApi(row.id)
    ElMessage.success(t('room.deleted'))
    await loadOptions()
    await loadLeaseCapabilityCounts()
    await loadList()
  } catch {
    /* cancel or interceptor */
  }
}

function acOptionLabel(opt: RoomConfigOption) {
  const extra = [opt.brand, opt.model].filter(Boolean).join(' ')
  return extra ? `${opt.label}（${extra}）` : opt.label
}

async function saveForm() {
  if (saving.value) return
  if (!form.roomCode.trim() || !form.name.trim()) return
  if (!form.roomType.trim()) {
    ElMessage.warning(t('room.roomTypeRequired'))
    return
  }
  if (!form.buildingId) {
    ElMessage.warning(t('room.buildingRequired'))
    return
  }
  const allowedBuildingIds = new Set(buildingScope.options.map((b) => b.id))
  if (!userStore.isAdmin && !allowedBuildingIds.has(form.buildingId)) {
    ElMessage.warning(t('room.buildingNoPermission'))
    return
  }
  if (!(Number(form.monthlyRent) > 0)) {
    ElMessage.warning(t('room.monthlyRentRequired'))
    return
  }
  if (!(Number(form.sizeSqft) > 0)) {
    ElMessage.warning(t('room.sizeSqftRequired'))
    return
  }
  const payload: RoomWritePayload = {
    roomCode: form.roomCode.trim(),
    name: form.name.trim(),
    roomType: form.roomType,
    buildingId: form.buildingId,
    status: form.status as RoomStatus,
    serialNo: form.serialNo,
    monthlyRent: form.monthlyRent,
    dailyRent: form.dailyRent,
    hourlyRent: form.hourlyRent,
    sizeSqft: form.sizeSqft,
    description: form.description,
    remark: form.remark,
    windowConfig: form.windowConfig,
    acConfig: form.acConfig,
    subleaseMark: form.subleaseMark,
    leaseCapability: form.leaseCapability,
    splitCount: formNeedsSplitParts.value ? form.splitCount : undefined,
    splitLabels: formNeedsSplitParts.value ? previewSplitLabels.value : [],
    allowShortTerm: form.allowShortTerm === true,
  }
  saving.value = true
  try {
    let roomId = editing.value?.id || ''
    if (editing.value) {
      await updateRoomApi(editing.value.id, payload)
      for (const imageId of formRemovedImageIds.value) {
        await deleteRoomImageApi(editing.value.id, imageId)
      }
    } else {
      if (!perms.import) {
        ElMessage.warning(t('room.importAdminOnly'))
        return
      }
      const created = await createRoomApi(payload)
      roomId = created.data.id
    }
    const pendingFiles = formPendingImages.value.map((p) => p.file)
    if (roomId && pendingFiles.length) {
      await uploadRoomImagesApi(roomId, pendingFiles)
    }
    formVisible.value = false
    resetFormImages()
    await loadOptions()
    await loadLeaseCapabilityCounts()
    await loadList()
  } catch {
    /* interceptor */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <RefreshListButton :loading="loading" @refresh="() => void onRefreshList()" />
      <h2>{{ t('menu.rooms') }}</h2>
      <div class="building-chips-rail">
        <div class="building-chips" role="tablist" :aria-label="t('room.fields.leaseCapability')">
          <button
            v-for="chip in leaseCapabilityChips"
            :key="chip.key ?? 'all'"
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': leaseCapabilityFilter === chip.key }"
            :aria-selected="leaseCapabilityFilter === chip.key"
            @click="setLeaseCapabilityFilter(chip.key)"
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
          :placeholder="t('room.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="tableHeaderConditionCount" @clear="onClearTableHeaderFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('room.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('room.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('room.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('room.downloadTemplate') }}</span>
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

    <div v-if="!useCards" class="table-card">
      <div
        class="table-scroll"
        v-loading="loading"
        element-loading-background="rgba(247, 250, 248, 0.78)"
      >
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${listActionColWidth}`"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
          class="room-table--clickable"
          style="width: 100%"
          @selection-change="onSelectionChange"
          @row-click="onRoomRowClick"
        >
          <el-table-column
            type="selection"
            width="48"
            fixed="left"
            align="center"
            header-align="center"
            reserve-selection
          />
          <el-table-column type="index" :index="rowIndex" label="#" width="52" fixed="left" align="center" header-align="center" />
          <el-table-column
            prop="roomCode"
            :min-width="codeColW(t('room.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.roomCode')"
                filterable
                sortable
                :options="roomCodeFilterOptions"
                :model-value="filters.roomCode || []"
                :sort-order="sortOrderOf('roomCode')"
                @update:model-value="(v) => setFilter('roomCode', v)"
                @update:sort-order="(v) => setSort('roomCode', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="name"
            :min-width="codeColW(t('room.fields.name'), { interactive: true, samples: list.map((r) => r.name) })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.name')"
                filterable
                sortable
                :options="roomNameFilterOptions"
                :model-value="filters.name || []"
                :sort-order="sortOrderOf('name')"
                @update:model-value="(v) => setFilter('name', v)"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.roomType'), { interactive: true, contentMin: 132 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.roomType')"
                filterable
                :options="roomTypeFilterOptions"
                :model-value="filters.roomType || []"
                @update:model-value="(v) => setFilter('roomType', v)"
              />
            </template>
            <template #default="{ row }">
              <RoomTypeBadge :value="row.roomType" :tone="toneForLabel(row.roomType)" />
            </template>
          </el-table-column>
          <el-table-column
            v-if="!buildingScope.selectedId"
            prop="buildingName"
            :min-width="colW(t('room.fields.building'), { interactive: true, contentMin: 178 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.building')"
                filterable
                sortable
                :options="buildingFilterOptions"
                :model-value="filters.buildingId || []"
                :sort-order="sortOrderOf('buildingId')"
                @update:model-value="(v) => setFilter('buildingId', v)"
                @update:sort-order="(v) => setSort('buildingId', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                type="button"
                class="fk-link"
                @click.stop="openBuildingDetail((row as RoomRecord).buildingId)"
              >
                {{ (row as RoomRecord).buildingName }}
              </button>
            </template>
          </el-table-column>
          <el-table-column
            v-if="!leaseCapabilityFilter"
            :min-width="
              statusColW(
                t('room.fields.leaseCapability'),
                [
                  t('room.leaseCapability.flexibleShort'),
                  t('room.leaseCapability.wholeOnlyShort'),
                  t('room.leaseCapability.partOnlyShort'),
                ],
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.leaseCapability')"
                filterable
                sortable
                :options="leaseCapabilityColumnFilterOptions"
                :model-value="filters.leaseCapability || []"
                :sort-order="sortOrderOf('leaseCapability')"
                @update:model-value="(v) => setFilter('leaseCapability', v)"
                @update:sort-order="(v) => setSort('leaseCapability', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="roomLeaseCapabilityTone((row as RoomRecord).leaseCapability)"
                :label="leaseCapabilityLabel((row as RoomRecord).leaseCapability)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('room.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.status')"
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
                :tone="roomFillStatusTone(fillStatusOf(row as RoomRecord))"
                :label="t(`room.fillStatus.${fillStatusOf(row as RoomRecord)}`)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('room.fields.occupancy')"
            :min-width="occupancyColMinWidth"
          >
            <template #default="{ row }">
              <RoomOccupancyChips
                :occupancy="row.occupancy"
                :lease-capability="row.leaseCapability"
                :split-labels="row.splitLabels"
                @open-contract="(id) => relationDrawers?.openContractSide(id)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.monthlyRent'), { interactive: true, contentMin: 112 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.monthlyRent')"
                filterable
                sortable
                :options="monthlyRentFilterOptions"
                :model-value="filters.monthlyRent || []"
                :sort-order="sortOrderOf('monthlyRent')"
                @update:model-value="(v) => setFilter('monthlyRent', v)"
                @update:sort-order="(v) => setSort('monthlyRent', v)"
              />
            </template>
            <template #default="{ row }">
              <SuperAdminInlineCell
                :value="row.monthlyRent"
                type="number"
                :precision="2"
                :min="0"
                :display-text="money(row.monthlyRent)"
                @save="(v) => onRoomInlineSave(row as RoomRecord, 'monthlyRent', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.dailyRent'), { interactive: true, contentMin: 108 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.dailyRent')"
                filterable
                sortable
                :options="dailyRentFilterOptions"
                :model-value="filters.dailyRent || []"
                :sort-order="sortOrderOf('dailyRent')"
                @update:model-value="(v) => setFilter('dailyRent', v)"
                @update:sort-order="(v) => setSort('dailyRent', v)"
              />
            </template>
            <template #default="{ row }">
              <SuperAdminInlineCell
                :value="row.dailyRent"
                type="number"
                :precision="2"
                :min="0"
                :display-text="money(row.dailyRent)"
                @save="(v) => onRoomInlineSave(row as RoomRecord, 'dailyRent', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.hourlyRent'), { interactive: true, contentMin: 108 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.hourlyRent')"
                filterable
                sortable
                :options="hourlyRentFilterOptions"
                :model-value="filters.hourlyRent || []"
                :sort-order="sortOrderOf('hourlyRent')"
                @update:model-value="(v) => setFilter('hourlyRent', v)"
                @update:sort-order="(v) => setSort('hourlyRent', v)"
              />
            </template>
            <template #default="{ row }">
              <SuperAdminInlineCell
                :value="row.hourlyRent"
                type="number"
                :precision="2"
                :min="0"
                :display-text="money(row.hourlyRent)"
                @save="(v) => onRoomInlineSave(row as RoomRecord, 'hourlyRent', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.sizeSqft'), { interactive: true, contentMin: 118 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.sizeSqft')"
                sortable
                filterable
                :options="sizeRangeFilterOptions"
                :model-value="filters.sizeRange || []"
                :sort-order="sortOrderOf('sizeSqft')"
                @update:model-value="(v) => setFilter('sizeRange', v)"
                @update:sort-order="(v) => setSort('sizeSqft', v)"
              />
            </template>
            <template #default="{ row }">{{ number2(row.sizeSqft) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.windowConfig'), { interactive: true, contentMin: 92 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.windowConfig')"
                filterable
                sortable
                :options="windowConfigFilterOptions"
                :model-value="filters.windowConfig || []"
                :sort-order="sortOrderOf('windowConfig')"
                @update:model-value="(v) => setFilter('windowConfig', v)"
                @update:sort-order="(v) => setSort('windowConfig', v)"
              />
            </template>
            <template #default="{ row }">{{ row.windowConfig || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.acConfig'), { interactive: true, contentMin: 136 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.acConfig')"
                filterable
                sortable
                :options="acConfigFilterOptions"
                :model-value="filters.acConfig || []"
                :sort-order="sortOrderOf('acConfig')"
                @update:model-value="(v) => setFilter('acConfig', v)"
                @update:sort-order="(v) => setSort('acConfig', v)"
              />
            </template>
            <template #default="{ row }">{{ row.acConfig || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.contractCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.contractCount')"
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
            :min-width="colW(t('room.fields.invoiceCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.invoiceCount')"
                sortable
                :sort-order="sortOrderOf('invoiceCount')"
                @update:sort-order="(v) => setSort('invoiceCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.invoiceCount ?? 0" @click="openInvoicesSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.terminationCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.terminationCount')"
                sortable
                :sort-order="sortOrderOf('terminationCount')"
                @update:sort-order="(v) => setSort('terminationCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.terminationCount ?? 0" @click="openTerminationsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.depositRefundCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.depositRefundCount')"
                sortable
                :sort-order="sortOrderOf('depositRefundCount')"
                @update:sort-order="(v) => setSort('depositRefundCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.depositRefundCount ?? 0" @click="openDepositRefundsSide(row)" />
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
          <el-table-column :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
            <template #header>
              <TableColumnHeader
                :label="t('common.createdAt')"
                sortable
                date-range
                :model-value="filters.createdAt || []"
                :sort-order="sortOrderOf('createdAt')"
                :date-range-value="dateRangeOf('createdAt')"
                @update:model-value="(v) => setFilter('createdAt', v)"
                @update:sort-order="(v) => setSort('createdAt', v)"
                @update:date-range-value="(v) => setDateRange('createdAt', v)"
              />
            </template>
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedBy')"
                filterable
                sortable
                :options="updatedByFilterOptions"
                :model-value="filters.updatedBy || []"
                :sort-order="sortOrderOf('updatedBy')"
                @update:model-value="(v) => setFilter('updatedBy', v)"
                @update:sort-order="(v) => setSort('updatedBy', v)"
              />
            </template>
            <template #default="{ row }">{{ row.updatedBy || '—' }}</template>
          </el-table-column>
          <el-table-column :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedAt')"
                sortable
                date-range
                :model-value="filters.updatedAt || []"
                :sort-order="sortOrderOf('updatedAt')"
                :date-range-value="dateRangeOf('updatedAt')"
                @update:model-value="(v) => setFilter('updatedAt', v)"
                @update:sort-order="(v) => setSort('updatedAt', v)"
                @update:date-range-value="(v) => setDateRange('updatedAt', v)"
              />
            </template>
            <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
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
                <button type="button" class="action-pill action-pill--view" @click="openDetail(row as RoomRecord)">
                  {{ t('common.detail') }}
                </button>
                <button
                  v-if="perms.update" v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="openEdit(row as RoomRecord)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="perms.delete" v-admin-glow="perms.codes.delete"
                  type="button"
                  class="action-pill action-pill--danger"
                  :disabled="!canDeleteRoom(row as RoomRecord)"
                  :title="
                    canDeleteRoom(row as RoomRecord) ? undefined : t('room.deleteBlockedHasContracts')
                  "
                  @click="onDelete(row as RoomRecord)"
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
          <template v-if="perms.batchDelete || userStore.isSuperAdmin" #batch>
            <button
              v-if="userStore.isSuperAdmin"
              type="button"
              class="lb-pager__batch-btn lb-pager__batch-btn--primary"
              :disabled="batchEditing || batchDeleting || selectAllLoading"
              @click="openBatchEdit"
            >
              {{ t('room.batchEdit.action') }}
            </button>
            <button
              v-if="perms.batchDelete"
              v-admin-glow="perms.codes.batchDelete"
              type="button"
              class="lb-pager__batch-btn"
              :disabled="batchDeleting || batchEditing || selectAllLoading"
              @click="onBatchDelete"
            >
              {{ t('common.batchDelete') }}
            </button>
          </template>
        </TablePagination>
      </div>
    </div>

    <div v-else class="data-cards" v-loading="loading">
      <article v-for="row in list" :key="row.id" class="data-card">
        <div class="data-card__head">
          <div>
            <h3 class="data-card__title">{{ row.name }}</h3>
            <p class="data-card__meta">
              {{ row.roomCode }}
              <template v-if="!buildingScope.selectedId">
                ·
                <button type="button" class="fk-link" @click="openBuildingDetail(row.buildingId)">
                  {{ row.buildingName }}
                </button>
              </template>
            </p>
          </div>
          <StatusBadge
            :tone="roomFillStatusTone(fillStatusOf(row))"
            :label="t(`room.fillStatus.${fillStatusOf(row)}`)"
          />
        </div>
        <dl class="data-card__grid">
          <div>
            <dt>{{ t('room.fields.roomType') }}</dt>
            <dd><RoomTypeBadge :value="row.roomType" :tone="toneForLabel(row.roomType)" /></dd>
          </div>
          <div v-if="!leaseCapabilityFilter">
            <dt>{{ t('room.fields.leaseCapability') }}</dt>
            <dd>
              <StatusBadge
                :tone="roomLeaseCapabilityTone(row.leaseCapability)"
                :label="leaseCapabilityLabel(row.leaseCapability)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.sizeSqft') }}</dt>
            <dd>{{ number2(row.sizeSqft) }} sq.ft</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.windowConfig') }}</dt>
            <dd>{{ row.windowConfig || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.acConfig') }}</dt>
            <dd>{{ row.acConfig || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.monthlyRent') }}</dt>
            <dd>{{ money(row.monthlyRent) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.dailyRent') }}</dt>
            <dd>{{ money(row.dailyRent) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.hourlyRent') }}</dt>
            <dd>{{ money(row.hourlyRent) }}</dd>
          </div>
        </dl>
        <div class="data-card__actions">
          <button type="button" class="action-pill action-pill--view" @click="openDetail(row)">
            {{ t('common.detail') }}
          </button>
          <button
            v-if="perms.update" v-admin-glow="perms.codes.update"
            type="button"
            class="action-pill action-pill--edit"
            @click="openEdit(row)"
          >
            {{ t('common.edit') }}
          </button>
          <button
            v-if="perms.delete" v-admin-glow="perms.codes.delete"
            type="button"
            class="action-pill action-pill--danger"
            :disabled="!canDeleteRoom(row)"
            :title="canDeleteRoom(row) ? undefined : t('room.deleteBlockedHasContracts')"
            @click="onDelete(row)"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </article>
      <el-empty v-if="!list.length" />
      <div v-if="total" class="table-pagination cards-pagination">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>

    <RoomDetailDrawer
      v-model="drawerVisible"
      :room="current"
      desktop-direction="rtl"
      :size="drawerSize"
      @open-building="openBuildingDetail"
      @open-contracts="openContractsSide"
      @open-invoices="openInvoicesSide"
      @open-terminations="openTerminationsSide"
      @open-deposit-refunds="openDepositRefundsSide"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
    />

    <RelatedContractsDrawer
      v-model="relatedContractsDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-contract="onOpenContractFromRelated"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id, 'ltr')"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr')"
    />
    <RelatedInvoicesDrawer
      v-model="relatedInvoicesDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-invoice="onOpenInvoiceFromRelated"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @changed="loadList"
    />
    <RelatedTerminationsDrawer
      v-model="relatedTerminationsDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-termination="onOpenTerminationFromRelated"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr')"
    />
    <RelatedDepositRefundsDrawer
      v-model="relatedDepositRefundsDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-deposit-refund="onOpenDepositRefundFromRelated"
    />
    <RelatedEntityDrawers ref="relationDrawers" @changed="loadList" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('room.edit') : t('room.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      align-center
      class="lb-dialog"
    >
      <el-form label-position="top">
        <div class="form-grid form-grid--3">
          <div class="form-section">
            <h3>{{ t('room.sections.basic') }}</h3>
          </div>
          <el-form-item :label="t('room.fields.roomCode')" required>
            <el-input v-model="form.roomCode" />
          </el-form-item>
          <el-form-item :label="t('room.fields.name')" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="t('room.fields.roomType')" required>
            <el-select v-model="form.roomType" style="width: 100%" :placeholder="t('common.pleaseSelect')">
              <el-option
                v-for="opt in roomTypeOptions"
                :key="opt.id"
                :label="opt.label"
                :value="opt.label"
              >
                <RoomTypeBadge :value="opt.label" :tone="opt.tone" />
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="showRoomBuildingField"
            :label="t('room.fields.building')"
            required
          >
            <SelectWithViewAction
              :disabled="!form.buildingId"
              @view="openBuildingDetail(form.buildingId)"
            >
              <el-select
                v-model="form.buildingId"
                style="width: 100%"
                :placeholder="t('common.pleaseSelect')"
              >
                <el-option
                  v-for="b in formBuildingOptions"
                  :key="b.id"
                  :label="b.name"
                  :value="b.id"
                  :disabled="!b.active && b.id !== form.buildingId"
                />
              </el-select>
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('room.fields.allowShortTerm')">
            <el-switch v-model="form.allowShortTerm" />
          </el-form-item>

          <div
            class="room-lease-panel span-3"
            :class="{
              'room-lease-panel--whole':
                form.leaseCapability === 'whole_only' || form.leaseCapability === 'part_only',
            }"
          >
            <div class="room-lease-panel__grid">
              <el-form-item :label="t('room.fields.leaseCapability')" class="room-lease-panel__cap">
                <el-radio-group v-model="form.leaseCapability" class="lb-yesno-seg room-lease-seg">
                  <el-radio-button value="flexible">
                    {{ t('room.leaseCapability.flexibleShort') }}
                  </el-radio-button>
                  <el-radio-button value="whole_only">
                    {{ t('room.leaseCapability.wholeOnlyShort') }}
                  </el-radio-button>
                  <el-radio-button value="part_only">
                    {{ t('room.leaseCapability.partOnlyShort') }}
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item
                v-if="formNeedsSplitParts"
                :label="t('room.fields.splitCount')"
                class="room-lease-panel__count"
              >
                <el-input-number
                  v-model="form.splitCount"
                  :min="2"
                  :max="12"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item
                v-if="formNeedsSplitParts"
                :label="t('room.fields.splitLabels')"
                class="room-lease-panel__labels"
              >
                <div class="split-label-chips" :title="previewSplitLabels.join(' / ')">
                  <span
                    v-for="lab in previewSplitLabels"
                    :key="lab"
                    class="split-label-chip"
                  >{{ lab }}</span>
                </div>
              </el-form-item>
            </div>
          </div>

          <div class="form-section">
            <h3>{{ t('room.sections.pricing') }}</h3>
          </div>
          <el-form-item :label="t('room.fields.monthlyRent')" required>
            <el-input-number v-model="form.monthlyRent" :min="0" :precision="2" :step="0.01" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('room.fields.dailyRent')">
            <el-input-number v-model="form.dailyRent" :min="0" :precision="2" :step="0.01" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('room.fields.hourlyRent')">
            <el-input-number v-model="form.hourlyRent" :min="0" :precision="2" :step="0.01" style="width: 100%" />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('room.sections.config') }}</h3>
          </div>
          <el-form-item :label="t('room.fields.sizeSqft')" required>
            <el-input-number
              v-model="form.sizeSqft"
              :min="0"
              :precision="2"
              :step="0.01"
              style="width: 100%"
            />
            <p v-if="matchedSizeOption" class="form-section-hint room-size-match-hint">
              {{ t('room.sizeRangeMatched', { label: matchedSizeOption.label }) }}
            </p>
            <p v-else-if="form.sizeSqft > 0" class="form-section-hint room-size-match-hint">
              {{ t('room.sizeRangeUnmatched') }}
            </p>
          </el-form-item>
          <el-form-item :label="t('room.fields.windowConfig')">
            <el-select v-model="form.windowConfig" clearable filterable style="width: 100%">
              <el-option v-for="o in windowOptions" :key="o.id" :label="o.label" :value="o.label" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('room.fields.acConfig')">
            <el-select v-model="form.acConfig" clearable filterable style="width: 100%">
              <el-option
                v-for="o in acOptions"
                :key="o.id"
                :label="acOptionLabel(o)"
                :value="o.label"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('room.fields.description')" class="span-3">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('room.fields.remark')" class="span-3">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('room.sections.media') }}</h3>
          </div>
          <div class="span-3 room-image-editor">
            <div class="room-image-grid">
              <div
                v-for="img in formVisibleExisting"
                :key="img.id"
                class="room-image-tile"
              >
                <el-image
                  class="room-image-tile__img"
                  :src="formExistingUrlById[img.id]"
                  :alt="img.fileName"
                  fit="cover"
                  :preview-src-list="formPreviewList"
                  :initial-index="formPreviewIndex(formExistingUrlById[img.id])"
                  preview-teleported
                  hide-on-click-modal
                />
                <button
                  type="button"
                  class="room-image-tile__remove"
                  :aria-label="t('common.delete')"
                  @click.stop="removeExistingImage(img.id)"
                >
                  ×
                </button>
              </div>
              <div
                v-for="p in formVisiblePending"
                :key="p.key"
                class="room-image-tile"
              >
                <el-image
                  class="room-image-tile__img"
                  :src="p.previewUrl"
                  :alt="p.file.name"
                  fit="cover"
                  :preview-src-list="formPreviewList"
                  :initial-index="formPreviewIndex(p.previewUrl)"
                  preview-teleported
                  hide-on-click-modal
                />
                <button
                  type="button"
                  class="room-image-tile__remove"
                  :aria-label="t('common.delete')"
                  @click.stop="removePendingImage(p.key)"
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                class="room-image-add"
                @click="imageFileInput?.click()"
              >
                <span>+</span>
                <em>{{ t('room.addImages') }}</em>
              </button>
              <input
                ref="imageFileInput"
                type="file"
                class="room-io-file"
                accept="image/*"
                multiple
                @change="onPickRoomImages"
              />
            </div>
            <button
              v-if="formHiddenImageCount > 0"
              type="button"
              class="room-image-fold"
              @click="formImagesExpanded = !formImagesExpanded"
            >
              {{
                formImagesExpanded
                  ? t('room.imagesCollapse')
                  : t('room.imagesExpand', { n: formHiddenImageCount })
              }}
            </button>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">{{ t('common.save') }}</el-button>
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

    <el-dialog
      v-model="batchEditVisible"
      :title="t('room.batchEdit.title')"
      width="560px"
      class="lb-dialog"
      destroy-on-close
    >
      <p class="form-hint" style="margin-top: 0">
        {{ t('room.batchEdit.hint', { n: selectedCount }) }}
      </p>
      <div class="batch-edit-fields">
        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.allowShortTerm">
            {{ t('room.fields.allowShortTerm') }}
          </el-checkbox>
          <el-switch
            v-model="batchEditForm.allowShortTerm"
            :disabled="!batchEditEnable.allowShortTerm"
          />
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.roomType">
            {{ t('room.fields.roomType') }}
          </el-checkbox>
          <el-select
            v-model="batchEditForm.roomType"
            :disabled="!batchEditEnable.roomType"
            :placeholder="t('common.pleaseSelect')"
            style="width: 100%"
          >
            <el-option
              v-for="opt in roomTypeOptions"
              :key="opt.id"
              :label="opt.label"
              :value="opt.label"
            />
          </el-select>
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.buildingId">
            {{ t('room.fields.building') }}
          </el-checkbox>
          <SelectWithViewAction
            :disabled="!batchEditEnable.buildingId || !batchEditForm.buildingId"
            @view="openBuildingDetail(batchEditForm.buildingId)"
          >
            <el-select
              v-model="batchEditForm.buildingId"
              :disabled="!batchEditEnable.buildingId"
              :placeholder="t('common.pleaseSelect')"
              style="width: 100%"
            >
              <el-option
                v-for="b in formBuildingOptions"
                :key="b.id"
                :label="b.name"
                :value="b.id"
                :disabled="!b.active && b.id !== batchEditForm.buildingId"
              />
            </el-select>
          </SelectWithViewAction>
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.leaseCapability">
            {{ t('room.fields.leaseCapability') }}
          </el-checkbox>
          <div class="batch-edit-row__stack">
            <el-radio-group
              v-model="batchEditForm.leaseCapability"
              class="lb-yesno-seg"
              :disabled="!batchEditEnable.leaseCapability"
            >
              <el-radio-button value="flexible">
                {{ t('room.leaseCapability.flexibleShort') }}
              </el-radio-button>
              <el-radio-button value="whole_only">
                {{ t('room.leaseCapability.wholeOnlyShort') }}
              </el-radio-button>
              <el-radio-button value="part_only">
                {{ t('room.leaseCapability.partOnlyShort') }}
              </el-radio-button>
            </el-radio-group>
            <el-input-number
              v-if="batchEditForm.leaseCapability === 'flexible'"
              v-model="batchEditForm.splitCount"
              :min="2"
              :max="12"
              :disabled="!batchEditEnable.leaseCapability"
              controls-position="right"
              style="width: 140px"
            />
          </div>
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.windowConfig">
            {{ t('room.fields.windowConfig') }}
          </el-checkbox>
          <el-select
            v-model="batchEditForm.windowConfig"
            :disabled="!batchEditEnable.windowConfig"
            clearable
            :placeholder="t('common.pleaseSelect')"
            style="width: 100%"
          >
            <el-option
              v-for="o in windowOptions"
              :key="o.id"
              :label="o.label"
              :value="o.label"
            />
          </el-select>
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.acConfig">
            {{ t('room.fields.acConfig') }}
          </el-checkbox>
          <el-select
            v-model="batchEditForm.acConfig"
            :disabled="!batchEditEnable.acConfig"
            clearable
            :placeholder="t('common.pleaseSelect')"
            style="width: 100%"
          >
            <el-option
              v-for="o in acOptions"
              :key="o.id"
              :label="o.label"
              :value="o.label"
            />
          </el-select>
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.monthlyRent">
            {{ t('room.fields.monthlyRent') }}
          </el-checkbox>
          <el-input-number
            v-model="batchEditForm.monthlyRent"
            :min="0"
            :precision="2"
            :disabled="!batchEditEnable.monthlyRent"
            controls-position="right"
            style="width: 100%"
          />
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.dailyRent">
            {{ t('room.fields.dailyRent') }}
          </el-checkbox>
          <el-input-number
            v-model="batchEditForm.dailyRent"
            :min="0"
            :precision="2"
            :disabled="!batchEditEnable.dailyRent"
            controls-position="right"
            style="width: 100%"
          />
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.hourlyRent">
            {{ t('room.fields.hourlyRent') }}
          </el-checkbox>
          <el-input-number
            v-model="batchEditForm.hourlyRent"
            :min="0"
            :precision="2"
            :disabled="!batchEditEnable.hourlyRent"
            controls-position="right"
            style="width: 100%"
          />
        </div>

        <div class="batch-edit-row">
          <el-checkbox v-model="batchEditEnable.sizeSqft">
            {{ t('room.fields.sizeSqft') }}
          </el-checkbox>
          <el-input-number
            v-model="batchEditForm.sizeSqft"
            :min="0"
            :precision="2"
            :disabled="!batchEditEnable.sizeSqft"
            controls-position="right"
            style="width: 100%"
          />
        </div>

        <div class="batch-edit-row batch-edit-row--top">
          <el-checkbox v-model="batchEditEnable.description">
            {{ t('room.fields.description') }}
          </el-checkbox>
          <el-input
            v-model="batchEditForm.description"
            type="textarea"
            :rows="2"
            :disabled="!batchEditEnable.description"
            :placeholder="t('room.fields.description')"
          />
        </div>

        <div class="batch-edit-row batch-edit-row--top">
          <el-checkbox v-model="batchEditEnable.remark">
            {{ t('room.fields.remark') }}
          </el-checkbox>
          <el-input
            v-model="batchEditForm.remark"
            type="textarea"
            :rows="2"
            :disabled="!batchEditEnable.remark"
            :placeholder="t('room.fields.remark')"
          />
        </div>
      </div>
      <template #footer>
        <el-button :disabled="batchEditing" @click="batchEditVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="batchEditing" @click="onBatchEditSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--lb-muted, #6a7a70);
}

.batch-edit-fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 12px;
  margin-top: 12px;
}

.batch-edit-row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
}

.batch-edit-row--top {
  align-items: start;
}

.batch-edit-row--top :deep(.el-checkbox) {
  padding-top: 6px;
}

.batch-edit-row__stack {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.room-lease-panel {
  grid-column: 1 / -1;
  margin: 2px 0 4px;
  padding: 12px 14px 10px;
  border-radius: 12px;
  background: linear-gradient(180deg, #f7faf8 0%, #f2f6f3 100%);
  border: 1px solid #e2eae5;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.room-lease-panel__grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.5fr) minmax(112px, 0.7fr) minmax(140px, 1fr);
  gap: 4px 16px;
  align-items: start;
}

.room-lease-panel--whole .room-lease-panel__grid {
  grid-template-columns: 1fr;
}

.room-lease-panel__cap {
  min-width: 0;
}

.room-lease-panel :deep(.el-form-item) {
  margin-bottom: 0;
}

.room-lease-seg.lb-yesno-seg {
  width: 100%;
  display: flex;
}

.room-lease-seg :deep(.el-radio-button) {
  flex: 1;
}

.room-lease-seg :deep(.el-radio-button__inner) {
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  font-size: 0.84rem;
}

.split-label-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 8px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--lb-border, #d7ded9);
}

.room-lease-cap-detail {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.room-lease-cap-detail__chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.split-label-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #176db0;
  background: #eef6fb;
  box-shadow: inset 0 0 0 1px #b7d7ea;
}

@media (max-width: 720px) {
  .room-lease-panel__grid,
  .room-lease-panel--whole .room-lease-panel__grid {
    grid-template-columns: 1fr;
  }
}

.room-io-btn {
  width: 36px;
  padding: 0 !important;
  border-radius: 8px !important;
  border-color: #d7ded9 !important;
  background: #fff !important;
  color: var(--lb-brand) !important;
}

.room-io-btn:hover,
.room-io-btn:focus {
  border-color: var(--lb-brand) !important;
  color: var(--lb-brand) !important;
  background: #f3f8f5 !important;
}

.room-io-file {
  display: none;
}

.room-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.image-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.image-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--lb-muted);
}

.image-item img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--lb-border);
}

.room-size-match-hint {
  margin: 6px 0 0;
}

.room-image-editor {
  margin-bottom: 8px;
}

.room-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.room-image-tile {
  position: relative;
}

.room-image-tile__img {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  border: 1px solid var(--lb-border);
  display: block;
  overflow: hidden;
  cursor: zoom-in;
  background: #f5f7f6;
}

.room-image-tile__img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.room-image-tile__remove {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.room-image-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 90px;
  border: 1px dashed var(--lb-border);
  border-radius: 10px;
  background: #f8faf9;
  color: var(--lb-muted);
  cursor: pointer;
}

.room-image-add span {
  font-size: 1.4rem;
  line-height: 1;
  color: var(--lb-brand);
}

.room-image-add em {
  font-style: normal;
  font-size: 0.75rem;
}

.room-image-fold {
  margin-top: 10px;
  padding: 0;
  border: none;
  background: none;
  color: var(--lb-brand);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.room-image-fold:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .image-row {
    grid-template-columns: 1fr;
  }
}
</style>
