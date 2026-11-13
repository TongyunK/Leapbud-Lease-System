<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, QuestionFilled, Search, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createDepositRefundApi,
  deleteDepositRefundApi,
  batchDeleteDepositRefundsApi,
  deleteDepositRefundAttachmentApi,
  fetchDepositRefund,
  fetchDepositRefundAttachmentBlob,
  fetchDepositRefunds,
  importDepositRefundsApi,
  updateDepositRefundApi,
  uploadDepositRefundAttachmentsApi,
} from '@/api/deposit-refunds'
import type { DepositRefundWritePayload, DepositRefundListQuery } from '@/api/deposit-refunds'
import { fetchContracts } from '@/api/contracts'
import { fetchUsers } from '@/api/users'
import { fetchBookingDepositByContractApi } from '@/api/receipts'
import type {
  DepositRefundAttachmentRecord,
  DepositRefundRecord,
} from '@/types/deposit-refund'
import { DEPOSIT_REFUND_STATUSES } from '@/types/deposit-refund'
import MultiAttachmentField from '@/components/MultiAttachmentField.vue'
import type { MultiAttachmentExisting } from '@/components/MultiAttachmentField.vue'
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
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { depositRefundStatusTone } from '@/constants/statusBadges'
import { useUserStore } from '@/stores/user'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import { packFilterValues } from '@/utils/columnFilter'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import { ACTION_COL_ICON, useActionColWidth } from '@/composables/useActionColWidth'
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
const { actionColW } = useActionColWidth()
const listActionColWidth = computed(() =>
  actionColW([
    ACTION_COL_ICON,
    perms.update && t('depositRefund.conductRefund'),
    perms.update && t('common.edit'),
    perms.delete && t('common.delete'),
  ]),
)
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

/** 办理退还（未退 → 已退） */
const conductVisible = ref(false)
const conducting = ref<DepositRefundRecord | null>(null)
const conductSaving = ref(false)
const conductBookingBalance = ref(0)
const conductForm = reactive({
  refundDate: '' as string,
  actualRefundAmount: null as number | null,
  bookingDepositRefundAmount: null as number | null,
  remark: '',
})
const conductPendingAttachments = ref<Array<{ key: string; file: File }>>([])

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isPendingRefundStatus(status: string | null | undefined) {
  const s = (status || '').trim()
  return s === '未退' || s === '未退按金'
}

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
  uniqueOptions,
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
      refundCodes: packFilterValues(f.refundCode),
      contractCodes: packFilterValues(f.contractCode),
      customerNames: packFilterValues(f.customerName),
      roomNames: packFilterValues(f.roomName),
      totalDeposits: packFilterValues(f.totalDeposit),
      actualRefundAmounts: packFilterValues(f.actualRefundAmount),
      handlers: packFilterValues(f.handler),
      createdBys: packFilterValues(f.createdBy),
      status: packFilterValues(f.status)?.join(','),
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
  if (!perms.batchDelete || !selectedIds.value.length) return
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

function uniqueListOptions(
  get: (row: DepositRefundRecord) => string | number | null | undefined,
  labelOf?: (value: string) => string,
) {
  return uniqueOptions(list.value, get, labelOf)
}

const refundCodeFilterOptions = computed(() => uniqueListOptions((r) => r.refundCode))
const contractCodeFilterOptions = computed(() => uniqueListOptions((r) => r.contractCode))
const roomNameFilterOptions = computed(() =>
  uniqueListOptions((r) => r.roomName || r.roomCode),
)
const totalDepositFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.totalDeposit == null ? '' : String(r.totalDeposit)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const actualRefundAmountFilterOptions = computed(() =>
  uniqueListOptions(
    (r) => (r.actualRefundAmount == null ? '' : String(r.actualRefundAmount)),
    (v) => moneyOrDash(Number(v)),
  ),
)
const handlerFilterOptions = computed(() => uniqueListOptions((r) => r.handler))
const createdByFilterOptions = computed(() => uniqueListOptions((r) => r.createdBy))

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

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

