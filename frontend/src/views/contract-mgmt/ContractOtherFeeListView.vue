<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createContractOtherFeeApi,
  deleteContractOtherFeeApi,
  batchDeleteContractOtherFeesApi,
  fetchContractOtherFee,
  fetchContractOtherFees,
  importContractOtherFeesApi,
  updateContractOtherFeeApi,
} from '@/api/contract-other-fees'
import type { ContractOtherFeeWritePayload, ContractOtherFeeListQuery } from '@/api/contract-other-fees'
import { fetchContracts } from '@/api/contracts'
import { fetchLeaseTerminations } from '@/api/lease-terminations'
import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { ContractRecord } from '@/types/contract'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import ContractOtherFeeDetailDrawer from '@/components/ContractOtherFeeDetailDrawer.vue'
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
  contractOtherFeeIoTemplateExampleRow,
  contractOtherFeeToIoRow,
  rowToContractOtherFeeIoPayload,
} from '@/utils/contractOtherFeeExport'
import type { ContractOtherFeeImportPayload } from '@/utils/contractOtherFeeExport'
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
const editing = ref<ContractOtherFeeRecord | null>(null)
const contracts = ref<ContractRecord[]>([])
const terminationsForForm = ref<LeaseTerminationRecord[]>([])

const drawerVisible = ref(false)
const current = ref<ContractOtherFeeRecord | null>(null)
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
} = useTableSortFilter<ContractOtherFeeRecord>()

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
} = useServerPagedList<ContractOtherFeeRecord, ContractOtherFeeListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const created = range('createdAt')
    return {
      keyword: kw,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      sortBy,
      sortDir,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchContractOtherFees,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ContractOtherFeeRecord>()
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteContractOtherFeesApi(chunk), setBatchProgress)
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

const terminationFilterOptions = computed(() =>
  terminationsForForm.value.map((tr) => ({
    value: tr.id,
    label: tr.terminationCode,
  })),
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  contractId: '' as string,
  terminationId: '' as string,
  description: '',
  quantity: 1,
  unitAmount: 0,
  remark: '',
  sortOrder: 0,
})

const form = reactive(emptyForm())

const computedSubtotal = computed(
  () => (Number(form.quantity) || 0) * (Number(form.unitAmount) || 0),
)

async function loadContracts() {
  const { data } = await fetchContracts()
  contracts.value = data.items
}

async function loadTerminationsForContract(contractId: string) {
  if (!contractId) {
    terminationsForForm.value = []
    return
  }
  const { data } = await fetchLeaseTerminations({ contractId })
  terminationsForForm.value = data.items
}

watch(
  () => form.contractId,
  async (contractId) => {
    if (!formVisible.value) return
    form.terminationId = ''
    await loadTerminationsForContract(contractId)
  },
)

onMounted(async () => {
  await Promise.all([loadContracts(), loadList()])
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  terminationsForForm.value = []
  formVisible.value = true
}

async function openEdit(row: ContractOtherFeeRecord) {
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    terminationId: row.terminationId || '',
    description: row.description || '',
    quantity: row.quantity ?? 0,
    unitAmount: row.unitAmount ?? 0,
    remark: row.remark || '',
    sortOrder: row.sortOrder ?? 0,
  })
  await loadTerminationsForContract(form.contractId)
  formVisible.value = true
}

function payloadFromForm(): ContractOtherFeeWritePayload {
  return {
    contractId: form.contractId.trim(),
    terminationId: form.terminationId.trim() || null,
    description: form.description.trim() || undefined,
    quantity: Number(form.quantity) || 0,
    unitAmount: Number(form.unitAmount) || 0,
    subtotal: computedSubtotal.value,
    remark: form.remark.trim() || undefined,
    sortOrder: Math.floor(Number(form.sortOrder) || 0),
  }
}

