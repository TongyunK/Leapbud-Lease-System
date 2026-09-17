<script setup lang="ts">
import { fetchBuildings, fetchBuilding } from '@/api/buildings'
import {
  fetchRooms,
  createRoomApi,
  updateRoomApi,
  batchDeleteRoomsApi,
  importRoomsApi,
} from '@/api/rooms'
import type { RoomListQuery, RoomWritePayload } from '@/api/rooms'
import { fetchRoomConfigs } from '@/api/room-configs'
import { fetchRoomTypes } from '@/api/room-types'
import type { BuildingRecord } from '@/types/building'
import type { RoomRecord, RoomStatus } from '@/types/room'
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
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'
import RoomDetailDrawer from '@/components/RoomDetailDrawer.vue'
import CountListPill from '@/components/CountListPill.vue'
import RelatedContractsDrawer from '@/components/RelatedContractsDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedTerminationsDrawer from '@/components/RelatedTerminationsDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import ContractDetailDrawer from '@/components/ContractDetailDrawer.vue'
import InvoiceDetailDrawer from '@/components/InvoiceDetailDrawer.vue'
import LeaseTerminationDetailDrawer from '@/components/LeaseTerminationDetailDrawer.vue'
import DepositRefundDetailDrawer from '@/components/DepositRefundDetailDrawer.vue'
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
import { useImportProgress } from '@/composables/useImportProgress'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, CaretLeft, CaretRight, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'

const { t } = useI18n()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
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
const relatedContract = ref<ContractRecord | null>(null)
const relatedInvoice = ref<InvoiceRecord | null>(null)
const relatedTermination = ref<LeaseTerminationRecord | null>(null)
const relatedDepositRefund = ref<DepositRefundRecord | null>(null)
const contractDetailDrawer = ref(false)
const invoiceDetailDrawer = ref(false)
const terminationDetailDrawer = ref(false)
const depositRefundDetailDrawer = ref(false)
const formVisible = ref(false)
const current = ref<RoomRecord | null>(null)
const editing = ref<RoomRecord | null>(null)
const buildingDrawerVisible = ref(false)
const relatedRoomsDrawer = ref(false)
const relatedRoomDrawer = ref(false)
const relatedBuilding = ref<BuildingRecord | null>(null)
const relatedRoomsBuilding = ref<BuildingRecord | null>(null)
const relatedRoom = ref<RoomRecord | null>(null)

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
  activeConditionCount,
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
      buildingIds: f.buildingId?.length ? [...f.buildingId] : undefined,
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteRoomsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const buildingChips = computed(() =>
  buildings.value
    .filter((b) => b.active && (b.roomIds?.length || 0) > 0)
    .map((b) => ({ id: b.id, name: b.name, count: b.roomIds.length })),
)

const allBuildingCount = computed(() =>
  buildings.value.reduce((sum, b) => sum + (b.roomIds?.length || 0), 0),
)

const activeBuildingChip = computed(() => {
  const selected = filters.buildingId || []
  return selected.length === 1 ? selected[0] : ''
})

function selectBuildingChip(id: string) {
  setFilter('buildingId', id ? [id] : [])
}

/** 自定义细滚动条 + 头尾箭头；系统滚动条不参与布局，胶囊与标题中线对齐 */
const buildingChipsEl = ref<HTMLElement | null>(null)
const buildingChipsOverflow = ref(false)
const canScrollBuildingChipsLeft = ref(false)
const canScrollBuildingChipsRight = ref(false)
const buildingChipsThumbStyle = ref<Record<string, string>>({})
let buildingChipsRo: ResizeObserver | null = null

function syncBuildingChipsScroll() {
  const el = buildingChipsEl.value
  if (!el) return
  const { scrollLeft, scrollWidth, clientWidth } = el
  const overflow = scrollWidth > clientWidth + 1
  buildingChipsOverflow.value = overflow
  canScrollBuildingChipsLeft.value = overflow && scrollLeft > 1
  canScrollBuildingChipsRight.value = overflow && scrollLeft < scrollWidth - clientWidth - 1
  if (!overflow) {
    buildingChipsThumbStyle.value = {}
    return
  }
  const widthPct = (clientWidth / scrollWidth) * 100
  const leftPct = (scrollLeft / scrollWidth) * 100
  buildingChipsThumbStyle.value = {
    width: `${widthPct}%`,
    left: `${leftPct}%`,
  }
}

