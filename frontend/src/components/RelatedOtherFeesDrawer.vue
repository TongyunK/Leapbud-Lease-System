<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'
import { fetchContractOtherFees } from '@/api/contract-other-fees'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import { formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract?: ContractRecord | null
    terminationId?: string
    titleContext?: string
    /** 展示模式：其他费用 / 按金扣除（同源数据，文案不同） */
    mode?: 'otherFee' | 'depositDeduction'
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    contract: null,
    terminationId: undefined,
    titleContext: undefined,
    mode: 'otherFee',
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openFee: [fee: ContractOtherFeeRecord]
  openTermination: [terminationId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, tableLayoutKey } = useTableColWidth()
const fees = ref<ContractOtherFeeRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const i18nNs = computed(() =>
  props.mode === 'depositDeduction' ? 'depositDeduction' : 'contractOtherFee',
)
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) {
    return props.mode === 'depositDeduction'
      ? t('common.relatedDepositDeductionsWithContext', { context: ctx })
      : t('common.relatedOtherFeesWithContext', { context: ctx })
  }
  const code = props.contract?.contractCode?.trim()
  if (props.mode === 'depositDeduction') {
    return code
      ? t('contract.relatedDepositDeductionsWithContract', { contract: code })
      : t('contract.relatedDepositDeductions')
  }
  return code
    ? t('contract.relatedOtherFeesWithContract', { contract: code })
    : t('contract.relatedOtherFees')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return fees.value
  return fees.value.filter((row) =>
    [row.description, row.terminationCode, row.remark, String(row.subtotal)].join(' ').toLowerCase().includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } = useClientPagination(filtered)
watch(keyword, () => resetPage())

async function load() {
  const terminationId = props.terminationId?.trim()
  const contractId = props.contract?.id
  if (!terminationId && !contractId) {
    fees.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchContractOtherFees({
      ...(terminationId ? { terminationId } : {}),
      ...(!terminationId && contractId ? { contractId } : {}),
    })
    fees.value = data.items
  } catch {
    fees.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.terminationId, props.contract?.id, props.mode] as const,
  ([open, terminationId, contractId]) => {
    if (open && (terminationId || contractId)) {
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

function onRowClick(row: ContractOtherFeeRecord, column?: { type?: string }, event?: Event) {
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
  >
    <div v-loading="loading" class="related-list">
      <div class="related-list__toolbar">
        <el-input
          v-model="keyword"
          clearable
          class="related-list__search"
          :prefix-icon="Search"
          :placeholder="t(`${i18nNs}.searchPlaceholder`)"
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
          <el-table-column type="selection" width="48" align="center" header-align="center" />
          <el-table-column type="index" :index="rowIndex" label="#" width="48" align="center" header-align="center" />
          <el-table-column
            prop="terminationCode"
            :label="t(`${i18nNs}.fields.terminationCode`)"
            :min-width="
              codeColW(t(`${i18nNs}.fields.terminationCode`), {
                samples: paged.map((r) => r.terminationCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.terminationId"
                type="button"
                class="fk-link"
                @click.stop="emit('openTermination', row.terminationId)"
              >
                {{ row.terminationCode || '—' }}
              </button>
              <template v-else>{{ row.terminationCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :label="t(`${i18nNs}.fields.description`)"
            :min-width="textColW(t(`${i18nNs}.fields.description`), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t(`${i18nNs}.fields.quantity`)"
            :min-width="colW(t(`${i18nNs}.fields.quantity`), { contentMin: 72 })"
            align="right"
          >
            <template #default="{ row }">{{ row.quantity ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t(`${i18nNs}.fields.unitAmount`)"
            :min-width="colW(t(`${i18nNs}.fields.unitAmount`), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ row.unitAmount == null ? '—' : formatMoney(row.unitAmount) }}</template>
          </el-table-column>
          <el-table-column
            :label="t(`${i18nNs}.fields.subtotal`)"
            :min-width="colW(t(`${i18nNs}.fields.subtotal`), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">{{ row.subtotal == null ? '—' : formatMoney(row.subtotal) }}</template>
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