async function saveForm() {
  if (!form.contractId.trim()) {
    ElMessage.warning(t('contractOtherFee.contractRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateContractOtherFeeApi(editing.value.id, payload)
      ElMessage.success(t('contractOtherFee.updated'))
    } else {
      await createContractOtherFeeApi(payload)
      ElMessage.success(t('contractOtherFee.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ContractOtherFeeRecord) {
  try {
    await ElMessageBox.confirm(
      t('contractOtherFee.deleteConfirm', { desc: row.description || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteContractOtherFeeApi(row.id)
    ElMessage.success(t('contractOtherFee.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: ContractOtherFeeRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchContractOtherFee(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: ContractOtherFeeRecord, column: { type?: string } | undefined, event: Event) {
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
  if (scope) void exportFeesXlsx(scope)
}

function downloadImportTemplate() {
  const example = contractOtherFeeIoTemplateExampleRow(t, 'contractOtherFee')
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'OtherFees')
  XLSX.writeFile(wb, 'contract-other-fees-import-template.xlsx')
  ElMessage.success(t('contractOtherFee.templateDone'))
}

async function exportFeesXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ContractOtherFeeRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('contractOtherFee.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('contractOtherFee.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => contractOtherFeeToIoRow(r, t, 'contractOtherFee'))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'OtherFees')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `contract-other-fees-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('contractOtherFee.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('contractOtherFee.importFailed'))
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
    ElMessage.warning(t('contractOtherFee.importAdminOnly'))
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
        message: t('contractOtherFee.importEmpty'),
      })
      return
    }

    const payloads: ContractOtherFeeImportPayload[] = []
    for (const row of rawRows) {
      const parsed = rowToContractOtherFeeIoPayload(row, t, 'contractOtherFee')
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
              退租編號: String(row['退租編號'] ?? row['退租编号'] ?? ''),
              房間編號: String(row['房間編號'] ?? row['房间编号'] ?? ''),
              費用描述: String(row['描述'] ?? row['費用描述'] ?? row['费用描述'] ?? ''),
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
        const { data } = await importContractOtherFeesApi(batch)
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
              合約編號: it.contractCode || '',
              退租編號: it.terminationCode || '',
              房間編號: it.roomCode || '',
              費用描述: it.description || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('contractOtherFee.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.contractOtherFees') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('contractOtherFee.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('contractOtherFee.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('contractOtherFee.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('contractOtherFee.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('contractOtherFee.downloadTemplate') }}</span>
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
            :min-width="codeColW(t('contractOtherFee.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractOtherFee.fields.contractCode')"
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
            :min-width="codeColW(t('contractOtherFee.fields.terminationCode'), { samples: list.map((r) => r.terminationCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractOtherFee.fields.terminationCode')"
                sortable
                :sort-order="sortOrderOf('terminationCode')"
                @update:sort-order="(v) => setSort('terminationCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.terminationId"
                type="button"
                class="fk-link"
                @click.stop="relationDrawers?.openTerminationSide(row.terminationId)"
              >
                {{ row.terminationCode || '—' }}
              </button>
              <template v-else>{{ row.terminationCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('contractOtherFee.fields.description')"
            :min-width="textColW(t('contractOtherFee.fields.description'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractOtherFee.fields.quantity'), { interactive: true, contentMin: 72 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractOtherFee.fields.quantity')"
                sortable
                :sort-order="sortOrderOf('quantity')"
                @update:sort-order="(v) => setSort('quantity', v)"
              />
            </template>
            <template #default="{ row }">{{ row.quantity ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractOtherFee.fields.unitAmount'), { interactive: true, contentMin: 88 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractOtherFee.fields.unitAmount')"
                sortable
                :sort-order="sortOrderOf('unitAmount')"
                @update:sort-order="(v) => setSort('unitAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.unitAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contractOtherFee.fields.subtotal'), { interactive: true, contentMin: 88 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractOtherFee.fields.subtotal')"
                sortable
                :sort-order="sortOrderOf('subtotal')"
                @update:sort-order="(v) => setSort('subtotal', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.subtotal) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractOtherFee.fields.remark')"
            :min-width="textColW(t('contractOtherFee.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('contractOtherFee.fields.customerName'), { interactive: true, kind: 'name' })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractOtherFee.fields.customerName')"
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
            :min-width="codeColW(t('contractOtherFee.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contractOtherFee.fields.roomCode')"
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

    <ContractOtherFeeDetailDrawer
      v-model="drawerVisible"
      :fee="current"
      i18n-ns="contractOtherFee"
      :desktop-direction="detailDirection"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-termination="(id) => relationDrawers?.openTerminationSide(id)"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('contractOtherFee.edit') : t('contractOtherFee.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="fee-form">
        <div class="form-grid">
          <el-form-item :label="t('contractOtherFee.fields.contractCode')" required class="span-2">
            <el-select
              v-model="form.contractId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('contractOtherFee.fields.contractCode')"
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
          <el-form-item :label="t('contractOtherFee.fields.terminationCode')" class="span-2">
            <el-select
              v-model="form.terminationId"
              clearable
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('contractOtherFee.terminationOptional')"
              :disabled="!form.contractId"
            >
              <el-option
                v-for="opt in terminationFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('contractOtherFee.fields.description')" class="span-2">
            <el-input v-model="form.description" />
          </el-form-item>
          <el-form-item :label="t('contractOtherFee.fields.quantity')">
            <el-input-number
              v-model="form.quantity"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractOtherFee.fields.unitAmount')">
            <el-input-number
              v-model="form.unitAmount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractOtherFee.fields.subtotal')">
            <el-input :model-value="formatMoney(computedSubtotal)" readonly />
          </el-form-item>
          <el-form-item :label="t('contractOtherFee.fields.sortOrder')">
            <el-input-number
              v-model="form.sortOrder"
              :min="0"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('contractOtherFee.fields.remark')" class="span-2">
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

.fee-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}
</style>