function scrollBuildingChips(dir: -1 | 1) {
  const el = buildingChipsEl.value
  if (!el) return
  const step = Math.max(160, Math.floor(el.clientWidth * 0.55))
  el.scrollBy({ left: dir * step, behavior: 'smooth' })
}

function onBuildingChipsWheel(e: WheelEvent) {
  const el = buildingChipsEl.value
  if (!el || !buildingChipsOverflow.value) return
  const dominant =
    Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (dominant === 0) return
  const max = el.scrollWidth - el.clientWidth
  const next = Math.min(max, Math.max(0, el.scrollLeft + dominant))
  if (next === el.scrollLeft) return
  e.preventDefault()
  el.scrollLeft = next
  syncBuildingChipsScroll()
}

function selectRoomType(type: string) {
  form.roomType = type
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
  void loadOptions().then(() => nextTick(syncBuildingChipsScroll))
  void loadList()
  void nextTick(() => {
    const el = buildingChipsEl.value
    if (el && typeof ResizeObserver !== 'undefined') {
      buildingChipsRo = new ResizeObserver(() => syncBuildingChipsScroll())
      buildingChipsRo.observe(el)
    }
    window.addEventListener('resize', syncBuildingChipsScroll)
  })
})

onBeforeUnmount(() => {
  buildingChipsRo?.disconnect()
  window.removeEventListener('resize', syncBuildingChipsScroll)
})

watch(buildingChips, async () => {
  await nextTick()
  syncBuildingChipsScroll()
})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '760px'))
const drawerSize = computed(() => (isMobile.value ? '92%' : '560px'))

