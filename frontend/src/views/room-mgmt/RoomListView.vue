<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, CaretLeft, CaretRight, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import { fetchBuildings } from '@/api/buildings'
import { fetchRooms } from '@/api/rooms'
import { fetchRoomConfigs, matchSizeOption } from '@/api/room-configs'
import { fetchRoomTypes } from '@/api/room-types'
import type { BuildingRecord } from '@/types/building'
import type { RoomRecord, RoomStatus } from '@/types/room'
import type { RoomConfigOption } from '@/types/room-config'
import type { RoomTypeOption } from '@/types/room-type'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import RoomTypeBadge from '@/components/RoomTypeBadge.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import { roomStatusTone } from '@/constants/statusBadges'
import { formatMoney, formatNumber2 } from '@/utils/format'
import { roomIoTemplateExampleRow, roomToIoRow } from '@/utils/roomExport'

const { t } = useI18n()
const isMobile = useIsMobile()
const useCards = computed(() => isMobile.value)

const keyword = ref('')
const loading = ref(false)
const drawerVisible = ref(false)
const formVisible = ref(false)
const current = ref<RoomRecord | null>(null)
const editing = ref<RoomRecord | null>(null)

const list = ref<RoomRecord[]>([])
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
  sortOrderOf,
  apply: applySortFilter,
  uniqueOptions,
  sortKey,
  sortOrder,
} = useTableSortFilter<RoomRecord>()

const columnGetters = {
  roomCode: (r: RoomRecord) => r.roomCode,
  name: (r: RoomRecord) => r.name,
  roomType: (r: RoomRecord) => r.roomType,
  buildingId: (r: RoomRecord) => r.buildingId,
  status: (r: RoomRecord) => r.status,
  monthlyRent: (r: RoomRecord) => r.monthlyRent,
  dailyRent: (r: RoomRecord) => r.dailyRent,
  hourlyRent: (r: RoomRecord) => r.hourlyRent,
  sizeSqft: (r: RoomRecord) => r.sizeSqft,
  /** 按房间配置尺寸区间自动匹配，供表头筛选 */
  sizeRange: (r: RoomRecord) => matchSizeOption(sizeOptions.value, r.sizeSqft)?.id || '',
  windowConfig: (r: RoomRecord) => r.windowConfig || '',
  acConfig: (r: RoomRecord) => r.acConfig || '',
}

const roomTypeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.roomType),
)
const buildingFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => r.buildingId,
    (id) => list.value.find((r) => r.buildingId === id)?.buildingName || id,
  ),
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
  uniqueOptions(list.value, (r) => r.windowConfig),
)
const acConfigFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.acConfig))

const buildingChips = computed(() => {
  const counts = new Map<string, number>()
  for (const r of list.value) {
    counts.set(r.buildingId, (counts.get(r.buildingId) || 0) + 1)
  }
  return buildings.value
    .filter((b) => b.active)
    .map((b) => ({ id: b.id, name: b.name, count: counts.get(b.id) || 0 }))
    .filter((b) => b.count > 0)
})

