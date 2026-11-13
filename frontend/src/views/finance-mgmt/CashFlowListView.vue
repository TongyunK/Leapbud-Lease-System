<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import {
  deleteCashFlowApi,
  fetchCashFlow,
  fetchCashFlowDirectionCounts,
  fetchCashFlows,
  type CashFlowDirectionCounts,
  type CashFlowListQuery,
} from '@/api/cash-flows'
import type { CashFlowRecord } from '@/types/cash-flow'
import { CASH_FLOW_DIRECTIONS, CASH_FLOW_SOURCE_TYPES } from '@/types/cash-flow'
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
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import RefundOrderDetailDrawer from '@/components/RefundOrderDetailDrawer.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import ContractSettlementDetailDrawer from '@/components/ContractSettlementDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import { cashFlowDirectionTone, cashFlowSourceTypeTone } from '@/constants/statusBadges'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import { fetchRefundOrder } from '@/api/refund-orders'
import type { RefundOrderRecord } from '@/types/refund-order'
import { fetchContractSettlement } from '@/api/contract-settlements'
import type { ContractSettlementRecord } from '@/types/contract-settlement'

const { t } = useI18n()
const perms = useResourcePermissions('cashFlows')
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
const current = ref<CashFlowRecord | null>(null)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const refundOrderDrawer = ref(false)
const refundOrderRecord = ref<RefundOrderRecord | null>(null)
const relatedCashFlowsVisible = ref(false)
const settlementDrawer = ref(false)
const settlementRecord = ref<ContractSettlementRecord | null>(null)

function openCashFlowsFromRefund(row: RefundOrderRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  refundOrderRecord.value = row
  relatedCashFlowsVisible.value = true
}

async function openCashFlowFromRelated(row: CashFlowRecord) {
  try {
    const { data } = await fetchCashFlow(row.id)
    current.value = data
  } catch {
    current.value = row
  }
  drawerVisible.value = true
}

const directionOptions = computed(() =>
  CASH_FLOW_DIRECTIONS.map((s) => ({
    value: s,
    label: t(`cashFlow.direction.${s}`),
  })),
)
const sourceOptions = computed(() =>
  CASH_FLOW_SOURCE_TYPES.map((s) => ({
    value: s,
    label: t(`cashFlow.sourceType.${s}`),
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
} = useTableSortFilter<CashFlowRecord>()

/** 页头快捷筛选：全部 / 入账 / 出账（互斥） */
const directionChipFilter = ref<'all' | 'in' | 'out'>('all')
const directionChipCounts = ref<CashFlowDirectionCounts>({ all: 0, in: 0, out: 0 })

const directionChips = computed(() => [
  {
    key: 'all' as const,
    label: t('cashFlow.directionFilterAll'),
    count: directionChipCounts.value.all,
  },
  {
    key: 'in' as const,
    label: t('cashFlow.direction.in'),
    count: directionChipCounts.value.in,
  },
  {
    key: 'out' as const,
    label: t('cashFlow.direction.out'),
    count: directionChipCounts.value.out,
  },
])

async function loadDirectionChipCounts() {
  try {
    const { data } = await fetchCashFlowDirectionCounts()
    directionChipCounts.value = {
      all: data.all ?? 0,
      in: data.in ?? 0,
      out: data.out ?? 0,
    }
  } catch {
    /* interceptor */
  }
}

const {
  loading,
  list,
  total,
  page,
  pageSize,
  pageSizes,
  rowIndex,
  resetPage,
  loadList,
  onClearFilters,
} = useServerPagedList<CashFlowRecord, CashFlowListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const flow = range('flowDate')
    const created = range('createdAt')
    const chipKey = directionChipFilter.value
    return {
      keyword: kw,
      sortBy,
      sortDir,
      flowCodes: packFilterValues(f.flowCode),
      directions: chipKey === 'all' ? packFilterValues(f.direction) : [chipKey],
      amounts: packFilterValues(f.amount),
      sourceTypes: packFilterValues(f.sourceType),
      sourceRefs: packFilterValues(f.sourceRef),
      receiptCounts: packFilterValues(f.receiptCount),
      refundOrderCounts: packFilterValues(f.refundOrderCount),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      createdBys: packFilterValues(f.createdBy),
      flowDateFrom: flow.from,
      flowDateTo: flow.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchCashFlows,
})

async function reloadListAndCounts() {
  await Promise.all([loadList(), loadDirectionChipCounts()])
}

function setDirectionChipFilter(key: 'all' | 'in' | 'out') {
  if (directionChipFilter.value === key) return
  directionChipFilter.value = key
  if (filters.direction?.length) setFilter('direction', [])
  resetPage()
  void loadList()
}

function onClearCashFlowFilters() {
  directionChipFilter.value = 'all'
  onClearFilters()
  void loadDirectionChipCounts()
}

const cashFlowConditionCount = computed(
  () => activeConditionCount.value + (directionChipFilter.value !== 'all' ? 1 : 0),
)

const listActionColWidth = computed(() =>
  actionColW([ACTION_COL_ICON, perms.delete && t('common.delete')]),
)

const codeLayoutKey = computed(() =>
  [
    codeColW(t('cashFlow.fields.flowCode'), {
      interactive: true,
      samples: list.value.map((r) => r.flowCode),
    }),
    codeColW(t('cashFlow.fields.sourceRef'), {
      interactive: true,
      samples: list.value.map((r) => r.receiptCode || r.refundOrderCode),
    }),
  ].join('-'),
)

const flowCodeFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.flowCode))
const contractCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.contractCode),
)
const customerNameFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.customerName),
)
const sourceRefFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.receiptCode || r.refundOrderCode),
)
const amountFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.amount == null ? '' : String(r.amount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const receiptCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.receiptCount ?? (r.receiptId ? 1 : 0))),
)
const refundOrderCountFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => String(r.refundOrderCount ?? (r.refundOrderId ? 1 : 0))),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))

