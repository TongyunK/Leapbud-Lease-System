<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ReceivableWriteoffRecord } from '@/types/contract-settlement'
import { fetchSettlementWriteoffs } from '@/api/contract-settlements'
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
    settlementId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  
    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    settlementId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openReceivable: [receivableId: string]
}>()

const { t, te } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, tableLayoutKey } = useTableColWidth()
const rows = ref<ReceivableWriteoffRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  return ctx
    ? t('common.relatedWriteoffsWithContext', { context: ctx })
    : t('common.relatedWriteoffs')
})

function writeoffReasonLabel(code?: string | null) {
  const c = (code || '').trim()
  if (!c) return '—'
  const key = `contractSettlement.writeoffReason.${c}`
  return te(key) ? t(key) : c
}

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) =>
    [
      row.writeoffCode,
      row.receivableCode,
      row.reasonType,
      writeoffReasonLabel(row.reasonType),
      row.writeoffDate,
    ]
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
  rows: filtered,
  fields: [
    { prop: 'amount', label: t('common.amount') },
  ],
})
watch(keyword, () => resetPage())

async function load() {
  const settlementId = props.settlementId?.trim()
  if (!settlementId) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchSettlementWriteoffs(settlementId)
    rows.value = data || []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.settlementId] as const,
  ([open, settlementId]) => {
    if (open && settlementId) {
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
          class="related-list__table"
          :data="paged"
          height="100%"
          stripe
          border
          scrollbar-always-on
          style="width: 100%"
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
            prop="writeoffCode"
            :label="t('contractSettlement.fields.writeoffCode')"
            :min-width="
              codeColW(t('contractSettlement.fields.writeoffCode'), {
                samples: paged.map((r) => r.writeoffCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            :label="t('contractSettlement.fields.receivableCode')"
            :min-width="
              codeColW(t('contractSettlement.fields.receivableCode'), {
                samples: paged.map((r) => r.receivableCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <button
                v-if="row.receivableId"
                type="button"
                class="fk-link"
                @click="emit('openReceivable', row.receivableId)"
              >
                {{ row.receivableCode || '—' }}
              </button>
              <template v-else>{{ row.receivableCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            prop="amount"
            :label="t('common.amount')"
            :min-width="colW(t('common.amount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.reasonType')"
            :min-width="colW(t('contractSettlement.fields.reasonType'), { contentMin: 120 })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ writeoffReasonLabel(row.reasonType) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.writeoffDate')"
            :min-width="colW(t('contractSettlement.fields.writeoffDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.writeoffDate || '—' }}</template>
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