const allBuildingCount = computed(() => list.value.length)

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

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = list.value.filter((r) => {
    if (!q) return true
    return [r.roomCode, r.name, r.roomType, r.buildingName, r.serialNo, r.description]
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
  return applySortFilter(base, columnGetters)
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([keyword, filters, sortKey, sortOrder], () => resetPage(), { deep: true })

async function loadList() {
  loading.value = true
  try {
    const [roomsRes, buildingsRes, configsRes, typesRes] = await Promise.all([
      fetchRooms(),
      fetchBuildings(),
      fetchRoomConfigs({ activeOnly: true }),
      fetchRoomTypes({ activeOnly: true }),
    ])
    list.value = roomsRes.data
    buildings.value = buildingsRes.data
    const configs = configsRes.data
    sizeOptions.value = configs.filter((c) => c.type === 'size')
    windowOptions.value = configs.filter((c) => c.type === 'window')
    acOptions.value = configs.filter((c) => c.type === 'ac')
    roomTypeOptions.value = typesRes.data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList().then(() => nextTick(syncBuildingChipsScroll))
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

function onRoomRowClick(row: RoomRecord, _column: unknown, event: Event) {
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox')) return
  openDetail(row)
}

const importInputRef = ref<HTMLInputElement | null>(null)

function onDataIoCommand(cmd: string | number) {
  if (cmd === 'import') {
    importInputRef.value?.click()
    return
  }
  if (cmd === 'template') {
    downloadImportTemplate()
    return
  }
  if (cmd === 'export') {
    exportRoomsXlsx()
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

function exportRoomsXlsx() {
  const rows = filtered.value
  if (!rows.length) {
    ElMessage.warning(t('room.exportEmpty'))
    return
  }
  const sheetRows = rows.map((r) => roomToIoRow(r, t))
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rooms')
  XLSX.writeFile(wb, `rooms-${new Date().toISOString().slice(0, 10)}.xlsx`)
  ElMessage.success(t('room.exportDone', { n: rows.length }))
}

function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  ElMessage.info(t('room.importPending', { name: file.name }))
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

function saveForm() {
  if (!form.roomCode.trim() || !form.name.trim()) return
  const building = buildings.value.find((b) => b.id === form.buildingId)
  const payload = {
    ...form,
    buildingName: building?.name || '',
  }
  if (editing.value) {
    Object.assign(editing.value, payload)
  } else {
    list.value.unshift({
      id: `r${Date.now()}`,
      ...payload,
      createdBy: 'admin',
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      contractRecords: [],
    })
  }
  formVisible.value = false
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
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('room.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('room.dataIo')">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('room.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('room.downloadTemplate') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export" divided>
                <el-icon><Download /></el-icon>
                <span>{{ t('room.export') }}</span>
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
          :data="paged"
          height="100%"
          stripe
          border
          class="room-table--clickable"
          style="width: 100%"
          @row-click="onRoomRowClick"
        >
          <el-table-column type="index" :index="rowIndex" label="#" width="52" fixed="left" align="center" header-align="center" />
          <el-table-column prop="roomCode" min-width="136">
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.roomCode')"
                sortable
                :sort-order="sortOrderOf('roomCode')"
                @update:sort-order="(v) => setSort('roomCode', v)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="name" min-width="140">
            <template #header>
              <TableColumnHeader
                :label="t('room.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
          </el-table-column>
          <el-table-column min-width="132">
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
          <el-table-column prop="buildingName" min-width="168">
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
          </el-table-column>
          <el-table-column min-width="108">
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
          <el-table-column min-width="112" align="right">
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
          <el-table-column min-width="100" align="right">
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
          <el-table-column min-width="100" align="right">
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
          <el-table-column min-width="118" align="right">
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
          <el-table-column min-width="92" show-overflow-tooltip>
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
          <el-table-column min-width="118" show-overflow-tooltip>
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
          <el-table-column :label="t('common.actions')" width="150" fixed="right">
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
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>

    <div v-else class="data-cards">
      <article v-for="row in paged" :key="row.id" class="data-card">
        <div class="data-card__head">
          <div>
            <h3 class="data-card__title">{{ row.name }}</h3>
            <p class="data-card__meta">{{ row.roomCode }} · {{ row.buildingName }}</p>
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
      <el-empty v-if="!filtered.length" />
      <div v-if="filtered.length" class="table-pagination cards-pagination">
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
            <div><dt>{{ t('room.fields.building') }}</dt><dd>{{ current.buildingName }}</dd></div>
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
            <div><dt>{{ t('room.fields.createdBy') }}</dt><dd>{{ current.createdBy }}</dd></div>
            <div><dt>{{ t('room.fields.createdAt') }}</dt><dd>{{ current.createdAt }}</dd></div>
          </dl>
        </section>
      </template>
    </el-drawer>

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