function moneyOrDash(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

async function openDetail(row: CashFlowRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchCashFlow(row.id)
    current.value = data
  } catch {
    current.value = row
  }
  drawerVisible.value = true
  void direction
}

async function onDelete(row: CashFlowRecord) {
  try {
    await ElMessageBox.confirm(
      t('cashFlow.deleteConfirm', { code: row.flowCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteCashFlowApi(row.id, { silentError: true })
    await ElMessageBox.alert(t('cashFlow.deleted'), t('common.tip'), { type: 'success' })
    await reloadListAndCounts()
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
        ?.message ||
      (e as { message?: string })?.message ||
      t('common.error')
    await ElMessageBox.alert(String(msg), t('common.tip'), { type: 'error' })
  }
}

function onRowClick(
  row: CashFlowRecord,
  column: { type?: string } | undefined,
  event: Event,
) {
  if (column?.type === 'selection' || column?.type === 'index') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .fk-link, input, textarea')) return
  void openDetail(row, 'rtl')
}

function openReceiptSide(row: CashFlowRecord) {
  if (!row.receiptId) return
  void relationDrawers.value?.openReceiptSide(row.receiptId)
}

async function openRefundOrderById(refundOrderId: string, fallback?: CashFlowRecord | null) {
  if (!refundOrderId) return
  try {
    const { data } = await fetchRefundOrder(refundOrderId)
    refundOrderRecord.value = data
  } catch {
    const row = fallback
    refundOrderRecord.value = {
      id: refundOrderId,
      refundCode: row?.refundOrderCode || '',
      status: '',
      contractId: row?.contractId || '',
      contractCode: row?.contractCode || '',
      customerId: row?.customerId || '',
      customerCode: row?.customerCode || '',
      customerName: row?.customerName || '',
      roomId: null,
      roomCode: '',
      roomName: '',
      settlementId: null,
      settlementCode: '',
      settlementType: '',
      depositRefundId: null,
      amount: row?.amount ?? 0,
      paidAmount: 0,
      remainingAmount: row?.amount ?? 0,
      refundDate: row?.flowDate || '',
      paymentMethod: row?.paymentMethod || '',
      handlerId: null,
      handler: '',
      remark: '',
      items: [],
      createdBy: row?.createdBy || '',
      updatedBy: row?.updatedBy || '',
      createdAt: row?.createdAt || '',
      updatedAt: row?.updatedAt || '',
    }
  }
  refundOrderDrawer.value = true
}

function openRefundOrderSide(row: CashFlowRecord) {
  if (!row.refundOrderId) return
  void openRefundOrderById(row.refundOrderId, row)
}

async function openSettlementSide(id: string) {
  try {
    const { data } = await fetchContractSettlement(id)
    settlementRecord.value = data
    settlementDrawer.value = true
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  void reloadListAndCounts()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <RefreshListButton :loading="loading" @refresh="() => void reloadListAndCounts()" />
      <h2>{{ t('menu.cashFlows') }}</h2>
      <div class="building-chips-rail">
        <div class="building-chips" role="tablist" :aria-label="t('cashFlow.directionFilterAria')">
          <button
            v-for="chip in directionChips"
            :key="chip.key"
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': directionChipFilter === chip.key }"
            :aria-selected="directionChipFilter === chip.key"
            @click="setDirectionChipFilter(chip.key)"
          >
            <span class="building-chip__name">{{ chip.label }}</span>
            <span class="building-chip__count">({{ chip.count }})</span>
          </button>
        </div>
      </div>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('cashFlow.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="cashFlowConditionCount" @clear="onClearCashFlowFilters" />
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
              codeColW(t('cashFlow.fields.flowCode'), {
                interactive: true,
                samples: list.map((r) => r.flowCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.flowCode')"
                filterable
                sortable
                :options="flowCodeFilterOptions"
                :model-value="filters.flowCode || []"
                :sort-order="sortOrderOf('flowCode')"
                @update:model-value="(v) => setFilter('flowCode', v)"
                @update:sort-order="(v) => setSort('flowCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.flowCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('cashFlow.fields.direction'),
                directionOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.direction')"
                filterable
                sortable
                :options="directionOptions"
                :model-value="filters.direction || []"
                :sort-order="sortOrderOf('direction')"
                @update:model-value="(v) => setFilter('direction', v)"
                @update:sort-order="(v) => setSort('direction', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="cashFlowDirectionTone(row.direction)"
                :label="t(`cashFlow.direction.${row.direction}`, row.direction)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('cashFlow.fields.amount'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.amount')"
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
            :min-width="colW(t('cashFlow.fields.flowDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.flowDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('flowDate')"
                :date-range-value="dateRangeOf('flowDate')"
                @update:sort-order="(v) => setSort('flowDate', v)"
                @update:date-range-value="(v) => setDateRange('flowDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.flowDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('cashFlow.fields.sourceType'),
                sourceOptions.map((o) => o.label),
                { interactive: true },
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.sourceType')"
                filterable
                sortable
                :options="sourceOptions"
                :model-value="filters.sourceType || []"
                :sort-order="sortOrderOf('sourceType')"
                @update:model-value="(v) => setFilter('sourceType', v)"
                @update:sort-order="(v) => setSort('sourceType', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="cashFlowSourceTypeTone(row.sourceType)"
                :label="t(`cashFlow.sourceType.${row.sourceType}`, row.sourceType)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('cashFlow.fields.sourceRef'), {
                interactive: true,
                samples: list.map((r) => r.receiptCode || r.refundOrderCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.sourceRef')"
                filterable
                sortable
                :options="sourceRefFilterOptions"
                :model-value="filters.sourceRef || []"
                :sort-order="sortOrderOf('sourceRef')"
                @update:model-value="(v) => setFilter('sourceRef', v)"
                @update:sort-order="(v) => setSort('sourceRef', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.receiptId"
                type="button"
                class="fk-link"
                @click.stop="openReceiptSide(row)"
              >
                {{ row.receiptCode || '—' }}
              </button>
              <button
                v-else-if="row.refundOrderId"
                type="button"
                class="fk-link"
                @click.stop="openRefundOrderSide(row)"
              >
                {{ row.refundOrderCode || '—' }}
              </button>
              <template v-else>{{ row.receiptCode || row.refundOrderCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('cashFlow.fields.receiptCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.receiptCount')"
                filterable
                sortable
                :options="receiptCountFilterOptions"
                :model-value="filters.receiptCount || []"
                :sort-order="sortOrderOf('receiptCount')"
                @update:model-value="(v) => setFilter('receiptCount', v)"
                @update:sort-order="(v) => setSort('receiptCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receiptCount ?? (row.receiptId ? 1 : 0)"
                @click="openReceiptSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('cashFlow.fields.refundOrderCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.refundOrderCount')"
                filterable
                sortable
                :options="refundOrderCountFilterOptions"
                :model-value="filters.refundOrderCount || []"
                :sort-order="sortOrderOf('refundOrderCount')"
                @update:model-value="(v) => setFilter('refundOrderCount', v)"
                @update:sort-order="(v) => setSort('refundOrderCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.refundOrderCount ?? (row.refundOrderId ? 1 : 0)"
                @click="openRefundOrderSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              codeColW(t('cashFlow.fields.contractCode'), {
                interactive: true,
                samples: list.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.contractCode')"
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
              textColW(t('cashFlow.fields.customerName'), {
                interactive: true,
                kind: 'name',
              })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('cashFlow.fields.customerName')"
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

    <CashFlowDetailDrawer
      v-model="drawerVisible"
      :record="current"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id)"
      @open-refund-order="(id) => openRefundOrderById(id, current)"
    />
    <RefundOrderDetailDrawer
      v-model="refundOrderDrawer"
      :record="refundOrderRecord"
      desktop-direction="ltr"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
      @open-settlement="openSettlementSide"
      @open-cash-flows="openCashFlowsFromRefund"
    />
    <RelatedCashFlowsDrawer
      v-model="relatedCashFlowsVisible"
      :refund-order-id="refundOrderRecord?.id"
      :title-context="refundOrderRecord?.refundCode || ''"
      desktop-direction="ltr"
      @open-cash-flow="openCashFlowFromRelated"
    />
    <ContractSettlementDetailDrawer
      v-model="settlementDrawer"
      :record="settlementRecord"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />
  </div>
</template>
