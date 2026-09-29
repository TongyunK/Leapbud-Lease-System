<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createInvoiceServiceDetailApi,
  deleteInvoiceServiceDetailApi,
  batchDeleteInvoiceServiceDetailsApi,
  fetchInvoiceServiceDetail,
  fetchInvoiceServiceDetails,
  importInvoiceServiceDetailsApi,
  updateInvoiceServiceDetailApi,
} from '@/api/invoice-service-details'
import type {
  InvoiceServiceDetailWritePayload,
  InvoiceServiceDetailListQuery,
} from '@/api/invoice-service-details'
import { fetchInvoices } from '@/api/invoices'

import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'
import type { InvoiceRecord } from '@/types/invoice'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import InvoiceServiceDetailDrawer from '@/components/InvoiceServiceDetailDrawer.vue'
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
  invoiceServiceDetailIoTemplateExampleRow,
  invoiceServiceDetailToIoRow,
  rowToInvoiceServiceDetailIoPayload,
  pickInvoiceServiceDetailIoValue,
} from '@/utils/invoiceServiceDetailExport'
import type { InvoiceServiceDetailImportPayload } from '@/utils/invoiceServiceDetailExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

const keyword = ref('')
const formVisible = ref(false)
const editing = ref<InvoiceServiceDetailListRecord | null>(null)

const drawerVisible = ref(false)
const current = ref<InvoiceServiceDetailListRecord | null>(null)
const detailDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)

const {
  filters,
  setSort,
  setDateRange,
  dateRangeOf,
  dateRanges,
  sortOrderOf,
  activeConditionCount,
  clearAll,
  sortKey,
  sortOrder,
} = useTableSortFilter<InvoiceServiceDetailListRecord>()

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
} = useServerPagedList<InvoiceServiceDetailListRecord, InvoiceServiceDetailListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range }) => {
    const created = range('createdAt')
    return {
      keyword: kw,
      sortBy,
      sortDir,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchInvoiceServiceDetails,
})

/** 编号列宽随当前页数据变化时强制重算 */
const codeLayoutKey = computed(() =>
  codeColW(t('invoiceServiceDetail.fields.invoiceCode'), {
    interactive: true,
    samples: list.value.map((r) => r.invoiceCode),
  }),
)

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<InvoiceServiceDetailListRecord>()
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
    const { ok, fail } = await runServerBatchDelete(
      ids,
      (chunk) => batchDeleteInvoiceServiceDetailsApi(chunk),
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

type InvoiceSelectOpt = { value: string; label: string }

const invoiceSelectOptions = ref<InvoiceSelectOpt[]>([])
const invoiceSelectLoading = ref(false)

function invoiceOptionLabel(inv: Pick<InvoiceRecord, 'invoiceCode' | 'customerName' | 'contractCode'>) {
  return `${inv.invoiceCode} · ${inv.customerName} · ${inv.contractCode}`
}

async function searchInvoicesRemote(query: string) {
  invoiceSelectLoading.value = true
  try {
    const { data } = await fetchInvoices({
      keyword: query.trim() || undefined,
      page: 1,
      pageSize: 40,
    })
    invoiceSelectOptions.value = data.items.map((inv) => ({
      value: inv.id,
      label: invoiceOptionLabel(inv),
    }))
  } catch {
    invoiceSelectOptions.value = []
  } finally {
    invoiceSelectLoading.value = false
  }
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  invoiceId: '' as string,
  description: '',
  quantity: 1,
  unitAmount: 0,
  remark: '',
})

const form = reactive(emptyForm())

const computedSubtotal = computed(
  () => (Number(form.quantity) || 0) * (Number(form.unitAmount) || 0),
)