const emptyForm = () => ({
  contractId: '' as string,
  refundCode: '',
  status: DEPOSIT_REFUND_STATUSES[0] as string,
  terminationDate: '',
  refundDate: '',
  totalDeposit: null as number | null,
  actualRefundAmount: null as number | null,
  bookingDepositRefundAmount: null as number | null,
  handlerId: '' as string,
  remark: '',
})

const form = reactive(emptyForm())
const formExistingAttachments = ref<DepositRefundAttachmentRecord[]>([])
const formPendingAttachments = ref<Array<{ key: string; file: File }>>([])
const formRemovedAttachmentIds = ref<string[]>([])
const saving = ref(false)

function resetFormAttachments() {
  formExistingAttachments.value = []
  formPendingAttachments.value = []
  formRemovedAttachmentIds.value = []
}

function onAddAttachments(files: File[]) {
  for (const file of files) {
    formPendingAttachments.value.push({
      key: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
    })
  }
}

function removePendingAttachment(key: string) {
  formPendingAttachments.value = formPendingAttachments.value.filter((p) => p.key !== key)
}

function removeExistingAttachment(id: string) {
  formExistingAttachments.value = formExistingAttachments.value.filter((a) => a.id !== id)
  if (!formRemovedAttachmentIds.value.includes(id)) {
    formRemovedAttachmentIds.value.push(id)
  }
}

async function resolveFormAttachmentUrl(att: MultiAttachmentExisting) {
  const hit = formExistingAttachments.value.find((a) => a.id === att.id)
  if (hit?.publicUrl) return hit.publicUrl
  const refundId = editing.value?.id
  if (!refundId) return ''
  const blob = await fetchDepositRefundAttachmentBlob(refundId, att.id)
  return URL.createObjectURL(blob)
}

const selectedContract = computed(() =>
  contracts.value.find((c) => c.id === form.contractId) || null,
)

/** 所选合约定金可用余额（编辑时含本单已记退还） */
const bookingDepositBalance = ref(0)

async function refreshBookingDepositBalance(contractId: string) {
  const id = contractId.trim()
  if (!id) {
    bookingDepositBalance.value = 0
    if (!editing.value) form.bookingDepositRefundAmount = null
    return
  }
  try {
    const { data } = await fetchBookingDepositByContractApi(id)
    let bal = Number(data?.balance ?? 0)
    if (editing.value?.contractId === id) {
      bal += Number(editing.value.bookingDepositRefundAmount ?? 0)
    }
    bookingDepositBalance.value = Math.max(0, Math.round(bal * 100) / 100)
    // 按金与定金同退：一并退还定金强制为全部可用余额
    form.bookingDepositRefundAmount = bookingDepositBalance.value
  } catch {
    bookingDepositBalance.value = 0
  }
}

watch(
  () => form.contractId,
  (id) => {
    void refreshBookingDepositBalance(id || '')
  },
)

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
  resetFormAttachments()
  bookingDepositBalance.value = 0
  formVisible.value = true
}

async function openConductRefund(row: DepositRefundRecord) {
  conducting.value = row
  conductForm.refundDate = todayYmd()
  conductForm.actualRefundAmount = row.actualRefundAmount
  conductForm.bookingDepositRefundAmount = row.bookingDepositRefundAmount ?? 0
  conductForm.remark = row.remark || ''
  conductPendingAttachments.value = []
  conductBookingBalance.value = 0
  conductVisible.value = true
  try {
    const { data } = await fetchBookingDepositByContractApi(row.contractId)
    let bal = Number(data?.balance ?? 0)
    bal += Number(row.bookingDepositRefundAmount ?? 0)
    conductBookingBalance.value = Math.max(0, Math.round(bal * 100) / 100)
    conductForm.bookingDepositRefundAmount = conductBookingBalance.value
  } catch {
    conductBookingBalance.value = Math.max(0, Number(row.bookingDepositRefundAmount ?? 0))
    conductForm.bookingDepositRefundAmount = conductBookingBalance.value
  }
}

function onAddConductAttachments(files: File[]) {
  for (const file of files) {
    conductPendingAttachments.value.push({
      key: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
    })
  }
}

function removeConductPendingAttachment(key: string) {
  conductPendingAttachments.value = conductPendingAttachments.value.filter((p) => p.key !== key)
}

