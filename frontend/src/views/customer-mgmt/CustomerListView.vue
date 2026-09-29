<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createCustomerApi,
  deleteCustomerApi,
  batchDeleteCustomersApi,
  fetchCustomer,
  fetchCustomers,
  importCustomersApi,
  updateCustomerApi,
} from '@/api/customers'
import type { CustomerWritePayload, CustomerListQuery } from '@/api/customers'
import type { CustomerRecord, OccupantRecord } from '@/types/customer'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import { CUSTOMER_STATUSES } from '@/types/customer'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useServerPagedList } from '@/composables/useServerPagedList'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CustomerDetailDrawer from '@/components/CustomerDetailDrawer.vue'
import OccupantDetailDrawer from '@/components/OccupantDetailDrawer.vue'
import RelatedOccupantsDrawer from '@/components/RelatedOccupantsDrawer.vue'
import RelatedCustomerRequirementsDrawer from '@/components/RelatedCustomerRequirementsDrawer.vue'
import RelatedContractsDrawer from '@/components/RelatedContractsDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedReceivablesDrawer from '@/components/RelatedReceivablesDrawer.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import RelatedTerminationsDrawer from '@/components/RelatedTerminationsDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import CountListPill from '@/components/CountListPill.vue'
import type { ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import type { ReceivableRecord } from '@/types/receivable'
import type { ReceiptRecord } from '@/types/receipt'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import { customerStatusTone } from '@/constants/statusBadges'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
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
import { fetchDocumentTemplates } from '@/api/document-templates'
import { fetchOccupants, createOccupantApi } from '@/api/occupants'
import { fetchRooms } from '@/api/rooms'
import type { BuildingRecord } from '@/types/building'
import type { UserRecord } from '@/types/user'
import type { RoomRecord } from '@/types/room'
import type { CustomerSourceOption } from '@/types/customer-source'
import type { DocumentTemplateRecord } from '@/types/document-template'
import { chunkArray, IMPORT_BATCH_SIZE } from '@/utils/chunk'
import { exportFileSuffix, exportScopeFromCommand } from '@/utils/exportScope'
import { useTableSelection, runServerBatchDelete } from '@/composables/useTableSelection'
import { useBatchProgress } from '@/composables/useBatchProgress'

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const isAdmin = computed(() => userStore.isAdmin)
const { actionColWidth } = useActionColWidth()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, tableLayoutKey } = useTableColWidth()

const keyword = ref('')
const formVisible = ref(false)
const drawerVisible = ref(false)
const relatedOccupantDrawer = ref(false)
const relatedOccupantsListDrawer = ref(false)
const relatedRequirementsListDrawer = ref(false)
const editing = ref<CustomerRecord | null>(null)
const current = ref<CustomerRecord | null>(null)
const relatedOccupant = ref<OccupantRecord | null>(null)
const relatedOccupantsCustomer = ref<CustomerRecord | null>(null)
const relatedRequirementsCustomer = ref<CustomerRecord | null>(null)
const relatedContractsDrawer = ref(false)
const relatedInvoicesDrawer = ref(false)
const relatedReceivablesDrawer = ref(false)
const relatedReceiptsDrawer = ref(false)
const relatedTerminationsDrawer = ref(false)
const relatedDepositRefundsDrawer = ref(false)
const relatedListCustomer = ref<CustomerRecord | null>(null)
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)
const buildings = ref<BuildingRecord[]>([])
const users = ref<UserRecord[]>([])
const sourceOptions = ref<CustomerSourceOption[]>([])
const agreementTemplates = ref<DocumentTemplateRecord[]>([])
const rooms = ref<RoomRecord[]>([])
/** 表单内租用房间多选（存 roomCode，序列化进 rentedRooms） */
const rentedRoomCodes = ref<string[]>([])
/** 新建：是否选用过往使用者 */
const useExistingOccupant = ref(false)
const linkOccupantId = ref('')
/** 编辑：当前主要使用者 ID */
const primaryOccupantId = ref('')
/** 编辑：下拉选中值（使用者 id，或 NEW_OCCUPANT_VALUE 表示新增） */
const NEW_OCCUPANT_VALUE = '__new__'
const primaryOccupantSelect = ref('')
const customerOccupants = ref<OccupantRecord[]>([])
const isCreatingOccupant = computed(
  () => !!editing.value && primaryOccupantSelect.value === NEW_OCCUPANT_VALUE,
)
const customerDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
const occupantDrawerDirection = ref<'ltr' | 'rtl'>('ltr')


