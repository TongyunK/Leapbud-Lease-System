<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createDepositRefundApi,
  deleteDepositRefundApi,
  batchDeleteDepositRefundsApi,
  fetchDepositRefund,
  fetchDepositRefunds,
  importDepositRefundsApi,
  updateDepositRefundApi,
} from '@/api/deposit-refunds'
import type { DepositRefundWritePayload, DepositRefundListQuery } from '@/api/deposit-refunds'
import { fetchContracts } from '@/api/contracts'
import { fetchUsers } from '@/api/users'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import { DEPOSIT_REFUND_STATUSES } from '@/types/deposit-refund'
import type { ContractRecord } from '@/types/contract'
import type { UserRecord } from '@/types/user'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import DepositRefundDetailDrawer from '@/components/DepositRefundDetailDrawer.vue'
import CountListPill from '@/components/CountListPill.vue'
import RelatedReceivablesDrawer from '@/components/RelatedReceivablesDrawer.vue'
import type { ReceivableRecord } from '@/types/receivable'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { depositRefundStatusTone } from '@/constants/statusBadges'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  depositRefundIoTemplateExampleRow,
  depositRefundToIoRow,
  rowToDepositRefundIoPayload,
} from '@/utils/depositRefundExport'
import type { DepositRefundImportPayload } from '@/utils/depositRefundExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const perms = useResourcePermissions('depositRefunds')
const { actionColWidth } = useActionColWidth()
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
const formVisible = ref(false)
const editing = ref<DepositRefundRecord | null>(null)
const contracts = ref<ContractRecord[]>([])
const users = ref<UserRecord[]>([])

const drawerVisible = ref(false)
const relatedReceivablesDrawer = ref(false)
const relatedListRefund = ref<DepositRefundRecord | null>(null)
const current = ref<DepositRefundRecord | null>(null)
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
} = useTableSortFilter<DepositRefundRecord>()

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
} = useServerPagedList<DepositRefundRecord, DepositRefundListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    const termination = range('terminationDate')
    const refund = range('refundDate')
    return {
      keyword: kw,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      status: f.status?.[0],
      sortBy,
      sortDir,
      terminationDateFrom: termination.from,
      terminationDateTo: termination.to,
      refundDateFrom: refund.from,
      refundDateTo: refund.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchDepositRefunds,
})

const codeLayoutKey = computed(() =>
  [
    codeColW(t('depositRefund.fields.refundCode'), {
      interactive: true,
      samples: list.value.map((r) => r.refundCode),
    }),
    codeColW(t('depositRefund.fields.contractCode'), {
      interactive: true,
      samples: list.value.map((r) => r.contractCode),
    }),
    codeColW(t('depositRefund.fields.roomCode'), {
      interactive: true,
      samples: list.value.map((r) => r.roomCode),
    }),
  ].join('-'),
)

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<DepositRefundRecord>()
const batchDeleting = ref(false)
const selectAllLoading = ref(false)
const {
  state: batchState,
  percentage: batchPercentage,
  begin: beginBatch,
  setProgress: setBatchProgress,
  finish: finishBatch,
  close: closeBatch,
} = useBatchProgress()

watch([keyword, filters, sortKey, sortOrder, dateRanges], () => {
  clearSelection()
})

async function onSelectAll() {
  if (selectAllLoading.value || total.value === 0) return
  selectAllLoading.value = true
  try {
    const rows = await fetchExportRows('filtered')
    await selectRows(rows)
  } finally {
    selectAllLoading.value = false
  }
}

async function onBatchDelete() {
  if (!perms.batchDelete.value || !selectedIds.value.length) return
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
  beginBatch(ids.length)
  try {
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteDepositRefundsApi(chunk),
      setBatchProgress,
    )
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const statusFilterOptions = computed(() =>
  DEPOSIT_REFUND_STATUSES.map((s) => ({
    value: s,
    label: statusLabel(s),
  })),
)

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const c of contracts.value) {
    const name = c.customerName?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const contractFilterOptions = computed(() =>
  contracts.value.map((c) => ({
    value: c.id,
    label: `${c.contractCode} · ${c.customerName} · ${c.roomCode}`,
  })),
)

const userFilterOptions = computed(() =>
  users.value.map((u) => ({
    value: u.id,
    label: userOptionLabel(u),
  })),
)

const selectedContract = computed(() =>
  contracts.value.find((c) => c.id === form.contractId) || null,
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  contractId: '' as string,
  refundCode: '',
  status: DEPOSIT_REFUND_STATUSES[0] as string,
  terminationDate: '',
  refundDate: '',
  totalDeposit: null as number | null,
  actualRefundAmount: null as number | null,
  handlerId: '' as string,
  voucherImage: '',
  voucherAttachment: '',
  remark: '',
})

