<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { CustomerRecord } from '@/types/customer'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import { fetchCustomerRequirements } from '@/api/customer-requirements'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { customerRequirementStatusTone } from '@/constants/statusBadges'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { CUSTOMER_REQUIREMENT_STATUSES } from '@/types/customer-requirement'

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
  openRequirement: [requirement: CustomerRequirementRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, tableLayoutKey } = useTableColWidth()
const requirements = ref<CustomerRequirementRecord[]>([])
const loading = ref(false)
const keyword = ref('')

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
  apply: applySortFilter,
  sortKey,
  sortOrder,
} = useTableSortFilter<CustomerRequirementRecord>()

const columnGetters = {
  requirementCode: (o: CustomerRequirementRecord) => o.requirementCode,
  status: (o: CustomerRequirementRecord) => o.status,
  requirementDate: (o: CustomerRequirementRecord) => o.requirementDate,
  budget: (o: CustomerRequirementRecord) => o.budget ?? -1,
  createdAt: (o: CustomerRequirementRecord) => o.createdAt,
}

const statusFilterOptions = computed(() =>
  CUSTOMER_REQUIREMENT_STATUSES.map((s) => ({
    value: s,
    label: t(`customerRequirement.status.${s}`),
  })),
)

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '960px'))

const title = computed(() => {
  const c = props.customer
  if (!c) return t('customer.relatedRequirementsTitle')
  const code = c.customerCode?.trim()
  const name = c.name?.trim()
  const who = [code, name].filter(Boolean).join(' · ')
  return who
    ? t('customer.relatedRequirementsTitleWithCustomer', { customer: who })
    : t('customer.relatedRequirementsTitle')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = !q
    ? requirements.value
    : requirements.value.filter((o) =>
        [o.requirementCode, o.status, o.content, o.salesManager, o.leaseDuration]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
  return applySortFilter(base, columnGetters)
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([keyword, filters, dateRanges, sortKey, sortOrder], () => resetPage(), { deep: true })

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function statusLabel(status: string) {
  return t(`customerRequirement.status.${status}`, status)
}

async function loadRequirements(customerId: string) {
  loading.value = true
  try {
    const { data } = await fetchCustomerRequirements({ customerId })
    requirements.value = data.items
  } catch {
    requirements.value = []
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
      void loadRequirements(id)
    }
    if (!open) {
      requirements.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: CustomerRequirementRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openRequirement', row)
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
          :placeholder="t('customerRequirement.searchPlaceholder')"
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
            prop="requirementCode"
            :label="t('customerRequirement.fields.requirementCode')"
            :min-width="codeColW(t('customerRequirement.fields.requirementCode'), { samples: paged.map((r) => r.requirementCode) })"
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            :min-width="
              statusColW(
                t('customerRequirement.fields.status'),
                statusFilterOptions.map((o) => o.label),
                { interactive: true },
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
            <template #default="{ row }">{{ dash(row.requirementDate) }}</template>
          </el-table-column>
          <el-table-column
            prop="budget"
            :label="t('customerRequirement.fields.budget')"
            :min-width="colW(t('customerRequirement.fields.budget'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.budget != null ? formatMoney(row.budget) : '—' }}
            </template>
          </el-table-column>
          <el-table-column
            prop="content"
            :label="t('customerRequirement.fields.content')"
            :min-width="textColW(t('customerRequirement.fields.content'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ dash(row.content) }}</template>
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