function userOptionLabel(u: UserRecord) {
  const name = u.displayName?.trim()
  return name || u.account
}

const sortFilter = useTableSortFilter<CustomerRecord>()
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
  resetPage,
} = useServerPagedList<CustomerRecord, CustomerListQuery>({
  keyword,
  sortFilter,
  buildQuery: ({ keyword: kw, sortBy, sortDir, page: p, pageSize: ps, range, filters: f }) => ({
    keyword: kw,
    statuses: f.status?.length ? [...f.status] : undefined,
    accountManagers: f.accountManager?.length ? [...f.accountManager] : undefined,
    buildingNames: f.buildingName?.length ? [...f.buildingName] : undefined,
    names: f.name?.length ? [...f.name] : undefined,
    primaryContacts: f.primaryContact?.length ? [...f.primaryContact] : undefined,
    sortBy,
    sortDir,
    createdAtFrom: range('createdAt').from,
    createdAtTo: range('createdAt').to,
    page: p,
    pageSize: ps,
  }),
  fetchPage: fetchCustomers,
})

const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
  selectRows,
} = useTableSelection<CustomerRecord>()
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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteCustomersApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadList()
    void loadNameContactFilterOptions()
  } catch {
    finishBatch(0, ids.length)
  } finally {
    batchDeleting.value = false
  }
}

const statusFilterOptions = computed(() =>
  CUSTOMER_STATUSES.map((s) => ({
    value: s,
    label: t(`customer.status.${s}`, s),
  })),
)

const managerFilterOptions = computed(() => {
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

const buildingFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const b of buildings.value) {
    const name = b.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    opts.push({ value: name, label: name })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

/** 客户名 / 主要联络人筛选项：必须来自未按本列筛选的全量数据，否则选中 AB 后 AC 会从选项里消失 */
const customerNameFilterOptions = ref<{ value: string; label: string }[]>([])
const primaryContactFilterOptions = ref<{ value: string; label: string }[]>([])

async function loadNameContactFilterOptions() {
  try {
    const { data } = await fetchCustomers()
    const names = new Set<string>()
    const contacts = new Set<string>()
    for (const c of data.items) {
      const name = c.name?.trim()
      if (name) names.add(name)
      const contact = c.primaryContact?.trim()
      if (contact) contacts.add(contact)
    }
    customerNameFilterOptions.value = [...names]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      .map((v) => ({ value: v, label: v }))
    primaryContactFilterOptions.value = [...contacts]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      .map((v) => ({ value: v, label: v }))
  } catch {
    /* 保留上次选项 */
  }
}

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
  agreementTemplateId: '' as string,
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

/** 启用协议模板 + 当前客户已绑但未在列表中的项（停用后仍可回显） */
const agreementTemplateSelectOptions = computed(() => {
  const opts = [...agreementTemplates.value]
  const currentId = form.agreementTemplateId.trim()
  if (currentId && !opts.some((o) => o.id === currentId)) {
    const name =
      editing.value?.agreementTemplateName?.trim() ||
      t('customer.fields.agreementTemplate')
    opts.unshift({
      id: currentId,
      name,
      type: 'agreement',
      fileName: '',
      storageKey: '',
      enabled: false,
      remark: '',
      createdBy: '',
      updatedBy: '',
      createdAt: '',
      updatedAt: '',
    })
  }
  return opts
})

const occupantSelectOptions = ref<OccupantRecord[]>([])
const occupantSelectLoading = ref(false)

function occupantOptionLabel(o: OccupantRecord) {
  const phone = o.mobilePhone || o.whatsapp || ''
  const cust = o.customerName ? ` · ${o.customerName}` : ''
  return phone ? `${o.name}（${phone}）${cust}` : `${o.name}${cust}`
}

function customerOccupantOptionLabel(o: OccupantRecord) {
  const phone = o.mobilePhone || o.whatsapp || ''
  return phone ? `${o.name}（${phone}）` : o.name
}

async function loadCustomerOccupants(customerId: string) {
  try {
    const { data } = await fetchOccupants({ customerId, pageSize: 200 })
    customerOccupants.value = data.items
  } catch {
    customerOccupants.value = []
  }
}

function onPrimaryOccupantSelectChange(value: string) {
  if (!editing.value) return
  if (value === NEW_OCCUPANT_VALUE) {
    primaryOccupantId.value = ''
    applyOccupantToForm(null)
    return
  }
  primaryOccupantId.value = value
  const hit = customerOccupants.value.find((o) => o.id === value)
  applyOccupantToForm(hit)
}

async function searchOccupantsRemote(query: string) {
  occupantSelectLoading.value = true
  try {
    const { data } = await fetchOccupants({
      keyword: query.trim() || undefined,
      pageSize: 40,
      lite: true,
    })
    occupantSelectOptions.value = data.items
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

async function loadOptions() {
  const [buildingsRes, usersRes, sourcesRes, roomsRes, templatesRes] = await Promise.all([
    fetchBuildings({ activeOnly: false }),
    fetchUsers(),
    fetchCustomerSources({ activeOnly: true }),
    fetchRooms(),
    fetchDocumentTemplates({ type: 'agreement', enabledOnly: true }),
    loadNameContactFilterOptions(),
  ])
  buildings.value = buildingsRes.data.items
  users.value = usersRes.data
  sourceOptions.value = sourcesRes.data
  rooms.value = roomsRes.data.items
  agreementTemplates.value = templatesRes.data
}

onMounted(() => {
  void loadList()
  void loadOptions()
})

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

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  Object.assign(occupantForm, emptyOccupantForm())
  rentedRoomCodes.value = []
  useExistingOccupant.value = false
  linkOccupantId.value = ''
  primaryOccupantId.value = ''
  primaryOccupantSelect.value = ''
  customerOccupants.value = []
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
      agreementTemplateId: data.agreementTemplateId || '',
    })
    rentedRoomCodes.value = parseRentedRoomCodes(data.rentedRooms)
    useExistingOccupant.value = false
    linkOccupantId.value = ''
    await loadCustomerOccupants(data.id)
    if (
      data.primaryOccupantId &&
      data.primaryOccupant &&
      !customerOccupants.value.some((o) => o.id === data.primaryOccupantId)
    ) {
      customerOccupants.value = [
        { ...data.primaryOccupant, id: data.primaryOccupantId } as OccupantRecord,
        ...customerOccupants.value,
      ]
    }
    if (data.primaryOccupantId) {
      primaryOccupantId.value = data.primaryOccupantId
      primaryOccupantSelect.value = data.primaryOccupantId
      const fromList = customerOccupants.value.find((o) => o.id === data.primaryOccupantId)
      applyOccupantToForm(data.primaryOccupant || fromList || null)
    } else if (customerOccupants.value.length) {
      const first = customerOccupants.value[0]
      primaryOccupantId.value = first.id
      primaryOccupantSelect.value = first.id
      applyOccupantToForm(first)
    } else {
      primaryOccupantId.value = ''
      primaryOccupantSelect.value = NEW_OCCUPANT_VALUE
      applyOccupantToForm(null)
    }
    formVisible.value = true
  } catch {
    /* interceptor */
  }
}

