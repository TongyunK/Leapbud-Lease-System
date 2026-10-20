<script setup lang="ts">
import { fetchBuildings } from '@/api/buildings'
import {
  fetchRooms,
  createRoomApi,
  updateRoomApi,
  deleteRoomApi,
  batchDeleteRoomsApi,
  importRoomsApi,
  uploadRoomImagesApi,
  deleteRoomImageApi,
  fetchRoomImageBlob,
} from '@/api/rooms'
import type { RoomListQuery, RoomWritePayload } from '@/api/rooms'
import { fetchRoomConfigs, matchSizeOption } from '@/api/room-configs'
import { fetchRoomTypes } from '@/api/room-types'
import type { BuildingRecord } from '@/types/building'
import type { RoomImageRecord, RoomRecord, RoomStatus } from '@/types/room'
import RoomImageGallery from '@/components/RoomImageGallery.vue'
import type { RoomConfigOption } from '@/types/room-config'
import type { RoomTypeOption } from '@/types/room-type'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import RoomTypeBadge from '@/components/RoomTypeBadge.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'



import CountListPill from '@/components/CountListPill.vue'
import RelatedContractsDrawer from '@/components/RelatedContractsDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedTerminationsDrawer from '@/components/RelatedTerminationsDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import type { ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import { roomStatusTone } from '@/constants/statusBadges'
import { formatMoney, formatNumber2 } from '@/utils/format'
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
import { useTableColWidth } from '@/composables/useTableColWidth'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'

const { t } = useI18n()
const userStore = useUserStore()
const buildingScope = useBuildingScopeStore()
const perms = useResourcePermissions('rooms')
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()
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

const statusOptions: RoomStatus[] = ['idle', 'signing', 'leased', 'terminating']
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
} = useTableSortFilter<RoomRecord>()

const roomTypeFilterOptions = computed(() =>
  roomTypeOptions.value.map((o) => ({ value: o.label, label: o.label })),
)
const buildingFilterOptions = computed(() =>
  buildings.value.map((b) => ({ value: b.id, label: b.name })),
)
const statusFilterOptions = computed(() =>
  statusOptions.map((s) => ({ value: s, label: t(`room.status.${s}`) })),
)
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
      buildingIds:
        buildingScope.selectedId || !f.buildingId?.length ? undefined : [...f.buildingId],
      statuses: f.status?.length ? [...f.status] : undefined,
      roomTypes: f.roomType?.length ? [...f.roomType] : undefined,
      sizeRangeIds: f.sizeRange?.length ? [...f.sizeRange] : undefined,
      windowConfigs: f.windowConfig?.length ? [...f.windowConfig] : undefined,
      acConfigs: f.acConfig?.length ? [...f.acConfig] : undefined,
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteRoomsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadOptions()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
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
  void loadList()
})

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
})

const matchedSizeOption = computed(() => {
  const n = Number(form.sizeSqft)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return matchSizeOption(sizeOptions.value, n)
})

const formBuildingOptions = computed(() => {
  const currentId = form.buildingId
  return buildings.value.filter((b) => b.active || b.id === currentId)
})

function money(n: number) {
  return formatMoney(n)
}

