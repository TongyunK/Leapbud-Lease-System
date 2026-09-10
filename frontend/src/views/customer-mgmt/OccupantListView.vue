<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createOccupantApi,
  deleteOccupantApi,
  fetchOccupants,
  importOccupantsApi,
  updateOccupantApi,
} from '@/api/occupants'
import type { OccupantWritePayload } from '@/api/occupants'
import { fetchCustomer, fetchCustomers } from '@/api/customers'
import { fetchBuildings } from '@/api/buildings'
import type { CustomerRecord, OccupantRecord } from '@/types/customer'
import type { BuildingRecord } from '@/types/building'
import type { RoomRecord } from '@/types/room'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import OccupantDetailDrawer from '@/components/OccupantDetailDrawer.vue'
import CustomerDetailDrawer from '@/components/CustomerDetailDrawer.vue'
import RelatedOccupantsDrawer from '@/components/RelatedOccupantsDrawer.vue'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'
import RoomDetailDrawer from '@/components/RoomDetailDrawer.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import { useUserStore } from '@/stores/user'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime } from '@/utils/format'
import { useActionColWidth } from '@/composables/useActionColWidth'
import {
  occupantIoTemplateExampleRow,
  occupantToIoRow,
  rowToOccupantIoPayload,
} from '@/utils/occupantExport'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'

const { t } = useI18n()
const route = useRoute()
const userStore = useUserStore()
const isMobile = useIsMobile()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()

const keyword = ref('')
/** Silent filter from ?customerId= (no header dropdown) */
const customerIdFilter = ref('')
const loading = ref(false)
const formVisible = ref(false)
const drawerVisible = ref(false)
const relatedCustomerDrawer = ref(false)
const relatedOccupantsListDrawer = ref(false)
const buildingDrawerVisible = ref(false)
const relatedRoomsDrawer = ref(false)
const relatedRoomDrawer = ref(false)
const editing = ref<OccupantRecord | null>(null)
const current = ref<OccupantRecord | null>(null)
const relatedCustomer = ref<CustomerRecord | null>(null)
const relatedOccupantsCustomer = ref<CustomerRecord | null>(null)
const relatedBuilding = ref<BuildingRecord | null>(null)
const relatedRoomsBuilding = ref<BuildingRecord | null>(null)
const relatedRoom = ref<RoomRecord | null>(null)
const list = ref<OccupantRecord[]>([])
const customers = ref<CustomerRecord[]>([])
const buildings = ref<BuildingRecord[]>([])
const occupantDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
const customerDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

const {
  filters,
  setFilter,
  setSort,
  sortOrderOf,
  apply: applySortFilter,
  uniqueOptions,
  sortKey,
  sortOrder,
} = useTableSortFilter<OccupantRecord>()

const columnGetters = {
  name: (o: OccupantRecord) => o.name,
  customerName: (o: OccupantRecord) => o.customerName || o.relatedCustomerName,
  customerCode: (o: OccupantRecord) => o.customerCode,
  mobilePhone: (o: OccupantRecord) => o.mobilePhone,
  whatsapp: (o: OccupantRecord) => o.whatsapp,
  email: (o: OccupantRecord) => o.email,
  createdAt: (o: OccupantRecord) => o.createdAt,
  updatedAt: (o: OccupantRecord) => o.updatedAt,
}

const customerFilterOptions = computed(() =>
  customers.value.map((c) => ({
    value: c.id,
    label: `${c.customerCode} · ${c.name}`,
  })),
)

const customerNameFilterOptions = computed(() =>
  uniqueOptions(list.value, (o) => o.customerName || o.relatedCustomerName || ''),
)

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  let base = list.value
  if (customerIdFilter.value) {
    base = base.filter((o) => o.customerId === customerIdFilter.value)
  }
  if (q) {
    base = base.filter((o) =>
      [
        o.name,
        o.customerCode,
        o.customerName,
        o.relatedCustomerName,
        o.mobilePhone,
        o.whatsapp,
        o.contactPhone,
        o.email,
        o.idCardNo,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }
  return applySortFilter(base, columnGetters)
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([keyword, customerIdFilter, filters, sortKey, sortOrder], () => resetPage(), { deep: true })

const dialogWidth = computed(() => (isMobile.value ? '94%' : '760px'))

const emptyForm = () => ({
  name: '',
  customerId: '' as string,
  relatedCustomerName: '',
  whatsapp: '',
  mobilePhone: '',
  contactPhone: '',
  email: '',
  fax: '',
  address: '',
  idCardNo: '',
  idCardImage: '',
  addressProofCopy: '',
  remark: '',
})

const form = reactive(emptyForm())

async function loadCustomers() {
  const [{ data }, buildingsRes] = await Promise.all([
    fetchCustomers(),
    fetchBuildings({ activeOnly: false }),
  ])
  customers.value = data
  buildings.value = buildingsRes.data
}

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchOccupants()
    list.value = data
  } finally {
    loading.value = false
  }
}

