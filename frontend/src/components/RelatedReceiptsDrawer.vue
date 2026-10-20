<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { ReceiptRecord } from '@/types/receipt'
import { fetchReceipts } from '@/api/receipts'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import { formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract?: ContractRecord | null
    customerId?: string
    invoiceId?: string
    receivableId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    contract: null,
    customerId: undefined,
    invoiceId: undefined,
    receivableId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openReceipt: [receipt: ReceiptRecord]
  openInvoice: [invoiceId: string]
  openContract: [contractId: string]
  openReceivable: [receivableId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, tableLayoutKey } = useTableColWidth()
const receipts = ref<ReceiptRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedReceiptsWithContext', { context: ctx })
  const c = props.contract
  if (!c) return t('contract.relatedReceipts')
  const code = c.contractCode?.trim()
  return code
    ? t('contract.relatedReceiptsWithContract', { contract: code })
    : t('contract.relatedReceipts')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return receipts.value
  return receipts.value.filter((rec) =>
    [
      rec.receiptCode,
      rec.customerName,
      rec.invoiceCode,
      rec.receivableCode,
      rec.paymentMethod,
      rec.remark,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch(keyword, () => resetPage())

async function loadReceipts() {
  const customerId = props.customerId?.trim()
  const invoiceId = props.invoiceId?.trim()
  const receivableId = props.receivableId?.trim()
  const contractId = props.contract?.id
  if (!customerId && !invoiceId && !receivableId && !contractId) {
    receipts.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchReceipts({
      ...(customerId ? { customerId } : {}),
      ...(invoiceId ? { invoiceId } : {}),
      ...(receivableId ? { receivableId } : {}),
      ...(!customerId && !invoiceId && !receivableId && contractId
        ? { contractId }
        : {}),
    })
    receipts.value = data.items
  } catch {
    receipts.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () =>
    [visible.value, props.customerId, props.invoiceId, props.receivableId, props.contract?.id] as const,
  ([open, customerId, invoiceId, receivableId, contractId]) => {
    if (open && (customerId || invoiceId || receivableId || contractId)) {
      keyword.value = ''
      resetPage()
      void loadReceipts()
    }
    if (!open) {
      receipts.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: ReceiptRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openReceipt', row)
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
          :placeholder="t('receipt.searchPlaceholder')"
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
          <el-table-column type="selection" width="48" align="center" header-align="center" />
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="48"
            align="center"
            header-align="center"
          />
          <el-table-column
            prop="receiptCode"
            :label="t('receipt.fields.receiptCode')"
            :min-width="
              codeColW(t('receipt.fields.receiptCode'), {
                samples: paged.map((r) => r.receiptCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('receipt.fields.contractCode')"
            :min-width="
              codeColW(t('receipt.fields.contractCode'), {
                samples: paged.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.contractId"
                type="button"
                class="fk-link"
                @click.stop="emit('openContract', row.contractId)"
              >
                {{ row.contractCode || '—' }}
              </button>
              <template v-else>{{ row.contractCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('receipt.fields.paymentDate')"
            :min-width="colW(t('receipt.fields.paymentDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.paymentDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('receipt.fields.amount')"
            :min-width="colW(t('receipt.fields.amount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.amount == null ? '—' : formatMoney(row.amount) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('receipt.fields.paymentMethod')"
            :min-width="colW(t('receipt.fields.paymentMethod'), { contentMin: 110 })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.paymentMethod || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('receipt.fields.invoiceCode')"
            :min-width="
              codeColW(t('receipt.fields.invoiceCode'), {
                samples: paged.map((r) => r.invoiceCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.invoiceId"
                type="button"
                class="fk-link"
                @click.stop="emit('openInvoice', row.invoiceId)"
              >
                {{ row.invoiceCode || '—' }}
              </button>
              <template v-else>{{ row.invoiceCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('receipt.fields.receivableCode')"
            :min-width="
              codeColW(t('receipt.fields.receivableCode'), {
                samples: paged.map((r) => r.receivableCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.receivableId"
                type="button"
                class="fk-link"
                @click.stop="emit('openReceivable', row.receivableId)"
              >
                {{ row.receivableCode || '—' }}
              </button>
              <template v-else>{{ row.receivableCode || '—' }}</template>
            </template>
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
