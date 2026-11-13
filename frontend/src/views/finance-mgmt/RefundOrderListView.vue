<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { QuestionFilled, Search } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import {
  deleteRefundOrderApi,
  disburseRefundOrderApi,
  fetchRefundOrder,
  fetchRefundOrders,
  uploadRefundOrderAttachmentsApi,
  type RefundOrderListQuery,
} from '@/api/refund-orders'
import type { RefundOrderRecord } from '@/types/refund-order'
import {
  REFUND_ORDER_STATUSES,
  canDisburseRefundOrder,
  refundOrderRemaining,
} from '@/types/refund-order'
import { useUserStore } from '@/stores/user'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import MultiAttachmentField from '@/components/MultiAttachmentField.vue'
import type { MultiAttachmentPending } from '@/components/MultiAttachmentField.vue'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { ACTION_COL_ICON, useActionColWidth } from '@/composables/useActionColWidth'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CountListPill from '@/components/CountListPill.vue'
import RefundOrderDetailDrawer from '@/components/RefundOrderDetailDrawer.vue'
import ContractSettlementDetailDrawer from '@/components/ContractSettlementDetailDrawer.vue'
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import { fetchContractSettlement } from '@/api/contract-settlements'
import type { ContractSettlementRecord } from '@/types/contract-settlement'
import type { CashFlowRecord } from '@/types/cash-flow'
import { fetchCashFlow } from '@/api/cash-flows'
import { refundOrderStatusTone } from '@/constants/statusBadges'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'

const { t } = useI18n()
const perms = useResourcePermissions('refundOrders')
const userStore = useUserStore()
const { actionColW } = useActionColWidth()
const {
  colW,
  textColW,
  codeColW,
  statusColW,
  datetimeColWidth,
  auditUserColWidth,
  tableLayoutKey,
} = useTableColWidth()

const keyword = ref('')
const drawerVisible = ref(false)
const current = ref<RefundOrderRecord | null>(null)
const settlementDrawer = ref(false)
const settlementRecord = ref<ContractSettlementRecord | null>(null)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const relatedCashFlowsVisible = ref(false)
const relatedListRefund = ref<RefundOrderRecord | null>(null)
const cashFlowDrawer = ref(false)
const cashFlowRecord = ref<CashFlowRecord | null>(null)

const payVisible = ref(false)
const paying = ref<RefundOrderRecord | null>(null)
const paySaving = ref(false)
const payPendingAttachments = ref<MultiAttachmentPending[]>([])
const payForm = reactive({
  amount: 0,
  refundDate: '',
  paymentMethod: '',
  remark: '',
})

const paymentMethodOptions = computed(() => {
  const cur = payForm.paymentMethod.trim()
  if (cur && !(RECEIPT_PAYMENT_METHODS as readonly string[]).includes(cur)) {
    return [cur, ...RECEIPT_PAYMENT_METHODS]
  }
  return [...RECEIPT_PAYMENT_METHODS]
})

const payRemaining = computed(() =>
  paying.value ? refundOrderRemaining(paying.value) : 0,
)

const statusOptions = computed(() =>
  REFUND_ORDER_STATUSES.map((s) => ({
    value: s,
    label: t(`refundOrder.status.${s}`),
  })),
)

const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  dateRanges,
  sortOrderOf,
  activeConditionCount,
  clearAll,
  sortKey,
  sortOrder,
  uniqueOptions,
} = useTableSortFilter<RefundOrderRecord>()

const {
  loading,
  list,
  total,
  page,
  pageSize,
  pageSizes,
  rowIndex,
  loadList,
  onClearFilters,
} = useServerPagedList<RefundOrderRecord, RefundOrderListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    return {
      keyword: kw,
      sortBy,
      sortDir,
      refundCodes: packFilterValues(f.refundCode),
      statuses: packFilterValues(f.status),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      settlementCodes: packFilterValues(f.settlementCode),
      itemCounts: packFilterValues(f.itemCount),
      attachmentCounts: packFilterValues(f.attachmentCount),
      cashFlowCounts: packFilterValues(f.cashFlowCount),
      amounts: packFilterValues(f.amount),
      paidAmounts: packFilterValues(f.paidAmount),
      remainingAmounts: packFilterValues(f.remainingAmount),
      createdBys: packFilterValues(f.createdBy),
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchRefundOrders,
})

