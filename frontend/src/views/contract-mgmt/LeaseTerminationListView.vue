<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createLeaseTerminationApi,
  deleteLeaseTerminationApi,
  batchDeleteLeaseTerminationsApi,
  fetchLeaseTermination,
  fetchLeaseTerminations,
  importLeaseTerminationsApi,
  updateLeaseTerminationApi,
} from '@/api/lease-terminations'
import type { LeaseTerminationWritePayload, LeaseTerminationListQuery } from '@/api/lease-terminations'
import { fetchContract, fetchContracts } from '@/api/contracts'
import type { ContractOtherFeeNestedRecord } from '@/types/contract-other-fee'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { ContractRecord } from '@/types/contract'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import ContractDetailDrawer from '@/components/ContractDetailDrawer.vue'
import LeaseTerminationDetailDrawer from '@/components/LeaseTerminationDetailDrawer.vue'
import CountListPill from '@/components/CountListPill.vue'
import RelatedOtherFeesDrawer from '@/components/RelatedOtherFeesDrawer.vue'
import ContractOtherFeeDetailDrawer from '@/components/ContractOtherFeeDetailDrawer.vue'
import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { useUserStore } from '@/stores/user'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  leaseTerminationIoTemplateExampleRow,
  leaseTerminationToIoRow,
  rowToLeaseTerminationIoPayload,
} from '@/utils/leaseTerminationExport'
import type { LeaseTerminationImportPayload } from '@/utils/leaseTerminationExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const keyword = ref('')
const formVisible = ref(false)
const editing = ref<LeaseTerminationRecord | null>(null)
const contracts = ref<ContractRecord[]>([])

