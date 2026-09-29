<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import { INVOICE_STATUSES } from '@/types/invoice'
import { fetchInvoices } from '@/api/invoices'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { invoiceStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract?: ContractRecord | null
    customerId?: string
    roomId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    contract: null,
    customerId: undefined,
    roomId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openInvoice: [invoice: InvoiceRecord]
  openContract: [contractId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, statusColW, tableLayoutKey } = useTableColWidth()
const invoices = ref<InvoiceRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const statusLabels = computed(() => INVOICE_STATUSES.map((s) => t(`invoice.status.${s}`, s)))
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedInvoicesWithContext', { context: ctx })
  const c = props.contract
  if (!c) return t('contract.relatedInvoices')
  const code = c.contractCode?.trim()
  return code
    ? t('contract.relatedInvoicesWithContract', { contract: code })
    : t('contract.relatedInvoices')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return invoices.value
  return invoices.value.filter((inv) =>
    [inv.invoiceCode, inv.invoiceType, inv.description, inv.status, inv.customerName, inv.roomName]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch(keyword, () => resetPage())

async function loadInvoices() {
  const customerId = props.customerId?.trim()
  const roomId = props.roomId?.trim()
  const contractId = props.contract?.id
  if (!customerId && !roomId && !contractId) {
    invoices.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchInvoices({
      ...(customerId ? { customerId } : {}),
      ...(roomId ? { roomId } : {}),
      ...(!customerId && !roomId && contractId ? { contractId } : {}),
    })
    invoices.value = data.items
  } catch {
    invoices.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.customerId, props.roomId, props.contract?.id] as const,
  ([open, customerId, roomId, contractId]) => {
    if (open && (customerId || roomId || contractId)) {
      keyword.value = ''
      resetPage()
      void loadInvoices()
    }
    if (!open) {
      invoices.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: InvoiceRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openInvoice', row)
}

function statusLabel(status: string) {
  return t(`invoice.status.${status}`, status)
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
          :placeholder="t('invoice.searchPlaceholder')"
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
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="48"
            align="center"
            header-align="center"
          />
          <el-table-column
            prop="invoiceCode"
            :label="t('invoice.fields.invoiceCode')"
            :min-width="
              codeColW(t('invoice.fields.invoiceCode'), {
                samples: paged.map((r) => r.invoiceCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('invoice.fields.contractCode')"
            :min-width="
              codeColW(t('invoice.fields.contractCode'), {
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
            prop="invoiceType"
            :label="t('invoice.fields.invoiceType')"
            :min-width="colW(t('invoice.fields.invoiceType'), { contentMin: 140 })"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('invoice.fields.status')"
            :min-width="statusColW(t('invoice.fields.status'), statusLabels, { interactive: false })"
          >
            <template #default="{ row }">
              <StatusBadge :tone="invoiceStatusTone(row.status)" :label="statusLabel(row.status)" />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('invoice.fields.amount')"
            :min-width="colW(t('invoice.fields.amount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.amount == null ? '—' : formatMoney(row.amount) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('invoice.fields.invoiceDate')"
            :min-width="colW(t('invoice.fields.invoiceDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.invoiceDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('invoice.fields.paymentDueDate')"
            :min-width="colW(t('invoice.fields.paymentDueDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.paymentDueDate || '—' }}</template>
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
