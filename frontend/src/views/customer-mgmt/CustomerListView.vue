<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createCustomerApi,
  deleteCustomerApi,
  fetchCustomer,
  fetchCustomers,
  importCustomersApi,
  updateCustomerApi,
} from '@/api/customers'
import type { CustomerWritePayload } from '@/api/customers'
import type { CustomerRecord, OccupantRecord } from '@/types/customer'
import { CUSTOMER_STATUSES } from '@/types/customer'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CustomerDetailDrawer from '@/components/CustomerDetailDrawer.vue'
import OccupantDetailDrawer from '@/components/OccupantDetailDrawer.vue'
import RelatedOccupantsDrawer from '@/components/RelatedOccupantsDrawer.vue'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'
import RoomDetailDrawer from '@/components/RoomDetailDrawer.vue'
import CountListPill from '@/components/CountListPill.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import { customerStatusTone } from '@/constants/statusBadges'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useUserStore } from '@/stores/user'
import { useImportProgress } from '@/composables/useImportProgress'
import { formatDateTime } from '@/utils/format'
import {
  customerIoTemplateExampleRow,
  customerToIoRow,
  rowToCustomerIoPayload,
} from '@/utils/customerExport'
import { fetchBuildings } from '@/api/buildings'
import { fetchUsers } from '@/api/users'
import { fetchCustomerSources } from '@/api/customer-sources'
import { fetchOccupants } from '@/api/occupants'
import { fetchRooms } from '@/api/rooms'
import type { BuildingRecord } from '@/types/building'
import type { UserRecord } from '@/types/user'
import type { RoomRecord } from '@/types/room'
import type { CustomerSourceOption } from '@/types/customer-source'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()

const keyword = ref('')
const loading = ref(false)
const formVisible = ref(false)
const drawerVisible = ref(false)
const relatedOccupantDrawer = ref(false)
const relatedOccupantsListDrawer = ref(false)
const buildingDrawerVisible = ref(false)
const relatedRoomsDrawer = ref(false)
const relatedRoomDrawer = ref(false)
const editing = ref<CustomerRecord | null>(null)
const current = ref<CustomerRecord | null>(null)
const relatedOccupant = ref<OccupantRecord | null>(null)
const relatedOccupantsCustomer = ref<CustomerRecord | null>(null)
const relatedBuilding = ref<BuildingRecord | null>(null)
const relatedRoomsBuilding = ref<BuildingRecord | null>(null)
const relatedRoom = ref<RoomRecord | null>(null)
const list = ref<CustomerRecord[]>([])
const buildings = ref<BuildingRecord[]>([])
const users = ref<UserRecord[]>([])
const sourceOptions = ref<CustomerSourceOption[]>([])
const rooms = ref<RoomRecord[]>([])
/** 表单内租用房间多选（存 roomCode，序列化进 rentedRooms） */
const rentedRoomCodes = ref<string[]>([])
/** 新建：是否选用过往使用者 */
const useExistingOccupant = ref(false)
const linkOccupantId = ref('')
/** 编辑：当前主要使用者 ID */
const primaryOccupantId = ref('')
const customerDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
const occupantDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

function findBuilding(id?: string | null) {
  if (!id) return null
  return buildings.value.find((b) => b.id === id) || null
}

function userOptionLabel(u: UserRecord) {
  const name = u.displayName?.trim()
  return name || u.account
}

const {
  filters,
  setFilter,
  setSort,
  sortOrderOf,
  apply: applySortFilter,
  uniqueOptions,
  sortKey,
  sortOrder,
} = useTableSortFilter<CustomerRecord>()

const columnGetters = {
  customerCode: (c: CustomerRecord) => c.customerCode,
  name: (c: CustomerRecord) => c.name,
  status: (c: CustomerRecord) => c.status,
  accountManager: (c: CustomerRecord) => c.accountManager,
  primaryContact: (c: CustomerRecord) => c.primaryOccupant?.name || c.primaryContact,
  mobilePhone: (c: CustomerRecord) => c.primaryOccupant?.mobilePhone || c.mobilePhone,
  buildingName: (c: CustomerRecord) => c.buildingName,
  occupantCount: (c: CustomerRecord) => c.occupantCount,
  createdAt: (c: CustomerRecord) => c.createdAt,
  updatedAt: (c: CustomerRecord) => c.updatedAt,
}