const drawerVisible = ref(false)
const relatedOtherFeesDrawer = ref(false)
const relatedListTermination = ref<LeaseTerminationRecord | null>(null)
const relatedOtherFee = ref<ContractOtherFeeRecord | null>(null)
const otherFeeDetailDrawer = ref(false)
const current = ref<LeaseTerminationRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')
const contractDrawerVisible = ref(false)
const currentContract = ref<ContractRecord | null>(null)
const contractDrawerDirection = ref<'ltr' | 'rtl'>('ltr')
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
} = useTableSortFilter<LeaseTerminationRecord>()

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
} = useServerPagedList<LeaseTerminationRecord, LeaseTerminationListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const termination = range('terminationDate')
    const created = range('createdAt')
    return {
      keyword: kw,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      sortBy,
      sortDir,
      terminationDateFrom: termination.from,
      terminationDateTo: termination.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchLeaseTerminations,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<LeaseTerminationRecord>()
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
  if (!isAdmin.value || !selectedIds.value.length) return
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteLeaseTerminationsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const contractFilterOptions = computed(() =>
  contracts.value.map((c) => ({
    value: c.id,
    label: `${c.contractCode} · ${c.customerName} · ${c.roomCode}`,
    customerName: c.customerName,
    roomCode: c.roomCode,
    customerId: c.customerId,
    roomId: c.roomId,
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

const selectedContractDisplay = computed(() => {
  const opt = contractFilterOptions.value.find((o) => o.value === form.contractId)
  if (!opt) return { customerName: '—', roomCode: '—' }
  return { customerName: opt.customerName || '—', roomCode: opt.roomCode || '—' }
})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '920px'))

type FeeFormRow = ContractOtherFeeNestedRecord & { uid: string }

function defaultFeeRow(): FeeFormRow {
  return {
    uid: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitAmount: 0,
    remark: '',
    sortOrder: 0,
  }
}

const emptyForm = () => ({
  contractId: '' as string,
  reason: '',
  terminationDate: '',
  noticeAttachment: '',
  doorKeyReturnedQty: 0,
  smartCardReturnedQty: 0,
  siteCondition: '',
  remark: '',
  relatedDepositRefund: '',
})

const form = reactive(emptyForm())
const feeRows = ref<FeeFormRow[]>([])

function feeSubtotal(row: Pick<FeeFormRow, 'quantity' | 'unitAmount'>): number {
  return (Number(row.quantity) || 0) * (Number(row.unitAmount) || 0)
}

function addFeeRow() {
  feeRows.value.push(defaultFeeRow())
}

function removeFeeRow(idx: number) {
  feeRows.value.splice(idx, 1)
}

async function loadContracts() {
  const { data } = await fetchContracts()
  contracts.value = data.items
}

onMounted(async () => {
  await Promise.all([loadContracts(), loadList()])
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  feeRows.value = []
  formVisible.value = true
}

function openEdit(row: LeaseTerminationRecord) {
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    reason: row.reason || '',
    terminationDate: row.terminationDate || '',
    noticeAttachment: row.noticeAttachment || '',
    doorKeyReturnedQty: row.doorKeyReturnedQty ?? 0,
    smartCardReturnedQty: row.smartCardReturnedQty ?? 0,
    siteCondition: row.siteCondition || '',
    remark: row.remark || '',
    relatedDepositRefund: row.relatedDepositRefund || '',
  })
  feeRows.value = (row.otherFees ?? []).map((f) => ({
    uid: crypto.randomUUID(),
    id: f.id,
    description: f.description || '',
    quantity: f.quantity ?? 0,
    unitAmount: f.unitAmount ?? 0,
    remark: f.remark || '',
    sortOrder: f.sortOrder ?? 0,
  }))
  formVisible.value = true
}

function otherFeesPayload(): ContractOtherFeeNestedRecord[] {
  return feeRows.value
    .filter((r) => r.description.trim())
    .map((r, idx) => ({
      description: r.description.trim(),
      quantity: Number(r.quantity) || 0,
      unitAmount: Number(r.unitAmount) || 0,
      subtotal: feeSubtotal(r),
      remark: r.remark?.trim() || undefined,
      sortOrder: idx,
    }))
}

function payloadFromForm(): LeaseTerminationWritePayload {
  return {
    contractId: form.contractId.trim(),
    reason: form.reason.trim() || undefined,
    terminationDate: form.terminationDate || undefined,
    noticeAttachment: form.noticeAttachment.trim() || undefined,
    doorKeyReturnedQty: Math.max(0, Math.floor(Number(form.doorKeyReturnedQty) || 0)),
    smartCardReturnedQty: Math.max(0, Math.floor(Number(form.smartCardReturnedQty) || 0)),
    siteCondition: form.siteCondition.trim() || undefined,
    remark: form.remark.trim() || undefined,
    relatedDepositRefund: form.relatedDepositRefund.trim() || undefined,
    otherFees: otherFeesPayload(),
  }
}

async function saveForm() {
  if (!form.contractId.trim()) {
    ElMessage.warning(t('leaseTermination.contractRequired'))
    return
  }
  for (const row of feeRows.value) {
    if (row.description.trim() && (Number(row.quantity) || 0) < 0) {
      ElMessage.warning(t('leaseTermination.feeQuantityInvalid'))
      return
    }
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateLeaseTerminationApi(editing.value.id, payload)
      ElMessage.success(t('leaseTermination.updated'))
    } else {
      await createLeaseTerminationApi(payload)
      ElMessage.success(t('leaseTermination.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: LeaseTerminationRecord) {
  try {
    await ElMessageBox.confirm(
      t('leaseTermination.deleteConfirm', { code: row.terminationCode }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteLeaseTerminationApi(row.id)
    ElMessage.success(t('leaseTermination.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: LeaseTerminationRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchLeaseTermination(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openOtherFeesSide(row: LeaseTerminationRecord) {
  if (!row.otherFeeCount) return
  relatedListTermination.value = row
  relatedOtherFeesDrawer.value = true
}
function onOpenOtherFeeFromRelated(row: ContractOtherFeeRecord) {
  relatedOtherFee.value = row
  otherFeeDetailDrawer.value = true
}

function onRowClick(row: LeaseTerminationRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  void openDetail(row, 'rtl')
}

async function openContractSide(contractId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  if (!contractId) return
  try {
    const { data } = await fetchContract(contractId)
    currentContract.value = data
    contractDrawerDirection.value = direction
    contractDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openCustomerSide(customerId, direction)
}

async function openRoomSide(roomId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openRoomSide(roomId, direction)
}

async function openBuildingSide(buildingId?: string | null) {
  await relationDrawers.value?.openBuildingSide(buildingId)
}

async function openRequirementSide(requirementId?: string | null) {
  await relationDrawers.value?.openRequirementSide(requirementId)
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
  if (scope) void exportTerminationsXlsx(scope)
}

function downloadImportTemplate() {
  const example = leaseTerminationIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'LeaseTerminations')
  XLSX.writeFile(wb, 'lease-terminations-import-template.xlsx')
  ElMessage.success(t('leaseTermination.templateDone'))
}

async function exportTerminationsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: LeaseTerminationRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('leaseTermination.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('leaseTermination.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => leaseTerminationToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'LeaseTerminations')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `lease-terminations-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('leaseTermination.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('leaseTermination.importFailed'))
  } finally {
    exporting.value = false
  }
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAdmin.value) {
    ElMessage.warning(t('leaseTermination.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'skipped', 'unlinked', 'failed'],
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
        message: t('leaseTermination.importEmpty'),
      })
      return
    }

    const payloads: LeaseTerminationImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToLeaseTerminationIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              退租編號: String(row['退租編號'] ?? row['退租编号'] ?? ''),
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
              房間編號: String(row['房間編號'] ?? row['房间编号'] ?? ''),
              客戶名稱: String(row['客戶名稱'] ?? row['客户名称'] ?? ''),
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
        const { data } = await importLeaseTerminationsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.skipped) bumpImport('skipped', data.skipped)
        if (data.unlinked) bumpImport('unlinked', data.unlinked)
        if (data.failed) bumpImport('failed', data.failed)
        appendImportIssues(data.issues)
      } catch {
        bumpImport('failed', batch.length)
        appendImportIssues(
          batch.map((it) => ({
            status: 'failed' as const,
            reason: t('common.importUi.batchRequestFailed'),
            keys: {
              退租編號: it.terminationCode || '',
              合約編號: it.contractCode || '',
              房間編號: it.roomCode || '',
              客戶名稱: it.customerName || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('leaseTermination.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.leaseTerminations') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('leaseTermination.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('leaseTermination.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('leaseTermination.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('leaseTermination.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('leaseTermination.downloadTemplate') }}</span>
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
          :key="tableLayoutKey"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
          scrollbar-always-on
          empty-text="—"
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
            width="52"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column
            :min-width="codeColW(t('leaseTermination.fields.terminationCode'), { interactive: true, samples: list.map((r) => r.terminationCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.terminationCode')"
                sortable
                :sort-order="sortOrderOf('terminationCode')"
                @update:sort-order="(v) => setSort('terminationCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.terminationCode || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('leaseTermination.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.contractCode')"
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
            :min-width="textColW(t('leaseTermination.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.customerName')"
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
            :min-width="codeColW(t('leaseTermination.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.roomCode')"
                sortable
                :sort-order="sortOrderOf('roomCode')"
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
          <el-table-column
            :label="t('leaseTermination.fields.reason')"
            :min-width="textColW(t('leaseTermination.fields.reason'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.reason || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('leaseTermination.fields.terminationDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.terminationDate')"
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
            :min-width="colW(t('leaseTermination.fields.doorKeyReturnedQty'), { interactive: true, contentMin: 72 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.doorKeyReturnedQty')"
                sortable
                :sort-order="sortOrderOf('doorKeyReturnedQty')"
                @update:sort-order="(v) => setSort('doorKeyReturnedQty', v)"
              />
            </template>
            <template #default="{ row }">{{ row.doorKeyReturnedQty ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('leaseTermination.fields.smartCardReturnedQty'), { interactive: true, contentMin: 72 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.smartCardReturnedQty')"
                sortable
                :sort-order="sortOrderOf('smartCardReturnedQty')"
                @update:sort-order="(v) => setSort('smartCardReturnedQty', v)"
              />
            </template>
            <template #default="{ row }">{{ row.smartCardReturnedQty ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('leaseTermination.fields.relatedDepositRefund')"
            :min-width="textColW(t('leaseTermination.fields.relatedDepositRefund'), { kind: 'name' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.relatedDepositRefund || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('leaseTermination.fields.otherFeeCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('leaseTermination.fields.otherFeeCount')"
                sortable
                :sort-order="sortOrderOf('otherFeeCount')"
                @update:sort-order="(v) => setSort('otherFeeCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.otherFeeCount ?? 0" @click="openOtherFeesSide(row)" />
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
            v-if="isAdmin"
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
          <template v-if="isAdmin" #batch>
            <button
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

    <LeaseTerminationDetailDrawer
      v-model="drawerVisible"
      :termination="current"
      :desktop-direction="detailDirection"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
    
      @open-other-fees="openOtherFeesSide"
    />
    <RelatedOtherFeesDrawer
      v-model="relatedOtherFeesDrawer"
      :termination-id="relatedListTermination?.id"
      :title-context="relatedListTermination?.terminationCode || ''"
      mode="depositDeduction"
      desktop-direction="ltr"
      @open-fee="onOpenOtherFeeFromRelated"
    />
    <ContractOtherFeeDetailDrawer v-model="otherFeeDetailDrawer" :fee="relatedOtherFee" desktop-direction="ltr" />
    <ContractDetailDrawer
      v-model="contractDrawerVisible"
      :contract="currentContract"
      :desktop-direction="contractDrawerDirection"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-building="openBuildingSide"
      @open-requirement="openRequirementSide"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('leaseTermination.edit') : t('leaseTermination.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="termination-form">
        <div class="form-grid">
          <el-form-item :label="t('leaseTermination.fields.contractCode')" required class="span-2">
            <el-select
              v-model="form.contractId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('leaseTermination.fields.contractCode')"
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
          <el-form-item :label="t('leaseTermination.fields.customerName')">
            <el-input :model-value="selectedContractDisplay.customerName" readonly />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.roomCode')">
            <el-input :model-value="selectedContractDisplay.roomCode" readonly />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.reason')">
            <el-input v-model="form.reason" />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.terminationDate')">
            <el-date-picker
              v-model="form.terminationDate"
              type="date"
              value-format="YYYY-MM-DD"
              :placeholder="t('leaseTermination.fields.terminationDate')"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.noticeAttachment')" class="span-2">
            <el-input
              v-model="form.noticeAttachment"
              class="path-input"
              placeholder="/upload/..."
            />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.doorKeyReturnedQty')">
            <el-input-number
              v-model="form.doorKeyReturnedQty"
              :min="0"
              :precision="0"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.smartCardReturnedQty')">
            <el-input-number
              v-model="form.smartCardReturnedQty"
              :min="0"
              :precision="0"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.siteCondition')" class="span-2">
            <el-input v-model="form.siteCondition" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.relatedDepositRefund')">
            <el-input v-model="form.relatedDepositRefund" />
          </el-form-item>
          <el-form-item :label="t('leaseTermination.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>

        <section class="form-section form-section--fees">
          <div class="fee-section-head">
            <h3>{{ t('leaseTermination.depositDeductions') }}</h3>
            <el-button type="primary" plain class="fee-add-btn" :icon="Plus" @click="addFeeRow">
              {{ t('leaseTermination.addFeeRow') }}
            </el-button>
          </div>
          <div v-if="feeRows.length" class="fee-table-wrap">
            <div class="fee-table" role="table">
              <div class="fee-table__head" role="row">
                <div class="fee-table__cell fee-table__cell--index" role="columnheader">#</div>
                <div class="fee-table__cell fee-table__cell--desc" role="columnheader">
                  <span class="req">*</span>{{ t('leaseTermination.fields.feeDescription') }}
                </div>
                <div class="fee-table__cell fee-table__cell--qty" role="columnheader">
                  {{ t('leaseTermination.fields.feeQuantity') }}
                </div>
                <div class="fee-table__cell fee-table__cell--unit" role="columnheader">
                  {{ t('leaseTermination.fields.feeUnitAmount') }}
                </div>
                <div class="fee-table__cell fee-table__cell--subtotal" role="columnheader">
                  {{ t('leaseTermination.fields.feeSubtotal') }}
                </div>
                <div class="fee-table__cell fee-table__cell--remark" role="columnheader">
                  {{ t('leaseTermination.fields.feeRemark') }}
                </div>
                <div class="fee-table__cell fee-table__cell--actions" role="columnheader"></div>
              </div>
              <div
                v-for="(fee, idx) in feeRows"
                :key="fee.uid"
                class="fee-table__row"
                role="row"
              >
                <div class="fee-table__cell fee-table__cell--index" role="cell">{{ idx + 1 }}</div>
                <div class="fee-table__cell fee-table__cell--desc" role="cell">
                  <el-input v-model="fee.description" />
                </div>
                <div class="fee-table__cell fee-table__cell--qty" role="cell">
                  <el-input-number
                    v-model="fee.quantity"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    style="width: 100%"
                  />
                </div>
                <div class="fee-table__cell fee-table__cell--unit" role="cell">
                  <el-input-number
                    v-model="fee.unitAmount"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    style="width: 100%"
                  />
                </div>
                <div class="fee-table__cell fee-table__cell--subtotal" role="cell">
                  <span class="fee-subtotal">{{ formatMoney(feeSubtotal(fee)) }}</span>
                </div>
                <div class="fee-table__cell fee-table__cell--remark" role="cell">
                  <el-input v-model="fee.remark" />
                </div>
                <div class="fee-table__cell fee-table__cell--actions" role="cell">
                  <el-button type="danger" link :icon="Delete" @click="removeFeeRow(idx)" />
                </div>
              </div>
            </div>
          </div>
          <p v-else class="fee-empty">{{ t('leaseTermination.noFeeRows') }}</p>
        </section>
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

.path-input :deep(.el-input__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.select-option-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.termination-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.termination-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}

.form-section--fees {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #edf2ef;
}

.fee-section-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.fee-section-head h3 {
  margin: 0;
  font-size: 0.95rem;
}

.fee-add-btn {
  --el-button-bg-color: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  --el-button-border-color: color-mix(in srgb, var(--lb-brand) 35%, #fff);
  --el-button-text-color: var(--lb-brand);
  font-weight: 600;
  border-radius: 999px;
  padding: 4px 12px;
  height: 26px;
}

.fee-empty {
  margin: 0;
  color: #7a8f82;
  font-size: 0.85rem;
}

.fee-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e4ebe6;
  border-radius: 8px;
  background: #fff;
}

.fee-table {
  display: grid;
  min-width: 680px;
}

.fee-table__head,
.fee-table__row {
  display: grid;
  grid-template-columns:
    40px
    minmax(140px, 1.6fr)
    88px
    100px
    100px
    minmax(100px, 1fr)
    40px;
  align-items: center;
  column-gap: 6px;
  padding: 0 8px;
}

.fee-table__head {
  min-height: 34px;
  background: #f4f7f5;
  border-bottom: 1px solid #e4ebe6;
  color: #3d4f45;
  font-size: 0.78rem;
  font-weight: 700;
}

.fee-table__row {
  min-height: 40px;
  border-bottom: 1px solid #edf2ef;
}

.fee-table__row:last-child {
  border-bottom: none;
}

.fee-table__cell {
  display: flex;
  align-items: center;
  min-width: 0;
}

.fee-table__cell--index,
.fee-table__cell--subtotal,
.fee-table__cell--actions {
  justify-content: center;
}

.fee-table__head .req {
  color: #e35d5d;
  margin-right: 2px;
}

.fee-subtotal {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #2d4035;
}

.fee-table__row :deep(.el-input__wrapper),
.fee-table__row :deep(.el-input-number) {
  width: 100%;
}
</style>
