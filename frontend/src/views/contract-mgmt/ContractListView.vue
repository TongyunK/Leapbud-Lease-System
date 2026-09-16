<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, Download, Plus, Rank, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createContractApi,
  deleteContractApi,
  batchDeleteContractsApi,
  fetchContract,
  fetchContracts,
  importContractsApi,
  updateContractApi,
} from '@/api/contracts'
import type { ContractListQuery } from '@/api/contracts'
import { fetchCustomers } from '@/api/customers'
import { fetchCustomerRequirements } from '@/api/customer-requirements'
import { fetchRooms } from '@/api/rooms'
import { fetchUsers } from '@/api/users'
import { fetchContractConfigs } from '@/api/contract-configs'
import type { ContractPeriodRecord, ContractRecord } from '@/types/contract'
import {
  CONTRACT_PAYMENT_CYCLES,
  CONTRACT_PERIOD_UNITS,
  CONTRACT_STATUSES,
} from '@/types/contract'
import type { ContractConfigOption } from '@/types/contract-config'
import { KEY_DEPOSIT_CODES } from '@/types/contract-config'
import type { CustomerRecord } from '@/types/customer'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import type { RoomRecord } from '@/types/room'
import type { UserRecord } from '@/types/user'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ContractDetailDrawer from '@/components/ContractDetailDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { contractStatusTone } from '@/constants/statusBadges'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useImportProgress } from '@/composables/useImportProgress'
import { useUserStore } from '@/stores/user'
import { formatDateTime, formatMoney } from '@/utils/format'
import {
  contractIoPayloadToImportItem,
  contractIoTemplateExampleRow,
  contractToIoRow,
  rowToContractIoPayload,
} from '@/utils/contractExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

const formVisible = ref(false)
const editing = ref<ContractRecord | null>(null)
const customers = ref<CustomerRecord[]>([])
const rooms = ref<RoomRecord[]>([])
const users = ref<UserRecord[]>([])
const customerRequirements = ref<CustomerRequirementRecord[]>([])
const periodTypeOptions = ref<ContractConfigOption[]>([])
const leaseTypeOptions = ref<ContractConfigOption[]>([])
const keyDepositOptions = ref<ContractConfigOption[]>([])
const keyword = ref('')

const doorKeyUnitPrice = computed(() => {
  const hit = keyDepositOptions.value.find((o) => o.code === KEY_DEPOSIT_CODES.door)
  return hit?.unitPrice ?? 0
})
const mailboxKeyUnitPrice = computed(() => {
  const hit = keyDepositOptions.value.find((o) => o.code === KEY_DEPOSIT_CODES.mailbox)
  return hit?.unitPrice ?? 0
})