function syncFilterFromRoute() {
  const q = route.query.customerId
  const next = typeof q === 'string' ? q : ''
  if (customerIdFilter.value !== next) customerIdFilter.value = next
}

onMounted(async () => {
  syncFilterFromRoute()
  await Promise.all([loadCustomers(), loadList()])
})

watch(
  () => route.query.customerId,
  () => {
    syncFilterFromRoute()
  },
)

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  if (customerIdFilter.value) form.customerId = customerIdFilter.value
  formVisible.value = true
}

function openEdit(row: OccupantRecord) {
  editing.value = row
  Object.assign(form, {
    name: row.name || '',
    customerId: row.customerId || '',
    relatedCustomerName: row.relatedCustomerName || '',
    whatsapp: row.whatsapp || '',
    mobilePhone: row.mobilePhone || '',
    contactPhone: row.contactPhone || '',
    email: row.email || '',
    fax: row.fax || '',
    address: row.address || '',
    idCardNo: row.idCardNo || '',
    idCardImage: row.idCardImage || '',
    addressProofCopy: row.addressProofCopy || '',
    remark: row.remark || '',
  })
  formVisible.value = true
}

function payloadFromForm() {
  const customerId = form.customerId.trim() || undefined
  return {
    name: form.name.trim(),
    customerId,
    relatedCustomerName: form.relatedCustomerName.trim(),
    whatsapp: form.whatsapp.trim(),
    mobilePhone: form.mobilePhone.trim(),
    contactPhone: form.contactPhone.trim(),
    email: form.email.trim(),
    fax: form.fax.trim(),
    address: form.address.trim(),
    idCardNo: form.idCardNo.trim(),
    idCardImage: form.idCardImage.trim(),
    addressProofCopy: form.addressProofCopy.trim(),
    remark: form.remark.trim(),
  }
}