onMounted(() => {
  void loadList()
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  invoiceSelectOptions.value = []
  formVisible.value = true
  void searchInvoicesRemote('')
}

function openEdit(row: InvoiceServiceDetailListRecord) {
  editing.value = row
  Object.assign(form, {
    invoiceId: row.invoiceId || '',
    description: row.description || '',
    quantity: row.quantity ?? 0,
    unitAmount: row.unitAmount ?? 0,
    remark: row.remark || '',
  })
  // 编辑时发票不可改：只挂当前一项，避免全量 el-option 拖垮开合
  invoiceSelectOptions.value = row.invoiceId
    ? [
        {
          value: row.invoiceId,
          label: invoiceOptionLabel({
            invoiceCode: row.invoiceCode,
            customerName: row.customerName,
            contractCode: row.contractCode,
          }),
        },
      ]
    : []
  formVisible.value = true
}

function payloadFromForm(): InvoiceServiceDetailWritePayload {
  return {
    invoiceId: form.invoiceId.trim(),
    description: form.description.trim() || undefined,
    quantity: Number(form.quantity) || 0,
    unitAmount: Number(form.unitAmount) || 0,
    subtotal: computedSubtotal.value,
    remark: form.remark.trim() || undefined,
  }
}

async function saveForm() {
  if (!form.invoiceId.trim()) {
    ElMessage.warning(t('invoiceServiceDetail.invoiceRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateInvoiceServiceDetailApi(editing.value.id, payload)
      ElMessage.success(t('invoiceServiceDetail.updated'))
    } else {
      await createInvoiceServiceDetailApi(payload)
      ElMessage.success(t('invoiceServiceDetail.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: InvoiceServiceDetailListRecord) {
  try {
    await ElMessageBox.confirm(
      t('invoiceServiceDetail.deleteConfirm', { desc: row.description || row.id }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteInvoiceServiceDetailApi(row.id)
    ElMessage.success(t('invoiceServiceDetail.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function openDetail(row: InvoiceServiceDetailListRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchInvoiceServiceDetail(row.id)
    current.value = data
    detailDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(
  row: InvoiceServiceDetailListRecord,
  column: { type?: string } | undefined,
  event: Event,
) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (
    el?.closest(
      '.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection',
    )
  )
    return
  void openDetail(row, 'rtl')
}

async function openInvoiceSide(invoiceId?: string | null, _direction: 'ltr' | 'rtl' = 'ltr') {
  await relationDrawers.value?.openInvoiceSide(invoiceId)
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
  if (scope) void exportDetailsXlsx(scope)
}

function downloadImportTemplate() {
  const example = invoiceServiceDetailIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'InvoiceServiceDetails')
  XLSX.writeFile(wb, 'invoice-service-details-import-template.xlsx')
  ElMessage.success(t('invoiceServiceDetail.templateDone'))
}

async function exportDetailsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: InvoiceServiceDetailListRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('invoiceServiceDetail.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('invoiceServiceDetail.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => invoiceServiceDetailToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'InvoiceServiceDetails')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `invoice-service-details-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('invoiceServiceDetail.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('invoiceServiceDetail.importFailed'))
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
    ElMessage.warning(t('invoiceServiceDetail.importAdminOnly'))
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
        message: t('invoiceServiceDetail.importEmpty'),
      })
      return
    }

    const payloads: InvoiceServiceDetailImportPayload[] = []
    let lastInvoiceCode = ''
    for (const row of rawRows) {
      const rowInvoiceCode = pickInvoiceServiceDetailIoValue(row, 'invoiceCode', t)
      if (rowInvoiceCode) lastInvoiceCode = rowInvoiceCode
      const parsed = rowToInvoiceServiceDetailIoPayload(row, t, {
        fallbackInvoiceCode: lastInvoiceCode,
      })
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('invoiceServiceDetail.importMissingInvoice'),
            keys: {
              所屬發票: String(
                row['所屬發票'] ??
                  row['所属发票'] ??
                  row['所属發票'] ??
                  row['發票編號'] ??
                  row['发票编号'] ??
                  '',
              ),
              服務描述: String(row['服務描述'] ?? row['服务描述'] ?? row['描述'] ?? ''),
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
        const { data } = await importInvoiceServiceDetailsApi(batch)
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
              發票編號: it.invoiceCode || '',
              服務描述: it.description || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('invoiceServiceDetail.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.invoiceServiceDetails') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('invoiceServiceDetail.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('invoiceServiceDetail.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button
            class="room-io-btn"
            :aria-label="t('invoiceServiceDetail.dataIo')"
            :loading="importing || exporting"
          >
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('invoiceServiceDetail.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('invoiceServiceDetail.downloadTemplate') }}</span>
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
            width="44"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column
            :width="
              codeColW(t('invoiceServiceDetail.fields.invoiceCode'), {
                interactive: true,
                samples: list.map((r) => r.invoiceCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoiceServiceDetail.fields.invoiceCode')"
                sortable
                :sort-order="sortOrderOf('invoiceCode')"
                @update:sort-order="(v) => setSort('invoiceCode', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="row.invoiceId"
                type="button"
                class="fk-link"
                :title="row.invoiceCode"
                @click.stop="openInvoiceSide(row.invoiceId)"
              >
                {{ row.invoiceCode || '—' }}
              </button>
              <span v-else>{{ row.invoiceCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('invoiceServiceDetail.fields.description')"
            :min-width="textColW(t('invoiceServiceDetail.fields.description'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoiceServiceDetail.fields.quantity'), { interactive: true, contentMin: 72 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoiceServiceDetail.fields.quantity')"
                sortable
                :sort-order="sortOrderOf('quantity')"
                @update:sort-order="(v) => setSort('quantity', v)"
              />
            </template>
            <template #default="{ row }">{{ row.quantity ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoiceServiceDetail.fields.unitAmount'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoiceServiceDetail.fields.unitAmount')"
                sortable
                :sort-order="sortOrderOf('unitAmount')"
                @update:sort-order="(v) => setSort('unitAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.unitAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('invoiceServiceDetail.fields.subtotal'), { interactive: true, contentMin: 100 })"
            align="right"
            header-align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('invoiceServiceDetail.fields.subtotal')"
                sortable
                :sort-order="sortOrderOf('subtotal')"
                @update:sort-order="(v) => setSort('subtotal', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.subtotal) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('invoiceServiceDetail.fields.remark')"
            :min-width="textColW(t('invoiceServiceDetail.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column :min-width="auditUserColWidth" show-overflow-tooltip>
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

    <InvoiceServiceDetailDrawer
      v-model="drawerVisible"
      :detail="current"
      :desktop-direction="detailDirection"
      @open-invoice="(id) => openInvoiceSide(id, 'ltr')"
      @open-contract="(id) => openContractSide(id, 'ltr')"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('invoiceServiceDetail.edit') : t('invoiceServiceDetail.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="fee-form">
        <div class="form-grid">
          <el-form-item :label="t('invoiceServiceDetail.fields.invoiceCode')" required class="span-2">
            <el-select
              v-model="form.invoiceId"
              filterable
              remote
              reserve-keyword
              fit-input-width
              style="width: 100%"
              :placeholder="t('invoiceServiceDetail.fields.invoiceCode')"
              :disabled="!!editing"
              :remote-method="searchInvoicesRemote"
              :loading="invoiceSelectLoading"
              @visible-change="(open: boolean) => open && !editing && searchInvoicesRemote('')"
            >
              <el-option
                v-for="opt in invoiceSelectOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
                :title="opt.label"
              >
                <span class="select-option-ellipsis" :title="opt.label">{{ opt.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="t('invoiceServiceDetail.fields.description')" class="span-2">
            <el-input v-model="form.description" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('invoiceServiceDetail.fields.quantity')">
            <el-input-number
              v-model="form.quantity"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoiceServiceDetail.fields.unitAmount')">
            <el-input-number
              v-model="form.unitAmount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('invoiceServiceDetail.fields.subtotal')" class="span-2">
            <el-input :model-value="formatMoney(computedSubtotal)" readonly />
          </el-form-item>
          <el-form-item :label="t('invoiceServiceDetail.fields.remark')" class="span-2">
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
