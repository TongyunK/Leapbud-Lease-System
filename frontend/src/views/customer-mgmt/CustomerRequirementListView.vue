<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createCustomerRequirementApi,
  deleteCustomerRequirementApi,
  fetchCustomerRequirements,
  importCustomerRequirementsApi,
  updateCustomerRequirementApi,
} from '@/api/customer-requirements'
import type { CustomerRequirementImportItem } from '@/api/customer-requirements'
import { fetchCustomers } from '@/api/customers'
import { fetchRoomConfigs } from '@/api/room-configs'
import { fetchUsers } from '@/api/users'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import { CUSTOMER_REQUIREMENT_STATUSES } from '@/types/customer-requirement'
import type { CustomerRecord } from '@/types/customer'
import type { RoomConfigOption } from '@/types/room-config'
import type { UserRecord } from '@/types/user'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
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
import { exportFileSuffix, exportScopeFromCommand, resolveExportRows } from '@/utils/exportScope'

const { t } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const { colW, textColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } = useTableColWidth()

const loading = ref(false)
const formVisible = ref(false)
const editing = ref<CustomerRequirementRecord | null>(null)
const list = ref<CustomerRequirementRecord[]>([])
const customers = ref<CustomerRecord[]>([])
const users = ref<UserRecord[]>([])
const sizeOptions = ref<RoomConfigOption[]>([])
const acOptions = ref<RoomConfigOption[]>([])
const windowOptions = ref<RoomConfigOption[]>([])
const keyword = ref('')

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
  apply: applySortFilter,
  uniqueOptions,
  sortKey,
  sortOrder,
} = useTableSortFilter<CustomerRequirementRecord>()

const columnGetters = {
  requirementCode: (o: CustomerRequirementRecord) => o.requirementCode,
  customerName: (o: CustomerRequirementRecord) => o.customerName,
  salesManager: (o: CustomerRequirementRecord) => o.salesManager,
  requirementDate: (o: CustomerRequirementRecord) => o.requirementDate,
  status: (o: CustomerRequirementRecord) => o.status,
  leaseDuration: (o: CustomerRequirementRecord) => o.leaseDuration,
  budget: (o: CustomerRequirementRecord) => o.budget ?? -1,
  sizeConfigLabel: (o: CustomerRequirementRecord) => o.sizeConfigLabel,
  acConfigLabel: (o: CustomerRequirementRecord) => o.acConfigLabel,
  windowConfigLabel: (o: CustomerRequirementRecord) => o.windowConfigLabel,
  createdAt: (o: CustomerRequirementRecord) => o.createdAt,
}

const statusFilterOptions = computed(() =>
  CUSTOMER_REQUIREMENT_STATUSES.map((s) => ({
    value: s,
    label: t(`customerRequirement.status.${s}`),
  })),
)

const customerNameFilterOptions = computed(() =>
  uniqueOptions(list.value, (o) => o.customerName),
)
const salesManagerFilterOptions = computed(() =>
  uniqueOptions(list.value, (o) => o.salesManager),
)
const sizeConfigFilterOptions = computed(() =>
  uniqueOptions(list.value, (o) => o.sizeConfigLabel),
)
const acConfigFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.acConfigLabel))
const windowConfigFilterOptions = computed(() =>
  uniqueOptions(list.value, (o) => o.windowConfigLabel),
)

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter((row) =>
    [
      row.requirementCode,
      row.customerName,
      row.customerCode,
      row.salesManager,
      row.content,
      row.remark,
      row.leaseDuration,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const sorted = computed(() => applySortFilter(filtered.value, columnGetters))

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(sorted)

watch([filters, dateRanges, sortKey, sortOrder, keyword], () => resetPage(), { deep: true })

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

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchCustomerRequirements()
    list.value = data
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  const [custRes, userRes, confRes] = await Promise.all([
    fetchCustomers(),
    fetchUsers(),
    fetchRoomConfigs({ activeOnly: true }),
  ])
  customers.value = custRes.data
  users.value = userRes.data.filter((u) => u.status === 'active')
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

function exportRequirementsXlsx(scope: 'page' | 'filtered' | 'all') {
  const rows = resolveExportRows(scope, {
    page: paged.value,
    filtered: sorted.value,
    all: list.value,
  })
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
      } catch {
        bumpImport('failed', batch.length)
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
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
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
          <el-button class="room-io-btn" :aria-label="t('customerRequirement.dataIo')" :loading="importing">
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
          :key="tableLayoutKey"
          :data="paged"
          height="100%"
          stripe
          border
          empty-text="—"
          style="width: 100%"
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
            :min-width="colW(t('customerRequirement.fields.requirementCode'), { interactive: true, contentMin: 120 })"
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
            <template #default="{ row }">{{ row.customerName || '—' }}</template>
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
              <div class="action-pills">
                <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
                <button type="button" class="action-pill action-pill--danger" @click="onDelete(row)">
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
        />
      </div>
    </div>

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

.room-io-file {
  display: none;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
