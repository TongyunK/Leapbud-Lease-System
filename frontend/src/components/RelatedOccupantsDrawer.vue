<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { CustomerRecord, OccupantRecord } from '@/types/customer'
import { fetchOccupants } from '@/api/occupants'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import { formatDateTime } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    customer: CustomerRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openOccupant: [occupant: OccupantRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, textColW, datetimeColWidth, tableLayoutKey } = useTableColWidth()
const occupants = ref<OccupantRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const {
  setSort,
  setDateRange,
  dateRangeOf,
  dateRanges,
  sortOrderOf,
  activeConditionCount,
  clearAll,
  apply: applySortFilter,
  sortKey,
  sortOrder,
} = useTableSortFilter<OccupantRecord>()

const columnGetters = {
  createdAt: (o: OccupantRecord) => o.createdAt,
}

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '900px'))

const title = computed(() => {
  const c = props.customer
  if (!c) return t('customer.relatedOccupantsTitle')
  const code = c.customerCode?.trim()
  const name = c.name?.trim()
  const who = [code, name].filter(Boolean).join(' · ')
  return who
    ? t('customer.relatedOccupantsTitleWithCustomer', { customer: who })
    : t('customer.relatedOccupantsTitle')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = !q
    ? occupants.value
    : occupants.value.filter((o) =>
        [o.name, o.mobilePhone, o.whatsapp, o.email, o.idCardNo, o.contactPhone]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
  return applySortFilter(base, columnGetters)
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([keyword, dateRanges, sortKey, sortOrder], () => resetPage(), { deep: true })

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

async function loadOccupants(customerId: string) {
  loading.value = true
  try {
    const { data } = await fetchOccupants({ customerId })
    occupants.value = data.items
  } catch {
    occupants.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.customer?.id] as const,
  ([open, id]) => {
    if (open && id) {
      keyword.value = ''
      clearAll()
      resetPage()
      void loadOccupants(id)
    }
    if (!open) {
      occupants.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: OccupantRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openOccupant', row)
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
          :placeholder="t('occupant.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
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
            fixed="left"
          />
          <el-table-column
            prop="name"
            :label="t('occupant.fields.name')"
            :min-width="textColW(t('occupant.fields.name'), { kind: 'name' })"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            prop="mobilePhone"
            :label="t('occupant.fields.mobilePhone')"
            :min-width="colW(t('occupant.fields.mobilePhone'), { contentMin: 120 })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ dash(row.mobilePhone) }}</template>
          </el-table-column>
          <el-table-column
            prop="whatsapp"
            :label="t('occupant.fields.whatsapp')"
            :min-width="colW(t('occupant.fields.whatsapp'), { contentMin: 120 })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ dash(row.whatsapp) }}</template>
          </el-table-column>
          <el-table-column
            prop="email"
            :label="t('occupant.fields.email')"
            :min-width="colW(t('occupant.fields.email'), { contentMin: 160 })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ dash(row.email) }}</template>
          </el-table-column>
          <el-table-column
            prop="idCardNo"
            :label="t('occupant.fields.idCardNo')"
            :min-width="colW(t('occupant.fields.idCardNo'), { contentMin: 130 })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ dash(row.idCardNo) }}</template>
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
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.related-list__search {
  flex: 1 1 220px;
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