const statusFilterOptions = computed(() =>
  CUSTOMER_STATUSES.map((s) => ({
    value: s,
    label: t(`customer.status.${s}`, s),
  })),
)

const managerFilterOptions = computed(() => uniqueOptions(list.value, (c) => c.accountManager))

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  let base = list.value
  if (q) {
    base = base.filter((c) =>
      [
        c.customerCode,
        c.name,
        c.companyNameZh,
        c.companyNameEn,
        c.primaryOccupant?.name || c.primaryContact,
        c.primaryOccupant?.mobilePhone || c.mobilePhone,
        c.primaryOccupant?.whatsapp,
        c.primaryOccupant?.email,
        c.accountManager,
        c.buildingName,
        c.rentedRooms,
        c.status,
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

watch([keyword, filters, sortKey, sortOrder], () => resetPage(), { deep: true })

const dialogWidth = computed(() => (isMobile.value ? '94%' : '760px'))

const emptyForm = () => ({
  customerCode: '',
  name: '',
  status: '新客戶',
  accountManagerId: '' as string,
  companyNameZh: '',
  companyNameEn: '',
  businessRegNo: '',
  businessNature: '',
  businessRegCopy: '',
  remark: '',
  source: '',
  rentedRooms: '',
  buildingId: '' as string,
})

const emptyOccupantForm = () => ({
  name: '',
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
const occupantForm = reactive(emptyOccupantForm())

/** 启用选项 + 当前已选遗留值（停用或历史自由文本仍可回显） */
const sourceSelectOptions = computed(() => {
  const labels = sourceOptions.value.map((o) => o.label)
  const current = form.source.trim()
  if (current && !labels.includes(current)) return [current, ...labels]
  return labels
})

const occupantSelectOptions = ref<OccupantRecord[]>([])
const occupantSelectLoading = ref(false)

function occupantOptionLabel(o: OccupantRecord) {
  const phone = o.mobilePhone || o.whatsapp || ''
  const cust = o.customerName ? ` · ${o.customerName}` : ''
  return phone ? `${o.name}（${phone}）${cust}` : `${o.name}${cust}`
}

async function searchOccupantsRemote(query: string) {
  occupantSelectLoading.value = true
  try {
    const { data } = await fetchOccupants({
      keyword: query.trim() || undefined,
      limit: 40,
      lite: true,
    })
    occupantSelectOptions.value = data
  } catch {
    occupantSelectOptions.value = []
  } finally {
    occupantSelectLoading.value = false
  }
}

watch(linkOccupantId, (id) => {
  if (!id) return
  const hit = occupantSelectOptions.value.find((o) => o.id === id)
  applyOccupantToForm(hit)
})

watch(useExistingOccupant, (yes) => {
  if (!editing.value) {
    linkOccupantId.value = ''
    if (!yes) applyOccupantToForm(null)
    else void searchOccupantsRemote('')
  }
})

async function loadList() {
  loading.value = true
  try {
    const [{ data }, buildingsRes, usersRes, sourcesRes, roomsRes] = await Promise.all([
      fetchCustomers(),
      fetchBuildings({ activeOnly: false }),
      fetchUsers(),
      fetchCustomerSources({ activeOnly: true }),
      fetchRooms(),
    ])
    list.value = data
    buildings.value = buildingsRes.data
    users.value = usersRes.data
    sourceOptions.value = sourcesRes.data
    rooms.value = roomsRes.data
  } finally {
    loading.value = false
  }
}

function parseRentedRoomCodes(raw?: string | null): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,，、;；|/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function roomOptionLabel(r: RoomRecord) {
  return r.name?.trim() ? `${r.roomCode} · ${r.name}` : r.roomCode
}

const roomSelectOptions = computed(() => {
  const bid = form.buildingId.trim()
  const base = bid ? rooms.value.filter((r) => r.buildingId === bid) : rooms.value
  const byCode = new Map(base.map((r) => [r.roomCode, r]))
  // 保留已选但不在当前大厦筛选内的历史编号
  for (const code of rentedRoomCodes.value) {
    if (byCode.has(code)) continue
    const hit = rooms.value.find((r) => r.roomCode === code)
    if (hit) byCode.set(code, hit)
    else byCode.set(code, { id: code, roomCode: code, name: code } as RoomRecord)
  }
  return [...byCode.values()].sort((a, b) => a.roomCode.localeCompare(b.roomCode))
})

function applyOccupantToForm(
  o: Partial<{
    name: string
    whatsapp: string
    mobilePhone: string
    contactPhone: string
    email: string
    fax: string
    address: string
    idCardNo: string
    idCardImage: string
    addressProofCopy: string
    remark: string
  }> | null | undefined,
) {
  if (!o) {
    Object.assign(occupantForm, emptyOccupantForm())
    return
  }
  Object.assign(occupantForm, {
    name: o.name || '',
    whatsapp: o.whatsapp || '',
    mobilePhone: o.mobilePhone || '',
    contactPhone: o.contactPhone || '',
    email: o.email || '',
    fax: o.fax || '',
    address: o.address || '',
    idCardNo: o.idCardNo || '',
    idCardImage: o.idCardImage || '',
    addressProofCopy: o.addressProofCopy || '',
    remark: o.remark || '',
  })
}

onMounted(() => {
  void loadList()
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  Object.assign(occupantForm, emptyOccupantForm())
  rentedRoomCodes.value = []
  useExistingOccupant.value = false
  linkOccupantId.value = ''
  primaryOccupantId.value = ''
  formVisible.value = true
}

async function openEdit(row: CustomerRecord) {
  try {
    const { data } = await fetchCustomer(row.id)
    editing.value = data
    Object.assign(form, {
      customerCode: data.customerCode || '',
      name: data.name || '',
      status: data.status || '新客戶',
      accountManagerId: data.accountManagerId || '',
      companyNameZh: data.companyNameZh || '',
      companyNameEn: data.companyNameEn || '',
      businessRegNo: data.businessRegNo || '',
      businessNature: data.businessNature || '',
      businessRegCopy: data.businessRegCopy || '',
      remark: data.remark || '',
      source: data.source || '',
      rentedRooms: data.rentedRooms || '',
      buildingId: data.buildingId || '',
    })
    rentedRoomCodes.value = parseRentedRoomCodes(data.rentedRooms)
    useExistingOccupant.value = false
    linkOccupantId.value = ''
    primaryOccupantId.value = data.primaryOccupantId || ''
    if (data.primaryOccupant) {
      applyOccupantToForm(data.primaryOccupant)
    } else {
      applyOccupantToForm(null)
    }
    formVisible.value = true
  } catch {
    /* interceptor */
  }
}

function payloadFromForm() {
  const occupantPayload = {
    name: occupantForm.name.trim(),
    whatsapp: occupantForm.whatsapp.trim(),
    mobilePhone: occupantForm.mobilePhone.trim(),
    contactPhone: occupantForm.contactPhone.trim(),
    email: occupantForm.email.trim(),
    fax: occupantForm.fax.trim(),
    address: occupantForm.address.trim(),
    idCardNo: occupantForm.idCardNo.trim(),
    idCardImage: occupantForm.idCardImage.trim(),
    addressProofCopy: occupantForm.addressProofCopy.trim(),
    remark: occupantForm.remark.trim(),
  }
  return {
    customerCode: form.customerCode.trim(),
    name: form.name.trim(),
    status: form.status.trim(),
    accountManagerId: form.accountManagerId.trim() || null,
    companyNameZh: form.companyNameZh.trim(),
    companyNameEn: form.companyNameEn.trim(),
    businessRegNo: form.businessRegNo.trim(),
    businessNature: form.businessNature.trim(),
    businessRegCopy: form.businessRegCopy.trim(),
    remark: form.remark.trim(),
    source: form.source.trim(),
    rentedRooms: rentedRoomCodes.value.join('、'),
    buildingId: form.buildingId.trim() || null,
    occupant: occupantPayload,
    ...(editing.value
      ? {
          primaryOccupantId: primaryOccupantId.value || undefined,
        }
      : {
          linkOccupantId:
            useExistingOccupant.value && linkOccupantId.value
              ? linkOccupantId.value
              : undefined,
        }),
  }
}

async function saveForm() {
  if (!form.customerCode.trim()) {
    ElMessage.warning(t('customer.codeRequired'))
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning(t('customer.nameRequired'))
    return
  }
  if (!editing.value && useExistingOccupant.value && !linkOccupantId.value) {
    ElMessage.warning(t('customer.occupantSelectRequired'))
    return
  }
  if (!occupantForm.name.trim()) {
    ElMessage.warning(t('customer.occupantNameRequired'))
    return
  }
  try {
    const payload = payloadFromForm()
    if (editing.value) {
      await updateCustomerApi(editing.value.id, payload)
      ElMessage.success(t('customer.updated'))
    } else {
      await createCustomerApi(payload)
      ElMessage.success(t('customer.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: CustomerRecord) {
  try {
    await ElMessageBox.confirm(
      t('customer.deleteConfirm', { name: row.name || row.customerCode }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteCustomerApi(row.id)
    ElMessage.success(t('customer.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

function openOccupantsSide(row: CustomerRecord) {
  if (!row.occupantCount) return
  relatedOccupantsCustomer.value = row
  relatedOccupantsListDrawer.value = true
}

async function openDetail(row: CustomerRecord, direction: 'ltr' | 'rtl' = 'rtl') {
  try {
    const { data } = await fetchCustomer(row.id)
    current.value = data
    customerDrawerDirection.value = direction
    drawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onRowClick(row: CustomerRecord, _column: unknown, event: Event) {
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox')) return
  openDetail(row, 'rtl')
}

function onOpenOccupantFromCustomer(occupant: OccupantRecord) {
  relatedOccupant.value = occupant
  occupantDrawerDirection.value = 'ltr'
  relatedOccupantDrawer.value = true
}

async function openCustomerFromOccupant(customerId: string) {
  try {
    const { data } = await fetchCustomer(customerId)
    openDetail(data, 'ltr')
  } catch {
    /* interceptor */
  }
}

function openBuildingSide(buildingId?: string | null) {
  if (!buildingId) return
  let building = findBuilding(buildingId)
  if (!building) {
    // fallback: try from relatedBuilding already loaded list after refresh
    building = buildings.value.find((b) => b.id === buildingId) || null
  }
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

function statusLabel(status: string) {
  return t(`customer.status.${status}`, status)
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

function resolveBuildingId(name: string): string | null {
  const key = name.trim()
  if (!key) return null
  return buildings.value.find((b) => b.name.trim() === key)?.id ?? null
}

function resolveAccountManagerId(label: string): string | null {
  const key = label.trim()
  if (!key) return null
  const hit = users.value.find(
    (u) => u.account.trim() === key || (u.displayName?.trim() || '') === key,
  )
  return hit?.id ?? null
}

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
    exportCustomersXlsx()
  }
}

function downloadImportTemplate() {
  const example = customerIoTemplateExampleRow(t)
  const ws = XLSX.utils.json_to_sheet([example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Customers')
  XLSX.writeFile(wb, 'customers-import-template.xlsx')
  ElMessage.success(t('customer.templateDone'))
}

function exportCustomersXlsx() {
  const rows = filtered.value
  if (!rows.length) {
    ElMessage.warning(t('customer.exportEmpty'))
    return
  }
  const sheetRows = rows.map((r) => customerToIoRow(r, t))
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Customers')
  XLSX.writeFile(wb, `customers-${new Date().toISOString().slice(0, 10)}.xlsx`)
  ElMessage.success(t('customer.exportDone', { n: rows.length }))
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAdmin.value) {
    ElMessage.warning(t('customer.importAdminOnly'))
    return
  }

  beginImport({
    fileName: file.name,
    statKeys: ['created', 'updated', 'skipped', 'failed'],
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
        message: t('customer.importEmpty'),
      })
      return
    }

    setImportTotal(rawRows.length)

    const payloads: CustomerWritePayload[] = []
    for (const row of rawRows) {
      const parsed = rowToCustomerIoPayload(row, t)
      if (!parsed) {
        bumpImport('skipped')
        continue
      }
      payloads.push({
        customerCode: parsed.customerCode,
        name: parsed.name,
        status: parsed.status,
        accountManagerId: resolveAccountManagerId(parsed.accountManagerLabel),
        companyNameZh: parsed.companyNameZh,
        companyNameEn: parsed.companyNameEn,
        businessRegNo: parsed.businessRegNo,
        businessNature: parsed.businessNature,
        businessRegCopy: parsed.businessRegCopy,
        remark: parsed.remark,
        source: parsed.source,
        rentedRooms: parsed.rentedRooms,
        buildingId: resolveBuildingId(parsed.buildingName),
        ...(parsed.occupant ? { occupant: parsed.occupant } : {}),
      })
    }

    const batches = chunkArray(payloads, IMPORT_BATCH_SIZE)
    let processed = importState.stats.skipped
    for (const batch of batches) {
      processed += batch.length
      setImportProcessing(Math.min(processed, rawRows.length))
      try {
        const { data } = await importCustomersApi(batch)
        if (data.created) bumpImport('created', data.created)
        if (data.updated) bumpImport('updated', data.updated)
        if (data.skipped) bumpImport('skipped', data.skipped)
        if (data.failed) bumpImport('failed', data.failed)
      } catch {
        bumpImport('failed', batch.length)
      }
    }

    await loadList()
    resetPage()
    finishImport()
  } catch {
    failImport(t('customer.importFailed'))
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.customers') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('customer.searchPlaceholder')"
        />
        <el-button
          v-if="isAdmin"
          type="primary"
          :icon="Plus"
          class="lb-btn-primary"
          @click="openCreate"
        >
          {{ t('customer.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('customer.dataIo')" :loading="importing">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="isAdmin" command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('customer.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('customer.downloadTemplate') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export" divided>
                <el-icon><Download /></el-icon>
                <span>{{ t('customer.export') }}</span>
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
          class="customer-table--clickable"
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
          <el-table-column prop="customerCode" min-width="114" fixed="left">
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.customerCode')"
                sortable
                :sort-order="sortOrderOf('customerCode')"
                @update:sort-order="(v) => setSort('customerCode', v)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="name" min-width="156">
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
          </el-table-column>
          <el-table-column min-width="124">
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.status')"
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
              <StatusBadge :tone="customerStatusTone(row.status)" :label="statusLabel(row.status)" />
            </template>
          </el-table-column>
          <el-table-column prop="accountManager" min-width="128">
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.accountManager')"
                filterable
                sortable
                :options="managerFilterOptions"
                :model-value="filters.accountManager || []"
                :sort-order="sortOrderOf('accountManager')"
                @update:model-value="(v) => setFilter('accountManager', v)"
                @update:sort-order="(v) => setSort('accountManager', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="primaryContact"
            :label="t('customer.fields.primaryContact')"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            prop="mobilePhone"
            :label="t('customer.fields.mobilePhone')"
            min-width="120"
          />
          <el-table-column
            :label="t('customer.fields.buildingName')"
            min-width="148"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <button
                v-if="row.buildingId"
                type="button"
                class="fk-link"
                @click.stop="openBuildingSide(row.buildingId)"
              >
                {{ row.buildingName || '—' }}
              </button>
              <span v-else>{{ row.buildingName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column min-width="100" align="center">
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.occupantCount')"
                sortable
                :sort-order="sortOrderOf('occupantCount')"
                @update:sort-order="(v) => setSort('occupantCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.occupantCount ?? 0"
                @click="openOccupantsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            width="172"
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
          >            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <button
                  type="button"
                  class="action-pill action-pill--view"
                  @click.stop="openDetail(row)"
                >
                  {{ t('common.detail') }}
                </button>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click.stop="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  v-if="isAdmin"
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
        />
      </div>
    </div>

    <CustomerDetailDrawer
      v-model="drawerVisible"
      :customer="current"
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

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('customer.edit') : t('customer.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top" class="customer-form">
        <section class="form-section">
          <h3>{{ t('customer.sections.info') }}</h3>
          <div class="form-grid">
            <el-form-item :label="t('customer.fields.customerCode')" required>
              <el-input v-model="form.customerCode" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.name')" required>
              <el-input v-model="form.name" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.status')">
              <el-select v-model="form.status" style="width: 100%">
                <el-option
                  v-for="s in CUSTOMER_STATUSES"
                  :key="s"
                  :label="statusLabel(s)"
                  :value="s"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('customer.fields.accountManager')">
              <el-select
                v-model="form.accountManagerId"
                clearable
                filterable
                style="width: 100%"
                :placeholder="t('customer.fields.accountManager')"
              >
                <el-option
                  v-for="u in users"
                  :key="u.id"
                  :label="userOptionLabel(u)"
                  :value="u.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('customer.fields.source')">
              <el-select
                v-model="form.source"
                clearable
                filterable
                style="width: 100%"
                :placeholder="t('common.pleaseSelect')"
              >
                <el-option
                  v-for="o in sourceSelectOptions"
                  :key="o"
                  :label="o"
                  :value="o"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('customer.fields.buildingName')">
              <el-select
                v-model="form.buildingId"
                clearable
                filterable
                style="width: 100%"
                :placeholder="t('customer.fields.buildingName')"
              >
                <el-option
                  v-for="b in buildings"
                  :key="b.id"
                  :label="b.name"
                  :value="b.id"
                />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('customer.sections.company') }}</h3>
          <div class="form-grid">
            <el-form-item :label="t('customer.fields.companyNameZh')">
              <el-input v-model="form.companyNameZh" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.companyNameEn')">
              <el-input v-model="form.companyNameEn" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.businessRegNo')">
              <el-input v-model="form.businessRegNo" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.businessNature')">
              <el-input v-model="form.businessNature" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.businessRegCopy')" class="span-2">
              <el-input v-model="form.businessRegCopy" readonly class="path-input" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.remark')" class="span-2">
              <el-input v-model="form.remark" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item :label="t('customer.fields.rentedRooms')" class="span-2">
              <el-select
                v-model="rentedRoomCodes"
                multiple
                filterable
                clearable
                collapse-tags
                collapse-tags-tooltip
                style="width: 100%"
                :placeholder="t('common.pleaseSelect')"
              >
                <el-option
                  v-for="r in roomSelectOptions"
                  :key="r.roomCode"
                  :label="roomOptionLabel(r)"
                  :value="r.roomCode"
                />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('customer.sections.occupant') }}</h3>
          <div class="form-grid">
            <el-form-item
              v-if="!editing"
              :label="t('customer.useExistingOccupant')"
              class="span-2"
            >
              <el-radio-group v-model="useExistingOccupant">
                <el-radio :value="true">{{ t('common.yes') }}</el-radio>
                <el-radio :value="false">{{ t('common.no') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item
              v-if="!editing && useExistingOccupant"
              :label="t('customer.selectOccupant')"
              class="span-2"
              required
            >
              <el-select
                v-model="linkOccupantId"
                filterable
                remote
                clearable
                reserve-keyword
                style="width: 100%"
                :placeholder="t('customer.selectOccupantPlaceholder')"
                :remote-method="searchOccupantsRemote"
                :loading="occupantSelectLoading"
                @visible-change="(open: boolean) => open && searchOccupantsRemote('')"
              >
                <el-option
                  v-for="o in occupantSelectOptions"
                  :key="o.id"
                  :label="occupantOptionLabel(o)"
                  :value="o.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('occupant.fields.name')" required>
              <el-input v-model="occupantForm.name" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.mobilePhone')">
              <el-input v-model="occupantForm.mobilePhone" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.whatsapp')">
              <el-input v-model="occupantForm.whatsapp" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.contactPhone')">
              <el-input v-model="occupantForm.contactPhone" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.email')">
              <el-input v-model="occupantForm.email" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.fax')">
              <el-input v-model="occupantForm.fax" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.idCardNo')">
              <el-input v-model="occupantForm.idCardNo" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.address')" class="span-2">
              <el-input v-model="occupantForm.address" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.idCardImage')" class="span-2">
              <el-input v-model="occupantForm.idCardImage" readonly class="path-input" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.addressProofCopy')" class="span-2">
              <el-input v-model="occupantForm.addressProofCopy" readonly class="path-input" />
            </el-form-item>
            <el-form-item :label="t('occupant.fields.remark')" class="span-2">
              <el-input v-model="occupantForm.remark" type="textarea" :rows="2" />
            </el-form-item>
          </div>
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
      @close="closeImport"
    />
  </div>
</template>

<style scoped>
.customer-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.customer-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.customer-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}

.path-input :deep(.el-input__inner) {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.form-section-hint {
  margin: -4px 0 12px;
  color: var(--lb-muted, #6a7a70);
  font-size: 0.86rem;
  line-height: 1.4;
}
</style>
