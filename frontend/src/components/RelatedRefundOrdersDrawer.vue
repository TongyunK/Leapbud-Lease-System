<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { RefundOrderRecord } from '@/types/refund-order'
import { REFUND_ORDER_STATUSES } from '@/types/refund-order'
import { fetchRefundOrders } from '@/api/refund-orders'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useRelatedAmountStats } from '@/composables/useRelatedTableAmountSummary'
import RelatedAmountStatsBar from '@/components/RelatedAmountStatsBar.vue'
import TablePagination from '@/components/TablePagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { refundOrderStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    settlementId?: string
    contractId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  
    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    settlementId: undefined,
    contractId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  
    zIndex: undefined,
  },
)

const emit = defineEmits<{ openRefundOrder: [record: RefundOrderRecord] }>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, statusColW, tableLayoutKey } = useTableColWidth()
const rows = ref<RefundOrderRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const statusLabels = computed(() =>
  REFUND_ORDER_STATUSES.map((s) => t(`refundOrder.status.${s}`, s)),
)
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  return ctx
    ? t('common.relatedRefundOrdersWithContext', { context: ctx })
    : t('common.relatedRefundOrders')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) =>
    [row.refundCode, row.status, row.customerName, row.settlementCode, row.handler]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)
const {
  items: amountStats,
  visible: amountStatsVisible,
  caption: amountStatsCaption,
} = useRelatedAmountStats({
  rows: computed(() =>
    filtered.value.map((row) => ({
      ...row,
      remainingAmount:
        row.remainingAmount != null
          ? row.remainingAmount
          : Math.max(0, Number(row.amount || 0) - Number(row.paidAmount || 0)),
    })),
  ),
  fields: [
    { prop: 'amount', label: t('refundOrder.fields.amount') },
    { prop: 'paidAmount', label: t('refundOrder.fields.paidAmount') },
    { prop: 'remainingAmount', label: t('refundOrder.fields.remainingAmount') },
  ],
})
watch(keyword, () => resetPage())

async function load() {
  const settlementId = props.settlementId?.trim()
  const contractId = props.contractId?.trim()
  if (!settlementId && !contractId) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchRefundOrders({
      ...(settlementId ? { settlementId } : {}),
      ...(!settlementId && contractId ? { contractId } : {}),
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
  () => [visible.value, props.settlementId, props.contractId] as const,
  ([open, settlementId, contractId]) => {
    if (open && (settlementId || contractId)) {
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

function onRowClick(row: RefundOrderRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openRefundOrder', row)
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
            prop="refundCode"
            :label="t('refundOrder.fields.refundCode')"
            :min-width="
              codeColW(t('refundOrder.fields.refundCode'), {
                samples: paged.map((r) => r.refundCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            :label="t('refundOrder.fields.status')"
            :min-width="statusColW(t('refundOrder.fields.status'), statusLabels, { interactive: false })"
          >
            <template #default="{ row }">
              <StatusBadge
                :tone="refundOrderStatusTone(row.status)"
                :label="t(`refundOrder.status.${row.status}`, row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="amount"
            :label="t('refundOrder.fields.amount')"
            :min-width="colW(t('refundOrder.fields.amount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            prop="paidAmount"
            :label="t('refundOrder.fields.paidAmount')"
            :min-width="colW(t('refundOrder.fields.paidAmount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ formatMoney(row.paidAmount ?? 0) }}</template>
          </el-table-column>
          <el-table-column
            prop="remainingAmount"
            :label="t('refundOrder.fields.remainingAmount')"
            :min-width="colW(t('refundOrder.fields.remainingAmount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{
                formatMoney(
                  row.remainingAmount != null
                    ? row.remainingAmount
                    : Math.max(0, Number(row.amount || 0) - Number(row.paidAmount || 0)),
                )
              }}
            </template>
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
