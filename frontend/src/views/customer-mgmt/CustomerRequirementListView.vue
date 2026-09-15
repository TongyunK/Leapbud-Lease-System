<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createCustomerRequirementApi,
  deleteCustomerRequirementApi,
  batchDeleteCustomerRequirementsApi,
  fetchCustomerRequirement,
  fetchCustomerRequirements,
  importCustomerRequirementsApi,
  updateCustomerRequirementApi,
} from '@/api/customer-requirements'
import type { CustomerRequirementImportItem, CustomerRequirementListQuery } from '@/api/customer-requirements'
import { fetchCustomer, fetchCustomers } from '@/api/customers'
import { fetchRoomConfigs } from '@/api/room-configs'
import { fetchUsers } from '@/api/users'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import { CUSTOMER_REQUIREMENT_STATUSES } from '@/types/customer-requirement'
import type { CustomerRecord, OccupantRecord } from '@/types/customer'
import type { RoomConfigOption } from '@/types/room-config'
import type { UserRecord } from '@/types/user'
import type { BuildingRecord } from '@/types/building'
import type { RoomRecord } from '@/types/room'
import { fetchBuildings } from '@/api/buildings'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CustomerRequirementDetailDrawer from '@/components/CustomerRequirementDetailDrawer.vue'
import CustomerDetailDrawer from '@/components/CustomerDetailDrawer.vue'
import RelatedOccupantsDrawer from '@/components/RelatedOccupantsDrawer.vue'
import RelatedCustomerRequirementsDrawer from '@/components/RelatedCustomerRequirementsDrawer.vue'
import OccupantDetailDrawer from '@/components/OccupantDetailDrawer.vue'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'
import RoomDetailDrawer from '@/components/RoomDetailDrawer.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { customerRequirementStatusTone } from '@/constants/statusBadges'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useUserStore } from '@/stores/user'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime, formatMoney } from '@/utils/format'
import {
  customerRequirementIoTemplateExampleRow,
  customerRequirementToIoRow,
  rowToCustomerRequirementIoPayload,
} from '@/utils/customerRequirementExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const formVisible = ref(false)
const editing = ref<CustomerRequirementRecord | null>(null)
const customers = ref<CustomerRecord[]>([])
const users = ref<UserRecord[]>([])
const sizeOptions = ref<RoomConfigOption[]>([])
const acOptions = ref<RoomConfigOption[]>([])
const windowOptions = ref<RoomConfigOption[]>([])
const keyword = ref('')

const drawerVisible = ref(false)
const current = ref<CustomerRequirementRecord | null>(null)
const customerDrawerVisible = ref(false)
const relatedCustomer = ref<CustomerRecord | null>(null)
const relatedOccupantsListDrawer = ref(false)
const relatedOccupantDrawer = ref(false)
const relatedOccupant = ref<OccupantRecord | null>(null)
const relatedRequirementsListDrawer = ref(false)
const relatedRequirementDrawer = ref(false)
const relatedRequirement = ref<CustomerRequirementRecord | null>(null)
const buildingDrawerVisible = ref(false)
const relatedBuilding = ref<BuildingRecord | null>(null)
const relatedRoomsDrawer = ref(false)
const relatedRoomsBuilding = ref<BuildingRecord | null>(null)
const relatedRoomDrawer = ref(false)
const relatedRoom = ref<RoomRecord | null>(null)
const buildings = ref<BuildingRecord[]>([])
const customerDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
const requirementDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
const occupantDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

function userOptionLabel(u: UserRecord) {
  const name = u.displayName?.trim()
  return name || u.account
}