const form = reactive({
  roomCode: '',
  name: '',
    roomType: roomTypeOptions.value[0]?.label || '辦公室',
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
  relatedContract.value = row
  contractDetailDrawer.value = true
}
function onOpenInvoiceFromRelated(row: InvoiceRecord) {
  relatedInvoice.value = row
  invoiceDetailDrawer.value = true
}
function onOpenTerminationFromRelated(row: LeaseTerminationRecord) {
  relatedTermination.value = row
  terminationDetailDrawer.value = true
}
function onOpenDepositRefundFromRelated(row: DepositRefundRecord) {
  relatedDepositRefund.value = row
  depositRefundDetailDrawer.value = true
}

async function openBuildingDetail(buildingId: string) {
  if (!buildingId) return
  let building = buildings.value.find((b) => b.id === buildingId) || null
  if (!building) {
    try {
      const res = await fetchBuilding(buildingId)
      building = res.data
    } catch {
      ElMessage.warning(t('building.notFound'))
      return
    }
  }
  relatedBuilding.value = building
  buildingDrawerVisible.value = true
}

function openRoomsSide(row: BuildingRecord) {
  if (!row.roomIds?.length) return
  relatedRoomsBuilding.value = row
  relatedRoomsDrawer.value = true
}

function onOpenRoomFromList(room: RoomRecord) {
  relatedRoom.value = room
  relatedRoomDrawer.value = true
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
  if (!isAdmin.value) {
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
  Object.assign(form, {
    roomCode: '',
    name: '',
    roomType: roomTypeOptions.value[0]?.label || '辦公室',
    buildingId: buildings.value.find((b) => b.active)?.id || '',
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
}

function acOptionLabel(opt: RoomConfigOption) {
  const extra = [opt.brand, opt.model].filter(Boolean).join(' ')
  return extra ? `${opt.label}（${extra}）` : opt.label
}

async function saveForm() {
  if (!form.roomCode.trim() || !form.name.trim()) return
  if (!form.buildingId) {
    ElMessage.warning(t('room.buildingRequired'))
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
  try {
    if (editing.value) {
      await updateRoomApi(editing.value.id, payload)
    } else {
      if (!isAdmin.value) {
        ElMessage.warning(t('room.importAdminOnly'))
        return
      }
      await createRoomApi(payload)
    }
    formVisible.value = false
    await loadOptions()
    await loadList()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <h2>{{ t('menu.rooms') }}</h2>
      <div
        class="building-chips-rail"
        :class="{ 'is-overflow': buildingChipsOverflow }"
        @wheel="onBuildingChipsWheel"
      >
        <button
          v-show="buildingChipsOverflow"
          type="button"
          class="building-chips-nav is-prev"
          :disabled="!canScrollBuildingChipsLeft"
          :aria-label="t('room.scrollChipsLeft')"
          @click="scrollBuildingChips(-1)"
        >
          <el-icon :size="14"><CaretLeft /></el-icon>
        </button>
        <div
          ref="buildingChipsEl"
          class="building-chips"
          role="tablist"
          :aria-label="t('room.filterBuilding')"
          @scroll="syncBuildingChipsScroll"
        >
          <button
            type="button"
            role="tab"
            class="building-chip"
            :class="{ 'is-active': !activeBuildingChip }"
            :aria-selected="!activeBuildingChip"
            @click="selectBuildingChip('')"
          >
            {{ t('room.filterAllBuildings') }}
            <span class="building-chip__count">({{ allBuildingCount }})</span>
          </button>
          <button
            v-for="chip in buildingChips"
            :key="chip.id"
            type="button"
            role="tab"
            class="building-chip"
            :class="{ 'is-active': activeBuildingChip === chip.id }"
            :aria-selected="activeBuildingChip === chip.id"
            :title="chip.name"
            @click="selectBuildingChip(chip.id)"
          >
            <span class="building-chip__name">{{ chip.name }}</span>
            <span class="building-chip__count">({{ chip.count }})</span>
          </button>
        </div>
        <button
          v-show="buildingChipsOverflow"
          type="button"
          class="building-chips-nav is-next"
          :disabled="!canScrollBuildingChipsRight"
          :aria-label="t('room.scrollChipsRight')"
          @click="scrollBuildingChips(1)"
        >
          <el-icon :size="14"><CaretRight /></el-icon>
        </button>
        <div
          v-show="buildingChipsOverflow"
          class="building-chips-hscroll"
          aria-hidden="true"
        >
          <div class="building-chips-hscroll__thumb" :style="buildingChipsThumbStyle" />
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
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
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
              <el-dropdown-item v-if="isAdmin" command="import">
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
            :width="actionColWidth.two"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button type="button" class="action-pill action-pill--view" @click="openDetail(row as RoomRecord)">
                  {{ t('common.detail') }}
                </button>
                <button type="button" class="action-pill action-pill--edit" @click="openEdit(row as RoomRecord)">
                  {{ t('common.edit') }}
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

    <div v-else class="data-cards">
      <article v-for="row in list" :key="row.id" class="data-card">
        <div class="data-card__head">
          <div>
            <h3 class="data-card__title">{{ row.name }}</h3>
            <p class="data-card__meta">
              {{ row.roomCode }} ·
              <button type="button" class="fk-link" @click="openBuildingDetail(row.buildingId)">
                {{ row.buildingName }}
              </button>
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
          <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
            {{ t('common.edit') }}
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
          <div class="image-row">
            <div v-for="(src, idx) in [current.image1, current.image2, current.image3]" :key="idx" class="image-item">
              <span>{{ t('room.fields.image') }} {{ idx + 1 }}</span>
              <img v-if="src" :src="src" alt="" />
              <em v-else>—</em>
            </div>
          </div>
          <dl class="detail-grid" style="margin-top: 14px">
            <div><dt>{{ t('room.fields.description') }}</dt><dd>{{ current.description || '—' }}</dd></div>
            <div><dt>{{ t('room.fields.remark') }}</dt><dd>{{ current.remark || '—' }}</dd></div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('room.sections.contract') }}</h3>
          <dl class="detail-grid two">
            <div><dt>{{ t('room.fields.latestContract') }}</dt><dd>{{ current.latestContract || '—' }}</dd></div>
            <div>
              <dt>{{ t('room.fields.contractRecords') }}</dt>
              <dd>{{ current.contractRecords?.join(', ') || '—' }}</dd>
            </div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('room.sections.relatedRecords') }}</h3>
          <dl class="detail-grid two">
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

    <BuildingDetailDrawer
      v-model="buildingDrawerVisible"
      :building="relatedBuilding"
      desktop-direction="ltr"
      @open-rooms="openRoomsSide"
    />
    <RelatedRoomsDrawer
      v-model="relatedRoomsDrawer"
      :building="relatedRoomsBuilding"
      desktop-direction="ltr"
      @open-room="onOpenRoomFromList"
    />
    <RoomDetailDrawer
      v-model="relatedRoomDrawer"
      :room="relatedRoom"
      desktop-direction="ltr"
      @open-building="openBuildingDetail"
      @open-contracts="openContractsSide"
      @open-invoices="openInvoicesSide"
      @open-terminations="openTerminationsSide"
      @open-deposit-refunds="openDepositRefundsSide"
    />
    <RelatedContractsDrawer
      v-model="relatedContractsDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-contract="onOpenContractFromRelated"
    />
    <RelatedInvoicesDrawer
      v-model="relatedInvoicesDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-invoice="onOpenInvoiceFromRelated"
    />
    <RelatedTerminationsDrawer
      v-model="relatedTerminationsDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-termination="onOpenTerminationFromRelated"
    />
    <RelatedDepositRefundsDrawer
      v-model="relatedDepositRefundsDrawer"
      :room-id="relatedListRoom?.id"
      :title-context="relatedListRoom?.roomCode || ''"
      desktop-direction="ltr"
      @open-deposit-refund="onOpenDepositRefundFromRelated"
    />
    <ContractDetailDrawer v-model="contractDetailDrawer" :contract="relatedContract" desktop-direction="ltr" />
    <InvoiceDetailDrawer v-model="invoiceDetailDrawer" :record="relatedInvoice" desktop-direction="ltr" />
    <LeaseTerminationDetailDrawer v-model="terminationDetailDrawer" :termination="relatedTermination" desktop-direction="ltr" />
    <DepositRefundDetailDrawer v-model="depositRefundDetailDrawer" :record="relatedDepositRefund" desktop-direction="ltr" />

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
        <div class="form-grid">
          <div class="form-section">
            <h3>{{ t('room.sections.basic') }}</h3>
          </div>
          <el-form-item :label="t('room.fields.roomCode')" required>
            <el-input v-model="form.roomCode" />
          </el-form-item>
          <el-form-item :label="t('room.fields.name')" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="t('room.fields.roomType')">
            <div class="lb-room-type-picker" role="radiogroup" :aria-label="t('room.fields.roomType')">
              <button
                v-for="opt in roomTypeOptions"
                :key="opt.id"
                type="button"
                role="radio"
                class="lb-room-type-picker__item"
                :class="[
                  `lb-room-type-picker__item--${opt.tone}`,
                  { 'is-active': form.roomType === opt.label },
                ]"
                :aria-checked="form.roomType === opt.label"
                @click="selectRoomType(opt.label)"
              >
                <RoomTypeBadge :value="opt.label" :tone="opt.tone" />
              </button>
            </div>
          </el-form-item>
          <el-form-item :label="t('room.fields.building')">
            <el-select v-model="form.buildingId" style="width: 100%">
              <el-option v-for="b in formBuildingOptions" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('room.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option v-for="s in statusOptions" :key="s" :label="t(`room.status.${s}`)" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('room.fields.serialNo')">
            <el-input v-model="form.serialNo" />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('room.sections.pricing') }}</h3>
          </div>
          <el-form-item :label="t('room.fields.monthlyRent')">
            <el-input-number v-model="form.monthlyRent" :min="0" :precision="2" :step="0.01" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('room.fields.dailyRent')">
            <el-input-number v-model="form.dailyRent" :min="0" :precision="2" :step="0.01" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('room.fields.hourlyRent')">
            <el-input-number v-model="form.hourlyRent" :min="0" :precision="2" :step="0.01" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('room.fields.sizeSqft')">
            <el-input-number
              v-model="form.sizeSqft"
              :min="0"
              :precision="2"
              :step="0.01"
              style="width: 100%"
            />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('room.sections.config') }}</h3>
          </div>
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
          <el-form-item :label="t('room.fields.subleaseMark')">
            <el-input v-model="form.subleaseMark" />
          </el-form-item>
          <el-form-item :label="t('room.fields.description')" class="span-2">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('room.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveForm">{{ t('common.save') }}</el-button>
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

@media (max-width: 640px) {
  .image-row {
    grid-template-columns: 1fr;
  }
}
</style>