const drawerVisible = ref(false)
const current = ref<ContractRecord | null>(null)
const contractDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
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
} = useTableSortFilter<ContractRecord>()

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
} = useServerPagedList<ContractRecord, ContractListQuery>({
  keyword,
  sortFilter: { filters, dateRanges, dateRangeOf, sortKey, sortOrder, clearAll },
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => {
    const start = range('startDate')
    const end = range('endDate')
    const created = range('createdAt')
    return {
      keyword: kw,
      statuses: f.status?.length ? [...f.status] : undefined,
      roomCodes: f.roomCode?.length ? [...f.roomCode] : undefined,
      customerNames: f.customerName?.length ? [...f.customerName] : undefined,
      salesManagers: f.salesManager?.length ? [...f.salesManager] : undefined,
      leaseTypes: f.leaseType?.length ? [...f.leaseType] : undefined,
      paymentCycles: f.paymentCycle?.length ? [...f.paymentCycle] : undefined,
      sortBy,
      sortDir,
      startDateFrom: start.from,
      startDateTo: start.to,
      endDateFrom: end.from,
      endDateTo: end.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchContracts,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<ContractRecord>()
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteContractsApi(chunk), setBatchProgress)
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
  CONTRACT_STATUSES.map((s) => ({
    value: s,
    label: t(`contract.status.${s}`),
  })),
)

const roomCodeFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const r of rooms.value) {
    const code = r.roomCode?.trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    opts.push({ value: code, label: code })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const c of customers.value) {
    const name = c.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const salesManagerFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const u of users.value) {
    const label = userLabel(u)
    if (!label || seen.has(label)) continue
    seen.add(label)
    opts.push({ value: label, label })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const leaseTypeFilterOptions = computed(() =>
  leaseTypeOptions.value
    .map((o) => o.label.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map((label) => ({ value: label, label })),
)

const paymentCycleFilterOptions = computed(() =>
  CONTRACT_PAYMENT_CYCLES.map((s) => ({
    value: s,
    label: s,
  })),
)

function userLabel(u: UserRecord) {
  return u.displayName?.trim() || u.account
}

const dialogWidth = computed(() => (isMobile.value ? '94%' : '900px'))

type PeriodFormRow = Pick<
  ContractPeriodRecord,
  'dateType' | 'dateUnit' | 'dateValue' | 'startDate' | 'endDate'
> & { uid: string }

function newPeriodUid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultPeriodRow(): PeriodFormRow {
  const first = periodTypeOptions.value[0]?.label || '使用期'
  return {
    uid: newPeriodUid(),
    dateType: first,
    dateUnit: '月',
    dateValue: 12,
    startDate: '',
    endDate: '',
  }
}

const periods = ref<PeriodFormRow[]>([defaultPeriodRow()])

const emptyForm = () => ({
  contractCode: '',
  roomId: '',
  customerId: '',
  salesManagerId: '' as string,
  requirementId: '' as string,
  startDate: '',
  endDate: '',
  actualEndDate: '',
  leaseType: '',
  status: CONTRACT_STATUSES[0],
  roomDeposit: null as number | null,
  monthlyRent: null as number | null,
  bookingDeposit: null as number | null,
  paymentCycle: CONTRACT_PAYMENT_CYCLES[0],
  electricityRate: null as number | null,
  miscDeposit: null as number | null,
  doorKeyQty: 0,
  mailboxKeyQty: 0,
  roomNameText: '',
  subleaseMark: '',
  attachment: '',
  remark: '',
})

const form = reactive(emptyForm())

const computedDoorKeyDeposit = computed(() =>
  Math.round((Number(form.doorKeyQty) || 0) * doorKeyUnitPrice.value * 100) / 100,
)
const computedMailboxKeyDeposit = computed(() =>
  Math.round((Number(form.mailboxKeyQty) || 0) * mailboxKeyUnitPrice.value * 100) / 100,
)

function roomOptionLabel(r: RoomRecord) {
  const parts = [r.roomCode]
  if (r.name?.trim()) parts.push(r.name)
  if (r.buildingName?.trim()) parts.push(r.buildingName)
  return parts.join(' · ')
}

const requirementSelectOptions = computed(() => {
  const cid = form.customerId.trim()
  if (!cid) return []
  const base = customerRequirements.value.filter((r) => r.customerId === cid)
  const currentId = form.requirementId.trim()
  if (currentId && !base.some((r) => r.id === currentId)) {
    const hit =
      editing.value?.requirementId === currentId
        ? editing.value
        : list.value.find((c) => c.requirementId === currentId)
    if (hit?.requirementCode) {
      return [
        {
          id: currentId,
          requirementCode: hit.requirementCode,
          customerId: cid,
        } as CustomerRequirementRecord,
        ...base,
      ]
    }
  }
  return base
})

async function loadRequirementsForCustomer(customerId: string) {
  if (!customerId.trim()) {
    customerRequirements.value = []
    return
  }
  try {
    const { data } = await fetchCustomerRequirements({ customerId })
    customerRequirements.value = data.items
  } catch {
    customerRequirements.value = []
  }
}

watch(
  () => form.customerId,
  async (cid, prev) => {
    if (cid !== prev) form.requirementId = ''
    await loadRequirementsForCustomer(cid)
  },
)

function onRoomSelectChange(roomId: string) {
  const room = rooms.value.find((r) => r.id === roomId)
  if (!room) return
  form.roomNameText = room.name || ''
  if (form.monthlyRent == null) form.monthlyRent = room.monthlyRent ?? null
  if (!form.subleaseMark.trim()) form.subleaseMark = room.subleaseMark || ''
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
  if (scope) {
    exportContractsXlsx(scope)
  }
}

function downloadImportTemplate() {
  const example = contractIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contracts')
  XLSX.writeFile(wb, 'contracts-import-template.xlsx')
  ElMessage.success(t('contract.templateDone'))
}

async function exportContractsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: ContractRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('contract.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('contract.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => contractToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `contracts-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('contract.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('contract.importFailed'))
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
    ElMessage.warning(t('contract.importAdminOnly'))
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
        message: t('contract.importEmpty'),
      })
      return
    }

    const items = []
    for (const row of rawRows) {
      const parsed = rowToContractIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              合約編號: String(row['合約編號'] ?? row['合约编号'] ?? ''),
              房間編號: String(row['房間編號'] ?? row['房间编号'] ?? row['房號'] ?? ''),
              客戶名稱: String(row['客戶名稱'] ?? row['客户名称'] ?? ''),
              客戶編號: String(row['客戶編號'] ?? row['客户编号'] ?? ''),
            },
          },
        ])
        continue
      }
      items.push(contractIoPayloadToImportItem(parsed))
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(items, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importContractsApi(batch)
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
              房間編號: it.roomCode || '',
              客戶編號: it.customerCode || '',
              客戶名稱: it.customerName || '',
            },
          })),
        )
      }
    }

    await loadList()
    finishImport()
  } catch {
    failImport(t('contract.importFailed'))
  }
}

async function loadOptions() {
  const [custRes, roomRes, userRes, periodRes, leaseRes, keyRes] = await Promise.all([
    fetchCustomers(),
    fetchRooms(),
    fetchUsers(),
    fetchContractConfigs({ type: 'periodType', activeOnly: true }),
    fetchContractConfigs({ type: 'leaseType', activeOnly: true }),
    fetchContractConfigs({ type: 'keyDeposit', activeOnly: true }),
  ])
  customers.value = custRes.data.items
  rooms.value = roomRes.data.items
  users.value = userRes.data.filter((u) => u.status === 'active')
  periodTypeOptions.value = periodRes.data
  leaseTypeOptions.value = leaseRes.data
  keyDepositOptions.value = keyRes.data
}

onMounted(() => {
  void loadList()
  void loadOptions()
})

function openCreate() {
  if (!isAdmin.value) return
  editing.value = null
  Object.assign(form, emptyForm())
  form.leaseType = leaseTypeOptions.value[0]?.label || ''
  periods.value = [defaultPeriodRow()]
  customerRequirements.value = []
  formVisible.value = true
}

function periodDurationLabel(p: PeriodFormRow): string {
  const n = Number(p.dateValue) || 0
  return `${n}${p.dateUnit === '日' ? t('contract.periodUnits.日') : t('contract.periodUnits.月')}`
}

function addPeriod() {
  periods.value.push(defaultPeriodRow())
}

function removePeriod(idx: number) {
  periods.value.splice(idx, 1)
  if (!periods.value.length) addPeriod()
}

const dragPeriodUid = ref<string | null>(null)
const dragOverPeriodUid = ref<string | null>(null)

function onPeriodDragStart(uid: string, e: DragEvent) {
  dragPeriodUid.value = uid
  e.dataTransfer?.setData('text/plain', uid)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onPeriodDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragPeriodUid.value && dragPeriodUid.value !== uid) {
    dragOverPeriodUid.value = uid
  }
}

function onPeriodDrop(targetUid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragPeriodUid.value || e.dataTransfer?.getData('text/plain')
  dragPeriodUid.value = null
  dragOverPeriodUid.value = null
  if (!fromUid || fromUid === targetUid) return
  const list = periods.value
  const fromIdx = list.findIndex((p) => p.uid === fromUid)
  const toIdx = list.findIndex((p) => p.uid === targetUid)
  if (fromIdx < 0 || toIdx < 0) return
  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)
}

function onPeriodDragEnd() {
  dragPeriodUid.value = null
  dragOverPeriodUid.value = null
}

async function openEdit(row: ContractRecord) {
  if (!isAdmin.value) return
  editing.value = row
  Object.assign(form, {
    contractCode: row.contractCode,
    roomId: row.roomId,
    customerId: row.customerId,
    salesManagerId: row.salesManagerId || '',
    requirementId: row.requirementId || '',
    startDate: row.startDate || '',
    endDate: row.endDate || '',
    actualEndDate: row.actualEndDate || '',
    leaseType: row.leaseType || leaseTypeOptions.value[0]?.label || '',
    status: row.status || CONTRACT_STATUSES[0],
    roomDeposit: row.roomDeposit,
    monthlyRent: row.monthlyRent,
    bookingDeposit: row.bookingDeposit,
    paymentCycle: row.paymentCycle || CONTRACT_PAYMENT_CYCLES[0],
    electricityRate: row.electricityRate,
    miscDeposit: row.miscDeposit,
    doorKeyQty: row.doorKeyQty ?? 0,
    mailboxKeyQty: row.mailboxKeyQty ?? 0,
    roomNameText: row.roomNameText || row.roomName || '',
    subleaseMark: row.subleaseMark || '',
    attachment: row.attachment || '',
    remark: row.remark || '',
  })
  periods.value = row.periods?.length
    ? row.periods.map((p) => ({
        uid: p.id || newPeriodUid(),
        dateType: p.dateType,
        dateUnit: p.dateUnit,
        dateValue: p.dateValue,
        startDate: p.startDate || '',
        endDate: p.endDate || '',
      }))
    : [defaultPeriodRow()]
  await loadRequirementsForCustomer(row.customerId)
  formVisible.value = true
}

function payloadFromForm() {
  return {
    contractCode: form.contractCode.trim() || undefined,
    roomId: form.roomId.trim(),
    customerId: form.customerId.trim(),
    salesManagerId: form.salesManagerId.trim() || null,
    requirementId: form.requirementId.trim() || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    actualEndDate: form.actualEndDate || null,
    leaseType: form.leaseType.trim() || undefined,
    status: form.status,
    roomDeposit: form.roomDeposit,
    monthlyRent: form.monthlyRent,
    bookingDeposit: form.bookingDeposit,
    paymentCycle: form.paymentCycle.trim() || undefined,
    electricityRate: form.electricityRate,
    miscDeposit: form.miscDeposit,
    doorKeyQty: form.doorKeyQty,
    mailboxKeyQty: form.mailboxKeyQty,
    roomNameText: form.roomNameText.trim(),
    subleaseMark: form.subleaseMark.trim(),
    attachment: form.attachment.trim(),
    remark: form.remark.trim(),
    periods: periods.value
      .filter((p) => p.startDate && p.endDate)
      .map((p, i) => ({
        dateType: p.dateType,
        dateUnit: p.dateUnit,
        dateValue: Number(p.dateValue) || 0,
        startDate: p.startDate,
        endDate: p.endDate,
        sortOrder: i,
      })),
  }
}

async function saveForm() {
  if (!form.roomId.trim()) {
    ElMessage.warning(t('contract.roomRequired'))
    return
  }
  if (!form.customerId.trim()) {
    ElMessage.warning(t('contract.customerRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateContractApi(editing.value.id, payload)
      ElMessage.success(t('contract.updated'))
    } else {
      await createContractApi(payload)
      ElMessage.success(t('contract.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: ContractRecord) {
  if (!isAdmin.value) return
  try {
    await ElMessageBox.confirm(
      t('contract.deleteConfirm', { code: row.contractCode }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteContractApi(row.id)
    ElMessage.success(t('contract.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

function statusLabel(status: string) {
  const key = `contract.status.${status}`
  return t(key) === key ? status : t(key)
}

async function openDetail(row: ContractRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchContract(row.id)
    current.value = data
    contractDrawerDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: ContractRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  void openDetail(row, 'rtl')
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
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.contracts') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('contract.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('contract.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('contract.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('contract.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('contract.downloadTemplate') }}</span>
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
          empty-text="—"
          style="width: 100%"
          class="contract-table--clickable"
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
            :min-width="codeColW(t('contract.fields.contractCode'), { interactive: true, samples: list.map((r) => r.contractCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.contractCode')"
                sortable
                :sort-order="sortOrderOf('contractCode')"
                @update:sort-order="(v) => setSort('contractCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.contractCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('contract.fields.roomCode'), { interactive: true, samples: list.map((r) => r.roomCode) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.roomCode')"
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
                @click.stop="openRoomSide(row.roomId)"
              >
                {{ row.roomCode || '—' }}
              </button>
              <span v-else>{{ row.roomCode || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('contract.fields.customerName'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.customerName')"
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
                @click.stop="openCustomerSide(row.customerId)"
              >
                {{ row.customerName || '—' }}
              </button>
              <span v-else>{{ row.customerName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.salesManager'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.salesManager')"
                filterable
                sortable
                :options="salesManagerFilterOptions"
                :model-value="filters.salesManager || []"
                :sort-order="sortOrderOf('salesManager')"
                @update:model-value="(v) => setFilter('salesManager', v)"
                @update:sort-order="(v) => setSort('salesManager', v)"
              />
            </template>
            <template #default="{ row }">{{ row.salesManager || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.startDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.startDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('startDate')"
                :date-range-value="dateRangeOf('startDate')"
                @update:sort-order="(v) => setSort('startDate', v)"
                @update:date-range-value="(v) => setDateRange('startDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.startDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.endDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.endDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('endDate')"
                :date-range-value="dateRangeOf('endDate')"
                @update:sort-order="(v) => setSort('endDate', v)"
                @update:date-range-value="(v) => setDateRange('endDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.endDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('contract.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.status')"
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
                :tone="contractStatusTone(row.status)"
                :label="statusLabel(row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.leaseType'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.leaseType')"
                filterable
                sortable
                :options="leaseTypeFilterOptions"
                :model-value="filters.leaseType || []"
                :sort-order="sortOrderOf('leaseType')"
                @update:model-value="(v) => setFilter('leaseType', v)"
                @update:sort-order="(v) => setSort('leaseType', v)"
              />
            </template>
            <template #default="{ row }">{{ row.leaseType || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.monthlyRent'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.monthlyRent')"
                sortable
                :sort-order="sortOrderOf('monthlyRent')"
                @update:sort-order="(v) => setSort('monthlyRent', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.monthlyRent == null ? '—' : formatMoney(row.monthlyRent) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.paymentCycle'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.paymentCycle')"
                filterable
                sortable
                :options="paymentCycleFilterOptions"
                :model-value="filters.paymentCycle || []"
                :sort-order="sortOrderOf('paymentCycle')"
                @update:model-value="(v) => setFilter('paymentCycle', v)"
                @update:sort-order="(v) => setSort('paymentCycle', v)"
              />
            </template>
            <template #default="{ row }">{{ row.paymentCycle || '—' }}</template>
          </el-table-column>
          <el-table-column
            prop="createdBy"
            :label="t('common.createdBy')"
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          />
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
                  @click="openEdit(row as ContractRecord)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onDelete(row as ContractRecord)"
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

    <ContractDetailDrawer
      v-model="drawerVisible"
      :contract="current"
      :desktop-direction="contractDrawerDirection"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-building="openBuildingSide"
      @open-requirement="openRequirementSide"
    />
    <RelatedEntityDrawers ref="relationDrawers" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('contract.edit') : t('contract.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <section class="form-section">
          <h3>{{ t('contract.sections.basic') }}</h3>
          <div class="form-grid">
            <el-form-item :label="t('contract.fields.contractCode')">
              <el-input
                v-model="form.contractCode"
                :placeholder="t('contract.codeAutoHint')"
                :disabled="!!editing"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.roomCode')" required>
              <el-select
                v-model="form.roomId"
                filterable
                fit-input-width
                style="width: 100%"
                :placeholder="t('contract.fields.roomCode')"
                @change="onRoomSelectChange"
              >
                <el-option
                  v-for="r in rooms"
                  :key="r.id"
                  :label="roomOptionLabel(r)"
                  :value="r.id"
                  :title="roomOptionLabel(r)"
                >
                  <span class="select-option-ellipsis" :title="roomOptionLabel(r)">
                    {{ roomOptionLabel(r) }}
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.customerName')" required>
              <el-select
                v-model="form.customerId"
                filterable
                fit-input-width
                style="width: 100%"
                :placeholder="t('contract.fields.customerName')"
              >
                <el-option
                  v-for="c in customers"
                  :key="c.id"
                  :label="`${c.customerCode} · ${c.name}`"
                  :value="c.id"
                  :title="`${c.customerCode} · ${c.name}`"
                >
                  <span class="select-option-ellipsis" :title="`${c.customerCode} · ${c.name}`">
                    {{ c.customerCode }} · {{ c.name }}
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.salesManager')">
              <el-select
                v-model="form.salesManagerId"
                filterable
                clearable
                style="width: 100%"
                :placeholder="t('contract.fields.salesManager')"
              >
                <el-option v-for="u in users" :key="u.id" :label="userLabel(u)" :value="u.id" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.requirementCode')">
              <el-select
                v-model="form.requirementId"
                filterable
                clearable
                style="width: 100%"
                :disabled="!form.customerId"
                :placeholder="t('contract.fields.requirementCode')"
              >
                <el-option
                  v-for="req in requirementSelectOptions"
                  :key="req.id"
                  :label="req.requirementCode"
                  :value="req.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.startDate')">
              <el-date-picker
                v-model="form.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.endDate')">
              <el-date-picker
                v-model="form.endDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.actualEndDate')">
              <el-date-picker
                v-model="form.actualEndDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.leaseType')">
              <el-select v-model="form.leaseType" filterable style="width: 100%">
                <el-option
                  v-for="lt in leaseTypeOptions"
                  :key="lt.id"
                  :label="lt.label"
                  :value="lt.label"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.status')">
              <el-select v-model="form.status" style="width: 100%">
                <el-option
                  v-for="s in CONTRACT_STATUSES"
                  :key="s"
                  :label="t(`contract.status.${s}`)"
                  :value="s"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('contract.fields.roomNameText')">
              <el-input v-model="form.roomNameText" />
            </el-form-item>
            <el-form-item :label="t('contract.fields.subleaseMark')">
              <el-input v-model="form.subleaseMark" />
            </el-form-item>
          </div>
        </section>

        <section class="form-section form-section--periods">
          <div class="period-section-head">
            <h3>{{ t('contract.sections.periods') }}</h3>
            <el-button
              type="primary"
              size="small"
              plain
              :icon="Plus"
              class="period-add-btn"
              @click="addPeriod"
            >
              {{ t('contract.addPeriod') }}
            </el-button>
          </div>
          <div class="period-table-wrap">
            <div class="period-table" role="table">
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
                <div class="period-table__cell period-table__cell--type" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.dateType') }}
                </div>
                <div class="period-table__cell period-table__cell--unit" role="columnheader">
                  {{ t('contract.fields.dateUnit') }}
                </div>
                <div class="period-table__cell period-table__cell--value" role="columnheader">
                  {{ t('contract.fields.dateValue') }}
                </div>
                <div class="period-table__cell period-table__cell--duration" role="columnheader">
                  {{ t('contract.fields.duration') }}
                </div>
                <div class="period-table__cell period-table__cell--start" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.periodStart') }}
                </div>
                <div class="period-table__cell period-table__cell--to" role="columnheader"></div>
                <div class="period-table__cell period-table__cell--end" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.periodEnd') }}
                </div>
                <div class="period-table__cell period-table__cell--actions" role="columnheader"></div>
              </div>
              <div
                v-for="(p, idx) in periods"
                :key="p.uid"
                class="period-table__row"
                role="row"
                :class="{
                  'is-dragging': dragPeriodUid === p.uid,
                  'is-drag-over': dragOverPeriodUid === p.uid,
                }"
                @dragover="onPeriodDragOver(p.uid, $event)"
                @drop="onPeriodDrop(p.uid, $event)"
                @dragleave="dragOverPeriodUid === p.uid && (dragOverPeriodUid = null)"
              >
                <div class="period-table__cell period-table__cell--index" role="cell">
                  <button
                    type="button"
                    class="period-row__handle"
                    draggable="true"
                    :title="t('contract.dragPeriod')"
                    aria-label="drag"
                    @dragstart="onPeriodDragStart(p.uid, $event)"
                    @dragend="onPeriodDragEnd"
                  >
                    <el-icon :size="14"><Rank /></el-icon>
                  </button>
                  <span class="period-row__index">{{ idx + 1 }}</span>
                </div>
                <div class="period-table__cell period-table__cell--type" role="cell">
                  <el-select v-model="p.dateType" style="width: 100%">
                    <el-option
                      v-for="pt in periodTypeOptions"
                      :key="pt.id"
                      :label="pt.label"
                      :value="pt.label"
                    />
                  </el-select>
                </div>
                <div class="period-table__cell period-table__cell--unit" role="cell">
                  <el-select v-model="p.dateUnit" style="width: 100%">
                    <el-option
                      v-for="u in CONTRACT_PERIOD_UNITS"
                      :key="u"
                      :label="t(`contract.periodUnits.${u}`)"
                      :value="u"
                    />
                  </el-select>
                </div>
                <div class="period-table__cell period-table__cell--value" role="cell">
                  <el-input-number
                    v-model="p.dateValue"
                    :min="0"
                    :controls="false"
                    style="width: 100%"
                  />
                </div>
                <div class="period-table__cell period-table__cell--duration" role="cell">
                  <span class="period-row__duration">{{ periodDurationLabel(p) }}</span>
                </div>
                <div class="period-table__cell period-table__cell--start" role="cell">
                  <el-date-picker
                    v-model="p.startDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    :placeholder="t('contract.fields.periodStart')"
                    style="width: 100%"
                  />
                </div>
                <div class="period-table__cell period-table__cell--to" role="cell">
                  <span class="period-row__to">至</span>
                </div>
                <div class="period-table__cell period-table__cell--end" role="cell">
                  <el-date-picker
                    v-model="p.endDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    :placeholder="t('contract.fields.periodEnd')"
                    style="width: 100%"
                  />
                </div>
                <div class="period-table__cell period-table__cell--actions" role="cell">
                  <el-button type="danger" link :icon="Delete" @click="removePeriod(idx)" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('contract.sections.finance') }}</h3>
          <div class="form-grid">
            <el-form-item :label="t('contract.fields.monthlyRent')">
              <el-input-number
                v-model="form.monthlyRent"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.roomDeposit')">
              <el-input-number
                v-model="form.roomDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.bookingDeposit')">
              <el-input-number
                v-model="form.bookingDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.miscDeposit')">
              <el-input-number
                v-model="form.miscDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.doorKeyQty')">
              <div class="key-deposit-field">
                <el-input-number
                  v-model="form.doorKeyQty"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
                <p class="key-deposit-field__hint">
                  {{ t('contract.fields.keyDepositHint') }}：
                  {{ formatMoney(computedDoorKeyDeposit) }}
                  <span v-if="doorKeyUnitPrice">（{{ formatMoney(doorKeyUnitPrice) }}/把）</span>
                </p>
              </div>
            </el-form-item>
            <el-form-item :label="t('contract.fields.mailboxKeyQty')">
              <div class="key-deposit-field">
                <el-input-number
                  v-model="form.mailboxKeyQty"
                  :min="0"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
                <p class="key-deposit-field__hint">
                  {{ t('contract.fields.keyDepositHint') }}：
                  {{ formatMoney(computedMailboxKeyDeposit) }}
                  <span v-if="mailboxKeyUnitPrice">（{{ formatMoney(mailboxKeyUnitPrice) }}/把）</span>
                </p>
              </div>
            </el-form-item>
            <el-form-item :label="t('contract.fields.electricityRate')">
              <el-input-number
                v-model="form.electricityRate"
                :min="0"
                :precision="4"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.paymentCycle')">
              <el-select
                v-model="form.paymentCycle"
                filterable
                allow-create
                default-first-option
                style="width: 100%"
              >
                <el-option
                  v-for="pc in CONTRACT_PAYMENT_CYCLES"
                  :key="pc"
                  :label="pc"
                  :value="pc"
                />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('contract.sections.extra') }}</h3>
          <el-form-item :label="t('contract.fields.attachment')">
            <el-input
              v-model="form.attachment"
              class="path-input"
              readonly
              placeholder="/upload/..."
            />
          </el-form-item>
          <el-form-item :label="t('contract.fields.remark')">
            <el-input v-model="form.remark" type="textarea" :rows="3" />
          </el-form-item>
        </section>

        <AuditDetailSection
          v-if="editing"
          :created-by="editing.createdBy"
          :created-at="editing.createdAt"
          :updated-by="editing.updatedBy"
          :updated-at="editing.updatedAt"
        />
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

.contract-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
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

.period-section-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.period-section-head h3 {
  margin: 0;
}

.period-add-btn {
  --el-button-bg-color: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  --el-button-border-color: color-mix(in srgb, var(--lb-brand) 35%, #fff);
  --el-button-text-color: var(--lb-brand);
  --el-button-hover-bg-color: color-mix(in srgb, var(--lb-brand) 18%, #fff);
  --el-button-hover-border-color: var(--lb-brand);
  --el-button-hover-text-color: var(--lb-brand);
  font-weight: 600;
  border-radius: 999px;
  padding: 4px 12px;
  height: 26px;
}

.form-section--periods {
  margin-bottom: 14px;
  padding-bottom: 6px;
}

.period-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e4ebe6;
  border-radius: 8px;
  background: #fff;
}

.period-table {
  display: grid;
  min-width: 780px;
}

.period-table__head,
.period-table__row {
  display: grid;
  grid-template-columns:
    52px
    minmax(118px, 1.2fr)
    72px
    72px
    72px
    minmax(128px, 1fr)
    28px
    minmax(128px, 1fr)
    40px;
  align-items: center;
  column-gap: 6px;
  padding: 0 8px;
}

.period-table__head {
  min-height: 34px;
  background: #f4f7f5;
  border-bottom: 1px solid #e4ebe6;
  color: #3d4f45;
  font-size: 0.78rem;
  font-weight: 700;
}

.period-table__row {
  min-height: 40px;
  border-bottom: 1px solid #edf2ef;
  transition: background 0.12s ease, box-shadow 0.12s ease;
}

.period-table__row:last-child {
  border-bottom: none;
}

.period-table__row.is-dragging {
  opacity: 0.45;
}

.period-table__row.is-drag-over {
  background: color-mix(in srgb, var(--lb-brand) 6%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand) 35%, #fff);
}

.period-table__cell {
  display: flex;
  align-items: center;
  min-width: 0;
}

.period-table__cell--index {
  gap: 2px;
  justify-content: flex-start;
}

.period-table__cell--to,
.period-table__cell--actions,
.period-table__cell--duration {
  justify-content: center;
}

.period-table__head .req {
  color: #e35d5d;
  margin-right: 2px;
}

.period-row__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #8a9590;
  cursor: grab;
  flex: 0 0 auto;
}

.period-row__handle:hover {
  background: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  color: var(--lb-brand);
}

.period-row__handle:active {
  cursor: grabbing;
}

.period-row__index {
  flex: 0 0 auto;
  min-width: 0.9rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #5a6b62;
}

.period-row__duration {
  color: var(--lb-muted);
  font-size: 0.8rem;
  white-space: nowrap;
}

.period-row__to {
  color: #8a9590;
  font-size: 0.8rem;
}

.period-table__row :deep(.el-input__wrapper),
.period-table__row :deep(.el-select__wrapper) {
  min-height: 30px;
  box-shadow: 0 0 0 1px #dbe4df inset;
}

.period-table__row :deep(.el-input-number) {
  width: 100%;
}

.period-table__row :deep(.el-input-number .el-input__wrapper) {
  padding-left: 8px;
  padding-right: 8px;
}

.period-table__row :deep(.el-date-editor.el-input) {
  width: 100%;
}

.key-deposit-field {
  width: 100%;
}

.key-deposit-field__hint {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--lb-muted);
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