function buildOccupantPayload() {
  return {
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
}

function payloadFromForm(opts?: { includeOccupant?: boolean }) {
  const includeOccupant = opts?.includeOccupant !== false
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
    agreementTemplateId: form.agreementTemplateId.trim() || null,
    ...(includeOccupant ? { occupant: buildOccupantPayload() } : {}),
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
  if (editing.value && !isCreatingOccupant.value && !primaryOccupantSelect.value) {
    ElMessage.warning(t('customer.occupantSelectRequired'))
    return
  }
  if (!occupantForm.name.trim()) {
    ElMessage.warning(t('customer.occupantNameRequired'))
    return
  }
  try {
    if (editing.value && isCreatingOccupant.value) {
      const occPayload = buildOccupantPayload()
      const { data: createdOcc } = await createOccupantApi({
        ...occPayload,
        customerId: editing.value.id,
        customerCode: form.customerCode.trim(),
      })
      primaryOccupantId.value = createdOcc.id
      await updateCustomerApi(
        editing.value.id,
        payloadFromForm({ includeOccupant: false }),
      )
      ElMessage.success(t('customer.updated'))
    } else if (editing.value) {
      await updateCustomerApi(editing.value.id, payloadFromForm())
      ElMessage.success(t('customer.updated'))
    } else {
      await createCustomerApi(payloadFromForm())
      ElMessage.success(t('customer.created'))
    }
    formVisible.value = false
    await loadList()
    void loadNameContactFilterOptions()
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
    void loadNameContactFilterOptions()
  } catch {
    /* cancel */
  }
}

function openOccupantsSide(row: CustomerRecord) {
  if (!row.occupantCount) return
  relatedOccupantsCustomer.value = row
  relatedOccupantsListDrawer.value = true
}

function openRequirementsSide(row: CustomerRecord) {
  if (!row.requirementCount) return
  relatedRequirementsCustomer.value = row
  relatedRequirementsListDrawer.value = true
}

function relatedTitle(row: CustomerRecord) {
  return row.customerCode || row.name || ''
}

function openContractsSide(row: CustomerRecord) {
  if (!row.contractCount) return
  relatedListCustomer.value = row
  relatedContractsDrawer.value = true
}
function openInvoicesSide(row: CustomerRecord) {
  if (!row.invoiceCount) return
  relatedListCustomer.value = row
  relatedInvoicesDrawer.value = true
}
function openReceivablesSide(row: CustomerRecord) {
  if (!row.receivableCount) return
  relatedListCustomer.value = row
  relatedReceivablesDrawer.value = true
}
function openReceiptsSide(row: CustomerRecord) {
  if (!row.receiptCount) return
  relatedListCustomer.value = row
  relatedReceiptsDrawer.value = true
}
function openTerminationsSide(row: CustomerRecord) {
  if (!row.terminationCount) return
  relatedListCustomer.value = row
  relatedTerminationsDrawer.value = true
}
function openDepositRefundsSide(row: CustomerRecord) {
  if (!row.depositRefundCount) return
  relatedListCustomer.value = row
  relatedDepositRefundsDrawer.value = true
}

function onOpenContractFromRelated(row: ContractRecord) {
  void relationDrawers.value?.openContractSide(row.id)
}
function onOpenInvoiceFromRelated(row: InvoiceRecord) {
  void relationDrawers.value?.openInvoiceSide(row.id)
}
function onOpenReceivableFromRelated(row: ReceivableRecord) {
  void relationDrawers.value?.openReceivableSide(row.id)
}
function onOpenReceiptFromRelated(row: ReceiptRecord) {
  void relationDrawers.value?.openReceiptSide(row.id)
}
function onOpenTerminationFromRelated(row: LeaseTerminationRecord) {
  void relationDrawers.value?.openTerminationSide(row.id)
}
function onOpenDepositRefundFromRelated(row: DepositRefundRecord) {
  void relationDrawers.value?.openDepositRefundSide(row.id)
}

function onOpenRequirementFromCustomer(requirement: CustomerRequirementRecord) {
  void relationDrawers.value?.openRequirementSide(requirement.id)
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

function onRowClick(row: CustomerRecord, column: { type?: string } | undefined, event: Event) {
  if (column?.type === 'selection') return
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection')) return
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

async function openBuildingSide(buildingId?: string | null) {
  await relationDrawers.value?.openBuildingSide(buildingId)
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
  appendIssues: appendImportIssues,
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
  const scope = exportScopeFromCommand(cmd)
  if (scope) {
    exportCustomersXlsx(scope)
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

async function exportCustomersXlsx(scope: 'page' | 'filtered' | 'all') {
  try {
    exporting.value = true
    let rows: CustomerRecord[]
    if (scope === 'page') {
      rows = [...list.value]
    } else {
      ElMessage.info(t('customer.exportLoading'))
      rows = await fetchExportRows(scope)
    }
    if (!rows.length) {
      ElMessage.warning(t('customer.exportEmpty'))
      return
    }
    const sheetRows = rows.map((r) => customerToIoRow(r, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `customers-${exportFileSuffix(scope)}-${day}.xlsx`)
    ElMessage.success(t('customer.exportDone', { n: rows.length }))
  } catch {
    ElMessage.error(t('customer.importFailed'))
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
        appendImportIssues([
          {
            status: 'skipped',
            reason: t('common.importUi.parseSkipped'),
            keys: {
              客戶編號: String(row['客戶編號'] ?? row['客户编号'] ?? ''),
              客戶名稱: String(row['客戶名稱'] ?? row['客户名称'] ?? ''),
            },
          },
        ])
        continue
      }
      payloads.push({
        customerCode: parsed.customerCode || undefined,
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
        appendImportIssues(data.issues)
      } catch {
        bumpImport('failed', batch.length)
        appendImportIssues(
          batch.map((it) => ({
            status: 'failed' as const,
            reason: t('common.importUi.batchRequestFailed'),
            keys: {
              客戶編號: it.customerCode || '',
              客戶名稱: it.name || '',
            },
          })),
        )
      }
    }

    await loadList()
    void loadNameContactFilterOptions()
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
        <ClearTableFiltersButton :count="activeConditionCount" @clear="onClearFilters" />
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
          <el-button class="room-io-btn" :aria-label="t('customer.dataIo')" :loading="importing || exporting">
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
          class="customer-table--clickable"
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
            prop="customerCode"
            :min-width="codeColW(t('customer.fields.customerCode'), { interactive: true, samples: list.map((r) => r.customerCode) })"
            class-name="col-code"
            label-class-name="col-code"
            fixed="left"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.customerCode')"
                sortable
                :sort-order="sortOrderOf('customerCode')"
                @update:sort-order="(v) => setSort('customerCode', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="name"
            :min-width="textColW(t('customer.fields.name'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.name')"
                filterable
                sortable
                :options="customerNameFilterOptions"
                :model-value="filters.name || []"
                :sort-order="sortOrderOf('name')"
                @update:model-value="(v) => setFilter('name', v)"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('customer.fields.status'),
                statusFilterOptions.map((o) => o.label),
              )
            "
          >
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
          <el-table-column
            prop="accountManager"
            :min-width="colW(t('customer.fields.accountManager'), { interactive: true, contentMin: 128 })"
          >
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
            :min-width="colW(t('customer.fields.primaryContact'), { interactive: true, contentMin: 140 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.primaryContact')"
                filterable
                sortable
                :options="primaryContactFilterOptions"
                :model-value="filters.primaryContact || []"
                :sort-order="sortOrderOf('primaryContact')"
                @update:model-value="(v) => setFilter('primaryContact', v)"
                @update:sort-order="(v) => setSort('primaryContact', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="mobilePhone"
            :label="t('customer.fields.mobilePhone')"
            :min-width="colW(t('customer.fields.mobilePhone'), { contentMin: 120 })"
          />
          <el-table-column
            prop="buildingName"
            :min-width="colW(t('customer.fields.buildingName'), { interactive: true, contentMin: 140 })"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.buildingName')"
                filterable
                sortable
                :options="buildingFilterOptions"
                :model-value="filters.buildingName || []"
                :sort-order="sortOrderOf('buildingName')"
                @update:model-value="(v) => setFilter('buildingName', v)"
                @update:sort-order="(v) => setSort('buildingName', v)"
              />
            </template>
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
          <el-table-column
            :min-width="colW(t('customer.fields.occupantCount'), { interactive: true, contentMin: 100 })"
            align="center"
          >
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
            :min-width="colW(t('customer.fields.requirementCount'), { interactive: true, contentMin: 100 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.requirementCount')"
                sortable
                :sort-order="sortOrderOf('requirementCount')"
                @update:sort-order="(v) => setSort('requirementCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.requirementCount ?? 0"
                @click="openRequirementsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customer.fields.contractCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.contractCount')"
                sortable
                :sort-order="sortOrderOf('contractCount')"
                @update:sort-order="(v) => setSort('contractCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.contractCount ?? 0"
                @click="openContractsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customer.fields.invoiceCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.invoiceCount')"
                sortable
                :sort-order="sortOrderOf('invoiceCount')"
                @update:sort-order="(v) => setSort('invoiceCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.invoiceCount ?? 0"
                @click="openInvoicesSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customer.fields.receivableCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.receivableCount')"
                sortable
                :sort-order="sortOrderOf('receivableCount')"
                @update:sort-order="(v) => setSort('receivableCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receivableCount ?? 0"
                @click="openReceivablesSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customer.fields.receiptCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.receiptCount')"
                sortable
                :sort-order="sortOrderOf('receiptCount')"
                @update:sort-order="(v) => setSort('receiptCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receiptCount ?? 0"
                @click="openReceiptsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customer.fields.terminationCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.terminationCount')"
                sortable
                :sort-order="sortOrderOf('terminationCount')"
                @update:sort-order="(v) => setSort('terminationCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.terminationCount ?? 0"
                @click="openTerminationsSide(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('customer.fields.depositRefundCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('customer.fields.depositRefundCount')"
                sortable
                :sort-order="sortOrderOf('depositRefundCount')"
                @update:sort-order="(v) => setSort('depositRefundCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.depositRefundCount ?? 0"
                @click="openDepositRefundsSide(row)"
              />
            </template>
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

    <CustomerDetailDrawer
      v-model="drawerVisible"
      :customer="current"
      :desktop-direction="customerDrawerDirection"
      @open-occupants="openOccupantsSide"
      @open-requirements="openRequirementsSide"
      @open-contracts="openContractsSide"
      @open-invoices="openInvoicesSide"
      @open-receivables="openReceivablesSide"
      @open-receipts="openReceiptsSide"
      @open-terminations="openTerminationsSide"
      @open-deposit-refunds="openDepositRefundsSide"
      @open-building="openBuildingSide"
    />
    <RelatedOccupantsDrawer
      v-model="relatedOccupantsListDrawer"
      :customer="relatedOccupantsCustomer"
      desktop-direction="ltr"
      @open-occupant="onOpenOccupantFromCustomer"
    />
    <RelatedCustomerRequirementsDrawer
      v-model="relatedRequirementsListDrawer"
      :customer="relatedRequirementsCustomer"
      desktop-direction="ltr"
      @open-requirement="onOpenRequirementFromCustomer"
    />
    <RelatedContractsDrawer
      v-model="relatedContractsDrawer"
      :customer-id="relatedListCustomer?.id"
      :title-context="relatedListCustomer ? relatedTitle(relatedListCustomer) : ''"
      desktop-direction="ltr"
      @open-contract="onOpenContractFromRelated"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id, 'ltr')"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr')"
    />
    <RelatedInvoicesDrawer
      v-model="relatedInvoicesDrawer"
      :customer-id="relatedListCustomer?.id"
      :title-context="relatedListCustomer ? relatedTitle(relatedListCustomer) : ''"
      desktop-direction="ltr"
      @open-invoice="onOpenInvoiceFromRelated"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
    />
    <RelatedReceivablesDrawer
      v-model="relatedReceivablesDrawer"
      :customer-id="relatedListCustomer?.id"
      :title-context="relatedListCustomer ? relatedTitle(relatedListCustomer) : ''"
      desktop-direction="ltr"
      @open-receivable="onOpenReceivableFromRelated"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
    />
    <RelatedReceiptsDrawer
      v-model="relatedReceiptsDrawer"
      :customer-id="relatedListCustomer?.id"
      :title-context="relatedListCustomer ? relatedTitle(relatedListCustomer) : ''"
      desktop-direction="ltr"
      @open-receipt="onOpenReceiptFromRelated"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id)"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id)"
    />
    <RelatedTerminationsDrawer
      v-model="relatedTerminationsDrawer"
      :customer-id="relatedListCustomer?.id"
      :title-context="relatedListCustomer ? relatedTitle(relatedListCustomer) : ''"
      desktop-direction="ltr"
      @open-termination="onOpenTerminationFromRelated"
      @open-contract="(id) => relationDrawers?.openContractSide(id)"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr')"
    />
    <RelatedDepositRefundsDrawer
      v-model="relatedDepositRefundsDrawer"
      :customer-id="relatedListCustomer?.id"
      :title-context="relatedListCustomer ? relatedTitle(relatedListCustomer) : ''"
      desktop-direction="ltr"
      @open-deposit-refund="onOpenDepositRefundFromRelated"
    />
    <RelatedEntityDrawers ref="relationDrawers" />
    <OccupantDetailDrawer
      v-model="relatedOccupantDrawer"
      :occupant="relatedOccupant"
      :desktop-direction="occupantDrawerDirection"
      @open-customer="openCustomerFromOccupant"
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
            <el-form-item :label="t('customer.fields.agreementTemplate')">
              <el-select
                v-model="form.agreementTemplateId"
                clearable
                filterable
                style="width: 100%"
                :placeholder="t('common.pleaseSelect')"
              >
                <el-option
                  v-for="tpl in agreementTemplateSelectOptions"
                  :key="tpl.id"
                  :label="tpl.fileName ? `${tpl.name}（${tpl.fileName}）` : tpl.name"
                  :value="tpl.id"
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
          <p class="form-section-hint">{{ t('customer.occupantHint') }}</p>
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
            <el-form-item
              v-if="editing"
              :label="t('customer.selectPrimaryOccupant')"
              class="span-2"
              required
            >
              <el-select
                v-model="primaryOccupantSelect"
                filterable
                style="width: 100%"
                :placeholder="t('customer.selectPrimaryOccupantPlaceholder')"
                @change="onPrimaryOccupantSelectChange"
              >
                <el-option
                  v-for="o in customerOccupants"
                  :key="o.id"
                  :label="customerOccupantOptionLabel(o)"
                  :value="o.id"
                />
                <el-option
                  :value="NEW_OCCUPANT_VALUE"
                  :label="t('customer.createNewOccupant')"
                />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="editing && isCreatingOccupant"
              class="span-2"
            >
              <el-alert
                type="info"
                :closable="false"
                show-icon
                :title="t('customer.createNewOccupantHint')"
              />
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