const form = reactive(emptyForm())

function userOptionLabel(u: UserRecord) {
  const name = u.displayName?.trim()
  return name || u.account
}

function statusLabel(status: string) {
  const key = `depositRefund.status.${status}`
  return t(key) === key ? status : t(key)
}

async function loadContracts() {
  const { data } = await fetchContracts()
  contracts.value = data.items
}

async function loadUsers() {
  const { data } = await fetchUsers()
  users.value = data
}

onMounted(async () => {
  await Promise.all([loadContracts(), loadUsers(), loadList()])
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  formVisible.value = true
}

function openEdit(row: DepositRefundRecord) {
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    refundCode: row.refundCode || '',
    status: row.status || DEPOSIT_REFUND_STATUSES[0],
    terminationDate: row.terminationDate || '',
    refundDate: row.refundDate || '',
    totalDeposit: row.totalDeposit,
    actualRefundAmount: row.actualRefundAmount,
    handlerId: row.handlerId || '',
    voucherImage: row.voucherImage || '',
    voucherAttachment: row.voucherAttachment || '',
    remark: row.remark || '',
  })
  formVisible.value = true
}

function payloadFromForm(): DepositRefundWritePayload {
  return {
    contractId: form.contractId.trim(),
    refundCode: form.refundCode.trim() || undefined,
    status: form.status || undefined,
    terminationDate: form.terminationDate || undefined,
    refundDate: form.refundDate || undefined,
    totalDeposit: form.totalDeposit == null ? undefined : Number(form.totalDeposit) || 0,
    actualRefundAmount:
      form.actualRefundAmount == null ? undefined : Number(form.actualRefundAmount) || 0,
    handlerId: form.handlerId.trim() || null,
    voucherImage: form.voucherImage.trim() || undefined,
    voucherAttachment: form.voucherAttachment.trim() || undefined,
    remark: form.remark.trim() || undefined,
  }
}