async function saveConductRefund() {
  const row = conducting.value
  if (!row) return
  if (!conductForm.refundDate) {
    await ElMessageBox.alert(
      t('depositRefund.conductNeedRefundDate'),
      t('depositRefund.conductRefund'),
      { type: 'warning', confirmButtonText: t('common.confirm') },
    )
    return
  }
  conductSaving.value = true
  try {
    await updateDepositRefundApi(
      row.id,
      {
        status: '已退',
        refundDate: conductForm.refundDate,
        actualRefundAmount:
          conductForm.actualRefundAmount == null
            ? undefined
            : Number(conductForm.actualRefundAmount) || 0,
        bookingDepositRefundAmount: conductBookingBalance.value,
        remark: conductForm.remark.trim() || undefined,
      },
      { silentError: true },
    )
    const pending = conductPendingAttachments.value.map((p) => p.file)
    if (pending.length) {
      try {
        await uploadDepositRefundAttachmentsApi(row.id, pending)
      } catch {
        await ElMessageBox.alert(
          t('depositRefund.attachmentsUploadFailed'),
          t('depositRefund.conductRefund'),
          { type: 'warning', confirmButtonText: t('common.confirm') },
        )
        conductVisible.value = false
        conducting.value = null
        conductPendingAttachments.value = []
        await loadList()
        return
      }
    }
    conductVisible.value = false
    conducting.value = null
    conductPendingAttachments.value = []
    await ElMessageBox.alert(t('depositRefund.conductDone'), t('depositRefund.conductRefund'), {
      type: 'success',
      confirmButtonText: t('common.confirm'),
    })
    await loadList()
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('common.failed')
    try {
      await ElMessageBox.alert(msg, t('depositRefund.conductRefund'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      })
    } catch {
      /* dismiss */
    }
  } finally {
    conductSaving.value = false
  }
}

async function openEdit(row: DepositRefundRecord) {
  editing.value = row
  Object.assign(form, {
    contractId: row.contractId || '',
    refundCode: row.refundCode || '',
    status: row.status || DEPOSIT_REFUND_STATUSES[0],
    terminationDate: row.terminationDate || '',
    refundDate: row.refundDate || '',
    totalDeposit: row.totalDeposit,
    actualRefundAmount: row.actualRefundAmount,
    bookingDepositRefundAmount: row.bookingDepositRefundAmount ?? 0,
    handlerId: row.handlerId || '',
    remark: row.remark || '',
  })
  resetFormAttachments()
  formExistingAttachments.value = [...(row.attachments || [])]
  formVisible.value = true
  void refreshBookingDepositBalance(row.contractId || '')
  try {
    const { data } = await fetchDepositRefund(row.id)
    editing.value = data
    formExistingAttachments.value = [...(data.attachments || [])]
  } catch {
    /* list row 已回填；详情拉取失败时沿用列表 attachments */
  }
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
    bookingDepositRefundAmount: bookingDepositBalance.value,
    handlerId: form.handlerId.trim() || null,
    remark: form.remark.trim() || undefined,
  }
}

async function syncFormAttachments(depositRefundId: string) {
  for (const id of formRemovedAttachmentIds.value) {
    await deleteDepositRefundAttachmentApi(depositRefundId, id)
  }
  const pending = formPendingAttachments.value.map((p) => p.file)
  if (pending.length) {
    await uploadDepositRefundAttachmentsApi(depositRefundId, pending)
  }
}

