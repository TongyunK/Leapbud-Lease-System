<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, Download } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  fetchDepositDeduction,
  fetchDepositDeductions,
} from '@/api/deposit-deductions'
import type { DepositDeductionListQuery } from '@/api/deposit-deductions'
import type { DepositDeductionRecord } from '@/types/deposit-deduction'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import DepositDeductionDetailDrawer from '@/components/DepositDeductionDetailDrawer.vue'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import { ACTION_COL_ICON, useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'

const { t } = useI18n()
const { actionColW } = useActionColWidth()
const listActionColWidth = computed(() => actionColW([ACTION_COL_ICON]))
const { colW, textColW, codeColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

const keyword = ref('')
const drawerVisible = ref(false)
const current = ref<DepositDeductionRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)

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
} = useTableSortFilter<DepositDeductionRecord>()

const {
  loading,
  exporting,
  list,
  total,
  page,
  pageSize,
  pageSizes,
  rowIndex,
  loadList,
  fetchExportRows,
  onClearFilters,
} = useServerPagedList<DepositDeductionRecord, DepositDeductionListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    return {
      keyword: kw,
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      settlementCodes: packFilterValues(f.settlementCode),
      quantities: packFilterValues(f.quantity),
      unitAmounts: packFilterValues(f.unitAmount),
      amounts: packFilterValues(f.amount),
      roomCodes: packFilterValues(f.roomCode),
      returnStatuses: packFilterValues(f.returnStatus),
      createdBys: packFilterValues(f.createdBy),
      sortBy,
      sortDir,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchDepositDeductions,
})

function uniqueListOptions(
  get: (row: DepositDeductionRecord) => string | number | null | undefined,
  labelOf?: (value: string) => string,
) {
  return uniqueOptions(list.value, get, labelOf)
}

const contractCodeFilterOptions = computed(() => uniqueListOptions((r) => r.contractCode))
const settlementCodeFilterOptions = computed(() => uniqueListOptions((r) => r.settlementCode))
const quantityFilterOptions = computed(() =>
  uniqueListOptions((r) => (r.quantity == null ? '' : String(r.quantity))),
)
const unitAmountFilterOptions = computed(() =>
  uniqueListOptions((r) => (r.unitAmount == null ? '' : String(r.unitAmount)), (v) => moneyOrDash(Number(v))),
)
const amountFilterOptions = computed(() =>
  uniqueListOptions((r) => (r.amount == null ? '' : String(r.amount)), (v) => moneyOrDash(Number(v))),
)
const roomCodeFilterOptions = computed(() => uniqueListOptions((r) => r.roomCode))
const returnStatusFilterOptions = computed(() =>
  uniqueListOptions((r) => r.returnStatus, (v) => returnStatusLabel(v)),
)
const createdByFilterOptions = computed(() => uniqueListOptions((r) => r.createdBy))
const customerNameFilterOptions = computed(() => uniqueListOptions((r) => r.customerName))

onMounted(async () => {
  await loadList()
})

function moneyOrDash(v: number | null | undefined): string {
  return v == null ? '—' : formatMoney(v)
}

function returnStatusLabel(raw?: string | null) {
  const s = (raw || '').trim()
  if (!s) return '—'
  const key = `depositDeduction.returnStatus.${s}`
  const translated = t(key)
  return translated === key ? s : translated
}

async function openDetail(row: DepositDeductionRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchDepositDeduction(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: DepositDeductionRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  void openDetail(row, 'rtl')
}

async function openContractSide(contractId?: string | null, _direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openContractSide(contractId)
}

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openCustomerSide(customerId, direction)
}

async function openRoomSide(roomId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openRoomSide(roomId, direction)
}

function onDataIoCommand(cmd: string | number) {
  const scope = exportScopeFromCommand(cmd)
  if (scope) void exportDeductionsXlsx(scope)
}