const sortFilter = useTableSortFilter<CustomerRequirementRecord>()
const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  sortOrderOf,
  activeConditionCount,
  sortKey,
  sortOrder,
  dateRanges,
} = sortFilter

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
} = useServerPagedList<CustomerRequirementRecord, CustomerRequirementListQuery>({
  keyword,
  sortFilter,
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => ({
    keyword: kw,
    statuses: f.status?.length ? [...f.status] : undefined,
    customerNames: f.customerName?.length ? [...f.customerName] : undefined,
    salesManagers: f.salesManager?.length ? [...f.salesManager] : undefined,
    sizeConfigLabels: f.sizeConfigLabel?.length ? [...f.sizeConfigLabel] : undefined,
    acConfigLabels: f.acConfigLabel?.length ? [...f.acConfigLabel] : undefined,
    windowConfigLabels: f.windowConfigLabel?.length ? [...f.windowConfigLabel] : undefined,
    sortBy,
    sortDir,
    requirementDateFrom: range('requirementDate').from,
    requirementDateTo: range('requirementDate').to,
    createdAtFrom: range('createdAt').from,
    createdAtTo: range('createdAt').to,
    page: p,
    pageSize: ps,
  }),
  fetchPage: fetchCustomerRequirements,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<CustomerRequirementRecord>()
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteCustomerRequirementsApi(chunk), setBatchProgress)
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
  CUSTOMER_REQUIREMENT_STATUSES.map((s) => ({
    value: s,
    label: t(`customerRequirement.status.${s}`),
  })),
)

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
    const label = userOptionLabel(u)
    if (!label || seen.has(label)) continue
    seen.add(label)
    opts.push({ value: label, label })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const sizeConfigFilterOptions = computed(() =>
  sizeOptions.value
    .map((o) => ({ value: o.label, label: o.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant')),
)
const acConfigFilterOptions = computed(() =>
  acOptions.value
    .map((o) => ({ value: o.label, label: o.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant')),
)
const windowConfigFilterOptions = computed(() =>
  windowOptions.value
    .map((o) => ({ value: o.label, label: o.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant')),
)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '640px'))

function todayIso() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const form = reactive({
  requirementCode: '',
  customerId: '',
  salesManagerId: '' as string,
  requirementDate: todayIso(),
  status: '跟進中',
  leaseDuration: '',
  budget: null as number | null,
  content: '',
  remark: '',
  attachment: '',
  sizeConfigId: '' as string,
  acConfigId: '' as string,
  windowConfigId: '' as string,
})

async function loadOptions() {
  const [custRes, userRes, confRes, buildingsRes] = await Promise.all([
    fetchCustomers(),
    fetchUsers(),
    fetchRoomConfigs({ activeOnly: true }),
    fetchBuildings({ activeOnly: false }),
  ])
  customers.value = custRes.data.items
  users.value = userRes.data.filter((u) => u.status === 'active')
  buildings.value = buildingsRes.data.items
  const configs = confRes.data
  sizeOptions.value = configs.filter((c) => c.type === 'size')
  acOptions.value = configs.filter((c) => c.type === 'ac')
  windowOptions.value = configs.filter((c) => c.type === 'window')
}

onMounted(() => {
  void loadList()
  void loadOptions()
})

function openCreate() {
  if (!isAdmin.value) return
  editing.value = null
  Object.assign(form, {
    requirementCode: '',
    customerId: '',
    salesManagerId: '',
    requirementDate: todayIso(),
    status: '跟進中',
    leaseDuration: '',
    budget: null,
    content: '',
    remark: '',
    attachment: '',
    sizeConfigId: '',
    acConfigId: '',
    windowConfigId: '',
  })
  formVisible.value = true
}

function openEdit(row: CustomerRequirementRecord) {
  if (!isAdmin.value) return
  editing.value = row
  Object.assign(form, {
    requirementCode: row.requirementCode,
    customerId: row.customerId,
    salesManagerId: row.salesManagerId || '',
    requirementDate: row.requirementDate || todayIso(),
    status: row.status || '跟進中',
    leaseDuration: row.leaseDuration || '',
    budget: row.budget,
    content: row.content || '',
    remark: row.remark || '',
    attachment: row.attachment || '',
    sizeConfigId: row.sizeConfigId || '',
    acConfigId: row.acConfigId || '',
    windowConfigId: row.windowConfigId || '',
  })
  formVisible.value = true
}

function payloadFromForm() {
  return {
    requirementCode: form.requirementCode.trim() || undefined,
    customerId: form.customerId.trim(),
    salesManagerId: form.salesManagerId.trim() || null,
    requirementDate: form.requirementDate || null,
    status: form.status,
    leaseDuration: form.leaseDuration.trim(),
    budget: form.budget,
    content: form.content.trim(),
    remark: form.remark.trim(),
    attachment: form.attachment.trim(),
    sizeConfigId: form.sizeConfigId.trim() || null,
    acConfigId: form.acConfigId.trim() || null,
    windowConfigId: form.windowConfigId.trim() || null,
  }
}

async function saveForm() {
  if (!form.customerId.trim()) {
    ElMessage.warning(t('customerRequirement.customerRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateCustomerRequirementApi(editing.value.id, payload)
      ElMessage.success(t('customerRequirement.updated'))
    } else {
      await createCustomerRequirementApi(payload)
      ElMessage.success(t('customerRequirement.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: CustomerRequirementRecord) {
  if (!isAdmin.value) return
  try {
    await ElMessageBox.confirm(
      t('customerRequirement.deleteConfirm', { code: row.requirementCode }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteCustomerRequirementApi(row.id)
    ElMessage.success(t('customerRequirement.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

function statusLabel(status: string) {
  const key = `customerRequirement.status.${status}`
  return t(key) === key ? status : t(key)
}

function userLabel(u: UserRecord) {
  return u.displayName?.trim() || u.account
}

async function openDetail(row: CustomerRequirementRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchCustomerRequirement(row.id)
    current.value = data
    requirementDrawerDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: CustomerRequirementRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
  void openDetail(row, 'rtl')
}

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  if (!customerId) return
  try {
    const { data } = await fetchCustomer(customerId)
    relatedCustomer.value = data
    customerDrawerDirection.value = direction
    customerDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openOccupantsSide(row: CustomerRecord) {
  if (!row.occupantCount) return
  relatedCustomer.value = row
  relatedOccupantsListDrawer.value = true
}

function openRequirementsSide(row: CustomerRecord) {
  if (!row.requirementCount) return
  relatedCustomer.value = row
  relatedRequirementsListDrawer.value = true
}

function onOpenOccupantFromCustomer(occupant: OccupantRecord) {
  relatedOccupant.value = occupant
  occupantDrawerDirection.value = 'ltr'
  relatedOccupantDrawer.value = true
}

function onOpenRequirementFromList(requirement: CustomerRequirementRecord) {
  relatedRequirement.value = requirement
  relatedRequirementDrawer.value = true
}

function openBuildingSide(buildingId?: string | null) {
  if (!buildingId) return
  const building = buildings.value.find((b) => b.id === buildingId) || null
  if (!building) {
    ElMessage.warning(t('building.notFound'))
    return
  }
  relatedBuilding.value = building
  buildingDrawerVisible.value = true
}

function openRoomsSide(row: BuildingRecord) {
  if (!row.roomIds?.length) return
  relatedRoomsBuilding.value = row
  relatedRoomsDrawer.value = true
}

function onOpenRoomFromList(room: RoomRecord) {
  relatedRoom.value = room
  relatedRoomDrawer.value = true
}

async function openCustomerFromOccupant(customerId: string) {
  await openCustomerSide(customerId, 'ltr')
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
    exportRequirementsXlsx(scope)
  }
}

function downloadImportTemplate() {
  const example = customerRequirementIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Requirements')
  XLSX.writeFile(wb, 'customer-requirements-import-template.xlsx')
  ElMessage.success(t('customerRequirement.templateDone'))
}

async function exportRequirementsXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: CustomerRequirementRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('customerRequirement.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('customerRequirement.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => customerRequirementToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Requirements')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `customer-requirements-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('customerRequirement.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('customerRequirement.importFailed'))
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
    ElMessage.warning(t('customerRequirement.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'updated', 'skipped', 'unlinked', 'failed'],
  })
  try {
    setImportPreparing()
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rawRows.length) {
      finishImport({
        tone: 'warning',
        message: t('customerRequirement.importEmpty'),
      })
      return
    }

    const payloads: CustomerRequirementImportItem[] = []
    for (const row of rawRows) {
      const parsed = rowToCustomerRequirementIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              需求編號: String(row['需求編號'] ?? row['需求编号'] ?? ''),
              客戶編號: String(row['客戶編號'] ?? row['客户编号'] ?? ''),
              客戶名稱: String(row['客戶名稱'] ?? row['客户名称'] ?? row['公司名稱'] ?? row['公司名称'] ?? ''),
            },
          },
        ])
        continue
      }
      payloads.push({
        requirementCode: parsed.requirementCode || undefined,
        customerCode: parsed.customerCode || undefined,
        customerName: parsed.customerName || undefined,
        salesManager: parsed.salesManager || undefined,
        requirementDate: parsed.requirementDate || null,
        status: parsed.status,
        leaseDuration: parsed.leaseDuration,
        budget: parsed.budget,
        content: parsed.content,
        remark: parsed.remark,
        attachment: parsed.attachment,
        sizeConfig: parsed.sizeConfig || undefined,
        acConfig: parsed.acConfig || undefined,
        windowConfig: parsed.windowConfig || undefined,
      })
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(payloads, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importCustomerRequirementsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.updated) bumpImport('updated', data.updated)
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
              需求編號: it.requirementCode || '',
              客戶編號: it.customerCode || '',
              客戶名稱: it.customerName || '',
            },
          })),
        )
      }
    }

    await loadList()
    resetPage()
    finishImport()
  } catch {
    failImport(t('customerRequirement.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.customerRequirements') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('customerRequirement.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('customerRequirement.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('customerRequirement.dataIo')" :loading="importing || exporting">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('customerRequirement.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('customerRequirement.downloadTemplate') }}</span>
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

    <div class="table-card" v-loading="loading || importing">
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
          class="requirement-table--clickable"
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
            :min-width="codeColW(t('customerRequirement.fields.requirementCode'), { interactive: true, samples: list.map((r) => r.requirementCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.requirementCode')"
                sortable
                :sort-order="sortOrderOf('requirementCode')"
                @update:sort-order="(v) => setSort('requirementCode', v)"
              />
            </template>
            <template #default="{ row }">{{ row.requirementCode }}</template>
          </el-table-column>
          <el-table-column
            :min-width="textColW(t('customerRequirement.fields.customerName'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.customerName')"
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
            :min-width="colW(t('customerRequirement.fields.salesManager'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.salesManager')"
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
            :min-width="colW(t('customerRequirement.fields.requirementDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.requirementDate')"
                sortable
                date-range
                :sort-order="sortOrderOf('requirementDate')"
                :date-range-value="dateRangeOf('requirementDate')"
                @update:sort-order="(v) => setSort('requirementDate', v)"
                @update:date-range-value="(v) => setDateRange('requirementDate', v)"
              />
            </template>
            <template #default="{ row }">{{ row.requirementDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('customerRequirement.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.status')"
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
                :tone="customerRequirementStatusTone(row.status)"
                :label="statusLabel(row.status)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.leaseDuration'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.leaseDuration')"
                sortable
                :sort-order="sortOrderOf('leaseDuration')"
                @update:sort-order="(v) => setSort('leaseDuration', v)"
              />
            </template>
            <template #default="{ row }">{{ row.leaseDuration || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.budget'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.budget')"
                sortable
                :sort-order="sortOrderOf('budget')"
                @update:sort-order="(v) => setSort('budget', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.budget == null ? '—' : formatMoney(row.budget) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.sizeConfig'), { interactive: true, contentMin: 100 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.sizeConfig')"
                filterable
                sortable
                :options="sizeConfigFilterOptions"
                :model-value="filters.sizeConfigLabel || []"
                :sort-order="sortOrderOf('sizeConfigLabel')"
                @update:model-value="(v) => setFilter('sizeConfigLabel', v)"
                @update:sort-order="(v) => setSort('sizeConfigLabel', v)"
              />
            </template>
            <template #default="{ row }">{{ row.sizeConfigLabel || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.acConfig'), { interactive: true, contentMin: 90 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.acConfig')"
                filterable
                sortable
                :options="acConfigFilterOptions"
                :model-value="filters.acConfigLabel || []"
                :sort-order="sortOrderOf('acConfigLabel')"
                @update:model-value="(v) => setFilter('acConfigLabel', v)"
                @update:sort-order="(v) => setSort('acConfigLabel', v)"
              />
            </template>
            <template #default="{ row }">{{ row.acConfigLabel || '—' }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customerRequirement.fields.windowConfig'), { interactive: true, contentMin: 90 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customerRequirement.fields.windowConfig')"
                filterable
                sortable
                :options="windowConfigFilterOptions"
                :model-value="filters.windowConfigLabel || []"
                :sort-order="sortOrderOf('windowConfigLabel')"
                @update:model-value="(v) => setFilter('windowConfigLabel', v)"
                @update:sort-order="(v) => setSort('windowConfigLabel', v)"
              />
            </template>
            <template #default="{ row }">{{ row.windowConfigLabel || '—' }}</template>
          </el-table-column>
          <el-table-column
            prop="content"
            :label="t('customerRequirement.fields.content')"
            :min-width="textColW(t('customerRequirement.fields.content'), { kind: 'long' })"
            show-overflow-tooltip
          />
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
                  @click="openEdit(row as CustomerRequirementRecord)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--danger"
                  @click="onDelete(row as CustomerRequirementRecord)"
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

    <CustomerRequirementDetailDrawer
      v-model="drawerVisible"
      :requirement="current"
      :desktop-direction="requirementDrawerDirection"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
    />
    <CustomerDetailDrawer
      v-model="customerDrawerVisible"
      :customer="relatedCustomer"
      :desktop-direction="customerDrawerDirection"
      @open-occupants="openOccupantsSide"
      @open-requirements="openRequirementsSide"
      @open-building="openBuildingSide"
    />
    <RelatedOccupantsDrawer
      v-model="relatedOccupantsListDrawer"
      :customer="relatedCustomer"
      desktop-direction="ltr"
      @open-occupant="onOpenOccupantFromCustomer"
    />
    <RelatedCustomerRequirementsDrawer
      v-model="relatedRequirementsListDrawer"
      :customer="relatedCustomer"
      desktop-direction="ltr"
      @open-requirement="onOpenRequirementFromList"
    />
    <CustomerRequirementDetailDrawer
      v-model="relatedRequirementDrawer"
      :requirement="relatedRequirement"
      desktop-direction="ltr"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
    />
    <OccupantDetailDrawer
      v-model="relatedOccupantDrawer"
      :occupant="relatedOccupant"
      :desktop-direction="occupantDrawerDirection"
      @open-customer="openCustomerFromOccupant"
    />
    <BuildingDetailDrawer
      v-model="buildingDrawerVisible"
      :building="relatedBuilding"
      desktop-direction="ltr"
      @open-rooms="openRoomsSide"
    />
    <RelatedRoomsDrawer
      v-model="relatedRoomsDrawer"
      :building="relatedRoomsBuilding"
      desktop-direction="ltr"
      @open-room="onOpenRoomFromList"
    />
    <RoomDetailDrawer
      v-model="relatedRoomDrawer"
      :room="relatedRoom"
      desktop-direction="ltr"
      @open-building="openBuildingSide"
    />

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

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('customerRequirement.edit') : t('customerRequirement.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item :label="t('customerRequirement.fields.requirementCode')">
            <el-input
              v-model="form.requirementCode"
              :placeholder="t('customerRequirement.codeAutoHint')"
              :disabled="!!editing"
            />
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.customerName')" required>
            <el-select
              v-model="form.customerId"
              filterable
              fit-input-width
              style="width: 100%"
              :placeholder="t('customerRequirement.fields.customerName')"
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
          <el-form-item :label="t('customerRequirement.fields.salesManager')">
            <el-select
              v-model="form.salesManagerId"
              filterable
              clearable
              style="width: 100%"
              :placeholder="t('customerRequirement.fields.salesManager')"
            >
              <el-option
                v-for="u in users"
                :key="u.id"
                :label="userLabel(u)"
                :value="u.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.requirementDate')">
            <el-date-picker
              v-model="form.requirementDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option
                v-for="s in CUSTOMER_REQUIREMENT_STATUSES"
                :key="s"
                :label="t(`customerRequirement.status.${s}`)"
                :value="s"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.leaseDuration')">
            <el-input v-model="form.leaseDuration" />
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.budget')">
            <el-input-number
              v-model="form.budget"
              :min="0"
              :precision="2"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.sizeConfig')">
            <el-select v-model="form.sizeConfigId" clearable filterable style="width: 100%">
              <el-option
                v-for="o in sizeOptions"
                :key="o.id"
                :label="o.label"
                :value="o.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.acConfig')">
            <el-select v-model="form.acConfigId" clearable filterable style="width: 100%">
              <el-option v-for="o in acOptions" :key="o.id" :label="o.label" :value="o.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerRequirement.fields.windowConfig')">
            <el-select v-model="form.windowConfigId" clearable filterable style="width: 100%">
              <el-option
                v-for="o in windowOptions"
                :key="o.id"
                :label="o.label"
                :value="o.id"
              />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item :label="t('customerRequirement.fields.content')">
          <el-input v-model="form.content" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('customerRequirement.fields.remark')">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('customerRequirement.fields.attachment')">
          <el-input v-model="form.attachment" placeholder="/upload/..." />
        </el-form-item>
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

.requirement-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.room-io-file {
  display: none;
}

.select-option-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
