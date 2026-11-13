<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { DepositDeductionRecord } from '@/types/deposit-deduction'
import { fetchDepositDeductions } from '@/api/deposit-deductions'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useRelatedAmountStats } from '@/composables/useRelatedTableAmountSummary'
import RelatedAmountStatsBar from '@/components/RelatedAmountStatsBar.vue'
import TablePagination from '@/components/TablePagination.vue'
import { formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract?: ContractRecord | null
    settlementId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  
    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    contract: null,
    settlementId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openFee: [fee: DepositDeductionRecord]
  openSettlement: [settlementId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, tableLayoutKey } = useTableColWidth()
const fees = ref<DepositDeductionRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedDepositDeductionsWithContext', { context: ctx })
  const code = props.contract?.contractCode?.trim()
  return code
    ? t('contract.relatedDepositDeductionsWithContract', { contract: code })
    : t('contract.relatedDepositDeductions')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return fees.value
  return fees.value.filter((row) =>
    [row.description, row.settlementCode, row.returnStatus, row.remark, String(row.amount)]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } = useClientPagination(filtered)
const {
  items: amountStats,
  visible: amountStatsVisible,
  caption: amountStatsCaption,
} = useRelatedAmountStats({
  rows: filtered,
  fields: [
    { prop: 'amount', label: t('depositDeduction.fields.amount') },
  ],
})
watch(keyword, () => resetPage())

function returnStatusLabel(raw?: string | null) {
  const s = (raw || '').trim()
  if (!s) return '—'
  const key = `depositDeduction.returnStatus.${s}`
  const translated = t(key)
  return translated === key ? s : translated
}

async function load() {
  const settlementId = props.settlementId?.trim()
  const contractId = props.contract?.id
  if (!settlementId && !contractId) {
    fees.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchDepositDeductions({
      ...(settlementId ? { settlementId } : {}),
      ...(!settlementId && contractId ? { contractId } : {}),
    })
    fees.value = data.items
  } catch {
    fees.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.settlementId, props.contract?.id] as const,
  ([open, settlementId, contractId]) => {
    if (open && (settlementId || contractId)) {
      keyword.value = ''
      resetPage()
      void load()
    }
    if (!open) {
      fees.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: DepositDeductionRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openFee', row)
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
          :placeholder="t('depositDeduction.searchPlaceholder')"
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
            prop="settlementCode"
            :label="t('depositDeduction.fields.settlementCode')"
            :min-width="
              codeColW(t('depositDeduction.fields.settlementCode'), {
                samples: paged.map((r) => r.settlementCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.settlementId"
                type="button"
                class="fk-link"
                @click.stop="emit('openSettlement', row.settlementId)"
              >
                {{ row.settlementCode || '—' }}
              </button>
              <template v-else>{{ row.settlementCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('depositDeduction.fields.description')"
            :min-width="textColW(t('depositDeduction.fields.description'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('depositDeduction.fields.quantity')"
            :min-width="colW(t('depositDeduction.fields.quantity'), { contentMin: 72 })"
            align="right"
          >
            <template #default="{ row }">{{ row.quantity ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('depositDeduction.fields.unitAmount')"
            :min-width="colW(t('depositDeduction.fields.unitAmount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ formatMoney(row.unitAmount) }}</template>
          </el-table-column>
          <el-table-column
            prop="amount"
            :label="t('depositDeduction.fields.amount')"
            :min-width="colW(t('depositDeduction.fields.amount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('depositDeduction.fields.returnStatus')"
            :min-width="colW(t('depositDeduction.fields.returnStatus'), { contentMin: 88 })"
          >
            <template #default="{ row }">{{ returnStatusLabel(row.returnStatus) }}</template>
          </el-table-column>
        </el-table>
      </div>
      <RelatedAmountStatsBar
        v-if="amountStatsVisible"
        :items="amountStats"
        :caption="amountStatsCaption"
      />

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
