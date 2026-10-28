<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { ContractPeriodListRecord } from '@/types/contract-period'
import { fetchContractPeriods } from '@/api/contract-periods'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract: ContractRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  { desktopDirection: 'ltr', size: undefined },
)

const emit = defineEmits<{
  openPeriod: [period: ContractPeriodListRecord]
  openRoom: [roomId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, tableLayoutKey } = useTableColWidth()
const periods = ref<ContractPeriodListRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const code = props.contract?.contractCode?.trim()
  return code
    ? t('contract.relatedPeriodsWithContract', { contract: code })
    : t('contract.relatedPeriods')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return periods.value
  return periods.value.filter((p) =>
    [p.dateType, p.dateUnit, String(p.dateValue), p.startDate, p.endDate].join(' ').toLowerCase().includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } = useClientPagination(filtered)
watch(keyword, () => resetPage())

function durationLabel(p: ContractPeriodListRecord) {
  const n = Number(p.dateValue) || 0
  const unit = t(`contract.periodUnits.${p.dateUnit}`, p.dateUnit)
  return n ? `${n} ${unit}` : '—'
}

async function load(contractId: string) {
  loading.value = true
  try {
    const { data } = await fetchContractPeriods({ contractId })
    periods.value = data.items
  } catch {
    periods.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.contract?.id] as const,
  ([open, id]) => {
    if (open && id) {
      keyword.value = ''
      resetPage()
      void load(id)
    }
    if (!open) {
      periods.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: ContractPeriodListRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openPeriod', row)
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
          :placeholder="t('contractPeriod.searchPlaceholder')"
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
          style="width: 100%"
          @row-click="onRowClick"
        >
          <el-table-column type="index" :index="rowIndex" label="#" width="48" align="center" header-align="center" />
          <el-table-column
            :label="t('contractPeriod.fields.dateType')"
            :min-width="textColW(t('contractPeriod.fields.dateType'), { kind: 'name' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ t(`contract.periodTypes.${row.dateType}`, row.dateType) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractPeriod.fields.duration')"
            :min-width="colW(t('contractPeriod.fields.duration'), { contentMin: 80 })"
          >
            <template #default="{ row }">{{ durationLabel(row) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractPeriod.fields.startDate')"
            :min-width="colW(t('contractPeriod.fields.startDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.startDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractPeriod.fields.endDate')"
            :min-width="colW(t('contractPeriod.fields.endDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.endDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            prop="roomCode"
            :label="t('contractPeriod.fields.roomCode')"
            :min-width="codeColW(t('contractPeriod.fields.roomCode'), { samples: paged.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.roomId"
                type="button"
                class="fk-link"
                @click.stop="emit('openRoom', row.roomId)"
              >
                {{ row.roomCode || '—' }}
              </button>
              <template v-else>{{ row.roomCode || '—' }}</template>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div v-if="total" class="related-list__pager">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
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