async function saveForm() {
  if (!form.contractId.trim()) {
    await ElMessageBox.alert(
      t('depositRefund.contractRequired'),
      editing.value ? t('depositRefund.edit') : t('depositRefund.create'),
      { type: 'warning', confirmButtonText: t('common.confirm') },
    )
    return
  }
  saving.value = true
  try {
    const payload = payloadFromForm()
    let refundId = editing.value?.id || ''
    if (editing.value) {
      await updateDepositRefundApi(editing.value.id, payload, { silentError: true })
      refundId = editing.value.id
      await syncFormAttachments(refundId)
      await ElMessageBox.alert(t('depositRefund.updated'), t('depositRefund.edit'), {
        type: 'success',
        confirmButtonText: t('common.confirm'),
      })
    } else {
      const { data } = await createDepositRefundApi(payload, { silentError: true })
      refundId = data.id
      try {
        await syncFormAttachments(refundId)
      } catch {
        await ElMessageBox.alert(
          t('depositRefund.attachmentsUploadFailed'),
          t('depositRefund.create'),
          { type: 'warning', confirmButtonText: t('common.confirm') },
        )
        formVisible.value = false
        resetFormAttachments()
        await loadList()
        return
      }
      await ElMessageBox.alert(t('depositRefund.created'), t('depositRefund.create'), {
        type: 'success',
        confirmButtonText: t('common.confirm'),
      })
    }
    formVisible.value = false
    resetFormAttachments()
    await loadList()
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('common.failed')
    try {
      await ElMessageBox.alert(
        msg,
        editing.value ? t('depositRefund.edit') : t('depositRefund.create'),
        { type: 'error', confirmButtonText: t('common.confirm') },
      )
    } catch {
      /* dismiss */
    }
  } finally {
    saving.value = false
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
  if (!perms.import) {
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
      <RefreshListButton :loading="loading" @refresh="loadList" />
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
          :key="`${tableLayoutKey}-${codeLayoutKey}-${listActionColWidth}`"
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
                filterable
                sortable
                :options="refundCodeFilterOptions"
                :model-value="filters.refundCode || []"
                :sort-order="sortOrderOf('refundCode')"
                @update:model-value="(v) => setFilter('refundCode', v)"
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
            :min-width="codeColW(t('depositRefund.fields.roomName'), { interactive: true, samples: list.map((r) => r.roomName || r.roomCode) })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.roomName')"
                filterable
                sortable
                :options="roomNameFilterOptions"
                :model-value="filters.roomName || []"
                :sort-order="sortOrderOf('roomName')"
                @update:model-value="(v) => setFilter('roomName', v)"
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
                :model-value="filters.terminationDate || []"
                :sort-order="sortOrderOf('terminationDate')"
                :date-range-value="dateRangeOf('terminationDate')"
                @update:sort-order="(v) => setSort('terminationDate', v)"
                @update:model-value="(v) => setFilter('terminationDate', v)"
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
                :model-value="filters.refundDate || []"
                :sort-order="sortOrderOf('refundDate')"
                :date-range-value="dateRangeOf('refundDate')"
                @update:sort-order="(v) => setSort('refundDate', v)"
                @update:model-value="(v) => setFilter('refundDate', v)"
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
                filterable
                sortable
                :options="totalDepositFilterOptions"
                :model-value="filters.totalDeposit || []"
                :sort-order="sortOrderOf('totalDeposit')"
                @update:model-value="(v) => setFilter('totalDeposit', v)"
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
                filterable
                sortable
                :options="actualRefundAmountFilterOptions"
                :model-value="filters.actualRefundAmount || []"
                :sort-order="sortOrderOf('actualRefundAmount')"
                @update:model-value="(v) => setFilter('actualRefundAmount', v)"
                @update:sort-order="(v) => setSort('actualRefundAmount', v)"
              />
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.actualRefundAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.bookingDepositRefundAmount'), { contentMin: 110 })"
            align="right"
            header-align="right"
          >
            <template #header>
              {{ t('depositRefund.fields.bookingDepositRefundAmount') }}
            </template>
            <template #default="{ row }">{{ moneyOrDash(row.bookingDepositRefundAmount) }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.handler'), { interactive: true, contentMin: 100 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('depositRefund.fields.handler')"
                filterable
                sortable
                :options="handlerFilterOptions"
                :model-value="filters.handler || []"
                :sort-order="sortOrderOf('handler')"
                @update:model-value="(v) => setFilter('handler', v)"
                @update:sort-order="(v) => setSort('handler', v)"
              />
            </template>
            <template #default="{ row }">{{ row.handler || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('depositRefund.fields.attachments'), { contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader :label="t('depositRefund.fields.attachments')" />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.attachments?.length ?? 0"
                @click="openDetail(row)"
              />
            </template>
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
                <button
                  v-if="perms.update && isPendingRefundStatus(row.status)"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openConductRefund(row)"
                >
                  {{ t('depositRefund.conductRefund') }}
                </button>
                <button
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="perms.delete"
                  v-admin-glow="perms.codes.delete"
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
      @changed="loadList"
    />
    <RelatedEntityDrawers ref="relationDrawers" @changed="loadList" />

    <el-dialog
      v-model="conductVisible"
      :title="t('depositRefund.conductRefund')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form v-if="conducting" label-position="top" class="fee-form">
        <div class="form-grid">
          <el-form-item :label="t('depositRefund.fields.refundCode')">
            <el-input :model-value="conducting.refundCode" disabled />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.contractCode')">
            <el-input :model-value="conducting.contractCode" disabled />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.refundDate')" required>
            <el-date-picker
              v-model="conductForm.refundDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.totalDeposit')">
            <el-input :model-value="moneyOrDash(conducting.totalDeposit)" disabled />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.actualRefundAmount')">
            <el-input-number
              v-model="conductForm.actualRefundAmount"
              :min="0"
              :precision="2"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item>
            <template #label>
              <span class="form-label-with-tip">
                {{ t('depositRefund.fields.bookingDepositRefundAmount') }}
                <el-tooltip
                  :content="t('depositRefund.fields.bookingDepositMustFullHint')"
                  placement="top"
                >
                  <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <el-input :model-value="formatMoney(conductBookingBalance)" disabled />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.attachments')" class="span-2">
            <MultiAttachmentField
              :pending="conductPendingAttachments"
              :disabled="conductSaving"
              @add="onAddConductAttachments"
              @remove-pending="removeConductPendingAttachment"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.remark')" class="span-2">
            <el-input v-model="conductForm.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button :disabled="conductSaving" @click="conductVisible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button
            type="primary"
            class="lb-btn-primary"
            :loading="conductSaving"
            @click="saveConductRefund"
          >
            {{ t('depositRefund.conductSubmit') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

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
            <SelectWithViewAction
              :disabled="!form.contractId"
              @view="openContractSide(form.contractId, 'ltr')"
            >
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
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.customerName')">
            <SelectWithViewAction
              control="input"
              :disabled="!(selectedContract?.customerId || editing?.customerId)"
              @view="
                openCustomerSide(selectedContract?.customerId || editing?.customerId, 'ltr')
              "
            >
              <el-input
                :model-value="selectedContract?.customerName || editing?.customerName || ''"
                disabled
              />
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.roomName')">
            <SelectWithViewAction
              control="input"
              :disabled="!(selectedContract?.roomId || editing?.roomId)"
              @view="openRoomSide(selectedContract?.roomId || editing?.roomId, 'ltr')"
            >
              <el-input
                :model-value="
                  selectedContract
                    ? `${selectedContract.roomCode}${selectedContract.roomName ? ' · ' + selectedContract.roomName : ''}`
                    : editing
                      ? `${editing.roomCode}${editing.roomName ? ' · ' + editing.roomName : ''}`
                      : ''
                "
                disabled
              />
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.refundCode')">
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
          <el-form-item :label="t('depositRefund.fields.refundDate')">
            <el-date-picker
              v-model="form.refundDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
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
          <el-form-item :label="t('depositRefund.fields.terminationDate')">
            <el-date-picker
              v-model="form.terminationDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item>
            <template #label>
              <span class="form-label-with-tip">
                {{ t('depositRefund.fields.bookingDepositRefundAmount') }}
                <el-tooltip
                  :content="t('depositRefund.fields.bookingDepositMustFullHint')"
                  placement="top"
                >
                  <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <el-input :model-value="formatMoney(bookingDepositBalance)" disabled />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.attachments')" class="span-2">
            <MultiAttachmentField
              :existing="formExistingAttachments"
              :pending="formPendingAttachments"
              :disabled="saving"
              :resolve-url="resolveFormAttachmentUrl"
              @add="onAddAttachments"
              @remove-existing="removeExistingAttachment"
              @remove-pending="removePendingAttachment"
            />
          </el-form-item>
          <el-form-item :label="t('depositRefund.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button :disabled="saving" @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button
            type="primary"
            class="lb-btn-primary"
            :loading="saving"
            @click="saveForm"
          >
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
