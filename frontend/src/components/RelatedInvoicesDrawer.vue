<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import { INVOICE_STATUSES } from '@/types/invoice'
import { batchDeleteInvoicesApi, deleteInvoiceApi, fetchInvoices } from '@/api/invoices'
import { previewInvoicePdfApi, prefetchInvoicePdfApi } from '@/api/document-templates'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import {
  useTableSelection,
  runBatchDelete,
  runServerBatchDelete,
} from '@/composables/useTableSelection'
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
  changed: []
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const perms = useResourcePermissions('invoices')
const { colW, codeColW, statusColW, tableLayoutKey } = useTableColWidth()
const {
  tableRef,
  selectedRows,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<InvoiceRecord>()

const invoices = ref<InvoiceRecord[]>([])
const loading = ref(false)
const keyword = ref('')
const batchDeleting = ref(false)
const printing = ref(false)

const statusLabels = computed(() => INVOICE_STATUSES.map((s) => t(`invoice.status.${s}`, s)))
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))
const canDelete = computed(() => perms.delete.value || perms.batchDelete.value)

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
      clearSelection()
      void loadInvoices()
    }
    if (!open) {
      invoices.value = []
      keyword.value = ''
      clearSelection()
    }
  },
)

function onRowClick(row: InvoiceRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, .action-pills, button, a')) return
  emit('openInvoice', row)
}

function statusLabel(status: string) {
  return t(`invoice.status.${status}`, status)
}

async function onSelectAll() {
  await selectRows(filtered.value)
}

function onToolbarPrintHover() {
  if (selectedRows.value.length === 1) prefetchInvoicePdfApi(selectedRows.value[0].id)
}

async function onToolbarPrint() {
  if (selectedRows.value.length === 0) {
    ElMessage.warning(t('common.selectFirst'))
    return
  }
  if (selectedRows.value.length > 1) {
    ElMessage.warning(t('common.printSelectOneOnly'))
    return
  }
  const row = selectedRows.value[0]
  if (!row?.id || printing.value) return
  printing.value = true
  try {
    await previewInvoicePdfApi(row.id, { autoPrint: false })
    ElMessage.success(t('invoice.printInvoicePreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('invoice.printInvoiceFailed')
    ElMessage.error(msg)
  } finally {
    printing.value = false
  }
}

async function onToolbarDelete() {
  if (!canDelete.value) return
  if (!selectedIds.value.length) {
    ElMessage.warning(t('common.selectFirst'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('common.batchDeleteConfirm', { n: selectedIds.value.length }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  const ids = [...selectedIds.value]
  batchDeleting.value = true
  try {
    const { ok, fail } = perms.batchDelete.value
      ? await runServerBatchDelete(ids, (chunk) => batchDeleteInvoicesApi(chunk))
      : await runBatchDelete(ids, (id) => deleteInvoiceApi(id))
    if (fail === 0) ElMessage.success(t('common.batchDeleteDone', { ok }))
    else ElMessage.warning(t('common.batchDeletePartial', { ok, fail }))
    clearSelection()
    await loadInvoices()
    emit('changed')
  } catch {
    /* interceptor */
  } finally {
    batchDeleting.value = false
  }
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
        <div class="related-list__actions">
          <button
            type="button"
            class="action-pill action-pill--edit"
            :disabled="printing"
            @mouseenter="onToolbarPrintHover"
            @focus="onToolbarPrintHover"
            @click="onToolbarPrint"
          >
            {{ t('invoice.printInvoice') }}
          </button>
          <button
            v-if="canDelete"
            v-admin-glow="perms.batchDelete ? perms.codes.batchDelete : perms.codes.delete"
            type="button"
            class="action-pill action-pill--danger"
            :disabled="batchDeleting"
            @click="onToolbarDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>

      <div class="related-list__body">
        <p v-if="!loading && !filtered.length" class="related-list__empty">—</p>
        <el-table
          v-else
          :key="tableLayoutKey"
          ref="tableRef"
          class="related-list__table related-list__table--clickable"
          :data="paged"
          row-key="id"
          height="100%"
          stripe
          border
          scrollbar-always-on
          style="width: 100%"
          @selection-change="onSelectionChange"
          @row-click="onRowClick"
        >
          <el-table-column
            type="selection"
            width="48"
            align="center"
            header-align="center"
            reserve-selection
            fixed="left"
          />
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
            fixed="left"
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
          :selected-count="selectedCount"
          enable-select-all
          @select-all="onSelectAll"
          @clear-selection="clearSelection"
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
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.related-list__search {
  flex: 1 1 240px;
  max-width: 360px;
}

.related-list__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  margin-left: auto;
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