async function exportDeductionsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: DepositDeductionRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      void ElMessageBox.alert(t('depositDeduction.exportEmpty'), t('common.tip'), { type: 'warning' })
      return
    }
    const sheetRows = rows.map((r) => ({
      [t('depositDeduction.fields.settlementCode')]: r.settlementCode,
      [t('depositDeduction.fields.contractCode')]: r.contractCode,
      [t('depositDeduction.fields.customerName')]: r.customerName,
      [t('depositDeduction.fields.roomCode')]: r.roomCode,
      [t('depositDeduction.fields.description')]: r.description,
      [t('depositDeduction.fields.quantity')]: r.quantity,
      [t('depositDeduction.fields.unitAmount')]: r.unitAmount,
      [t('depositDeduction.fields.amount')]: r.amount,
      [t('depositDeduction.fields.returnStatus')]: returnStatusLabel(r.returnStatus),
      [t('depositDeduction.fields.remark')]: r.remark || '',
      [t('common.createdBy')]: r.createdBy || '',
      [t('common.createdAt')]: r.createdAt || '',
    }))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DepositDeductions')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `deposit-deductions-${exportFileSuffix(scope)}-${day}.xlsx`)
    void ElMessageBox.alert(
      t('depositDeduction.exportDone', { n: rows.length }),
      t('common.tip'),
      { type: 'success' },
    )
  } catch {
    void ElMessageBox.alert(t('depositDeduction.importFailed'), t('common.tip'), { type: 'error' })
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <RefreshListButton :loading="loading" @refresh="loadList" />
      <h2>{{ t('menu.depositDeductions') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('depositDeduction.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('depositDeduction.dataIo')" :loading="exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="export-page">
                <el-icon><Download /></el-icon>
                <span>{{ t('common.exportPage') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export-filtered">
                <el-icon><Download /></el-icon>
                <span>{{ t('common.exportFiltered') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export-all">
                <el-icon><Download /></el-icon>
                <span>{{ t('common.exportAll') }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="table-card">
      <div
        class="table-scroll"
        v-loading="loading"
        element-loading-background="rgba(247, 250, 248, 0.78)"
      >
        <el-table
          :key="`${tableLayoutKey}-${listActionColWidth}`"
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
            :min-width="codeColW(t('depositDeduction.fields.settlementCode'), { interactive: true, samples: list.map((r) => r.settlementCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.settlementCode')"
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
                @click.stop="relationDrawers?.openSettlementSide(row.settlementId)"
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
            :min-width="colW(t('depositDeduction.fields.quantity'), { interactive: true, contentMin: 72 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.quantity')"
                filterable
                sortable
                :options="quantityFilterOptions"
                :model-value="filters.quantity || []"
                :sort-order="sortOrderOf('quantity')"
                @update:model-value="(v) => setFilter('quantity', v)"
                @update:sort-order="(v) => setSort('quantity', v)"
              />
            </template>
            <template #default="{ row }">{{ row.quantity ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositDeduction.fields.unitAmount'), { interactive: true, contentMin: 88 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.unitAmount')"
                filterable
                sortable
                :options="unitAmountFilterOptions"
                :model-value="filters.unitAmount || []"
                :sort-order="sortOrderOf('unitAmount')"
                @update:model-value="(v) => setFilter('unitAmount', v)"
                @update:sort-order="(v) => setSort('unitAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.unitAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositDeduction.fields.amount'), { interactive: true, contentMin: 88 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.amount')"
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
            :min-width="colW(t('depositDeduction.fields.returnStatus'), { interactive: true, contentMin: 88 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.returnStatus')"
                filterable
                sortable
                :options="returnStatusFilterOptions"
                :model-value="filters.returnStatus || []"
                :sort-order="sortOrderOf('returnStatus')"
                @update:model-value="(v) => setFilter('returnStatus', v)"
                @update:sort-order="(v) => setSort('returnStatus', v)"
              />
            </template>
            <template #default="{ row }">{{ returnStatusLabel(row.returnStatus) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('depositDeduction.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.contractCode')"
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
                :title="row.contractCode"
                @click.stop="openContractSide(row.contractId)"
              >
                {{ row.contractCode || '—' }}
              </button>
              <span v-else>{{ row.contractCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('depositDeduction.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.customerName')"
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
                :title="row.customerName"
                @click.stop="openCustomerSide(row.customerId)"
              >
                {{ row.customerName || '—' }}
              </button>
              <span v-else>{{ row.customerName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('depositDeduction.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositDeduction.fields.roomCode')"
                filterable
                sortable
                :options="roomCodeFilterOptions"
                :model-value="filters.roomCode || []"
                :sort-order="sortOrderOf('roomCode')"
                @update:model-value="(v) => setFilter('roomCode', v)"
                @update:sort-order="(v) => setSort('roomCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.roomId"
                type="button"
                class="fk-link"
                :title="row.roomCode"
                @click.stop="openRoomSide(row.roomId)"
              >
                {{ row.roomCode || '—' }}
              </button>
              <span v-else>{{ row.roomCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column :min-width="auditUserColWidth" show-overflow-tooltip>
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
                :model-value="filters.createdAt || []"
                :sort-order="sortOrderOf('createdAt')"
                :date-range-value="dateRangeOf('createdAt')"
                @update:sort-order="(v) => setSort('createdAt', v)"
                @update:model-value="(v) => setFilter('createdAt', v)"
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
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="table-pagination">
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="pageSizes"
        />
      </div>
    </div>

    <DepositDeductionDetailDrawer
      v-model="drawerVisible"
      :fee="current"
      :desktop-direction="detailDirection"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-settlement="(id) => relationDrawers?.openSettlementSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />
  </div>
</template>

<style scoped>
.head-search {
  width: min(280px, 42vw);
}
</style>
