<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { BuildingRecord } from '@/types/building'
import type { RoomRecord } from '@/types/room'
import { fetchRooms } from '@/api/rooms'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { roomStatusTone } from '@/constants/statusBadges'
import { formatMoney, formatNumber2 } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    building: BuildingRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openRoom: [room: RoomRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, textColW, statusColW, tableLayoutKey } = useTableColWidth()
const rooms = ref<RoomRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const roomStatusLabels = computed(() =>
  (['idle', 'signing', 'leased', 'terminating'] as const).map((s) => t(`room.status.${s}`)),
)
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const b = props.building
  if (!b) return t('building.relatedRoomsTitle')
  const name = b.name?.trim()
  return name
    ? t('building.relatedRoomsTitleWithBuilding', { building: name })
    : t('building.relatedRoomsTitle')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return rooms.value
  return rooms.value.filter((r) =>
    [r.roomCode, r.name, r.roomType, r.status, r.serialNo, r.subleaseMark]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch(keyword, () => resetPage())

async function loadRooms(buildingId: string) {
  loading.value = true
  try {
    const { data } = await fetchRooms({ buildingId })
    rooms.value = data.items
  } catch {
    rooms.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.building?.id] as const,
  ([open, id]) => {
    if (open && id) {
      keyword.value = ''
      resetPage()
      void loadRooms(id)
    }
    if (!open) {
      rooms.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: RoomRecord) {
  emit('openRoom', row)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="title"
    :direction="direction"
    class="responsive-drawer related-list-drawer"
  >
    <div v-loading="loading" class="related-list">
      <div class="related-list__toolbar">
        <el-input
          v-model="keyword"
          clearable
          class="related-list__search"
          :prefix-icon="Search"
          :placeholder="t('room.searchPlaceholder')"
        />
      </div>

      <div class="related-list__body">
        <p v-if="!loading && !filtered.length" class="related-list__empty">—</p>
        <el-table
          v-else
          :key="tableLayoutKey"
          class="related-list__table related-list__table--clickable"
          :data="paged"
          height="100%"
          stripe
          border
          scrollbar-always-on
          empty-text="—"
          style="width: 100%"
          @row-click="onRowClick"
        >
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="48"
            align="center"
            header-align="center"
          />
          <el-table-column
            prop="roomCode"
            :label="t('room.fields.roomCode')"
            :min-width="colW(t('room.fields.roomCode'), { contentMin: 110 })"
            show-overflow-tooltip
          />
          <el-table-column
            prop="name"
            :label="t('room.fields.name')"
            :min-width="textColW(t('room.fields.name'), { kind: 'name' })"
            show-overflow-tooltip
          />
          <el-table-column
            prop="roomType"
            :label="t('room.fields.roomType')"
            :min-width="colW(t('room.fields.roomType'), { contentMin: 100 })"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('room.fields.status')"
            :min-width="statusColW(t('room.fields.status'), roomStatusLabels, { interactive: false })"
          >
            <template #default="{ row }">
              <StatusBadge
                :tone="roomStatusTone(row.status)"
                :label="t(`room.status.${row.status}`)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('room.fields.monthlyRent')"
            :min-width="colW(t('room.fields.monthlyRent'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ formatMoney(row.monthlyRent) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('room.fields.sizeSqft')"
            :min-width="colW(t('room.fields.sizeSqft'), { contentMin: 90 })"
            align="right"
          >
            <template #default="{ row }">{{ formatNumber2(row.sizeSqft) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="total" class="related-list__pager">
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="pageSizes"
        />
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.related-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

.related-list__toolbar {
  flex: 0 0 auto;
}

.related-list__search {
  max-width: 360px;
}

.related-list__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.related-list__empty {
  margin: 12px 0 0;
  color: var(--lb-muted, #6a7a70);
}

.related-list__table {
  flex: 1 1 auto;
  min-height: 0;
  height: 100% !important;
}

.related-list__table :deep(.el-table__inner-wrapper) {
  height: 100%;
}

.related-list__table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.related-list__pager {
  flex: 0 0 auto;
  margin: 0 -4px -4px;
  border: 1px solid #e6ebe8;
  border-radius: 10px;
  overflow: hidden;
}

.related-list__pager :deep(.lb-pager) {
  border-top: none;
}
</style>