const listActionColWidth = computed(() =>
  actionColW([
    ACTION_COL_ICON,
    perms.update && t('refundOrder.markPaid'),
    perms.delete && t('common.delete'),
  ]),
)

const codeLayoutKey = computed(() =>
  [
    codeColW(t('refundOrder.fields.refundCode'), {
      interactive: true,
      samples: list.value.map((r) => r.refundCode),
    }),
    codeColW(t('refundOrder.fields.contractCode'), {
      interactive: true,
      samples: list.value.map((r) => r.contractCode),
    }),
  ].join('-'),
)

const refundCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.refundCode),
)
const contractCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.contractCode),
)
const customerNameFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.customerName),
)
const settlementCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.settlementCode),
)
const itemCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.itemCount ?? r.items?.length ?? 0)),
)
const attachmentCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.attachmentCount ?? r.attachments?.length ?? 0)),
)
const cashFlowCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.cashFlowCount ?? 0)),
)
const amountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.amount == null ? '' : String(r.amount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const paidAmountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.paidAmount == null ? '' : String(r.paidAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const remainingAmountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => String(refundOrderRemaining(r)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))

function moneyOrDash(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function openDetail(row: RefundOrderRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchRefundOrder(row.id)
    current.value = data
  } catch {
    current.value = row
  }
  drawerVisible.value = true
  void direction
}

function onRowClick(
  row: RefundOrderRecord,
  column: { type?: string } | undefined,
  event: Event,
) {
  if (column?.type === 'selection' || column?.type === 'index') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .fk-link, input, textarea')) return
  void openDetail(row, 'rtl')
}

function openPay(row: RefundOrderRecord) {
  if (!canDisburseRefundOrder(row.status)) return
  paying.value = row
  payForm.amount = refundOrderRemaining(row)
  payForm.refundDate = todayYmd()
  payForm.paymentMethod = row.paymentMethod || ''
  payForm.remark = ''
  payPendingAttachments.value = []
  payVisible.value = true
}

async function onDelete(row: RefundOrderRecord) {
  try {
    await ElMessageBox.confirm(
      t('refundOrder.deleteConfirm', { code: row.refundCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteRefundOrderApi(row.id, { silentError: true })
    await ElMessageBox.alert(t('refundOrder.deleted'), t('common.tip'), { type: 'success' })
    await loadList()
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
        ?.message ||
      (e as { message?: string })?.message ||
      t('common.error')
    await ElMessageBox.alert(String(msg), t('common.tip'), { type: 'error' })
  }
}

function onPayAttachmentsAdd(files: File[]) {
  for (const file of files) {
    payPendingAttachments.value.push({
      key: `${Date.now()}_${file.name}_${Math.random().toString(36).slice(2, 8)}`,
      file,
    })
  }
}

function onPayAttachmentRemovePending(key: string) {
  payPendingAttachments.value = payPendingAttachments.value.filter((p) => p.key !== key)
}

async function submitPay() {
  if (!paying.value) return
  const amount = Math.round((Number(payForm.amount) || 0) * 100) / 100
  const maxPay = payRemaining.value
  if (amount <= 0.009) {
    await ElMessageBox.alert(t('refundOrder.needInstallmentAmount'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  if (amount > maxPay + 0.009) {
    await ElMessageBox.alert(
      t('refundOrder.amountExceedRemaining', { amount: formatMoney(maxPay) }),
      t('common.tip'),
      { type: 'warning' },
    )
    return
  }
  if (!payForm.refundDate) {
    await ElMessageBox.alert(t('refundOrder.needRefundDate'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  paySaving.value = true
  const refundOrderId = paying.value.id
  try {
    await disburseRefundOrderApi(
      refundOrderId,
      {
        amount,
        refundDate: payForm.refundDate,
        paymentMethod: payForm.paymentMethod.trim() || undefined,
        handlerId: userStore.user?.id?.trim() || null,
        remark: payForm.remark.trim() || undefined,
      },
      { silentError: true },
    )
    const files = payPendingAttachments.value.map((p) => p.file)
    if (files.length) {
      try {
        await uploadRefundOrderAttachmentsApi(refundOrderId, files)
      } catch {
        payVisible.value = false
        await ElMessageBox.alert(
          t('refundOrder.attachmentsUploadFailed'),
          t('common.tip'),
          { type: 'warning' },
        )
        await loadList()
        return
      }
    }
    payVisible.value = false
    await ElMessageBox.alert(t('refundOrder.markPaidDone'), t('common.success'), {
      type: 'success',
    })
    await loadList()
  } catch (e) {
    const msg =
      e instanceof Error && e.message ? e.message : t('refundOrder.markPaidFailed')
    await ElMessageBox.alert(msg, t('common.error'), { type: 'error' })
  } finally {
    paySaving.value = false
  }
}

function openItemsSide(row: RefundOrderRecord) {
  if (!(row.itemCount ?? row.items?.length ?? 0)) return
  void openDetail(row)
}

function openAttachmentsSide(row: RefundOrderRecord) {
  if (!(row.attachmentCount ?? row.attachments?.length ?? 0)) return
  void openDetail(row)
}

function openCashFlowsSide(row: RefundOrderRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  relatedListRefund.value = row
  relatedCashFlowsVisible.value = true
}

async function openCashFlowSide(row: CashFlowRecord) {
  try {
    const { data } = await fetchCashFlow(row.id)
    cashFlowRecord.value = data
  } catch {
    cashFlowRecord.value = row
  }
  cashFlowDrawer.value = true
}

async function openSettlement(id: string) {
  try {
    const { data } = await fetchContractSettlement(id)
    settlementRecord.value = data
    settlementDrawer.value = true
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('common.loadFailed')
    await ElMessageBox.alert(msg, t('common.error'), { type: 'error' })
  }
}

onMounted(() => {
  void loadList()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <RefreshListButton :loading="loading" @refresh="loadList" />
      <h2>{{ t('menu.refundOrders') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('refundOrder.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
      </div>
    </div>

    <div class="table-card">
      <div
        class="table-scroll"
        v-loading="loading"
        element-loading-background="rgba(247, 250, 248, 0.78)"
      >
        <el-table
          :key="`${tableLayoutKey}-${codeLayoutKey}-${listActionColWidth}`"
          :data="list"
          row-key="id"
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
            width="52"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column
            :min-width="
              codeColW(t('refundOrder.fields.refundCode'), {
                interactive: true,
                samples: list.map((r) => r.refundCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.refundCode')"
                filterable
                sortable
                :options="refundCodeFilterOptions"
                :model-value="filters.refundCode || []"
                :sort-order="sortOrderOf('refundCode')"
                @update:model-value="(v) => setFilter('refundCode', v)"
                @update:sort-order="(v) => setSort('refundCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.refundCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('refundOrder.fields.status'),
                statusOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.status')"
                filterable
                sortable
                :options="statusOptions"
                :model-value="filters.status || []"
                :sort-order="sortOrderOf('status')"
                @update:model-value="(v) => setFilter('status', v)"
                @update:sort-order="(v) => setSort('status', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="refundOrderStatusTone(row.status)"
                :label="t(`refundOrder.status.${row.status}`, row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('refundOrder.fields.contractCode'), {
                interactive: true,
                samples: list.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.contractCode')"
                filterable
                sortable
                :options="contractCodeFilterOptions"
                :model-value="filters.contractCode || []"
                :sort-order="sortOrderOf('contractCode')"
                @update:model-value="(v) => setFilter('contractCode', v)"
                @update:sort-order="(v) => setSort('contractCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.contractId"
                type="button"
                class="fk-link"
                @click.stop="relationDrawers?.openContractSide(row.contractId)"
              >
                {{ row.contractCode || '—' }}
              </button>
              <template v-else>{{ row.contractCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              textColW(t('refundOrder.fields.customerName'), {
                interactive: true,
                kind: 'name',
              })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.customerName')"
                filterable
                sortable
                :options="customerNameFilterOptions"
                :model-value="filters.customerName || []"
                :sort-order="sortOrderOf('customerName')"
                @update:model-value="(v) => setFilter('customerName', v)"
                @update:sort-order="(v) => setSort('customerName', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.customerId"
                type="button"
                class="fk-link"
                @click.stop="relationDrawers?.openCustomerSide(row.customerId)"
              >
                {{ row.customerName || '—' }}
              </button>
              <template v-else>{{ row.customerName || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('refundOrder.fields.settlementCode'), {
                interactive: true,
                samples: list.map((r) => r.settlementCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.settlementCode')"
                filterable
                sortable
                :options="settlementCodeFilterOptions"
                :model-value="filters.settlementCode || []"
                :sort-order="sortOrderOf('settlementCode')"
                @update:model-value="(v) => setFilter('settlementCode', v)"
                @update:sort-order="(v) => setSort('settlementCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.settlementId"
                type="button"
                class="fk-link"
                @click.stop="openSettlement(row.settlementId)"
              >
                {{ row.settlementCode || '—' }}
              </button>
              <template v-else>{{ row.settlementCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.itemCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.itemCount')"
                filterable
                sortable
                :options="itemCountFilterOptions"
                :model-value="filters.itemCount || []"
                :sort-order="sortOrderOf('itemCount')"
                @update:model-value="(v) => setFilter('itemCount', v)"
                @update:sort-order="(v) => setSort('itemCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.itemCount ?? row.items?.length ?? 0"
                @click="openItemsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.attachmentCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.attachmentCount')"
                filterable
                sortable
                :options="attachmentCountFilterOptions"
                :model-value="filters.attachmentCount || []"
                :sort-order="sortOrderOf('attachmentCount')"
                @update:model-value="(v) => setFilter('attachmentCount', v)"
                @update:sort-order="(v) => setSort('attachmentCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.attachmentCount ?? row.attachments?.length ?? 0"
                @click="openAttachmentsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.cashFlowCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.cashFlowCount')"
                filterable
                sortable
                :options="cashFlowCountFilterOptions"
                :model-value="filters.cashFlowCount || []"
                :sort-order="sortOrderOf('cashFlowCount')"
                @update:model-value="(v) => setFilter('cashFlowCount', v)"
                @update:sort-order="(v) => setSort('cashFlowCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.cashFlowCount ?? 0" @click="openCashFlowsSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.amount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.amount')"
                filterable
                sortable
                :options="amountFilterOptions"
                :model-value="filters.amount || []"
                :sort-order="sortOrderOf('amount')"
                @update:model-value="(v) => setFilter('amount', v)"
                @update:sort-order="(v) => setSort('amount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.paidAmount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.paidAmount')"
                filterable
                sortable
                :options="paidAmountFilterOptions"
                :model-value="filters.paidAmount || []"
                :sort-order="sortOrderOf('paidAmount')"
                @update:model-value="(v) => setFilter('paidAmount', v)"
                @update:sort-order="(v) => setSort('paidAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.paidAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('refundOrder.fields.remainingAmount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('refundOrder.fields.remainingAmount')"
                filterable
                sortable
                :options="remainingAmountFilterOptions"
                :model-value="filters.remainingAmount || []"
                :sort-order="sortOrderOf('remainingAmount')"
                @update:model-value="(v) => setFilter('remainingAmount', v)"
                @update:sort-order="(v) => setSort('remainingAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(refundOrderRemaining(row)) }}</template>
          </el-table-column>
          <el-table-column :min-width="auditUserColWidth">
            <template #header>
              <TableColumnHeader
                :label="t('common.createdBy')"
                filterable
                sortable
                :options="createdByFilterOptions"
                :model-value="filters.createdBy || []"
                :sort-order="sortOrderOf('createdBy')"
                @update:model-value="(v) => setFilter('createdBy', v)"
                @update:sort-order="(v) => setSort('createdBy', v)"
              />
            </template>
            <template #default="{ row }">{{ row.createdBy || '—' }}</template>
          </el-table-column>
          <el-table-column
            :width="datetimeColWidth"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.createdAt')"
                sortable
                date-range
                :sort-order="sortOrderOf('createdAt')"
                :date-range-value="dateRangeOf('createdAt')"
                @update:sort-order="(v) => setSort('createdAt', v)"
                @update:date-range-value="(v) => setDateRange('createdAt', v)"
              />
            </template>
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="listActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <ActionDetailButton @click="openDetail(row)" />
                <button
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--accent"
                  :disabled="!canDisburseRefundOrder(row.status)"
                  @click="openPay(row)"
                >
                  {{ t('refundOrder.markPaid') }}
                </button>
                <button
                  v-if="perms.delete"
                  v-admin-glow="perms.codes.delete"
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onDelete(row)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <TablePagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="pageSizes"
    />

    <RefundOrderDetailDrawer
      v-model="drawerVisible"
      :record="current"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
      @open-settlement="openSettlement"
      @open-cash-flows="openCashFlowsSide"
    />
    <ContractSettlementDetailDrawer
      v-model="settlementDrawer"
      :record="settlementRecord"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
    />
    <RelatedCashFlowsDrawer
      v-model="relatedCashFlowsVisible"
      :refund-order-id="relatedListRefund?.id"
      :title-context="relatedListRefund?.refundCode || ''"
      @open-cash-flow="openCashFlowSide"
    />
    <CashFlowDetailDrawer
      v-model="cashFlowDrawer"
      :record="cashFlowRecord"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id)"
      @open-refund-order="(id) => relationDrawers?.openRefundOrderSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="payVisible"
      class="lb-dialog"
      :title="t('refundOrder.markPaidTitle')"
      width="560px"
      destroy-on-close
    >
      <el-form label-position="top" class="form-grid">
        <el-form-item :label="t('refundOrder.fields.remainingAmount')">
          <el-input :model-value="moneyOrDash(payRemaining)" disabled />
        </el-form-item>
        <el-form-item required>
          <template #label>
            <span class="form-label-with-tip">
              {{ t('refundOrder.fields.installmentAmount') }}
              <el-tooltip
                :content="t('refundOrder.disburseAmountHint')"
                placement="top"
              >
                <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-input-number
            v-model="payForm.amount"
            :min="0.01"
            :max="Math.max(0.01, payRemaining || 0.01)"
            :precision="2"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('refundOrder.fields.refundDate')" required>
          <el-date-picker
            v-model="payForm.refundDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('refundOrder.fields.paymentMethod')">
          <el-select
            v-model="payForm.paymentMethod"
            filterable
            clearable
            value-on-clear=""
            :placeholder="t('common.pleaseSelect')"
            style="width: 100%"
          >
            <el-option
              v-for="m in paymentMethodOptions"
              :key="m"
              :label="m"
              :value="m"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('refundOrder.fields.attachments')" class="span-2">
          <MultiAttachmentField
            :pending="payPendingAttachments"
            @add="onPayAttachmentsAdd"
            @remove-pending="onPayAttachmentRemovePending"
          />
        </el-form-item>
        <el-form-item :label="t('common.remark')" class="span-2">
          <el-input v-model="payForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          v-admin-glow="perms.codes.update"
          type="primary"
          class="lb-btn-primary"
          :loading="paySaving"
          @click="submitPay"
        >
          {{ t('refundOrder.markPaid') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form-label-tip {
  color: var(--lb-muted, #6a7a70);
  cursor: help;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