function number2(n: number) {
  return formatNumber2(n)
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
      ElMessage.info(t('room.exportLoading'))
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
  if (!perms.import.value) {
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
      if (!perms.import.value) {
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
    <div class="admin-page-head">
      <h2>{{ t('menu.rooms') }}</h2>
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

    <div v-if="!useCards" class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="tableLayoutKey"
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
                sortable
                :sort-order="sortOrderOf('roomCode')"
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
                sortable
                :sort-order="sortOrderOf('name')"
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
            :min-width="textColW(t('room.fields.building'), { interactive: true, kind: 'name' })"
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
              <StatusBadge :tone="roomStatusTone(row.status)" :label="t(`room.status.${row.status}`)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.monthlyRent'), { interactive: true, contentMin: 112 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.monthlyRent')"
                sortable
                :sort-order="sortOrderOf('monthlyRent')"
                @update:sort-order="(v) => setSort('monthlyRent', v)"
              />
            </template>
            <template #default="{ row }">{{ money(row.monthlyRent) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.dailyRent'), { interactive: true, contentMin: 108 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.dailyRent')"
                sortable
                :sort-order="sortOrderOf('dailyRent')"
                @update:sort-order="(v) => setSort('dailyRent', v)"
              />
            </template>
            <template #default="{ row }">{{ money(row.dailyRent) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('room.fields.hourlyRent'), { interactive: true, contentMin: 108 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.hourlyRent')"
                sortable
                :sort-order="sortOrderOf('hourlyRent')"
                @update:sort-order="(v) => setSort('hourlyRent', v)"
              />
            </template>
            <template #default="{ row }">{{ money(row.hourlyRent) }}</template>
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
            prop="createdBy"
            :label="t('common.createdBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
          <el-table-column prop="createdAt" :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
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
          </el-table-column>
          <el-table-column
            prop="updatedBy"
            :label="t('common.updatedBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
          <el-table-column prop="updatedAt" :width="datetimeColWidth" class-name="col-datetime" label-class-name="col-datetime">
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedAt')"
                sortable
                date-range
                :sort-order="sortOrderOf('updatedAt')"
                :date-range-value="dateRangeOf('updatedAt')"
                @update:sort-order="(v) => setSort('updatedAt', v)"
                @update:date-range-value="(v) => setDateRange('updatedAt', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="actionColWidth.three"
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

    <div v-else class="data-cards">
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
          <StatusBadge :tone="roomStatusTone(row.status)" :label="t(`room.status.${row.status}`)" />
        </div>
        <dl class="data-card__grid">
          <div>
            <dt>{{ t('room.fields.roomType') }}</dt>
            <dd><RoomTypeBadge :value="row.roomType" :tone="toneForLabel(row.roomType)" /></dd>
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

    <el-drawer
      v-model="drawerVisible"
      :size="drawerSize"
      :title="t('room.detailTitle')"
      :direction="isMobile ? 'btt' : 'rtl'"
    >
      <template v-if="current">
        <section class="detail-section">
          <h3>{{ t('room.sections.basic') }}</h3>
          <dl class="detail-grid two">
            <div><dt>{{ t('room.fields.roomCode') }}</dt><dd>{{ current.roomCode }}</dd></div>
            <div><dt>{{ t('room.fields.name') }}</dt><dd>{{ current.name }}</dd></div>
            <div><dt>{{ t('room.fields.roomType') }}</dt><dd><RoomTypeBadge :value="current.roomType" :tone="toneForLabel(current.roomType)" /></dd></div>
            <div>
              <dt>{{ t('room.fields.building') }}</dt>
              <dd>
                <button type="button" class="fk-link" @click="openBuildingDetail(current.buildingId)">
                  {{ current.buildingName }}
                </button>
              </dd>
            </div>
            <div>
              <dt>{{ t('room.fields.status') }}</dt>
              <dd><StatusBadge :tone="roomStatusTone(current.status)" :label="t(`room.status.${current.status}`)" /></dd>
            </div>
            <div><dt>{{ t('room.fields.serialNo') }}</dt><dd>{{ current.serialNo }}</dd></div>
            <div><dt>{{ t('room.fields.subleaseMark') }}</dt><dd>{{ current.subleaseMark || '—' }}</dd></div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('room.sections.pricing') }}</h3>
          <dl class="detail-grid two">
            <div><dt>{{ t('room.fields.monthlyRent') }}</dt><dd>{{ money(current.monthlyRent) }}</dd></div>
            <div><dt>{{ t('room.fields.dailyRent') }}</dt><dd>{{ money(current.dailyRent) }}</dd></div>
            <div><dt>{{ t('room.fields.hourlyRent') }}</dt><dd>{{ money(current.hourlyRent) }}</dd></div>
            <div><dt>{{ t('room.fields.sizeSqft') }}</dt><dd>{{ number2(current.sizeSqft) }} sq.ft</dd></div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('room.sections.config') }}</h3>
          <dl class="detail-grid two">
            <div><dt>{{ t('room.fields.windowConfig') }}</dt><dd>{{ current.windowConfig || '—' }}</dd></div>
            <div><dt>{{ t('room.fields.acConfig') }}</dt><dd>{{ current.acConfig || '—' }}</dd></div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('room.sections.media') }}</h3>
          <RoomImageGallery :room-id="current.id" :images="current.images || []" />
          <dl class="detail-grid" style="margin-top: 14px">
            <div><dt>{{ t('room.fields.description') }}</dt><dd>{{ current.description || '—' }}</dd></div>
            <div><dt>{{ t('room.fields.remark') }}</dt><dd>{{ current.remark || '—' }}</dd></div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('room.sections.relatedRecords') }}</h3>
          <dl class="detail-grid two">
            <div><dt>{{ t('room.fields.latestContract') }}</dt><dd>{{ current.latestContract || '—' }}</dd></div>
            <div>
              <dt>{{ t('room.fields.contractCount') }}</dt>
              <dd>
                <CountListPill
                  :count="current.contractCount ?? 0"
                  @click="openContractsSide(current)"
                />
              </dd>
            </div>
            <div>
              <dt>{{ t('room.fields.invoiceCount') }}</dt>
              <dd>
                <CountListPill
                  :count="current.invoiceCount ?? 0"
                  @click="openInvoicesSide(current)"
                />
              </dd>
            </div>
            <div>
              <dt>{{ t('room.fields.terminationCount') }}</dt>
              <dd>
                <CountListPill
                  :count="current.terminationCount ?? 0"
                  @click="openTerminationsSide(current)"
                />
              </dd>
            </div>
            <div>
              <dt>{{ t('room.fields.depositRefundCount') }}</dt>
              <dd>
                <CountListPill
                  :count="current.depositRefundCount ?? 0"
                  @click="openDepositRefundsSide(current)"
                />
              </dd>
            </div>
          </dl>
        </section>

        <AuditDetailSection
          :created-by="current.createdBy"
          :created-at="current.createdAt"
          :updated-by="current.updatedBy"
          :updated-at="current.updatedAt"
        />
      </template>
    </el-drawer>

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
    <RelatedEntityDrawers ref="relationDrawers" />

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
          <el-form-item :label="t('room.fields.building')" required>
            <el-select v-model="form.buildingId" style="width: 100%" :placeholder="t('common.pleaseSelect')">
              <el-option v-for="b in formBuildingOptions" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('room.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option v-for="s in statusOptions" :key="s" :label="t(`room.status.${s}`)" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('room.fields.subleaseMark')">
            <el-input v-model="form.subleaseMark" />
          </el-form-item>

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
  </div>
</template>

<style scoped>
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
