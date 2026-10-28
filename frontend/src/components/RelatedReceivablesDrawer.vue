<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ContractRecord } from '@/types/contract'
import type { ReceivableRecord } from '@/types/receivable'
import {
  batchDeleteReceivablesApi,
  deleteReceivableApi,
  fetchReceivables,
} from '@/api/receivables'
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
    depositRefundId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    contract: null,
    customerId: undefined,
    invoiceId: undefined,
    depositRefundId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openReceivable: [receivable: ReceivableRecord]
  openInvoice: [invoiceId: string]
  openContract: [contractId: string]
  changed: []
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const perms = useResourcePermissions('receivables')
const { colW, codeColW, tableLayoutKey } = useTableColWidth()
const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ReceivableRecord>()

const receivables = ref<ReceivableRecord[]>([])
const loading = ref(false)
const keyword = ref('')
const batchDeleting = ref(false)

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))
const canDelete = computed(() => perms.delete.value || perms.batchDelete.value)

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedReceivablesWithContext', { context: ctx })
  const c = props.contract
  if (!c) return t('contract.relatedReceivables')
  const code = c.contractCode?.trim()
  return code
    ? t('contract.relatedReceivablesWithContract', { contract: code })
    : t('contract.relatedReceivables')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return receivables.value
  return receivables.value.filter((rec) =>
    [
      rec.receivableCode,
      rec.invoiceCode,
      rec.customerName,
      rec.relatedReceiptRef,
      rec.depositRefundCode,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch(keyword, () => resetPage())

async function loadReceivables() {
  const customerId = props.customerId?.trim()
  const invoiceId = props.invoiceId?.trim()
  const depositRefundId = props.depositRefundId?.trim()
  const contractId = props.contract?.id
  if (!customerId && !invoiceId && !depositRefundId && !contractId) {
    receivables.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchReceivables({
      ...(customerId ? { customerId } : {}),
      ...(invoiceId ? { invoiceId } : {}),
      ...(depositRefundId ? { depositRefundId } : {}),
      ...(!customerId && !invoiceId && !depositRefundId && contractId
        ? { contractId }
        : {}),
    })
    receivables.value = data.items
  } catch {
    receivables.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () =>
    [
      visible.value,
      props.customerId,
      props.invoiceId,
      props.depositRefundId,
      props.contract?.id,
    ] as const,
  ([open, customerId, invoiceId, depositRefundId, contractId]) => {
    if (open && (customerId || invoiceId || depositRefundId || contractId)) {
      keyword.value = ''
      resetPage()
      clearSelection()
      void loadReceivables()
    }
    if (!open) {
      receivables.value = []
      keyword.value = ''
      clearSelection()
    }
  },
)

function onRowClick(row: ReceivableRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, .action-pills, button, a')) return
  emit('openReceivable', row)
}

async function onSelectAll() {
  await selectRows(filtered.value)
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
      ? await runServerBatchDelete(ids, (chunk) => batchDeleteReceivablesApi(chunk))
      : await runBatchDelete(ids, (id) => deleteReceivableApi(id))
    if (fail === 0) ElMessage.success(t('common.batchDeleteDone', { ok }))
    else ElMessage.warning(t('common.batchDeletePartial', { ok, fail }))
    clearSelection()
    await loadReceivables()
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
          :placeholder="t('receivable.searchPlaceholder')"
        />
        <div v-if="canDelete" class="related-list__actions">
          <button
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
            v-if="canDelete"
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
            prop="receivableCode"
            :label="t('receivable.fields.receivableCode')"
            :min-width="
              codeColW(t('receivable.fields.receivableCode'), {
                samples: paged.map((r) => r.receivableCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            prop="invoiceCode"
            :label="t('receivable.fields.invoiceCode')"
            :min-width="
              codeColW(t('receivable.fields.invoiceCode'), {
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
            :label="t('receivable.fields.contractCode')"
            :min-width="
              codeColW(t('receivable.fields.contractCode'), {
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
            :label="t('receivable.fields.paymentDueDate')"
            :min-width="colW(t('receivable.fields.paymentDueDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.paymentDueDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('receivable.fields.invoiceAmount')"
            :min-width="colW(t('receivable.fields.invoiceAmount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.invoiceAmount == null ? '—' : formatMoney(row.invoiceAmount) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('receivable.fields.receivedAmount')"
            :min-width="colW(t('receivable.fields.receivedAmount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.receivedAmount == null ? '—' : formatMoney(row.receivedAmount) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('receivable.fields.receivableAmount')"
            :min-width="colW(t('receivable.fields.receivableAmount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.receivableAmount == null ? '—' : formatMoney(row.receivableAmount) }}
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
          :selected-count="canDelete ? selectedCount : 0"
          :enable-select-all="canDelete"
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