async function saveForm() {
  if (!form.contractId.trim()) {
    ElMessage.warning(t('depositRefund.contractRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateDepositRefundApi(editing.value.id, payload)
      ElMessage.success(t('depositRefund.updated'))
    } else {
      await createDepositRefundApi(payload)
      ElMessage.success(t('depositRefund.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: DepositRefundRecord) {
  try {
    await ElMessageBox.confirm(
      t('depositRefund.deleteConfirm', { code: row.refundCode || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteDepositRefundApi(row.id)
    ElMessage.success(t('depositRefund.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: DepositRefundRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchDepositRefund(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openReceivablesSide(row: DepositRefundRecord) {
  if (!row.receivableCount) return
  relatedListRefund.value = row
  relatedReceivablesDrawer.value = true
}
function onOpenReceivableFromRelated(row: ReceivableRecord) {
  void relationDrawers.value?.openReceivableSide(row.id)
}

function onRowClick(row: DepositRefundRecord, column: { type?: string } | undefined, event: Event) {
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

function moneyOrDash(v: number | null | undefined): string {
  return v == null ? '—' : formatMoney(v)
}

const importInputRef = ref<HTMLInputElement | null>(null)
const {
  state: importState,
  percentage: importPercentage,
  importing,
  begin: beginImport,
  setTotal: setImportTotal,
  setPreparing: setImportPreparing,
  setProcessing: setImportProcessing,
  bump: bumpImport,
  appendIssues: appendImportIssues,
  finish: finishImport,
  fail: failImport,
  close: closeImport,
} = useImportProgress()

function onDataIoCommand(cmd: string | number) {
  if (cmd === 'import') {
    importInputRef.value?.click()
    return
  }
  if (cmd === 'template') {
    downloadImportTemplate()
    return
  }
  const scope = exportScopeFromCommand(cmd)
  if (scope) void exportRefundsXlsx(scope)
}

function downloadImportTemplate() {
  const example = depositRefundIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'DepositRefunds')
  XLSX.writeFile(wb, 'deposit-refunds-import-template.xlsx')
  ElMessage.success(t('depositRefund.templateDone'))
}

async function exportRefundsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: DepositRefundRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('depositRefund.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('depositRefund.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => depositRefundToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DepositRefunds')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `deposit-refunds-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('depositRefund.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('depositRefund.importFailed'))
  } finally {
    exporting.value = false
  }
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!perms.import.value) {
    ElMessage.warning(t('depositRefund.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'skipped', 'failed'],
  })
  try {
    setImportPreparing()
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rawRows.length) {
      finishImport({
        tone: 'warning',
        message: t('depositRefund.importEmpty'),
      })
      return
    }

    const payloads: DepositRefundImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToDepositRefundIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
              退還編號: String(row['退還編號'] ?? row['退还编号'] ?? ''),
            },
          },
        ])
        continue
      }
      payloads.push(parsed)
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(payloads, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importDepositRefundsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.skipped) bumpImport('skipped', data.skipped)
        if (data.failed) bumpImport('failed', data.failed)
        appendImportIssues(data.issues)
      } catch {
        bumpImport('failed', batch.length)
        appendImportIssues(
          batch.map((it) => ({
            status: 'failed' as const,
            reason: t('common.importUi.batchRequestFailed'),
            keys: {
              合約編號: it.contractCode || '',
              退還編號: it.refundCode || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('depositRefund.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.depositRefunds') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('depositRefund.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('depositRefund.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('depositRefund.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('depositRefund.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('depositRefund.downloadTemplate') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export-page" divided>
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
        <input
          ref="importInputRef"
          type="file"
          class="room-io-file"
          accept=".xlsx,.xls,.csv"
          @change="onImportFile"
        />
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          ref="tableRef"
          :key="`${tableLayoutKey}-${codeLayoutKey}`"
          :data="list"
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
            fixed="left"
            align="center"
            header-align="center"
            reserve-selection
          />
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="44"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column
            :width="codeColW(t('depositRefund.fields.refundCode'), { interactive: true, samples: list.map((r) => r.refundCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.refundCode')"
                sortable
                :sort-order="sortOrderOf('refundCode')"
                @update:sort-order="(v) => setSort('refundCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.refundCode || '—' }}</template>
          </el-table-column>
          <el-table-column
            :width="codeColW(t('depositRefund.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.contractCode')"
                sortable
                :sort-order="sortOrderOf('contractCode')"
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
            :min-width="codeColW(t('depositRefund.fields.roomName'), { interactive: true, samples: list.map((r) => r.roomName || r.roomCode) })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.roomName')"
                sortable
                :sort-order="sortOrderOf('roomName')"
                @update:sort-order="(v) => setSort('roomName', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.roomId"
                type="button"
                class="fk-link"
                :title="row.roomName || row.roomCode"
                @click.stop="openRoomSide(row.roomId)"
              >
                {{ row.roomName || row.roomCode || '—' }}
              </button>
              <span v-else>{{ row.roomName || row.roomCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('depositRefund.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.customerName')"
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
            :min-width="
              statusColW(
                t('depositRefund.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.status')"
                filterable
                sortable
                :options="statusFilterOptions"
                :model-value="filters.status || []"
                :sort-order="sortOrderOf('status')"
                @update:model-value="(v) => setFilter('status', v)"
                @update:sort-order="(v) => setSort('status', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="depositRefundStatusTone(row.status)"
                :label="statusLabel(row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.terminationDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.terminationDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('terminationDate')"
                :date-range-value="dateRangeOf('terminationDate')"
                @update:sort-order="(v) => setSort('terminationDate', v)"
                @update:date-range-value="(v) => setDateRange('terminationDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.terminationDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.refundDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.refundDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('refundDate')"
                :date-range-value="dateRangeOf('refundDate')"
                @update:sort-order="(v) => setSort('refundDate', v)"
                @update:date-range-value="(v) => setDateRange('refundDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.refundDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.totalDeposit'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.totalDeposit')"
                sortable
                :sort-order="sortOrderOf('totalDeposit')"
                @update:sort-order="(v) => setSort('totalDeposit', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.totalDeposit) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.actualRefundAmount'), { interactive: true, contentMin: 110 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.actualRefundAmount')"
                sortable
                :sort-order="sortOrderOf('actualRefundAmount')"
                @update:sort-order="(v) => setSort('actualRefundAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.actualRefundAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.handler'), { interactive: true, contentMin: 100 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.handler')"
                sortable
                :sort-order="sortOrderOf('handler')"
                @update:sort-order="(v) => setSort('handler', v)"
              />
            </template>
            <template #default="{ row }">{{ row.handler || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('depositRefund.fields.voucherImage')"
            :min-width="textColW(t('depositRefund.fields.voucherImage'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.voucherImage || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('depositRefund.fields.voucherAttachment')"
            :min-width="textColW(t('depositRefund.fields.voucherAttachment'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.voucherAttachment || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('depositRefund.fields.remark')"
            :min-width="textColW(t('depositRefund.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.receivableCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.receivableCount')"
                sortable
                :sort-order="sortOrderOf('receivableCount')"
                @update:sort-order="(v) => setSort('receivableCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.receivableCount ?? 0" @click="openReceivablesSide(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.createdBy')"
                sortable
                :sort-order="sortOrderOf('createdBy')"
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
            v-if="perms.canEditOrDelete"
            :label="t('common.actions')"
            :width="actionColWidth.two"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--danger"
                  @click.stop="onDelete(row)"
                >
                  {{ t('common.delete') }}
                </button>
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
          :selected-count="selectedCount"
          enable-select-all
          :select-all-loading="selectAllLoading"
          @select-all="onSelectAll"
          @clear-selection="clearSelection"
        >
          <template v-if="perms.batchDelete" #batch>
            <button
              v-admin-glow="perms.codes.batchDelete"
              type="button"
              class="lb-pager__batch-btn"
              :disabled="batchDeleting || selectAllLoading"
              @click="onBatchDelete"
            >
              {{ t('common.batchDelete') }}
            </button>
          </template>
        </TablePagination>
      </div>
    </div>

    <DepositRefundDetailDrawer
      v-model="drawerVisible"
      :record="current"
      :desktop-direction="detailDirection"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-receivables="openReceivablesSide"
    />
    <RelatedReceivablesDrawer
      v-model="relatedReceivablesDrawer"
      :deposit-refund-id="relatedListRefund?.id"
      :title-context="relatedListRefund?.refundCode || ''"
      desktop-direction="ltr"
      @open-receivable="onOpenReceivableFromRelated"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('depositRefund.edit') : t('depositRefund.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="fee-form">
        <div class="form-grid">
          <el-form-item :label="t('depositRefund.fields.contractCode')" required class="span-2">
            <el-select
              v-model="form.contractId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('depositRefund.fields.contractCode')"
              :disabled="!!editing"
            >
              <el-option
                v-for="opt in contractFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.customerName')">
            <el-input
              :model-value="selectedContract?.customerName || editing?.customerName || ''"
              readonly
              :placeholder="t('depositRefund.autoFromContract')"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.roomName')">
            <el-input
              :model-value="
                selectedContract
                  ? `${selectedContract.roomCode}${selectedContract.roomName ? ' · ' + selectedContract.roomName : ''}`
                  : editing
                    ? `${editing.roomCode}${editing.roomName ? ' · ' + editing.roomName : ''}`
                    : ''
              "
              readonly
              :placeholder="t('depositRefund.autoFromContract')"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.refundCode')" class="span-2">
            <el-input
              v-model="form.refundCode"
              :placeholder="t('depositRefund.codeAutoHint')"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option
                v-for="s in DEPOSIT_REFUND_STATUSES"
                :key="s"
                :label="statusLabel(s)"
                :value="s"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.handler')">
            <el-select
              v-model="form.handlerId"
              clearable
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('depositRefund.fields.handler')"
            >
              <el-option
                v-for="opt in userFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.terminationDate')">
            <el-date-picker
              v-model="form.terminationDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.refundDate')">
            <el-date-picker
              v-model="form.refundDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.totalDeposit')">
            <el-input-number
              v-model="form.totalDeposit"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.actualRefundAmount')">
            <el-input-number
              v-model="form.actualRefundAmount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.voucherImage')" class="span-2">
            <el-input v-model="form.voucherImage" />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.voucherAttachment')" class="span-2">
            <el-input v-model="form.voucherAttachment" />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">
            {{ t('common.save') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <ImportProgressDialog
      v-model="importState.visible"
      :phase="importState.phase"
      :file-name="importState.fileName"
      :total="importState.total"
      :current="importState.current"
      :percentage="importPercentage"
      :status-key="importState.statusKey"
      :stats="importState.stats"
      :result-tone="importState.resultTone"
      :result-message="importState.resultMessage"
      :result-stat-keys="importState.resultStatKeys"
      :issues="importState.issues"
      @close="closeImport"
    />

    <BatchProgressDialog
      v-model="batchState.visible"
      :phase="batchState.phase"
      :total="batchState.total"
      :current="batchState.current"
      :percentage="batchPercentage"
      :ok="batchState.ok"
      :fail="batchState.fail"
      :result-tone="batchState.resultTone"
      @close="closeBatch"
    />
  </div>
</template>

<style scoped>
.head-search {
  width: min(280px, 42vw);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.form-grid .span-2 {
  grid-column: 1 / -1;
}

.select-option-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fee-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.room-io-file {
  display: none;
}
</style>