async function saveForm() {
  if (!form.name.trim()) {
    ElMessage.warning(t('occupant.nameRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateOccupantApi(editing.value.id, {
        ...payload,
        customerId: payload.customerId ?? null,
      })
      ElMessage.success(t('occupant.updated'))
    } else {
      await createOccupantApi(payload)
      ElMessage.success(t('occupant.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: OccupantRecord) {
  try {
    await ElMessageBox.confirm(t('occupant.deleteConfirm', { name: row.name }), t('common.deleteTitle'), {
      type: 'warning',
    })
    await deleteOccupantApi(row.id)
    ElMessage.success(t('occupant.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

function displayCustomer(row: OccupantRecord) {
  return row.customerName || row.relatedCustomerName || '—'
}

function openDetail(row: OccupantRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  current.value = row
  occupantDrawerDirection.value = direction
  drawerVisible.value = true
}

function onRowClick(row: OccupantRecord, _column: unknown, event: Event) {
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox')) return
  openDetail(row, 'rtl')
}

async function openCustomerSide(customerId?: string | null) {
  if (!customerId) return
  let row = customers.value.find((c) => c.id === customerId) || null
  if (!row) {
    try {
      const { data } = await fetchCustomer(customerId)
      row = data
    } catch {
      return
    }
  }
  relatedCustomer.value = row
  customerDrawerDirection.value = 'ltr'
  relatedCustomerDrawer.value = true
}

function onOpenOccupantFromCustomer(occupant: OccupantRecord) {
  openDetail(occupant, 'ltr')
}

function openOccupantsSide(row: CustomerRecord) {
  if (!row.occupantCount) return
  relatedOccupantsCustomer.value = row
  relatedOccupantsListDrawer.value = true
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
  if (cmd === 'export') {
    exportOccupantsXlsx()
  }
}

function downloadImportTemplate() {
  const example = occupantIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Occupants')
  XLSX.writeFile(wb, 'occupants-import-template.xlsx')
  ElMessage.success(t('occupant.templateDone'))
}

function exportOccupantsXlsx() {
  const rows = filtered.value
  if (!rows.length) {
    ElMessage.warning(t('occupant.exportEmpty'))
    return
  }
  const sheetRows = rows.map((r) => occupantToIoRow(r, t))
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Occupants')
  XLSX.writeFile(wb, `occupants-${new Date().toISOString().slice(0, 10)}.xlsx`)
  ElMessage.success(t('occupant.exportDone', { n: rows.length }))
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAdmin.value) {
    ElMessage.warning(t('occupant.importAdminOnly'))
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
        message: t('occupant.importEmpty'),
      })
      return
    }

    // 解析阶段：无效行计入跳过；去重交给后端（并按批提交）
    const payloads: OccupantWritePayload[] = []
    for (const row of rawRows) {
      const parsed = rowToOccupantIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        continue
      }
      payloads.push({
        name: parsed.name,
        customerCode: parsed.customerCode,
        relatedCustomerName: parsed.relatedCustomerName,
        whatsapp: parsed.whatsapp,
        mobilePhone: parsed.mobilePhone,
        contactPhone: parsed.contactPhone,
        email: parsed.email,
        fax: parsed.fax,
        address: parsed.address,
        idCardNo: parsed.idCardNo,
        idCardImage: parsed.idCardImage,
        addressProofCopy: parsed.addressProofCopy,
        remark: parsed.remark,
      })
    }

    setImportTotal(rawRows.length)
    const batches = chunkArray(payloads, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importOccupantsApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.skipped) bumpImport('skipped', data.skipped)
        if (data.unlinked) bumpImport('unlinked', data.unlinked)
        if (data.failed) bumpImport('failed', data.failed)
      } catch {
        bumpImport('failed', batch.length)
      }
    }

    await Promise.all([loadList(), loadCustomers()])
    resetPage()
    finishImport()
  } catch {
    failImport(t('occupant.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.occupants') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('occupant.searchPlaceholder')"
        />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('occupant.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('occupant.dataIo')" :loading="importing">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('occupant.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('occupant.downloadTemplate') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export" divided>
                <el-icon><Download /></el-icon>
                <span>{{ t('occupant.export') }}</span>
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
          class="occupant-table--clickable"
          :data="paged"
          height="100%"
          stripe
          border
          scrollbar-always-on
          empty-text="—"
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
          <el-table-column prop="name" min-width="140" fixed="left">
            <template #header>
              <TableColumnHeader
                :label="t('occupant.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
          </el-table-column>
          <el-table-column min-width="200" show-overflow-tooltip>
            <template #header>
              <TableColumnHeader
                :label="t('occupant.fields.customer')"
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
                :title="displayCustomer(row)"
                @click.stop="openCustomerSide(row.customerId)"
              >
                {{ displayCustomer(row) }}
              </button>
              <span v-else>{{ displayCustomer(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="mobilePhone" min-width="120">
            <template #header>
              <TableColumnHeader
                :label="t('occupant.fields.mobilePhone')"
                sortable
                :sort-order="sortOrderOf('mobilePhone')"
                @update:sort-order="(v) => setSort('mobilePhone', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="whatsapp"
            :label="t('occupant.fields.whatsapp')"
            min-width="120"
          />
          <el-table-column
            prop="email"
            :label="t('occupant.fields.email')"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column
            prop="idCardNo"
            :label="t('occupant.fields.idCardNo')"
            min-width="160"
          />
          <el-table-column
            width="178"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.createdAt')"
                sortable
                :sort-order="sortOrderOf('createdAt')"
                @update:sort-order="(v) => setSort('createdAt', v)"
              />
            </template>
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="isAdmin ? actionColWidth.three : actionColWidth.one"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--view"
                  @click.stop="openDetail(row)"
                >
                  {{ t('common.detail') }}
                </button>
                <template v-if="isAdmin">
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
                </template>
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

    <OccupantDetailDrawer
      v-model="drawerVisible"
      :occupant="current"
      :desktop-direction="occupantDrawerDirection"
      @open-customer="openCustomerSide"
    />
    <CustomerDetailDrawer
      v-model="relatedCustomerDrawer"
      :customer="relatedCustomer"
      :desktop-direction="customerDrawerDirection"
      @open-occupants="openOccupantsSide"
      @open-building="openBuildingSide"
    />
    <RelatedOccupantsDrawer
      v-model="relatedOccupantsListDrawer"
      :customer="relatedOccupantsCustomer"
      desktop-direction="ltr"
      @open-occupant="onOpenOccupantFromCustomer"
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

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('occupant.edit') : t('occupant.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="occupant-form">
        <div class="form-grid">
          <el-form-item :label="t('occupant.fields.name')" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.customer')">
            <el-select
              v-model="form.customerId"
              clearable
              filterable
              style="width: 100%"
              :placeholder="t('occupant.fields.customer')"
            >
              <el-option
                v-for="opt in customerFilterOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('occupant.fields.relatedCustomerName')" class="span-2">
            <el-input v-model="form.relatedCustomerName" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.whatsapp')">
            <el-input v-model="form.whatsapp" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.mobilePhone')">
            <el-input v-model="form.mobilePhone" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.contactPhone')">
            <el-input v-model="form.contactPhone" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.email')">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.fax')">
            <el-input v-model="form.fax" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.idCardNo')">
            <el-input v-model="form.idCardNo" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.address')" class="span-2">
            <el-input v-model="form.address" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.idCardImage')" class="span-2">
            <el-input v-model="form.idCardImage" readonly class="path-input" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.addressProofCopy')" class="span-2">
            <el-input v-model="form.addressProofCopy" readonly class="path-input" />
          </el-form-item>
          <el-form-item :label="t('occupant.fields.remark')" class="span-2">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>
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
      @close="closeImport"
    />
  </div>
</template>

<style scoped>
.occupant-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.occupant-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.occupant-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}

.path-input :deep(.el-input__inner) {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
</style>
