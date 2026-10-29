<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ContractRecord } from '@/types/contract'
import type { ReceiptRecord } from '@/types/receipt'
import { batchDeleteReceiptsApi, deleteReceiptApi, fetchReceipts } from '@/api/receipts'
import { previewReceiptPdfApi, prefetchReceiptPdfApi } from '@/api/document-templates'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import {
  useTableSelection,
  runBatchDelete,
  runServerBatchDelete,
} from '@/composables/useTableSelection'
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
  changed: []
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const perms = useResourcePermissions('receipts')
const { colW, codeColW, tableLayoutKey } = useTableColWidth()
const {
  tableRef,
  selectedRows,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ReceiptRecord>()

const receipts = ref<ReceiptRecord[]>([])
const loading = ref(false)
const keyword = ref('')
const batchDeleting = ref(false)
const printing = ref(false)

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))
const canDelete = computed(() => perms.delete.value || perms.batchDelete.value)

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
      clearSelection()
      void loadReceipts()
    }
    if (!open) {
      receipts.value = []
      keyword.value = ''
      clearSelection()
    }
  },
)

function onRowClick(row: ReceiptRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, .action-pills, button, a')) return
  emit('openReceipt', row)
}

async function onSelectAll() {
  await selectRows(filtered.value)
}

function onToolbarPrintHover() {
  if (selectedRows.value.length === 1) prefetchReceiptPdfApi(selectedRows.value[0].id)
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
    await previewReceiptPdfApi(row.id, { autoPrint: false })
    ElMessage.success(t('receipt.printReceiptPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('receipt.printReceiptFailed')
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
      ? await runServerBatchDelete(ids, (chunk) => batchDeleteReceiptsApi(chunk))
      : await runBatchDelete(ids, (id) => deleteReceiptApi(id))
    if (fail === 0) ElMessage.success(t('common.batchDeleteDone', { ok }))
    else ElMessage.warning(t('common.batchDeletePartial', { ok, fail }))
    clearSelection()
    await loadReceipts()
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
          :placeholder="t('receipt.searchPlaceholder')"
        />
        <div class="related-list__actions">
          <button
            type="button"
            class="action-pill action-pill--leave"
            :disabled="printing"
            @mouseenter="onToolbarPrintHover"
            @focus="onToolbarPrintHover"
            @click="onToolbarPrint"
          >
            {{ t('receipt.printReceipt') }}
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
            fixed="left"
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
