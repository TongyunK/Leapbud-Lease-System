<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { CashFlowRecord } from '@/types/cash-flow'
import { CASH_FLOW_DIRECTIONS, CASH_FLOW_SOURCE_TYPES } from '@/types/cash-flow'
import { fetchCashFlows } from '@/api/cash-flows'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import RelatedAmountStatsBar from '@/components/RelatedAmountStatsBar.vue'
import TablePagination from '@/components/TablePagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { cashFlowDirectionTone, cashFlowSourceTypeTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    refundOrderId?: string
    receiptId?: string
    invoiceId?: string
    receivableId?: string
    contractId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  
    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    refundOrderId: undefined,
    receiptId: undefined,
    invoiceId: undefined,
    receivableId: undefined,
    contractId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  
    zIndex: undefined,
  },
)

const emit = defineEmits<{ openCashFlow: [record: CashFlowRecord] }>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, statusColW, tableLayoutKey } = useTableColWidth()
const rows = ref<CashFlowRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const directionLabels = computed(() =>
  CASH_FLOW_DIRECTIONS.map((s) => t(`cashFlow.direction.${s}`, s)),
)
const sourceTypeLabels = computed(() =>
  CASH_FLOW_SOURCE_TYPES.map((s) => t(`cashFlow.sourceType.${s}`, s)),
)

function sourceRefOf(row: CashFlowRecord) {
  return (row.receiptCode || row.refundOrderCode || '').trim()
}
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  return ctx
    ? t('common.relatedCashFlowsWithContext', { context: ctx })
    : t('common.relatedCashFlows')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) =>
    [
      row.flowCode,
      row.direction,
      row.sourceType,
      row.receiptCode,
      row.refundOrderCode,
      row.customerName,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** 底部：入账合计 / 出账合计 / 盈亏额（入−出） */
const amountStats = computed(() => {
  let inflow = 0
  let outflow = 0
  for (const row of filtered.value) {
    const amt = Number(row.amount)
    if (!Number.isFinite(amt)) continue
    if (row.direction === 'out') outflow += amt
    else if (row.direction === 'in') inflow += amt
  }
  inflow = round2(inflow)
  outflow = round2(outflow)
  const net = round2(inflow - outflow)
  return [
    {
      key: 'in',
      label: t('cashFlow.statsIn'),
      value: inflow,
      display: formatMoney(inflow),
    },
    {
      key: 'out',
      label: t('cashFlow.statsOut'),
      value: outflow,
      display: formatMoney(outflow),
    },
    {
      key: 'net',
      label: t('cashFlow.statsNet'),
      value: net,
      display: formatMoney(net),
    },
  ]
})
const amountStatsVisible = computed(() => filtered.value.length > 0)
const amountStatsCaption = computed(() => t('common.relatedAmountStatsAll'))
watch(keyword, () => resetPage())

async function load() {
  const refundOrderId = props.refundOrderId?.trim()
  const receiptId = props.receiptId?.trim()
  const invoiceId = props.invoiceId?.trim()
  const receivableId = props.receivableId?.trim()
  const contractId = props.contractId?.trim()
  if (!refundOrderId && !receiptId && !invoiceId && !receivableId && !contractId) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchCashFlows({
      ...(refundOrderId ? { refundOrderId } : {}),
      ...(receiptId ? { receiptId } : {}),
      ...(invoiceId ? { invoiceId } : {}),
      ...(receivableId ? { receivableId } : {}),
      ...(!refundOrderId && !receiptId && !invoiceId && !receivableId && contractId
        ? { contractId }
        : {}),
      pageSize: 500,
    })
    rows.value = data.items || []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () =>
    [
      visible.value,
      props.refundOrderId,
      props.receiptId,
      props.invoiceId,
      props.receivableId,
      props.contractId,
    ] as const,
  ([open, refundOrderId, receiptId, invoiceId, receivableId, contractId]) => {
    if (open && (refundOrderId || receiptId || invoiceId || receivableId || contractId)) {
      keyword.value = ''
      resetPage()
      void load()
    }
    if (!open) {
      rows.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: CashFlowRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openCashFlow', row)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="title"
    :direction="direction"
    class="responsive-drawer related-list-drawer"
  
    append-to-body
  
    :z-index="zIndex"
  >
    <div v-loading="loading" class="related-list">
      <div class="related-list__toolbar">
        <el-input
          v-model="keyword"
          clearable
          class="related-list__search"
          :prefix-icon="Search"
          :placeholder="t('common.searchKeyword')"
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
            prop="flowCode"
            :label="t('cashFlow.fields.flowCode')"
            :min-width="
              codeColW(t('cashFlow.fields.flowCode'), {
                samples: paged.map((r) => r.flowCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            :label="t('cashFlow.fields.direction')"
            :min-width="statusColW(t('cashFlow.fields.direction'), directionLabels, { interactive: false })"
          >
            <template #default="{ row }">
              <StatusBadge
                :tone="cashFlowDirectionTone(row.direction)"
                :label="t(`cashFlow.direction.${row.direction}`, row.direction)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="amount"
            :label="t('cashFlow.fields.amount')"
            :min-width="colW(t('cashFlow.fields.amount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('cashFlow.fields.flowDate')"
            :min-width="colW(t('cashFlow.fields.flowDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.flowDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('cashFlow.fields.sourceType')"
            :min-width="
              statusColW(t('cashFlow.fields.sourceType'), sourceTypeLabels, {
                interactive: false,
              })
            "
          >
            <template #default="{ row }">
              <StatusBadge
                :tone="cashFlowSourceTypeTone(row.sourceType)"
                :label="t(`cashFlow.sourceType.${row.sourceType}`, row.sourceType)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('cashFlow.fields.sourceRef')"
            :min-width="
              codeColW(t('cashFlow.fields.sourceRef'), {
                samples: paged.map((r) => sourceRefOf(r)),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">{{ sourceRefOf(row) || '—' }}</template>
          </el-table-column>
        </el-table>
      </div>
      <RelatedAmountStatsBar
        v-if="amountStatsVisible"
        :items="amountStats"
        :caption="amountStatsCaption"
      />

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
