<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, Download, EditPen, Plus, QuestionFilled, Rank, Search, Upload, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  createContractApi,
  batchDeleteContractsApi,
  deleteContractApi,
  fetchContract,
  fetchContractExpiringSoonCount,
  fetchContractOccupancyCounts,
  fetchContractOutstandingReceivableCount,
  fetchContracts,
  fetchIssueBlockedAlerts,
  importContractsApi,
  openContractOrderApi,
  updateContractApi,
} from '@/api/contracts'
import { updateContractExpiringSoonApi } from '@/api/system-settings'
import type {
  ContractExpiringSoonConfig,
  ExpiringSoonStatusMode,
  ExpiringSoonUnit,
} from '@/types/system-setting'
import type { IssueBlockedAlertItem } from '@/api/contracts'
import type {
  ContractListQuery,
  ContractOccupancyCounts,
  ContractWritePayload,
} from '@/api/contracts'
import { fetchCustomers } from '@/api/customers'
import { fetchCustomerRequirements } from '@/api/customer-requirements'
import { fetchRoom, fetchRooms } from '@/api/rooms'
import { fetchUsers } from '@/api/users'
import { fetchContractConfigs } from '@/api/contract-configs'
import type {
  ContractLoanItemNestedRecord,
  ContractPeriodRecord,
  ContractRecord,
} from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import type { ReceivableRecord } from '@/types/receivable'
import type { ReceiptRecord } from '@/types/receipt'
import type { ContractPeriodListRecord } from '@/types/contract-period'
import type { ContractSettlementRecord } from '@/types/contract-settlement'
import type { ContractLoanItemRecord } from '@/types/contract-loan-item'
import type { DepositDeductionRecord } from '@/types/deposit-deduction'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import {
  CONTRACT_PAYMENT_CYCLES,
  CONTRACT_PERIOD_UNITS,
  CONTRACT_STATUSES,
  coerceContractFormStatus,
  coerceContractPaymentCycle,
  contractOccupancyFilterKey,
  contractStatusOptionsForEdit,
  formatContractOccupancyLabel,
  isSigningContractStatus,
} from '@/types/contract'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import {
  fetchBookingDepositByContractApi,
  topUpBookingDepositApi,
  type BookingDepositReceiptSummary,
} from '@/api/receipts'
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
import AttachmentField from '@/components/AttachmentField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ContractDetailDrawer from '@/components/ContractDetailDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedReceivablesDrawer from '@/components/RelatedReceivablesDrawer.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import RelatedPeriodsDrawer from '@/components/RelatedPeriodsDrawer.vue'
import RelatedSettlementsDrawer from '@/components/RelatedSettlementsDrawer.vue'
import RelatedLoanItemsDrawer from '@/components/RelatedLoanItemsDrawer.vue'
import RelatedDepositDeductionsDrawer from '@/components/RelatedDepositDeductionsDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import RelatedEntityDrawers from '@/components/RelatedEntityDrawers.vue'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import ContractReceivePaymentDialog from '@/components/ContractReceivePaymentDialog.vue'
import ContractTerminateDialog from '@/components/ContractTerminateDialog.vue'
import ContractVacateDetailDialog from '@/components/ContractVacateDetailDialog.vue'
import RefundOrderDetailDrawer from '@/components/RefundOrderDetailDrawer.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import ContractCancelDialog from '@/components/ContractCancelDialog.vue'
import ContractSettlementRefundDialog from '@/components/ContractSettlementRefundDialog.vue'
import { fetchContractSettlements } from '@/api/contract-settlements'
import { fetchRefundOrder } from '@/api/refund-orders'
import { fetchCashFlow } from '@/api/cash-flows'
import type { RefundOrderRecord } from '@/types/refund-order'
import type { CashFlowRecord } from '@/types/cash-flow'
import CountListPill from '@/components/CountListPill.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import RefreshListButton from '@/components/RefreshListButton.vue'
import ImportProgressDialog from '@/components/ImportProgressDialog.vue'
import BatchProgressDialog from '@/components/BatchProgressDialog.vue'
import {
  contractOccupancyTone,
  contractStatusTone,
  roomFillStatusTone,
  roomLeaseCapabilityTone,
  type StatusTone,
} from '@/constants/statusBadges'
import ActionDetailButton from '@/components/ActionDetailButton.vue'
import { ACTION_COL_ICON, measureActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import {
  OVERLAY_ABOVE_FEATURE_MENU_Z,
  useOverlayStackZ,
} from '@/composables/useOverlayStackZ'
import { useImportProgress } from '@/composables/useImportProgress'
import { useUserStore } from '@/stores/user'
import { useBuildingScopeStore } from '@/stores/buildingScope'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { formatDateTime, formatMoney } from '@/utils/format'
import { EMPTY_FILTER_VALUE, packFilterValues } from '@/utils/columnFilter'
import {
  addDaysYmd,
  endDateFromDuration,
  findFirstPeriodOverlap,
  inferPeriodDurationFromDates,
} from '@/utils/contractPeriodDuration'
import { needsIssueBeforeSecondBilling } from '@/utils/billingPeriod'
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
import { previewAgreementPdfApi, prefetchAgreementPdfApi, previewAgreementDraftPdfApi } from '@/api/document-templates'
import SuperAdminInlineCell from '@/components/SuperAdminInlineCell.vue'
import {
  CONTRACT_INLINE_FIELDS,
  type ContractInlineField,
} from '@/config/inlineEditWhitelist'

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const buildingScope = useBuildingScopeStore()
const perms = useResourcePermissions('contracts')
const receiptPerms = useResourcePermissions('receipts')
const refundOrderPerms = useResourcePermissions('refundOrders')
const { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

const receivePayVisible = ref(false)
const receivePayContract = ref<ContractRecord | null>(null)
const receivePayZIndex = ref<number | undefined>(undefined)
/** 退租／取消详情弹窗内收款／退款完成后刷新 */
const endDetailRefreshKey = ref(0)

function onReceivePayment(row: ContractRecord, opts?: { zIndex?: number }) {
  receivePayContract.value = row
  if (opts?.zIndex != null) {
    raiseFloor(opts.zIndex)
    receivePayZIndex.value = allocZ(opts.zIndex)
  } else if (contractMoreVisible.value) {
    receivePayZIndex.value = allocZ(FEATURE_DIALOG_ABOVE_MORE_Z)
  } else {
    receivePayZIndex.value = allocZ()
  }
  receivePayVisible.value = true
}

const terminateVisible = ref(false)
const terminateContract = ref<ContractRecord | null>(null)
const terminateZIndex = ref<number | undefined>(undefined)
const vacateDetailVisible = ref(false)
const vacateDetailContract = ref<ContractRecord | null>(null)
/** 详情弹窗结算类型：退租 VACATE／取消 CANCEL */
const endDetailSettlementType = ref<'VACATE' | 'CANCEL'>('VACATE')
const refundOrderDrawerVisible = ref(false)
const refundOrderRecord = ref<RefundOrderRecord | null>(null)
const refundOrderCashFlowsVisible = ref(false)
const refundOrderCashFlowsZIndex = ref<number | undefined>(undefined)
const refundOrderCashFlowDrawerVisible = ref(false)
const refundOrderCashFlowDetailZIndex = ref<number | undefined>(undefined)
const refundOrderCashFlowRecord = ref<CashFlowRecord | null>(null)
const cancelVisible = ref(false)
const cancelContract = ref<ContractRecord | null>(null)
const settlementRefundVisible = ref(false)
const settlementRefundRecord = ref<ContractSettlementRecord | null>(null)
const settlementRefundZIndex = ref<number | undefined>(undefined)

function canTerminateContract(row: ContractRecord) {
  const st = (row.status || '').trim()
  return st === '租賃中' || st === '退租中' || st === '已續約'
}

/** 已退租（或已有终止结算）时可查看退租结算详情 */
function canViewVacateSettlement(row: ContractRecord | null | undefined) {
  if (!row) return false
  if ((row.terminationCount ?? 0) > 0) return true
  return (row.status || '').trim() === '已退租'
}

function isCancelledContractStatus(status?: string | null) {
  return (status || '').trim() === '已取消'
}

/**
 * 結束组主按钮：取消／退租／详情（按状态互斥）
 * - 簽約中 → 取消
 * - 可退租 → 退租
 * - 已退租／有结算 → 详情（退租结算）
 * - 已取消 → 详情（取消结算）
 */
type ContractEndAction = 'cancel' | 'terminate' | 'vacateDetail' | 'cancelDetail'

function endActionOf(row: ContractRecord | null | undefined): ContractEndAction | null {
  if (!row) return null
  if (canTerminateContract(row)) return 'terminate'
  if (canViewVacateSettlement(row)) return 'vacateDetail'
  if (isSigningContractStatus(row.status)) return perms.update ? 'cancel' : null
  if (isCancelledContractStatus(row.status)) return 'cancelDetail'
  return null
}

function endActionLabel(row: ContractRecord | null | undefined) {
  const action = endActionOf(row)
  if (action === 'terminate') return t('contract.terminateLease')
  if (action === 'cancel') return t('contract.cancel')
  if (action === 'vacateDetail' || action === 'cancelDetail') {
    return t('contract.viewVacateSettlement')
  }
  return t('contract.viewVacateSettlement')
}

function endActionDisabledHint(row: ContractRecord | null | undefined) {
  if (endActionOf(row)) return undefined
  if (isSigningContractStatus(row?.status) && !perms.update) {
    return t('contract.cancelOnlySigning')
  }
  return t('contract.terminateOnlyLeased')
}

function onTerminateLease(row: ContractRecord) {
  if (!canTerminateContract(row)) return
  terminateContract.value = row
  terminateZIndex.value = allocZ(
    contractMoreVisible.value ? FEATURE_DIALOG_ABOVE_MORE_Z : undefined,
  )
  terminateVisible.value = true
}

/** 更多菜单結束主按钮：按状态打开取消／退租／对应详情 */
function onContractEndAction(row: ContractRecord) {
  const action = endActionOf(row)
  if (!action) return
  if (action === 'terminate') {
    onTerminateLease(row)
    return
  }
  if (action === 'cancel') {
    openCancelContract(row)
    return
  }
  if (action === 'vacateDetail') {
    openEndSettlementDetail(row, 'VACATE')
    return
  }
  openEndSettlementDetail(row, 'CANCEL')
}

/** 退租／取消结算共用详情弹窗 */
function openEndSettlementDetail(row: ContractRecord, type: 'VACATE' | 'CANCEL') {
  endDetailSettlementType.value = type
  vacateDetailContract.value = row
  vacateDetailZIndex.value = allocZ(
    contractMoreVisible.value ? FEATURE_DIALOG_ABOVE_MORE_Z : undefined,
  )
  vacateDetailVisible.value = true
}

function openVacateDetail(row: ContractRecord) {
  openEndSettlementDetail(row, 'VACATE')
}

function openReceivableFromVacate(id: string) {
  void relationDrawers.value?.openReceivableSide(id, {
    zIndex: vacateDetailZIndex.value,
  })
}

async function openRefundOrderFromVacate(id: string) {
  if (!id) return
  try {
    const { data } = await fetchRefundOrder(id)
    refundOrderRecord.value = data
    refundOrderDrawerZIndex.value = allocZ(vacateDetailZIndex.value)
    refundOrderDrawerVisible.value = true
  } catch {
    /* silent: list request already surfaces errors when needed */
  }
}

function openRefundOrderFromCancel(id: string, opts?: { zIndex?: number }) {
  if (!id) return
  void relationDrawers.value?.openRefundOrderSide(id, opts)
}

async function openRefundOrderFromSettlementRefund(
  id: string,
  opts?: { zIndex?: number },
) {
  if (!id) return
  try {
    const { data } = await fetchRefundOrder(id)
    refundOrderRecord.value = data
    const base = opts?.zIndex ?? settlementRefundZIndex.value
    if (base != null) raiseFloor(base)
    refundOrderDrawerZIndex.value = allocZ(base)
    refundOrderDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openRefundOrderCashFlows(row: RefundOrderRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  refundOrderRecord.value = row
  refundOrderCashFlowsZIndex.value = allocZ(refundOrderDrawerZIndex.value)
  refundOrderCashFlowsVisible.value = true
}

async function openRefundOrderCashFlowDetail(row: CashFlowRecord) {
  try {
    const { data } = await fetchCashFlow(row.id)
    refundOrderCashFlowRecord.value = data
  } catch {
    refundOrderCashFlowRecord.value = row
  }
  refundOrderCashFlowDetailZIndex.value = allocZ(refundOrderCashFlowsZIndex.value)
  refundOrderCashFlowDrawerVisible.value = true
}

function openCancelContract(row: ContractRecord) {
  if (!perms.update) return
  if (!isSigningContractStatus(row.status)) {
    void ElMessageBox.alert(
      t('contract.cancelOnlySigning'),
      t('contract.cancel'),
      messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
    )
    return
  }
  cancelContract.value = row
  cancelVisible.value = true
}

function canCancelRefund(row?: ContractRecord | null) {
  if (!row || !isCancelledContractStatus(row.status)) return false
  return row.cancelRefundPending !== false
}

/** 结算是否仍有待退（可办理退款单打款） */
function settlementHasRefundPending(row: ContractSettlementRecord) {
  const st = (row.refundStatus || row.status || '').trim()
  if (st === 'pending_refund' || st === 'partial') return true
  const due = Number(row.refundDueTotal) || 0
  const got = Number(row.refundedTotal) || 0
  return due - got > 0.009
}

/**
 * 合约「办理退款」入口（取消／退租统一：退款单打款，refundOrders:update）
 */
function canOfferContractRefund(row?: ContractRecord | null) {
  if (!row || !refundOrderPerms.update) return false
  if (canCancelRefund(row)) return true
  if (canViewVacateSettlement(row)) return true
  return false
}

function contractRefundDisabledHint(row?: ContractRecord | null) {
  if (!row) return t('contract.refundEntryUnavailable')
  if (!refundOrderPerms.update) {
    return t('contract.vacateRefundNoPerm')
  }
  if (isCancelledContractStatus(row.status)) {
    return t('contract.cancelRefundNothingPending')
  }
  if (canViewVacateSettlement(row)) {
    return t('contract.vacateRefundNothingPending')
  }
  return t('contract.refundEntryUnavailable')
}

/** 打开结算退款单打款弹窗（取消 CANCEL / 退租 VACATE 共用样式） */
async function openSettlementRefundByType(
  row: ContractRecord,
  type: 'CANCEL' | 'VACATE',
  opts?: { zIndex?: number },
) {
  if (!refundOrderPerms.update) {
    await ElMessageBox.alert(
      t('contract.vacateRefundNoPerm'),
      t('contract.cancelRefund'),
      messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
    )
    return
  }
  const emptyHint =
    type === 'CANCEL'
      ? t('contract.cancelRefundNothingPending')
      : t('contract.vacateRefundNothingPending')
  const failHint =
    type === 'CANCEL'
      ? t('contract.cancelRefundLoadFailed')
      : t('contract.vacateRefundLoadFailed')
  try {
    const { data } = await fetchContractSettlements({
      contractId: row.id,
      types: [type],
      pageSize: 20,
    })
    const settlement =
      (data.items || []).find((s) => settlementHasRefundPending(s)) || null
    if (!settlement) {
      if (type === 'CANCEL') row.cancelRefundPending = false
      await ElMessageBox.alert(
        emptyHint,
        t('contract.cancelRefund'),
        messageBoxOpts({ type: 'info', confirmButtonText: t('common.confirm') }),
      )
      return
    }
    settlementRefundRecord.value = settlement
    const base =
      opts?.zIndex ??
      (contractMoreVisible.value ? FEATURE_DIALOG_ABOVE_MORE_Z : undefined)
    if (base != null) raiseFloor(base)
    settlementRefundZIndex.value = allocZ(base)
    settlementRefundVisible.value = true
  } catch {
    await ElMessageBox.alert(
      failHint,
      t('contract.cancelRefund'),
      messageBoxOpts({ type: 'error', confirmButtonText: t('common.confirm') }),
    )
  }
}

/** 统一入口：取消／退租均走结算退款单打款弹窗 */
async function openContractRefund(row: ContractRecord, opts?: { zIndex?: number }) {
  if (canCancelRefund(row)) {
    await openSettlementRefundByType(row, 'CANCEL', opts)
    return
  }
  if (canViewVacateSettlement(row)) {
    await openSettlementRefundByType(row, 'VACATE', opts)
    return
  }
  await ElMessageBox.alert(
    t('contract.refundEntryUnavailable'),
    t('contract.cancelRefund'),
    messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
  )
}

function onCollectFromEndDetail() {
  const row = vacateDetailContract.value
  if (!row) return
  onReceivePayment(row, { zIndex: vacateDetailZIndex.value })
}

function onRefundFromEndDetail() {
  const row = vacateDetailContract.value
  if (!row) return
  void openContractRefund(row, { zIndex: vacateDetailZIndex.value })
}

function onReceivePayCollected() {
  void loadList()
  if (vacateDetailVisible.value) endDetailRefreshKey.value += 1
}

function onSettlementRefundDone() {
  void loadList()
  if (vacateDetailVisible.value) endDetailRefreshKey.value += 1
}

function onRenewContractPlaceholder() {
  ElMessage.info(t('contract.featureComingSoon'))
}

/** 整页共用「更多」菜单状态（须早于 messageBoxOpts / 各操作，供 MessageBox 抬层判断） */
const contractMoreRow = ref<ContractRecord | null>(null)
const contractMoreVisible = ref(false)
const contractMoreStyle = ref<Record<string, string>>({})
/** 更多面板 z-index；功能弹窗打开时压低，让默认 EP overlay（≈2000+）盖住 */
const CONTRACT_MORE_MENU_Z = 3200
const CONTRACT_MORE_MENU_Z_UNDER_OVERLAY = 1500
/**
 * 仅用于仍须盖过「更多」面板的功能弹窗（取消／开单等）。
 * 勿再给 MessageBox 传高 zIndex——EP 打开时会 nextZIndex() 覆盖，提示会落到弹窗下；
 * 全局已把 MessageBox append 到当前弹窗 overlay 内。
 */
const FEATURE_DIALOG_ABOVE_MORE_Z = OVERLAY_ABOVE_FEATURE_MENU_Z
const { allocZ, raiseFloor } = useOverlayStackZ()
const vacateDetailZIndex = ref<number | undefined>(undefined)
const refundOrderDrawerZIndex = ref<number | undefined>(undefined)

function messageBoxOpts(base: Record<string, unknown> = {}) {
  return base
}

/** 功能弹窗／抽屉是否打开（用于压低更多面板 z-index，不阻止悬停关闭） */
function isContractMoreFeatureUiOpen() {
  return (
    openOrderVisible.value ||
    topUpVisible.value ||
    terminateVisible.value ||
    vacateDetailVisible.value ||
    cancelVisible.value ||
    settlementRefundVisible.value ||
    relatedInvoicesDrawerVisible.value
  )
}

/** MessageBox 确认中（取消／删除）：悬停移开时仍保留面板上下文 */
function hasOpenMessageBox() {
  return !!document.querySelector(
    '.el-message-box__wrapper, .el-overlay-message-box, .el-overlay.is-message-box',
  )
}

/** 刚点开功能时短暂钉住，避免弹层盖住瞬间 mouseleave／blur 抢先关面板 */
let contractMoreFeaturePinUntil = 0

function pinContractMoreForFeatureUi() {
  clearContractMoreCloseTimer()
  contractMoreFeaturePinUntil = Date.now() + 600
  syncContractMoreMenuZIndex()
}

function shouldKeepContractMoreOpen() {
  if (hasOpenMessageBox()) return true
  if (isContractMoreFeatureUiOpen()) return true
  if (Date.now() < contractMoreFeaturePinUntil) return true
  return false
}

function contractMoreMenuZIndex() {
  return shouldKeepContractMoreOpen()
    ? CONTRACT_MORE_MENU_Z_UNDER_OVERLAY
    : CONTRACT_MORE_MENU_Z
}

function syncContractMoreMenuZIndex() {
  if (!contractMoreVisible.value) return
  contractMoreStyle.value = {
    ...contractMoreStyle.value,
    zIndex: String(contractMoreMenuZIndex()),
  }
}

/** @returns 是否已完成删除（确认并成功）；取消 MessageBox 时为 false，面板应保持打开 */
async function onDeleteContract(row: ContractRecord): Promise<boolean> {
  if (!perms.delete) return false
  try {
    await ElMessageBox.confirm(
      t('contract.deleteConfirm', { code: row.contractCode }),
      t('common.deleteTitle'),
      messageBoxOpts({ type: 'warning' }),
    )
    await deleteContractApi(row.id)
    ElMessage.success(t('contract.deleted'))
    if (current.value?.id === row.id) {
      drawerVisible.value = false
      current.value = null
    }
    await loadHeadChipCounts()
    await loadList()
    return true
  } catch {
    /* cancel / interceptor */
    return false
  }
}

const printingAgreementId = ref<string | null>(null)
const previewingDraft = ref(false)

/** 仅「簽約中」可开单（上传签约文件 → 租赁中） */
function canOpenOrderSign(row: ContractRecord) {
  return isSigningContractStatus(row.status)
}

const openOrderVisible = ref(false)
const openOrderSaving = ref(false)
const openOrderTarget = ref<ContractRecord | null>(null)
const openOrderAttachment = ref('')

/** @returns 是否已打开开单对话框；状态不允许时弹 MessageBox 并返回 false（不关更多面板） */
async function onOpenOrderClick(row: ContractRecord): Promise<boolean> {
  if (!canOpenOrderSign(row)) {
    try {
      await ElMessageBox.alert(
        t('contract.openOrderStatusNotAllowed'),
        t('contract.openOrder'),
        messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
      )
    } catch {
      /* dismiss */
    }
    return false
  }
  if (!perms.update) return false
  openOrderTarget.value = row
  openOrderAttachment.value = row.attachment || ''
  openOrderVisible.value = true
  return true
}

async function submitOpenOrder() {
  const row = openOrderTarget.value
  if (!row) return
  const attachment = openOrderAttachment.value.trim()
  if (!attachment) {
    ElMessage.warning(t('contract.openOrderAttachmentRequired'))
    return
  }
  openOrderSaving.value = true
  try {
    const { data } = await openContractOrderApi(row.id, attachment)
    const idx = list.value.findIndex((r) => r.id === row.id)
    if (idx >= 0) list.value[idx] = { ...list.value[idx], ...data }
    if (current.value?.id === row.id) current.value = { ...current.value, ...data }
    openOrderVisible.value = false
    ElMessage.success(t('contract.openOrderDone'))
    void loadIssueBlockedAlerts()
  } catch {
    /* interceptor */
  } finally {
    openOrderSaving.value = false
  }
}

async function onPrintAgreement(row: ContractRecord) {
  if (!row?.id || printingAgreementId.value) return
  printingAgreementId.value = row.id
  try {
    await previewAgreementPdfApi(row.id, { autoPrint: false })
    ElMessage.success(t('contract.printAgreementPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.printAgreementFailed')
    ElMessage.error(msg)
  } finally {
    printingAgreementId.value = null
  }
}

/** 编辑弹窗预览：使用当前表单（含未保存修改） */
async function onPreviewAgreementDraft() {
  const row = editing.value
  if (!row?.id || previewingDraft.value) return
  if (!form.roomId.trim()) {
    ElMessage.warning(t('contract.roomRequired'))
    return
  }
  if (!form.customerId.trim()) {
    ElMessage.warning(t('contract.customerRequired'))
    return
  }
  previewingDraft.value = true
  try {
    const payload = payloadFromForm()
    await previewAgreementDraftPdfApi(row.id, {
      contractCode: payload.contractCode || row.contractCode,
      roomId: payload.roomId,
      customerId: payload.customerId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      leaseType: payload.leaseType,
      paymentCycle: payload.paymentCycle,
      monthlyRent: payload.monthlyRent,
      roomDeposit: payload.roomDeposit,
      bookingDeposit: payload.bookingDeposit,
      miscDeposit: payload.miscDeposit,
      electricityRate: payload.electricityRate,
      doorKeyQty: payload.doorKeyQty,
      mailboxKeyQty: payload.mailboxKeyQty,
      roomNameText: payload.roomNameText,
      remark: payload.remark,
      periods: payload.periods,
    })
    ElMessage.success(t('contract.printAgreementPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.printAgreementFailed')
    ElMessage.error(msg)
  } finally {
    previewingDraft.value = false
  }
}

const formVisible = ref(false)
const formSaving = ref(false)
const editing = ref<ContractRecord | null>(null)
const roomSelectOptions = ref<RoomRecord[]>([])
/** 房間下拉頂部：租用方式粗篩（再選房間） */
type RoomPickMode = 'all' | 'whole' | 'part'
const roomPickMode = ref<RoomPickMode>('all')
const roomPickModeChips = computed(() => [
  { key: 'all' as const, label: t('contract.roomPickModeAll') },
  { key: 'whole' as const, label: t('contract.roomPickModeWhole') },
  { key: 'part' as const, label: t('contract.roomPickModePart') },
])
/** 僅首屏 / 搜尋重置時驅動 el-select loading，追加加載不用，避免下拉閃動 */
const roomSelectLoading = ref(false)
const roomSelectLoadingMore = ref(false)
const customerSelectOptions = ref<CustomerRecord[]>([])
const customerSelectLoading = ref(false)
const customerSelectLoadingMore = ref(false)
const users = ref<UserRecord[]>([])
const customerRequirements = ref<CustomerRequirementRecord[]>([])
const periodTypeOptions = ref<ContractConfigOption[]>([])
const leaseTypeOptions = ref<ContractConfigOption[]>([])
const keyDepositOptions = ref<ContractConfigOption[]>([])
const keyword = ref('')
/** 下拉無限滾動：首屏 / 每次追加條數 */
const SELECT_PAGE_SIZE = 20
const roomSelectPage = ref(1)
const roomSelectHasMore = ref(true)
const roomSelectKeyword = ref('')
const customerSelectPage = ref(1)
const customerSelectHasMore = ref(true)
const customerSelectKeyword = ref('')
let roomSelectScrollEl: HTMLElement | null = null
let customerSelectScrollEl: HTMLElement | null = null
let roomSelectScrollHandler: ((e: Event) => void) | null = null
let customerSelectScrollHandler: ((e: Event) => void) | null = null

const doorKeyUnitPrice = computed(() => {
  const hit = keyDepositOptions.value.find((o) => o.code === KEY_DEPOSIT_CODES.door)
  return hit?.unitPrice ?? 0
})
const mailboxKeyUnitPrice = computed(() => {
  const hit = keyDepositOptions.value.find((o) => o.code === KEY_DEPOSIT_CODES.mailbox)
  return hit?.unitPrice ?? 0
})
const doorKeyQtyLabel = computed(
  () =>
    `${t('contract.fields.doorKeyQty')}（${formatMoney(doorKeyUnitPrice.value)}/${t('contract.fields.keyUnit')}）`,
)
const mailboxKeyQtyLabel = computed(
  () =>
    `${t('contract.fields.mailboxKeyQty')}（${formatMoney(mailboxKeyUnitPrice.value)}/${t('contract.fields.keyUnit')}）`,
)

const drawerVisible = ref(false)
const current = ref<ContractRecord | null>(null)
const contractDrawerDirection = ref<'ltr' | 'rtl'>('rtl')
const relationDrawers = ref<InstanceType<typeof RelatedEntityDrawers> | null>(null)

// 相关记录抽屉
const relatedInvoicesDrawerVisible = ref(false)
const relatedInvoicesZIndex = ref<number | undefined>(undefined)
const relatedReceivablesDrawerVisible = ref(false)
const relatedReceivablesZIndex = ref<number | undefined>(undefined)
const relatedReceiptsDrawerVisible = ref(false)
const relatedReceiptsZIndex = ref<number | undefined>(undefined)
const relatedCashFlowsVisible = ref(false)
const relatedCashFlowsZIndex = ref<number | undefined>(undefined)
const relatedCashFlowDrawerVisible = ref(false)
const relatedCashFlowDetailZIndex = ref<number | undefined>(undefined)
const relatedCashFlowRecord = ref<CashFlowRecord | null>(null)
const relatedPeriodsDrawerVisible = ref(false)
const relatedPeriodsZIndex = ref<number | undefined>(undefined)
const relatedSettlementsDrawerVisible = ref(false)
const relatedSettlementsZIndex = ref<number | undefined>(undefined)
const relatedLoanItemsDrawerVisible = ref(false)
const relatedLoanItemsZIndex = ref<number | undefined>(undefined)
const relatedDepositDeductionsDrawerVisible = ref(false)
const relatedDepositDeductionsZIndex = ref<number | undefined>(undefined)
const relatedDepositRefundsDrawerVisible = ref(false)
const relatedDepositRefundsZIndex = ref<number | undefined>(undefined)
const relatedInvoicesContract = ref<ContractRecord | null>(null)
const relatedReceivablesContract = ref<ContractRecord | null>(null)
const relatedReceiptsContract = ref<ContractRecord | null>(null)
const relatedCashFlowsContract = ref<ContractRecord | null>(null)
const relatedPeriodsContract = ref<ContractRecord | null>(null)
const relatedSettlementsContract = ref<ContractRecord | null>(null)
const relatedLoanItemsContract = ref<ContractRecord | null>(null)
const relatedDepositDeductionsContract = ref<ContractRecord | null>(null)
const relatedDepositRefundsContract = ref<ContractRecord | null>(null)

const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  dateRanges,
  sortOrderOf,
  clearAll,
  sortKey,
  sortOrder,
  uniqueOptions,
} = useTableSortFilter<ContractRecord>()

/** 页头快捷筛选：null=全部，whole/part 对应占用方式 */
const occupancyModeFilter = ref<'whole' | 'part' | null>(null)
const occupancyModeCounts = ref<ContractOccupancyCounts>({ all: 0, whole: 0, part: 0 })
/** 与整租/分租并行；条件由 SuperAdmin 在芯片旁编辑 */
const expiringSoonFilter = ref(false)
const expiringSoonCount = ref(0)
const expiringSoonTip = ref('')
const expiringSoonConfig = ref<ContractExpiringSoonConfig>({
  amount: 30,
  unit: 'day',
  statusMode: 'include',
  statuses: ['租賃中', '退租中'],
})
/** 与整租/分租/即将到期并行：当前应收金额 > 0 */
const outstandingReceivableFilter = ref(false)
const outstandingReceivableCount = ref(0)
const expiringEditVisible = ref(false)
const expiringEditSaving = ref(false)
const expiringEditForm = reactive({
  amount: 30,
  unit: 'day' as ExpiringSoonUnit,
  statusMode: 'include' as ExpiringSoonStatusMode,
  statuses: ['租賃中', '退租中'] as string[],
})

const expiringEditStatusOptions = computed(() =>
  CONTRACT_STATUSES.map((s) => ({
    value: s,
    label: t(`contract.status.${s}`),
  })),
)

const expiringEditAmountMax = computed(() => (expiringEditForm.unit === 'month' ? 36 : 365))

/**
 * 「全部」= 整表不过滤（占用 / 需收款 / 即将到期皆未开）。
 * 整租·分租 与 需收款、即将到期 分属 | 组，组间可并行；与「全部」互斥。
 */
const allChipActive = computed(
  () =>
    occupancyModeFilter.value === null &&
    !outstandingReceivableFilter.value &&
    !expiringSoonFilter.value,
)

const occupancyModeChips = computed(() => [
  {
    key: 'whole' as const,
    label: t('contract.occupancyWhole'),
    count: occupancyModeCounts.value.whole,
  },
  {
    key: 'part' as const,
    label: t('contract.occupancyPart'),
    count: occupancyModeCounts.value.part,
  },
])

async function loadOccupancyModeCounts() {
  try {
    const { data } = await fetchContractOccupancyCounts()
    occupancyModeCounts.value = data
  } catch {
    /* interceptor */
  }
}

function applyExpiringSoonTip(cfg: ContractExpiringSoonConfig) {
  const unitLabel =
    cfg.unit === 'month' ? t('contract.expiringSoonUnitMonth') : t('contract.expiringSoonUnitDay')
  const statusList = (cfg.statuses || [])
    .map((s) => {
      const key = `contract.status.${s}`
      return t(key) === key ? s : t(key)
    })
    .join('、')
  let statusPart = t('contract.expiringSoonStatusAll')
  if (cfg.statusMode === 'include' && statusList) {
    statusPart = t('contract.expiringSoonStatusInclude', { list: statusList })
  } else if (cfg.statusMode === 'exclude' && statusList) {
    statusPart = t('contract.expiringSoonStatusExclude', { list: statusList })
  }
  expiringSoonTip.value = t('contract.expiringSoonTip', {
    amount: cfg.amount,
    unit: unitLabel,
    status: statusPart,
  })
}

async function loadExpiringSoonCount() {
  try {
    const { data } = await fetchContractExpiringSoonCount()
    expiringSoonCount.value = data.count
    expiringSoonConfig.value = { ...data.config, statuses: [...(data.config.statuses || [])] }
    applyExpiringSoonTip(expiringSoonConfig.value)
  } catch {
    /* interceptor */
  }
}

function seedExpiringEditForm() {
  const cfg = expiringSoonConfig.value
  expiringEditForm.amount = cfg.amount
  expiringEditForm.unit = cfg.unit
  expiringEditForm.statusMode = cfg.statusMode
  expiringEditForm.statuses = [...cfg.statuses]
}

function onExpiringEditUnitChange() {
  const max = expiringEditForm.unit === 'month' ? 36 : 365
  if (expiringEditForm.amount > max) expiringEditForm.amount = max
}

function onExpiringEditStatusModeChange() {
  if (
    (expiringEditForm.statusMode === 'include' || expiringEditForm.statusMode === 'exclude') &&
    expiringEditForm.statuses.length === 0
  ) {
    expiringEditForm.statuses = ['租賃中', '退租中']
  }
}

async function saveExpiringEdit() {
  if (!userStore.isSuperAdmin) return
  const amount = Math.trunc(Number(expiringEditForm.amount))
  const max = expiringEditForm.unit === 'month' ? 36 : 365
  if (!Number.isFinite(amount) || amount < 1 || amount > max) {
    ElMessage.warning(t('systemSettings.expiringAmountInvalid'))
    return
  }
  if (
    (expiringEditForm.statusMode === 'include' || expiringEditForm.statusMode === 'exclude') &&
    expiringEditForm.statuses.length === 0
  ) {
    ElMessage.warning(t('systemSettings.expiringStatusesRequired'))
    return
  }
  expiringEditSaving.value = true
  try {
    const { data } = await updateContractExpiringSoonApi({
      amount,
      unit: expiringEditForm.unit,
      statusMode: expiringEditForm.statusMode,
      statuses: expiringEditForm.statusMode === 'all' ? [] : [...expiringEditForm.statuses],
    })
    expiringSoonConfig.value = {
      ...data.contractExpiringSoon,
      statuses: [...data.contractExpiringSoon.statuses],
    }
    applyExpiringSoonTip(expiringSoonConfig.value)
    await loadExpiringSoonCount()
    if (expiringSoonFilter.value) {
      resetPage()
      await loadList()
    }
    expiringEditVisible.value = false
    ElMessage.success(t('contract.expiringSoonSaved'))
  } catch {
    /* interceptor */
  } finally {
    expiringEditSaving.value = false
  }
}

async function loadOutstandingReceivableCount() {
  try {
    const { data } = await fetchContractOutstandingReceivableCount()
    outstandingReceivableCount.value = data.count
  } catch {
    /* interceptor */
  }
}

async function loadHeadChipCounts() {
  await Promise.all([
    loadOccupancyModeCounts(),
    loadExpiringSoonCount(),
    loadOutstandingReceivableCount(),
  ])
}

async function onRefreshList() {
  await Promise.all([loadList(), loadHeadChipCounts()])
}

const {
  loading,
  exporting,
  list,
  total,
  page,
  pageSize,
  pageSizes,
  rowIndex,
  resetPage,
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
    const chipKey = occupancyModeFilter.value
    const soon = expiringSoonFilter.value
    const outstanding = outstandingReceivableFilter.value
    return {
      keyword: kw,
      buildingIds: packFilterValues(f.buildingId),
      // 即将到期时状态由系统设置接管，避免与表头状态互斥
      statuses: soon ? undefined : packFilterValues(f.status),
      contractCodes: packFilterValues(f.contractCode),
      roomCodes: packFilterValues(f.roomCode),
      customerNames: packFilterValues(f.customerName),
      salesManagers: packFilterValues(f.salesManager),
      // 页头胶囊优先；未选时才用表头「租賃方式」细筛
      occupancyKeys: chipKey ? [chipKey] : packFilterValues(f.leaseType),
      monthlyRents: packFilterValues(f.monthlyRent),
      paymentCycles: packFilterValues(f.paymentCycle),
      sortBy,
      sortDir,
      startDateFrom: start.from,
      startDateTo: start.to,
      endDateFrom: end.from,
      endDateTo: end.to,
      createdAtFrom: created.from,
      createdAtTo: created.to,
      createdAtEmpty: (f.createdAt || []).includes(EMPTY_FILTER_VALUE) || undefined,
      startDateEmpty: (f.startDate || []).includes(EMPTY_FILTER_VALUE) || undefined,
      endDateEmpty: (f.endDate || []).includes(EMPTY_FILTER_VALUE) || undefined,
      createdBys: packFilterValues(f.createdBy),
      expiringSoon: soon || undefined,
      hasOutstandingReceivable: outstanding || undefined,
      rentCollectionStatuses: packFilterValues(f.rentCollectionStatus),
      page: p,
      pageSize: ps,
    }
  },
  fetchPage: fetchContracts,
})

/** 点「全部」：清除所有页头快捷筛选（整表不过滤） */
function selectAllChip() {
  if (allChipActive.value) return
  occupancyModeFilter.value = null
  outstandingReceivableFilter.value = false
  expiringSoonFilter.value = false
  if (filters.leaseType?.length) setFilter('leaseType', [])
  resetPage()
  void loadList()
}

function setOccupancyModeFilter(key: 'whole' | 'part') {
  // 再点已选 → 取消占用筛选（仍可保留需收款 / 即将到期）
  occupancyModeFilter.value = occupancyModeFilter.value === key ? null : key
  if (filters.leaseType?.length) setFilter('leaseType', [])
  resetPage()
  void loadList()
}

function toggleExpiringSoonFilter() {
  expiringSoonFilter.value = !expiringSoonFilter.value
  resetPage()
  void loadList()
}

function toggleOutstandingReceivableFilter() {
  outstandingReceivableFilter.value = !outstandingReceivableFilter.value
  resetPage()
  void loadList()
}

/** 自动开票提前天数（系统设置；提示用） */
const rentInvoiceLeadDays = ref(7)

function contractNeedsIssueBeforeSecond(row: {
  status: string
  startDate: string
  endDate: string
  paymentCycle: string
  periods?: ContractPeriodRecord[]
}) {
  return needsIssueBeforeSecondBilling({
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    paymentCycle: row.paymentCycle,
    periods: row.periods,
    leadDays: rentInvoiceLeadDays.value,
    isSigning: isSigningContractStatus,
  })
}

function issueBlockedRowTip(row: ContractRecord) {
  const hit = contractNeedsIssueBeforeSecond(row)
  if (!hit.needed) return ''
  return t('contract.issueBlockedRowTip', {
    date: hit.secondPeriodStart || '—',
    days: rentInvoiceLeadDays.value,
  })
}

function findIssueBlockedRow(id: string) {
  return list.value.find((r) => r.id === id) ?? null
}

function openIssueBlockedDetail(id: string) {
  const row = findIssueBlockedRow(id)
  if (row) {
    void openDetail(row, 'rtl')
    return
  }
  // 不在当前页：仍可拉详情
  void openDetail({ id } as ContractRecord, 'rtl')
}

function openIssueBlockedOrder(id: string) {
  const row = findIssueBlockedRow(id)
  if (row) {
    onOpenOrderClick(row)
    return
  }
  // 不在当前页：先拉详情再开单
  void (async () => {
    try {
      const { data } = await fetchContract(id)
      onOpenOrderClick(data)
    } catch {
      /* interceptor */
    }
  })()
}

/** 全量紧急待开单（不受分页限制；后端按紧急程度排序） */
const issueBlockedAlerts = ref<IssueBlockedAlertItem[]>([])
const issueBlockedLeadDays = ref(7)

async function loadIssueBlockedAlerts() {
  try {
    const { data } = await fetchIssueBlockedAlerts()
    issueBlockedAlerts.value = data.items || []
    const n = Math.trunc(Number(data.leadDays))
    if (Number.isFinite(n) && n >= 1) {
      issueBlockedLeadDays.value = Math.min(90, n)
      rentInvoiceLeadDays.value = issueBlockedLeadDays.value
    }
  } catch {
    issueBlockedAlerts.value = []
  }
}

function issueBlockedUrgencyText(item: IssueBlockedAlertItem) {
  if (item.daysUntilSecond < 0) {
    return t('contract.issueBlockedOverdue', { n: Math.abs(item.daysUntilSecond) })
  }
  if (item.daysUntilSecond === 0) return t('contract.issueBlockedToday')
  return t('contract.issueBlockedInDays', { n: item.daysUntilSecond })
}

/** 编辑表单内：当前签约中合约是否已逼近第 2 期 */
const formIssueBlockedHint = computed(() => {
  if (formReadonly.value) return null
  const status = editing.value?.status || '簽約中'
  if (!isSigningContractStatus(status)) return null
  const hit = needsIssueBeforeSecondBilling({
    status,
    startDate: form.startDate,
    endDate: form.endDate,
    paymentCycle: form.paymentCycle,
    periods: periods.value.map((p) => ({
      dateType: p.dateType,
      startDate: p.startDate,
      endDate: p.endDate,
      sortOrder: p.sortOrder,
    })),
    leadDays: rentInvoiceLeadDays.value,
    isSigning: isSigningContractStatus,
  })
  return hit.needed ? hit : null
})

/** 非签约中打开表单为只读查看 */
const formReadonly = computed(
  () => Boolean(editing.value && !isSigningContractStatus(editing.value.status)),
)

/**
 * 编辑合约时定金本金／收款信息只读：未收也须走「加收定金」，勿在编辑弹窗直接改金额。
 * 新建合约仍可在表单一次性填写已收定金。
 */
const bookingDepositLocked = computed(() => Boolean(editing.value))

/** 签约中 + 收据新增权限 → 可加收（含创建时未收定金、后续首次收取） */
function canTopUpBookingDeposit(row: ContractRecord | null | undefined) {
  return Boolean(row?.id) && isSigningContractStatus(row?.status) && receiptPerms.create
}

function topUpBookingDepositDisabledReason(row: ContractRecord | null | undefined) {
  if (!row) return t('receipt.bookingDeposit.topUpOnlySigning')
  if (!receiptPerms.create) return t('receipt.bookingDeposit.topUpNeedPermission')
  if (!isSigningContractStatus(row.status)) return t('receipt.bookingDeposit.topUpOnlySigning')
  return ''
}

const canTopUpBookingDepositInForm = computed(
  () => Boolean(editing.value) && !formReadonly.value && canTopUpBookingDeposit(editing.value),
)

/** 加收弹窗：尚无定金收据时不可选「合并」 */
const topUpHasExistingReceipts = computed(() => topUpReceiptOptions.value.length > 0)

const topUpVisible = ref(false)
const topUpSubmitting = ref(false)
/** 加收目标合约（编辑弹窗或更多菜单共用） */
const topUpTarget = ref<ContractRecord | null>(null)
const topUpReceiptOptions = ref<BookingDepositReceiptSummary[]>([])
const topUpReceiptsLoading = ref(false)
/** 目标收据收款方式（合并校验用；来自账户接口或合约定金方式兜底） */
const topUpReceiptMethods = ref<Record<string, string>>({})
const topUpForm = reactive({
  mode: 'new_receipt' as 'new_receipt' | 'merge',
  mergeReceiptId: '' as string,
  amount: null as number | null,
  paymentDate: '' as string,
  paymentMethod: null as string | null,
  paymentVoucher: '',
  remark: '',
})

function todayYmdLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const mergeTargetReceiptMethod = computed(() => {
  const id = topUpForm.mergeReceiptId
  if (!id) return null
  const fromMap = (topUpReceiptMethods.value[id] || '').trim()
  if (fromMap) return fromMap
  // 兜底：合约当前定金收款方式（多为首张）
  const fromTarget = (topUpTarget.value?.paymentMethod || '').trim()
  if (fromTarget) return fromTarget
  if (editing.value?.id && topUpTarget.value?.id === editing.value.id) {
    return (form.paymentMethod || '').trim() || null
  }
  return null
})

function applyMergePaymentMethodLock() {
  if (topUpForm.mode !== 'merge') return
  topUpForm.paymentMethod = mergeTargetReceiptMethod.value
}

function setTopUpMode(mode: 'new_receipt' | 'merge') {
  if (mode === 'merge' && !topUpHasExistingReceipts.value) {
    topUpForm.mode = 'new_receipt'
    return
  }
  topUpForm.mode = mode
  if (mode === 'merge') {
    if (!topUpForm.mergeReceiptId && topUpReceiptOptions.value.length) {
      // 默认合并到最新一张（更可能尚未交给租客）
      const newest = topUpReceiptOptions.value[topUpReceiptOptions.value.length - 1]
      topUpForm.mergeReceiptId = newest?.id || ''
    }
    applyMergePaymentMethodLock()
  }
}

async function loadTopUpReceiptOptions(contractId: string) {
  topUpReceiptsLoading.value = true
  try {
    const { data } = await fetchBookingDepositByContractApi(contractId)
    const list = data?.receipts?.length
      ? data.receipts
      : data?.receiptId
        ? [
            {
              id: data.receiptId,
              receiptCode: data.receiptCode || '',
              amount: Number(data.principal ?? 0),
            },
          ]
        : []
    topUpReceiptOptions.value = list
    const fallbackMethod = (topUpTarget.value?.paymentMethod || form.paymentMethod || '').trim()
    const methods: Record<string, string> = {}
    for (const r of list) {
      methods[r.id] = (r.paymentMethod || '').trim() || fallbackMethod
    }
    topUpReceiptMethods.value = methods
    if (!topUpForm.mergeReceiptId && list.length) {
      topUpForm.mergeReceiptId = list[list.length - 1]!.id
    }
    if (!list.length) topUpForm.mode = 'new_receipt'
    if (topUpForm.mode === 'merge') applyMergePaymentMethodLock()
  } catch {
    topUpReceiptOptions.value = []
    topUpReceiptMethods.value = {}
    topUpForm.mode = 'new_receipt'
  } finally {
    topUpReceiptsLoading.value = false
  }
}

function openTopUpBookingDepositFor(row: ContractRecord | null | undefined) {
  if (!canTopUpBookingDeposit(row) || !row) return false
  topUpTarget.value = row
  topUpForm.mode = 'new_receipt'
  topUpForm.mergeReceiptId = ''
  topUpForm.amount = null
  topUpForm.paymentDate = todayYmdLocal()
  topUpForm.paymentMethod = null
  topUpForm.paymentVoucher = ''
  topUpForm.remark = ''
  topUpReceiptOptions.value = []
  topUpVisible.value = true
  void loadTopUpReceiptOptions(row.id)
  return true
}

function openTopUpBookingDeposit() {
  if (!canTopUpBookingDepositInForm.value) return
  openTopUpBookingDepositFor(editing.value)
}

async function submitTopUpBookingDeposit() {
  const contractId = topUpTarget.value?.id?.trim() || editing.value?.id?.trim()
  const amount = Number(topUpForm.amount ?? 0)
  if (!contractId) return
  if (!Number.isFinite(amount) || amount <= 0) {
    await ElMessageBox.alert(
      t('receipt.bookingDeposit.topUpNeedAmount'),
      t('receipt.bookingDeposit.topUpTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm') },
    )
    return
  }
  if (!topUpForm.paymentDate) {
    await ElMessageBox.alert(
      t('receipt.bookingDeposit.topUpNeedDate'),
      t('receipt.bookingDeposit.topUpTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm') },
    )
    return
  }
  if (topUpForm.mode === 'new_receipt' && !(topUpForm.paymentMethod || '').trim()) {
    await ElMessageBox.alert(
      t('contract.fields.paymentMethodRequired'),
      t('receipt.bookingDeposit.topUpTitle'),
      messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
    )
    return
  }
  if (topUpForm.mode === 'merge') {
    if (!topUpHasExistingReceipts.value) {
      await ElMessageBox.alert(
        t('receipt.bookingDeposit.topUpMergeNeedReceipt'),
        t('receipt.bookingDeposit.topUpTitle'),
        messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
      )
      return
    }
    if (!topUpForm.mergeReceiptId.trim()) {
      await ElMessageBox.alert(
        t('receipt.bookingDeposit.topUpNeedMergeReceipt'),
        t('receipt.bookingDeposit.topUpTitle'),
        messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
      )
      return
    }
    const targetMethod = mergeTargetReceiptMethod.value
    const chosen = (topUpForm.paymentMethod || '').trim()
    if (targetMethod && chosen && targetMethod !== chosen) {
      await ElMessageBox.alert(
        t('receipt.bookingDeposit.topUpMergeMethodConflict', { method: targetMethod }),
        t('receipt.bookingDeposit.topUpTitle'),
        messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
      )
      return
    }
    if (targetMethod) topUpForm.paymentMethod = targetMethod
  }
  topUpSubmitting.value = true
  try {
    await topUpBookingDepositApi(
      {
        contractId,
        amount,
        paymentDate: topUpForm.paymentDate,
        mode: topUpForm.mode,
        mergeReceiptId:
          topUpForm.mode === 'merge' ? topUpForm.mergeReceiptId || undefined : undefined,
        paymentMethod: topUpForm.paymentMethod || undefined,
        remark: topUpForm.remark.trim() || undefined,
        paymentVoucher: topUpForm.paymentVoucher.trim() || undefined,
      },
      { silentError: true },
    )
    const { data } = await fetchContract(contractId)
    if (editing.value?.id === contractId) {
      editing.value = data
      form.bookingDeposit = data.bookingDeposit
      form.paymentDate = data.paymentDate || ''
      form.paymentMethod = data.paymentMethod?.trim() || null
      form.paymentVoucher = data.paymentVoucher || ''
    }
    topUpTarget.value = data
    topUpVisible.value = false
    await loadList()
    await ElMessageBox.alert(
      t('receipt.bookingDeposit.topUpDone'),
      t('receipt.bookingDeposit.topUpTitle'),
      { type: 'success', confirmButtonText: t('common.confirm') },
    )
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('common.failed')
    try {
      await ElMessageBox.alert(msg, t('receipt.bookingDeposit.topUpTitle'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      })
    } catch {
      /* dismiss */
    }
  } finally {
    topUpSubmitting.value = false
  }
}

const contractActionColWidth = computed(() => {
  void locale.value
  // 按实际主列按钮测宽，勿再 Math.max(three)：否则会多出右侧空白
  const labels = perms.update
    ? [
        ACTION_COL_ICON,
        t('common.edit'),
        t('contract.receivePayment'),
        t('contract.printAgreement'),
        '…',
      ]
    : [ACTION_COL_ICON, t('contract.receivePayment'), t('contract.printAgreement'), '…']
  return measureActionColWidth(labels)
})

const contractTableKey = computed(
  () => `${tableLayoutKey.value}-${contractActionColWidth.value}`,
)

const tableHeaderConditionCount = computed(() => {
  let n = 0
  for (const selected of Object.values(filters)) {
    if (selected?.length) n += 1
  }
  for (const range of Object.values(dateRanges)) {
    if (range?.[0] && range?.[1]) n += 1
  }
  if (sortKey.value && sortOrder.value) n += 1
  if (expiringSoonFilter.value) n += 1
  if (outstandingReceivableFilter.value) n += 1
  return n
})

function onClearTableHeaderFilters() {
  expiringSoonFilter.value = false
  outstandingReceivableFilter.value = false
  onClearFilters()
}

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
    const { ok, fail } = await runServerBatchDelete(ids, (chunk) => batchDeleteContractsApi(chunk), setBatchProgress)
    finishBatch(ok, fail)
    clearSelection()
    await loadHeadChipCounts()
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

const RENT_COLLECTION_STATUSES = ['collected', 'uncollected'] as const

const rentCollectionFilterOptions = computed(() =>
  RENT_COLLECTION_STATUSES.map((s) => ({
    value: s,
    label: t(`contract.rentCollection.${s}`),
  })),
)

function rentCollectionLabel(status?: string | null) {
  const key = String(status || '').trim()
  if (key === 'collected' || key === 'uncollected') {
    return t(`contract.rentCollection.${key}`)
  }
  return t('contract.rentCollection.uncollected')
}

function rentCollectionTone(status?: string | null): string {
  return String(status || '') === 'collected' ? 'leased' : 'terminating'
}

/** 行内改状态：普通用户非签约中不提供「已取消」；superAdmin 可选全部状态 */
function statusEditOptionsForRow(row: ContractRecord) {
  const statuses = userStore.isSuperAdmin
    ? [...CONTRACT_STATUSES]
    : contractStatusOptionsForEdit(row.status)
  return statuses.map((s) => ({
    value: s,
    label: t(`contract.status.${s}`),
  }))
}

const contractCodeFilterOptions = computed(() =>
  uniqueOptions(list.value, (r) => r.contractCode),
)

const roomCodeFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const r of list.value) {
    const code = r.roomCode?.trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    opts.push({ value: code, label: code })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const monthlyRentFilterOptions = computed(() =>
  uniqueOptions(
    list.value,
    (r) => (r.monthlyRent == null ? '' : String(r.monthlyRent)),
    (v) => formatMoney(Number(v)),
  ),
)

const customerNameFilterOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const c of list.value) {
    const name = c.customerName?.trim()
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

const occupancyLabelPair = () => ({
  whole: t('contract.occupancyWhole'),
  part: t('contract.occupancyPart'),
})

function occupancyLabelOf(row: ContractRecord) {
  return formatContractOccupancyLabel(row, occupancyLabelPair())
}

/** 表头筛选：按当前页占用方式聚合（整租 / 分租·A） */
const leaseTypeFilterOptions = computed(() => {
  void locale.value
  const seen = new Set<string>()
  const opts: { value: string; label: string }[] = []
  for (const r of list.value) {
    const value = contractOccupancyFilterKey(r)
    if (seen.has(value)) continue
    seen.add(value)
    opts.push({ value, label: occupancyLabelOf(r) })
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
})

const occupancyStatusSamples = computed(() => {
  void locale.value
  const labels = new Set(list.value.map((r) => occupancyLabelOf(r)))
  labels.add(t('contract.occupancyWhole'))
  labels.add(`${t('contract.occupancyPart')}·A`)
  return [...labels]
})

const paymentCycleFilterOptions = computed(() =>
  CONTRACT_PAYMENT_CYCLES.map((s) => ({
    value: s,
    label: s,
  })),
)
const createdByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.createdBy))

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

type LoanItemFormRow = {
  uid: string
  description: string
  quantity: number | null
  unitAmount: number | null
  remark: string
}

function newLoanItemUid() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultLoanItemRow(): LoanItemFormRow {
  return {
    uid: newLoanItemUid(),
    description: '',
    quantity: null,
    unitAmount: null,
    remark: '',
  }
}

function loanItemSubtotal(row: LoanItemFormRow) {
  if (row.quantity == null || row.unitAmount == null) return 0
  return Math.round(Number(row.quantity) * Number(row.unitAmount) * 100) / 100
}

function isLoanItemRowEmpty(row: LoanItemFormRow) {
  return (
    !row.description.trim() &&
    row.quantity == null &&
    row.unitAmount == null &&
    !row.remark.trim()
  )
}

function isLoanItemRowComplete(row: LoanItemFormRow) {
  return (
    Boolean(row.description.trim()) &&
    row.quantity != null &&
    !Number.isNaN(Number(row.quantity)) &&
    row.unitAmount != null &&
    !Number.isNaN(Number(row.unitAmount))
  )
}

const loanItems = ref<LoanItemFormRow[]>([])
const LOAN_ITEM_PAGE_SIZE = 5
const loanItemPage = ref(1)

const loanItemTotalPages = computed(() =>
  Math.max(1, Math.ceil(loanItems.value.length / LOAN_ITEM_PAGE_SIZE) || 1),
)

const pagedLoanItems = computed(() => {
  const start = (loanItemPage.value - 1) * LOAN_ITEM_PAGE_SIZE
  return loanItems.value.slice(start, start + LOAN_ITEM_PAGE_SIZE).map((row, i) => ({
    row,
    index: start + i,
  }))
})

function clampLoanItemPage() {
  loanItemPage.value = Math.min(Math.max(1, loanItemPage.value), loanItemTotalPages.value)
}

function addLoanItem() {
  loanItems.value.push(defaultLoanItemRow())
  loanItemPage.value = Math.ceil(loanItems.value.length / LOAN_ITEM_PAGE_SIZE)
}

function removeLoanItem(idx: number) {
  loanItems.value.splice(idx, 1)
  clampLoanItemPage()
}

function mapLoanItemsFromRecord(fees?: ContractLoanItemNestedRecord[] | null): LoanItemFormRow[] {
  if (!fees?.length) return []
  return fees.map((f) => ({
    uid: f.id || newLoanItemUid(),
    description: f.description || '',
    quantity: f.quantity == null ? null : Number(f.quantity),
    unitAmount: f.unitAmount == null ? null : Number(f.unitAmount),
    remark: f.remark || '',
  }))
}

function todayDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
  occupancyMode: 'whole' as 'whole' | 'part',
  partLabel: '',
  status: CONTRACT_STATUSES[0],
  roomDeposit: null as number | null,
  monthlyRent: null as number | null,
  bookingDeposit: null as number | null,
  paymentDate: todayDateStr(),
  paymentCycle: CONTRACT_PAYMENT_CYCLES[0],
  /** 定金收据收款方式（写入定金收据，非合约固定字段） */
  paymentMethod: null as string | null,
  paymentVoucher: '',
  electricityRate: 0 as number | null,
  miscDeposit: 0 as number | null,
  doorKeyQty: 0,
  mailboxKeyQty: 0,
  roomNameText: '',
  subleaseMark: '',
  attachment: '',
  remark: '',
})

const form = reactive(emptyForm())
/** 用户改过房间按金后不再随月租自动覆盖 */
const roomDepositTouched = ref(false)

function depositFromMonthlyRent(rent: number | null | undefined): number | null {
  if (rent == null || Number.isNaN(Number(rent))) return null
  return Math.round(Number(rent) * 2 * 100) / 100
}

function syncRoomDepositFromRent() {
  if (roomDepositTouched.value) return
  form.roomDeposit = depositFromMonthlyRent(form.monthlyRent)
}

function onRoomDepositUserChange() {
  roomDepositTouched.value = true
}

const selectedRoom = computed(() =>
  roomSelectOptions.value.find((r) => r.id === form.roomId.trim()) || null,
)

const roomPartOptions = computed(() => {
  const room = selectedRoom.value
  if (!room) return [] as { label: string; value: string; disabled: boolean }[]
  if (room.leaseCapability !== 'flexible') return []
  const labels = room.splitLabels?.length ? room.splitLabels : ['A', 'B']
  // 编辑中：本合约占用的份位不算「已被他人租用」，换 A→B 后 A 仍可选
  const selfId = editing.value?.id
  const occupied = new Set(
    (room.occupancy?.slots || [])
      .filter((s) => s.occupied && (!selfId || s.contractId !== selfId))
      .map((s) => s.label),
  )
  return labels.map((label) => ({
    label,
    value: label,
    disabled: occupied.has(label),
  }))
})

const canWholeLease = computed(() => {
  const room = selectedRoom.value
  if (!room) return true
  const selfId = editing.value?.id
  const wholeByOther =
    !!room.occupancy?.wholeOccupied &&
    (!selfId || room.occupancy?.wholeContractId !== selfId)
  if (wholeByOther) return false
  const slotsBusyByOther = (room.occupancy?.slots || []).some(
    (s) => s.occupied && (!selfId || s.contractId !== selfId),
  )
  if (slotsBusyByOther) return false
  return true
})

const canPartLease = computed(() => {
  const room = selectedRoom.value
  if (!room) return true
  // 仅可整可分可在同一房间内选 A/B/C
  return room.leaseCapability === 'flexible'
})

const computedDoorKeyDeposit = computed(() =>
  Math.round((Number(form.doorKeyQty) || 0) * doorKeyUnitPrice.value * 100) / 100,
)
const computedMailboxKeyDeposit = computed(() =>
  Math.round((Number(form.mailboxKeyQty) || 0) * mailboxKeyUnitPrice.value * 100) / 100,
)

/** 借出物品按金合计（数量 × 按金） */
const computedLoanItemsDeposit = computed(() =>
  Math.round(
    loanItems.value.reduce((sum, f) => sum + loanItemSubtotal(f), 0) * 100,
  ) / 100,
)

/** 按金总数 = 房间按金 + 杂项按金 + 借出物品总按金 + 钥匙按金 */
const computedTotalDeposit = computed(() => {
  const room = Number(form.roomDeposit) || 0
  const misc = Number(form.miscDeposit) || 0
  const total =
    room +
    misc +
    computedLoanItemsDeposit.value +
    computedDoorKeyDeposit.value +
    computedMailboxKeyDeposit.value
  return Math.round(total * 100) / 100
})

function roomOptionLabel(r: Pick<RoomRecord, 'roomCode' | 'name' | 'buildingName'>) {
  const parts = [r.roomCode]
  if (r.name?.trim()) parts.push(r.name)
  // 全局已篩選某一大廈時，下拉無需再重複顯示所屬大廈
  if (!buildingScope.selectedId && r.buildingName?.trim()) parts.push(r.buildingName)
  return parts.join(' · ')
}

/** 下拉选项右侧状态：整租可租 / 分租有空（含空份位） */
function roomPickBadge(r: RoomRecord): { tone: StatusTone; label: string } {
  const summary = r.occupancy?.summary || 'idle'
  const cap = r.leaseCapability || 'flexible'
  if (summary === 'partial') {
    const free = (r.occupancy?.slots || [])
      .filter((s) => !s.occupied)
      .map((s) => s.label)
    if (free.length) {
      return {
        tone: roomFillStatusTone('partial'),
        label: t('contract.roomPickBadgePartialSlots', { slots: free.join('·') }),
      }
    }
    return { tone: roomFillStatusTone('partial'), label: t('contract.roomPickBadgePartial') }
  }
  if (cap === 'whole_only') {
    return { tone: roomLeaseCapabilityTone('whole_only'), label: t('contract.roomPickBadgeWhole') }
  }
  if (cap === 'part_only') {
    return { tone: roomLeaseCapabilityTone('part_only'), label: t('contract.roomPickBadgePartOnly') }
  }
  return { tone: roomFillStatusTone('idle'), label: t('contract.roomPickBadgeFlexibleIdle') }
}

function buildRoomSelectQuery(page: number) {
  const mode = roomPickMode.value
  const base = {
    keyword: roomSelectKeyword.value || undefined,
    page,
    pageSize: SELECT_PAGE_SIZE,
  }
  // 只列可租：闲置 / 分租尚有空位；顶栏再按整租·分租收窄
  if (mode === 'whole') {
    return { ...base, occupancySummaries: ['idle'] as string[] }
  }
  if (mode === 'part') {
    return {
      ...base,
      leaseCapabilities: ['flexible', 'part_only'],
      occupancySummaries: ['idle', 'partial'] as string[],
    }
  }
  return { ...base, occupancySummaries: ['idle', 'partial'] as string[] }
}

function setRoomPickMode(mode: RoomPickMode) {
  if (roomPickMode.value === mode) return
  roomPickMode.value = mode
  roomSelectHasMore.value = true
  void loadRoomsPage(true)
}

function customerOptionLabel(c: Pick<CustomerRecord, 'customerCode' | 'name'>) {
  return `${c.customerCode} · ${c.name}`
}

function seedRoomOption(row: ContractRecord): RoomRecord | null {
  if (!row.roomId) return null
  return {
    id: row.roomId,
    roomCode: row.roomCode || row.roomId,
    name: row.roomName || row.roomNameText || '',
    buildingId: row.buildingId || '',
    buildingName: row.buildingName || '',
  } as RoomRecord
}

function seedCustomerOption(row: ContractRecord): CustomerRecord | null {
  if (!row.customerId) return null
  return {
    id: row.customerId,
    customerCode: row.customerCode || row.customerId,
    name: row.customerName || row.customerId,
    buildingId: row.buildingId,
  } as CustomerRecord
}

function keepSelectedInOptions<T extends { id: string }>(
  items: T[],
  selectedId: string | null | undefined,
  current: T[],
): T[] {
  const sid = String(selectedId ?? '').trim()
  if (!sid || items.some((x) => x.id === sid)) return items
  const keep = current.find((x) => x.id === sid)
  return keep ? [keep, ...items] : items
}

/** 追加去重：原地 push，避免替換數組引用導致下拉重繪閃動 */
function appendUniqueById<T extends { id: string }>(prev: T[], next: T[]): void {
  if (!next.length) return
  const seen = new Set(prev.map((x) => x.id))
  for (const item of next) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    prev.push(item)
  }
}

function unbindSelectScroll(
  el: HTMLElement | null,
  handler: ((e: Event) => void) | null,
): void {
  if (el && handler) el.removeEventListener('scroll', handler)
}

function bindSelectScroll(
  popperClass: string,
  onReachEnd: () => void,
): { el: HTMLElement | null; handler: ((e: Event) => void) | null } {
  const popper = document.querySelector(`.${popperClass}`)
  const wrap =
    (popper?.querySelector('.el-select-dropdown__wrap') as HTMLElement | null) ||
    (popper?.querySelector('.el-scrollbar__wrap') as HTMLElement | null)
  if (!wrap) return { el: null, handler: null }
  let ticking = false
  const handler = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      if (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight <= 28) onReachEnd()
    })
  }
  wrap.addEventListener('scroll', handler, { passive: true })
  return { el: wrap, handler }
}

async function restoreSelectScroll(el: HTMLElement | null, top: number) {
  if (!el) return
  await nextTick()
  el.scrollTop = top
}

async function loadRoomsPage(reset: boolean) {
  if (reset) {
    if (roomSelectLoading.value) return
    roomSelectLoading.value = true
  } else {
    if (roomSelectLoading.value || roomSelectLoadingMore.value || !roomSelectHasMore.value) return
    roomSelectLoadingMore.value = true
  }
  const page = reset ? 1 : roomSelectPage.value
  const scrollEl = roomSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchRooms(buildRoomSelectQuery(page))
    if (reset) {
      roomSelectOptions.value = keepSelectedInOptions(
        data.items,
        form.roomId.trim(),
        roomSelectOptions.value,
      )
    } else {
      appendUniqueById(roomSelectOptions.value, data.items)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    roomSelectPage.value = page + 1
    roomSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
  } catch {
    if (reset) {
      roomSelectOptions.value = keepSelectedInOptions(
        [],
        form.roomId.trim(),
        roomSelectOptions.value,
      )
      roomSelectHasMore.value = false
    }
  } finally {
    if (reset) roomSelectLoading.value = false
    else roomSelectLoadingMore.value = false
  }
}

async function loadCustomersPage(reset: boolean) {
  if (reset) {
    if (customerSelectLoading.value) return
    customerSelectLoading.value = true
  } else {
    if (
      customerSelectLoading.value ||
      customerSelectLoadingMore.value ||
      !customerSelectHasMore.value
    ) {
      return
    }
    customerSelectLoadingMore.value = true
  }
  const page = reset ? 1 : customerSelectPage.value
  const scrollEl = customerSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchCustomers({
      keyword: customerSelectKeyword.value || undefined,
      page,
      pageSize: SELECT_PAGE_SIZE,
    })
    const bid = buildingScope.selectedId
    const pageItems = bid ? data.items.filter((c) => c.buildingId === bid) : data.items
    if (reset) {
      customerSelectOptions.value = keepSelectedInOptions(
        pageItems,
        form.customerId.trim(),
        customerSelectOptions.value,
      )
    } else {
      appendUniqueById(customerSelectOptions.value, pageItems)
      await restoreSelectScroll(scrollEl, prevTop)
    }
    customerSelectPage.value = page + 1
    customerSelectHasMore.value = data.items.length >= SELECT_PAGE_SIZE
    if (bid && customerSelectHasMore.value && pageItems.length === 0) {
      // 本頁全被濾掉但後端還有資料 → 自動續拉，避免滾動空白
      customerSelectLoadingMore.value = false
      await loadCustomersPage(false)
      return
    }
  } catch {
    if (reset) {
      customerSelectOptions.value = keepSelectedInOptions(
        [],
        form.customerId.trim(),
        customerSelectOptions.value,
      )
      customerSelectHasMore.value = false
    }
  } finally {
    if (reset) customerSelectLoading.value = false
    else customerSelectLoadingMore.value = false
  }
}

/** 遠程搜尋（輸入關鍵字時重置分頁） */
function searchRoomsRemote(query: string) {
  roomSelectKeyword.value = query.trim()
  roomSelectHasMore.value = true
  void loadRoomsPage(true)
}

function searchCustomersRemote(query: string) {
  customerSelectKeyword.value = query.trim()
  customerSelectHasMore.value = true
  void loadCustomersPage(true)
}

async function attachSelectScroll(popperClass: string, onReachEnd: () => void) {
  await nextTick()
  let bound = bindSelectScroll(popperClass, onReachEnd)
  if (!bound.el) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    bound = bindSelectScroll(popperClass, onReachEnd)
  }
  return bound
}

async function onRoomSelectVisible(open: boolean) {
  unbindSelectScroll(roomSelectScrollEl, roomSelectScrollHandler)
  roomSelectScrollEl = null
  roomSelectScrollHandler = null
  if (!open) return
  roomSelectKeyword.value = ''
  roomSelectHasMore.value = true
  await loadRoomsPage(true)
  const bound = await attachSelectScroll('contract-room-select-popper', () => {
    void loadRoomsPage(false)
  })
  roomSelectScrollEl = bound.el
  roomSelectScrollHandler = bound.handler
}

async function onCustomerSelectVisible(open: boolean) {
  unbindSelectScroll(customerSelectScrollEl, customerSelectScrollHandler)
  customerSelectScrollEl = null
  customerSelectScrollHandler = null
  if (!open) return
  customerSelectKeyword.value = ''
  customerSelectHasMore.value = true
  await loadCustomersPage(true)
  const bound = await attachSelectScroll('contract-customer-select-popper', () => {
    void loadCustomersPage(false)
  })
  customerSelectScrollEl = bound.el
  customerSelectScrollHandler = bound.handler
}

/**
 * 清空后仍保留曾选过的需求（避免仅靠「当前选中」临时 seed，一点 × 选项就从列表消失）。
 * EP clearable 默认 valueOnClear 为 undefined，须配合 value-on-clear=""。
 */
const pinnedRequirements = ref<CustomerRequirementRecord[]>([])

function pinRequirementOption(row: CustomerRequirementRecord) {
  if (!row?.id) return
  if (pinnedRequirements.value.some((r) => r.id === row.id)) return
  pinnedRequirements.value = [...pinnedRequirements.value, row]
}

function requirementSeedFromContract(
  requirementId: string,
  customerId: string,
): CustomerRequirementRecord | null {
  const hit =
    editing.value?.requirementId === requirementId
      ? editing.value
      : list.value.find((c) => c.requirementId === requirementId)
  if (!hit?.requirementCode) return null
  return {
    id: requirementId,
    requirementCode: hit.requirementCode,
    customerId,
  } as CustomerRequirementRecord
}

const requirementSelectOptions = computed(() => {
  const cid = String(form.customerId ?? '').trim()
  if (!cid) return []
  const map = new Map<string, CustomerRequirementRecord>()
  for (const r of customerRequirements.value) {
    if (r.customerId === cid) map.set(r.id, r)
  }
  for (const r of pinnedRequirements.value) {
    if (r.customerId === cid) map.set(r.id, r)
  }
  return [...map.values()]
})

/** 合约可选关联的需求：未跟进／已取消（大厦范围由列表接口 BuildingAccess + 顶栏大厦注入） */
const CONTRACT_LINKABLE_REQUIREMENT_STATUSES = ['未跟進', '已取消'] as const

async function loadRequirementsForCustomer(customerId: string) {
  if (!String(customerId ?? '').trim()) {
    customerRequirements.value = []
    return
  }
  try {
    const { data } = await fetchCustomerRequirements({
      customerId,
      statuses: [...CONTRACT_LINKABLE_REQUIREMENT_STATUSES],
      pageSize: 100,
    })
    customerRequirements.value = data.items
    // 编辑时保留当前已挂需求（可能已是跟进中／已签约，不在可选列表）
    const currentId = String(form.requirementId || editing.value?.requirementId || '').trim()
    if (
      currentId &&
      !customerRequirements.value.some((r) => r.id === currentId) &&
      !pinnedRequirements.value.some((r) => r.id === currentId)
    ) {
      const pinned =
        pinnedRequirements.value.find((r) => r.id === currentId) ||
        requirementSeedFromContract(currentId, customerId)
      if (pinned) pinRequirementOption(pinned)
    }
  } catch {
    customerRequirements.value = []
  }
}

watch(
  () => form.customerId,
  async (cid, prev) => {
    // 仅用户在弹窗内改客户时清空需求；openEdit 赋值时 dialog 尚未打开，勿冲掉 requirementId
    if (cid !== prev && formVisible.value) {
      form.requirementId = ''
      pinnedRequirements.value = []
    }
    await loadRequirementsForCustomer(cid)
  },
)

watch(
  () => form.requirementId,
  (id) => {
    const sid = String(id ?? '').trim()
    if (!sid) return
    const cid = String(form.customerId ?? '').trim()
    const existing =
      customerRequirements.value.find((r) => r.id === sid) ||
      pinnedRequirements.value.find((r) => r.id === sid)
    if (existing) {
      pinRequirementOption(existing)
      return
    }
    if (!cid) return
    const seeded = requirementSeedFromContract(sid, cid)
    if (seeded) pinRequirementOption(seeded)
  },
)

function isRentFreePeriodType(dateType: string) {
  const label = String(dateType || '').trim()
  if (!label) return false
  const opt = periodTypeOptions.value.find((o) => o.label === label)
  if (opt?.code === 'rent_free') return true
  return label === '免租期'
}

/** 租賃方式由占用方式推导（整租→整租；分租→分租首用戶），表单不再重复选 */
function resolveLeaseTypeLabel(mode: 'whole' | 'part'): string {
  const opts = leaseTypeOptions.value
  if (mode === 'whole') {
    return (
      opts.find((o) => o.code === 'whole')?.label ||
      opts.find((o) => o.label === '整租')?.label ||
      '整租'
    )
  }
  return (
    opts.find((o) => o.code === 'sub_primary')?.label ||
    opts.find((o) => /分租/.test(o.label))?.label ||
    '分租首用戶'
  )
}

function syncLeaseTypeFromOccupancy() {
  form.leaseType = resolveLeaseTypeLabel(form.occupancyMode)
}

function firstFreePartLabel(room: RoomRecord) {
  return (
    (room.splitLabels || ['A', 'B']).find(
      (label) => !(room.occupancy?.slots || []).some((s) => s.label === label && s.occupied),
    ) || ''
  )
}

function onRoomSelectChange(roomId: string) {
  const room = roomSelectOptions.value.find((r) => r.id === roomId)
  if (!room) return
  // 房間名稱文本：旧系统 PDF 快照；新系统以房间外键为准，表单不再手填
  form.roomNameText = room.name || ''
  if (form.monthlyRent == null) form.monthlyRent = room.monthlyRent ?? null
  syncRoomDepositFromRent()
  if (room.leaseCapability === 'whole_only' || room.leaseCapability === 'part_only') {
    form.occupancyMode = 'whole'
    form.partLabel = ''
    form.subleaseMark = ''
    syncLeaseTypeFromOccupancy()
    return
  }
  if (room.occupancy?.wholeOccupied || room.occupancy?.slots?.some((s) => s.occupied)) {
    form.occupancyMode = 'part'
    form.partLabel = firstFreePartLabel(room)
    form.subleaseMark = form.partLabel
  } else if (roomPickMode.value === 'part') {
    // 下拉已选「分租」：空置可整可分也默认走分租并预填空份位
    form.occupancyMode = 'part'
    form.partLabel = firstFreePartLabel(room)
    form.subleaseMark = form.partLabel
  } else {
    form.occupancyMode = 'whole'
    form.partLabel = ''
    form.subleaseMark = ''
  }
  syncLeaseTypeFromOccupancy()
}

watch(
  () => [form.occupancyMode, form.partLabel] as const,
  ([mode, part]) => {
    if (mode === 'part') form.subleaseMark = String(part || '').trim().toUpperCase()
    else form.subleaseMark = ''
    syncLeaseTypeFromOccupancy()
  },
)

watch(
  () => form.monthlyRent,
  () => {
    syncRoomDepositFromRent()
  },
)

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
  if (!perms.import) {
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

    await loadHeadChipCounts()
    await loadList()
    finishImport()
  } catch {
    failImport(t('contract.importFailed'))
  }
}

async function loadOptions() {
  // 房間 / 客戶改為彈窗下拉遠程懶加載，避免進入頁面就全量拉取
  const [userRes, periodRes, leaseRes, keyRes] = await Promise.all([
    fetchUsers(),
    fetchContractConfigs({ type: 'periodType', activeOnly: true }),
    fetchContractConfigs({ type: 'leaseType', activeOnly: true }),
    fetchContractConfigs({ type: 'keyDeposit', activeOnly: true }),
  ])
  users.value = userRes.data.filter((u) => u.status === 'active')
  periodTypeOptions.value = periodRes.data
  leaseTypeOptions.value = leaseRes.data
  keyDepositOptions.value = keyRes.data
}

onMounted(() => {
  void loadList()
  void loadOptions()
  void loadHeadChipCounts()
  void loadIssueBlockedAlerts()
  document.addEventListener('pointerdown', onContractMoreDocPointer, true)
  window.addEventListener('scroll', onContractMoreScrollOrResize, true)
  window.addEventListener('resize', onContractMoreScrollOrResize)
})

onBeforeUnmount(() => {
  clearContractMoreCloseTimer()
  document.removeEventListener('pointerdown', onContractMoreDocPointer, true)
  window.removeEventListener('scroll', onContractMoreScrollOrResize, true)
  window.removeEventListener('resize', onContractMoreScrollOrResize)
})

watch(
  () => buildingScope.viewKey,
  () => {
    closeContractMoreMenu()
    void loadHeadChipCounts()
    void loadIssueBlockedAlerts()
  },
)

watch(
  [
    openOrderVisible,
    topUpVisible,
    terminateVisible,
    vacateDetailVisible,
    cancelVisible,
    settlementRefundVisible,
    relatedInvoicesDrawerVisible,
  ],
  () => {
    syncContractMoreMenuZIndex()
  },
)

function openCreate() {
  if (!perms.create) return
  editing.value = null
  roomDepositTouched.value = false
  Object.assign(form, emptyForm())
  form.leaseType = leaseTypeOptions.value[0]?.label || ''
  // 銷售經理默認當前登錄用戶
  const uid = userStore.user?.id?.trim() || ''
  if (uid) form.salesManagerId = uid
  periods.value = [defaultPeriodRow()]
  periodPage.value = 1
  loanItems.value = []
  loanItemPage.value = 1
  customerRequirements.value = []
  pinnedRequirements.value = []
  roomSelectOptions.value = []
  customerSelectOptions.value = []
  roomPickMode.value = 'all'
  roomSelectPage.value = 1
  roomSelectHasMore.value = true
  roomSelectKeyword.value = ''
  customerSelectPage.value = 1
  customerSelectHasMore.value = true
  customerSelectKeyword.value = ''
  formVisible.value = true
}

function periodDurationLabel(p: PeriodFormRow): string {
  const n = Number(p.dateValue) || 0
  return `${n} ${p.dateUnit === '日' ? t('contract.periodUnits.日') : t('contract.periodUnits.月')}`
}

/** 英文 Unit 更宽、数值列更窄；中文保持紧凑 */
const periodTableEn = computed(() => String(locale.value).toLowerCase().startsWith('en'))

/** 防止日期 ↔ 时长双向同步互相覆盖 */
let periodDateDurationSyncing = false

/** 起止日期齐全时，自动推算单位与数值 */
function syncPeriodDurationFromDates(p: PeriodFormRow) {
  if (periodDateDurationSyncing) return
  const hit = inferPeriodDurationFromDates(p.startDate, p.endDate)
  if (!hit) return
  if (p.dateUnit === hit.dateUnit && Number(p.dateValue) === hit.dateValue) return
  periodDateDurationSyncing = true
  try {
    p.dateUnit = hit.dateUnit
    p.dateValue = hit.dateValue
  } finally {
    periodDateDurationSyncing = false
  }
}

/** 缺开始日时：首段用合约开始日，其后用上一段结束日 + 1 */
function ensurePeriodStartDate(p: PeriodFormRow, index: number): string {
  const existing = String(p.startDate || '').trim()
  if (existing) return existing
  if (index <= 0) {
    const contractStart = form.startDate?.trim() || ''
    if (!contractStart) return ''
    p.startDate = contractStart
    return contractStart
  }
  const prevEnd = periods.value[index - 1]?.endDate?.trim() || ''
  if (!prevEnd) return ''
  const next = addDaysYmd(prevEnd, 1)
  if (!next) return ''
  p.startDate = next
  return next
}

/**
 * 由单位/数值推算结束日；必要时补开始日。
 */
function syncPeriodDatesFromDuration(p: PeriodFormRow, index: number) {
  if (periodDateDurationSyncing) return
  const start = ensurePeriodStartDate(p, index)
  if (!start) return
  const end = endDateFromDuration(start, p.dateUnit, p.dateValue)
  if (!end) return
  if (p.endDate === end) return

  periodDateDurationSyncing = true
  try {
    p.endDate = end
  } finally {
    periodDateDurationSyncing = false
  }
}

/**
 * 合约期 → 合约总日期（双向）：首段开始日、末段结束日回写上方。
 * 锁延到 nextTick 再放，避免 watch 同拍再向下推一遍。
 */
function syncContractDatesFromPeriods() {
  const firstStart = String(periods.value[0]?.startDate || '').trim()
  const lastEnd = String(periods.value[periods.value.length - 1]?.endDate || '').trim()
  const needStart = Boolean(firstStart && form.startDate !== firstStart)
  const needEnd = Boolean(lastEnd && form.endDate !== lastEnd)
  if (!needStart && !needEnd) return

  periodDateDurationSyncing = true
  try {
    if (needStart) form.startDate = firstStart
    if (needEnd) form.endDate = lastEnd
  } finally {
    nextTick(() => {
      periodDateDurationSyncing = false
    })
  }
}

/**
 * 从 fromIndex 起向后串联：下一段开始日 = 上一段结束日 + 1，
 * 并按该段单位/数值重算结束日；最后与合约总日期双向对齐。
 */
function cascadeFollowingPeriods(fromIndex: number) {
  if (fromIndex >= 0 && fromIndex < periods.value.length - 1) {
    periodDateDurationSyncing = true
    try {
      for (let i = fromIndex + 1; i < periods.value.length; i++) {
        const prevEnd = String(periods.value[i - 1]?.endDate || '').trim()
        if (!prevEnd) break
        const nextStart = addDaysYmd(prevEnd, 1)
        if (!nextStart) break
        const row = periods.value[i]
        if (row.startDate !== nextStart) row.startDate = nextStart
        const newEnd = endDateFromDuration(nextStart, row.dateUnit, row.dateValue)
        if (newEnd && row.endDate !== newEnd) row.endDate = newEnd
      }
    } finally {
      periodDateDurationSyncing = false
    }
  }
  syncContractDatesFromPeriods()
}

/** 改起止日期：两端齐全则反推时长；仅有开始 + 单位/数值则推结束日；再向后串联并回写总日期 */
function onPeriodDatesChange(p: PeriodFormRow, index: number) {
  const s = String(p.startDate || '').trim()
  const e = String(p.endDate || '').trim()
  if (s && e) {
    syncPeriodDurationFromDates(p)
  } else if (s) {
    syncPeriodDatesFromDuration(p, index)
  }
  cascadeFollowingPeriods(index)
}

/** 改单位/数值 → 推算结束日，向后串联，并回写合约总日期 */
function onPeriodDurationChange(p: PeriodFormRow, index: number) {
  syncPeriodDatesFromDuration(p, index)
  cascadeFollowingPeriods(index)
}

/**
 * 校验合约期是否符合用户填写的合约起止：
 * - 首段开始日 = 合约开始日
 * - 末段结束日 = 合约结束日
 * - 各段不重叠、段内起止合法
 */
function validatePeriodsAgainstContractDates(): string | null {
  const contractStart = form.startDate?.trim() || ''
  const contractEnd = form.endDate?.trim() || ''
  if (!contractStart || !contractEnd) {
    return t('contract.contractDatesRequired')
  }
  if (contractEnd < contractStart) {
    return t('contract.contractDateRangeInvalid')
  }

  const ordered = periods.value
  if (!ordered.length) return t('contract.periodRequired')

  for (const p of ordered) {
    const s = p.startDate?.trim() || ''
    const e = p.endDate?.trim() || ''
    if (!s || !e) return t('contract.periodRequired')
    if (e < s) return t('contract.periodRangeInvalid')
  }

  const overlap = findFirstPeriodOverlap(ordered)
  if (overlap) {
    return t('contract.periodOverlap', { a: overlap.i + 1, b: overlap.j + 1 })
  }

  const firstStart = ordered[0].startDate.trim()
  const lastEnd = ordered[ordered.length - 1].endDate.trim()
  if (firstStart !== contractStart) {
    return t('contract.periodMustMatchContractStart')
  }
  if (lastEnd !== contractEnd) {
    return t('contract.periodMustMatchContractEnd')
  }
  return null
}

/** 合约开始日 → 自动填入第一段开始日；有结束则反推时长，否则用单位/数值推结束日 */
watch(
  () => form.startDate,
  (v) => {
    if (periodDateDurationSyncing) return
    const start = String(v || '').trim()
    if (!periods.value.length) periods.value = [defaultPeriodRow()]
    const first = periods.value[0]
    if (!first) return
    if (first.startDate !== start) first.startDate = start
    onPeriodDatesChange(first, 0)
  },
)

/** 合约到期日 → 自动填入最后一段结束日，并反推时长 */
watch(
  () => form.endDate,
  (v) => {
    if (periodDateDurationSyncing) return
    const end = String(v || '').trim()
    if (!periods.value.length) periods.value = [defaultPeriodRow()]
    const last = periods.value[periods.value.length - 1]
    const lastIndex = periods.value.length - 1
    if (!last) return
    if (last.endDate !== end) last.endDate = end
    onPeriodDatesChange(last, lastIndex)
  },
)

/** 合约期表格每页条数：超过后换页显示 */
const PERIOD_PAGE_SIZE = 5
const periodPage = ref(1)

const periodTotalPages = computed(() =>
  Math.max(1, Math.ceil(periods.value.length / PERIOD_PAGE_SIZE) || 1),
)

const pagedPeriods = computed(() => {
  const start = (periodPage.value - 1) * PERIOD_PAGE_SIZE
  return periods.value.slice(start, start + PERIOD_PAGE_SIZE).map((p, i) => ({
    p,
    index: start + i,
  }))
})

function clampPeriodPage() {
  periodPage.value = Math.min(Math.max(1, periodPage.value), periodTotalPages.value)
}

function addPeriod() {
  const row = defaultPeriodRow()
  const prev = periods.value[periods.value.length - 1]
  const prevEnd = prev?.endDate?.trim() || ''
  if (prevEnd) {
    row.startDate = addDaysYmd(prevEnd, 1)
    // 末段应对齐合约结束日：新增时若合约结束日晚于开始日，预填结束日便于衔接
    const contractEnd = form.endDate?.trim() || ''
    if (contractEnd && contractEnd >= row.startDate) {
      row.endDate = contractEnd
      syncPeriodDurationFromDates(row)
    }
  }
  periods.value.push(row)
  periodPage.value = Math.ceil(periods.value.length / PERIOD_PAGE_SIZE)
}

function removePeriod(idx: number) {
  periods.value.splice(idx, 1)
  if (!periods.value.length) {
    addPeriod()
    return
  }
  clampPeriodPage()
  // 删除后把后续段重新接到前一段
  if (idx <= 0) {
    const first = periods.value[0]
    const contractStart = form.startDate?.trim() || ''
    if (first && contractStart && first.startDate !== contractStart) {
      first.startDate = contractStart
    }
    if (first) onPeriodDatesChange(first, 0)
  } else {
    cascadeFollowingPeriods(idx - 1)
  }
}

/** 双击序号改位置：跨页移动行（draft 必须保持字符串，避免 type=number 把 v-model 变成 number） */
const editingPeriodIndexUid = ref<string | null>(null)
const editingPeriodIndexFrom = ref(-1)
const editingPeriodIndexDraft = ref('')
const periodIndexInputRef = ref<HTMLInputElement | null>(null)
let periodIndexCommitLock = false

function goToPeriodIndex(absoluteIdx: number) {
  periodPage.value = Math.floor(absoluteIdx / PERIOD_PAGE_SIZE) + 1
}

async function startEditPeriodIndex(uid: string, currentIndex: number) {
  if (periods.value.length <= 1) return
  periodIndexCommitLock = false
  editingPeriodIndexUid.value = uid
  editingPeriodIndexFrom.value = currentIndex
  editingPeriodIndexDraft.value = String(currentIndex + 1)
  await nextTick()
  const el = periodIndexInputRef.value
  if (!el) return
  el.focus()
  el.select()
}

function cancelEditPeriodIndex() {
  editingPeriodIndexUid.value = null
  editingPeriodIndexFrom.value = -1
  editingPeriodIndexDraft.value = ''
}

function commitEditPeriodIndex() {
  if (periodIndexCommitLock) return
  periodIndexCommitLock = true
  const uid = editingPeriodIndexUid.value
  const fromIdx = editingPeriodIndexFrom.value
  const draft = String(editingPeriodIndexDraft.value ?? '').trim()
  cancelEditPeriodIndex()
  if (!uid || fromIdx < 0) {
    periodIndexCommitLock = false
    return
  }
  const total = periods.value.length
  const raw = Number.parseInt(draft, 10)
  if (!Number.isFinite(raw)) {
    periodIndexCommitLock = false
    return
  }
  const toIdx = Math.min(total, Math.max(1, raw)) - 1
  const list = periods.value
  if (list[fromIdx]?.uid !== uid) {
    periodIndexCommitLock = false
    return
  }
  if (toIdx !== fromIdx) {
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
    realignPeriodChainFrom(0)
  }
  goToPeriodIndex(toIdx)
  periodIndexCommitLock = false
}

function onPeriodIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    commitEditPeriodIndex()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancelEditPeriodIndex()
  }
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
  realignPeriodChainFrom(0)
}

/** 调序/删除后：从某段起按「上一段结束+1 + 本段时长」重串日期链 */
function realignPeriodChainFrom(startIndex: number) {
  const row = periods.value[startIndex]
  if (!row) return
  if (startIndex === 0) {
    const contractStart = form.startDate?.trim() || ''
    if (contractStart && row.startDate !== contractStart) row.startDate = contractStart
  } else {
    const prevEnd = periods.value[startIndex - 1]?.endDate?.trim() || ''
    if (prevEnd) {
      const nextStart = addDaysYmd(prevEnd, 1)
      if (nextStart && row.startDate !== nextStart) row.startDate = nextStart
    }
  }
  const start = String(row.startDate || '').trim()
  if (start) {
    const end = endDateFromDuration(start, row.dateUnit, row.dateValue)
    if (end && row.endDate !== end) {
      periodDateDurationSyncing = true
      try {
        row.endDate = end
      } finally {
        periodDateDurationSyncing = false
      }
    }
  }
  cascadeFollowingPeriods(startIndex)
}

function onPeriodDragEnd() {
  dragPeriodUid.value = null
  dragOverPeriodUid.value = null
}

/** 借出物品：拖拽排序 + 双击序号改位置（与合约期一致） */
const editingLoanItemIndexUid = ref<string | null>(null)
const editingLoanItemIndexFrom = ref(-1)
const editingLoanItemIndexDraft = ref('')
const loanItemIndexInputRef = ref<HTMLInputElement | null>(null)
let loanItemIndexCommitLock = false
const dragLoanItemUid = ref<string | null>(null)
const dragOverLoanItemUid = ref<string | null>(null)

function goToLoanItemIndex(absoluteIdx: number) {
  loanItemPage.value = Math.floor(absoluteIdx / LOAN_ITEM_PAGE_SIZE) + 1
}

async function startEditLoanItemIndex(uid: string, currentIndex: number) {
  if (loanItems.value.length <= 1) return
  loanItemIndexCommitLock = false
  editingLoanItemIndexUid.value = uid
  editingLoanItemIndexFrom.value = currentIndex
  editingLoanItemIndexDraft.value = String(currentIndex + 1)
  await nextTick()
  const el = loanItemIndexInputRef.value
  if (!el) return
  el.focus()
  el.select()
}

function cancelEditLoanItemIndex() {
  editingLoanItemIndexUid.value = null
  editingLoanItemIndexFrom.value = -1
  editingLoanItemIndexDraft.value = ''
}

function commitEditLoanItemIndex() {
  if (loanItemIndexCommitLock) return
  loanItemIndexCommitLock = true
  const uid = editingLoanItemIndexUid.value
  const fromIdx = editingLoanItemIndexFrom.value
  const draft = String(editingLoanItemIndexDraft.value ?? '').trim()
  cancelEditLoanItemIndex()
  if (!uid || fromIdx < 0) {
    loanItemIndexCommitLock = false
    return
  }
  const total = loanItems.value.length
  const raw = Number.parseInt(draft, 10)
  if (!Number.isFinite(raw)) {
    loanItemIndexCommitLock = false
    return
  }
  const toIdx = Math.min(total, Math.max(1, raw)) - 1
  const list = loanItems.value
  if (list[fromIdx]?.uid !== uid) {
    loanItemIndexCommitLock = false
    return
  }
  if (toIdx !== fromIdx) {
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
  }
  goToLoanItemIndex(toIdx)
  loanItemIndexCommitLock = false
}

function onLoanItemIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    commitEditLoanItemIndex()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancelEditLoanItemIndex()
  }
}

function onLoanItemDragStart(uid: string, e: DragEvent) {
  dragLoanItemUid.value = uid
  e.dataTransfer?.setData('text/plain', uid)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onLoanItemDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragLoanItemUid.value && dragLoanItemUid.value !== uid) {
    dragOverLoanItemUid.value = uid
  }
}

function onLoanItemDrop(targetUid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragLoanItemUid.value || e.dataTransfer?.getData('text/plain')
  dragLoanItemUid.value = null
  dragOverLoanItemUid.value = null
  if (!fromUid || fromUid === targetUid) return
  const list = loanItems.value
  const fromIdx = list.findIndex((p) => p.uid === fromUid)
  const toIdx = list.findIndex((p) => p.uid === targetUid)
  if (fromIdx < 0 || toIdx < 0) return
  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)
}

function onLoanItemDragEnd() {
  dragLoanItemUid.value = null
  dragOverLoanItemUid.value = null
}

async function openEdit(row: ContractRecord) {
  if (!perms.update) return
  editing.value = row
  roomDepositTouched.value = true
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
    occupancyMode: (row.occupancyMode === 'part' ? 'part' : 'whole') as 'whole' | 'part',
    partLabel: row.partLabel || row.subleaseMark || '',
    status: coerceContractFormStatus(row.status),
    roomDeposit: row.roomDeposit,
    monthlyRent: row.monthlyRent,
    bookingDeposit: row.bookingDeposit,
    paymentDate: row.paymentDate || '',
    paymentCycle: coerceContractPaymentCycle(row.paymentCycle),
    paymentMethod: row.paymentMethod?.trim() || null,
    paymentVoucher: row.paymentVoucher || '',
    electricityRate: row.electricityRate ?? 0,
    miscDeposit: row.miscDeposit ?? 0,
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
  periodPage.value = 1
  loanItems.value = mapLoanItemsFromRecord(row.loanItems)
  loanItemPage.value = 1
  // 列表若未带齐借出物品，再拉详情补全
  if (!row.loanItems?.length && (row.loanItemCount ?? 0) > 0) {
    try {
      const { data } = await fetchContract(row.id)
      loanItems.value = mapLoanItemsFromRecord(data.loanItems)
    } catch {
      /* keep empty */
    }
  }
  const seededRoom = seedRoomOption(row)
  const seededCustomer = seedCustomerOption(row)
  roomSelectOptions.value = seededRoom ? [seededRoom] : []
  customerSelectOptions.value = seededCustomer ? [seededCustomer] : []
  roomPickMode.value = 'all'
  roomSelectPage.value = 1
  roomSelectHasMore.value = true
  roomSelectKeyword.value = ''
  customerSelectPage.value = 1
  customerSelectHasMore.value = true
  customerSelectKeyword.value = ''
  if (row.roomId) {
    try {
      const { data } = await fetchRoom(row.roomId)
      roomSelectOptions.value = keepSelectedInOptions([data], row.roomId, roomSelectOptions.value)
    } catch {
      /* keep seed */
    }
  }
  pinnedRequirements.value = []
  await loadRequirementsForCustomer(row.customerId)
  const reqId = String(row.requirementId || '').trim()
  if (reqId) {
    const existing =
      customerRequirements.value.find((r) => r.id === reqId) ||
      requirementSeedFromContract(reqId, row.customerId)
    if (existing) pinRequirementOption(existing)
  }
  formVisible.value = true
}

function payloadFromForm(issueNow = false) {
  return {
    // 新增不传编号，由后端按「房间编号-YYYYMMDD」生成；编辑保留原编号
    contractCode: editing.value ? form.contractCode.trim() || undefined : undefined,
    roomId: form.roomId.trim(),
    customerId: form.customerId.trim(),
    salesManagerId: form.salesManagerId.trim() || null,
    requirementId: String(form.requirementId ?? '').trim() || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    actualEndDate: form.actualEndDate || null,
    leaseType: resolveLeaseTypeLabel(form.occupancyMode),
    occupancyMode: form.occupancyMode,
    partLabel: form.occupancyMode === 'part' ? form.partLabel.trim().toUpperCase() : '',
    // 普通保存：新增固定签约中；编辑可带表单状态（后端会拦「租赁中」）
    // 直接开单：由后端置为租赁中
    status: issueNow ? undefined : editing.value ? form.status : '簽約中',
    roomDeposit: form.roomDeposit,
    monthlyRent: form.monthlyRent,
    bookingDeposit: form.bookingDeposit,
    paymentDate: form.paymentDate || null,
    paymentCycle: form.paymentCycle.trim() || undefined,
    paymentMethod: (form.paymentMethod || '').trim() || undefined,
    paymentVoucher: form.paymentVoucher.trim(),
    electricityRate: form.electricityRate,
    miscDeposit: form.miscDeposit,
    doorKeyQty: form.doorKeyQty,
    mailboxKeyQty: form.mailboxKeyQty,
    roomNameText:
      selectedRoom.value?.name?.trim() ||
      form.roomNameText.trim() ||
      '',
    subleaseMark:
      form.occupancyMode === 'part' ? form.partLabel.trim().toUpperCase() : form.subleaseMark.trim(),
    attachment: form.attachment.trim(),
    remark: form.remark.trim(),
    issueNow: issueNow || undefined,
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
    loanItems: loanItems.value
      .filter((f) => isLoanItemRowComplete(f))
      .map((f, i) => ({
        description: f.description.trim(),
        quantity: Number(f.quantity),
        unitAmount: Number(f.unitAmount),
        subtotal: loanItemSubtotal(f),
        remark: f.remark.trim(),
        sortOrder: i,
      })),
  }
}

async function saveForm(mode: 'save' | 'issue' = 'save') {
  if (!form.roomId.trim()) {
    ElMessage.warning(t('contract.roomRequired'))
    return
  }
  if (!form.customerId.trim()) {
    ElMessage.warning(t('contract.customerRequired'))
    return
  }
  if (form.occupancyMode === 'part' && !form.partLabel.trim()) {
    ElMessage.warning(t('contract.partLabelRequired'))
    return
  }
  // 新增时若已收定金>0：收款方式、定金凭证必填
  const bookingAmt = Number(form.bookingDeposit ?? 0)
  if (!editing.value && Number.isFinite(bookingAmt) && bookingAmt > 0) {
    if (!(form.paymentMethod || '').trim()) {
      await ElMessageBox.alert(
        t('contract.fields.paymentMethodRequired'),
        t('contract.create'),
        messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
      )
      return
    }
    if (!form.paymentVoucher.trim()) {
      await ElMessageBox.alert(
        t('contract.fields.paymentVoucherRequired'),
        t('contract.create'),
        messageBoxOpts({ type: 'warning', confirmButtonText: t('common.confirm') }),
      )
      return
    }
  }
  const issueNow = mode === 'issue'
  if (issueNow && !form.attachment.trim()) {
    ElMessage.warning(t('contract.issueNowNeedAttachment'))
    return
  }
  const periodErr = validatePeriodsAgainstContractDates()
  if (periodErr) {
    ElMessage.warning(periodErr)
    return
  }
  // 仅有免租期（含「只有一条免租期」）不允许提交
  const hasBillablePeriod = periods.value.some((p) => !isRentFreePeriodType(p.dateType))
  if (!hasBillablePeriod) {
    ElMessage.warning(t('contract.periodNeedUsage'))
    return
  }
  const incompleteLoan = loanItems.value.find(
    (f) => !isLoanItemRowEmpty(f) && !isLoanItemRowComplete(f),
  )
  if (incompleteLoan) {
    ElMessage.warning(t('contract.loanItemRequired'))
    return
  }
  if (editing.value && !isSigningContractStatus(editing.value.status)) {
    ElMessage.warning(t('contract.editOnlySigning'))
    return
  }
  if (formSaving.value) return
  formSaving.value = true
  try {
    const payload = payloadFromForm(issueNow)
    if (editing.value) {
      await updateContractApi(editing.value.id, payload)
      ElMessage.success(
        issueNow ? t('contract.issueNowDone') : t('contract.updatedWithInvoices'),
      )
    } else {
      await createContractApi(payload)
      ElMessage.success(
        issueNow ? t('contract.issueNowDone') : t('contract.createdWithInvoices'),
      )
    }
    formVisible.value = false
    await loadHeadChipCounts()
    await loadList()
    void loadIssueBlockedAlerts()
  } catch {
    /* interceptor */
  } finally {
    formSaving.value = false
  }
}

async function onCancelContractDone() {
  closeContractMoreMenu()
  if (current.value?.id && cancelContract.value?.id === current.value.id) {
    try {
      const { data } = await fetchContract(current.value.id)
      current.value = data
    } catch {
      /* interceptor */
    }
  }
  void loadExpiringSoonCount()
  await loadHeadChipCounts()
  await loadList()
}

function statusLabel(status: string) {
  const key = `contract.status.${status}`
  return t(key) === key ? status : t(key)
}

async function onContractInlineSave(
  row: ContractRecord,
  field: ContractInlineField,
  value: string | number | null,
) {
  if (!(field in CONTRACT_INLINE_FIELDS)) return
  // superAdmin 行内编辑不受签约流程限制（组件本身仅 superAdmin 可改）
  try {
    const payload = { [field]: value } as Partial<ContractWritePayload>
    const { data } = await updateContractApi(row.id, payload)
    const idx = list.value.findIndex((r) => r.id === row.id)
    if (idx >= 0) {
      list.value[idx] = { ...list.value[idx], ...data }
    }
    if (current.value?.id === row.id) current.value = { ...current.value, ...data }
    ElMessage.success(t('contract.updated'))
    if (field === 'status' || field === 'endDate') void loadExpiringSoonCount()
  } catch {
    /* interceptor */
  }
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
  if (
    el?.closest(
      '.action-pills, button, a, .el-switch, input, textarea, .el-checkbox, .el-table-column--selection, .sa-inline, .el-select, .el-date-editor',
    )
  ) {
    return
  }
  void openDetail(row, 'rtl')
}

async function openCustomerSide(
  customerId?: string | null,
  direction: 'ltr' | 'rtl' = 'ltr',
  opts?: { zIndex?: number },
) {
  await relationDrawers.value?.openCustomerSide(customerId, direction, opts)
}

async function openRoomSide(
  roomId?: string | null,
  direction: 'ltr' | 'rtl' = 'ltr',
  opts?: { zIndex?: number },
) {
  await relationDrawers.value?.openRoomSide(roomId, direction, opts)
}

async function openBuildingSide(buildingId?: string | null, opts?: { zIndex?: number }) {
  await relationDrawers.value?.openBuildingSide(buildingId, opts)
}

async function openRequirementSide(requirementId?: string | null, opts?: { zIndex?: number }) {
  await relationDrawers.value?.openRequirementSide(requirementId, opts)
}

/** 关联列表抽屉：始终 alloc 一层，若从抬高弹窗打开则盖过父层 */
function allocRelatedListZ(above?: number) {
  return allocZ(above)
}

function openInvoicesList(row: ContractRecord, opts?: { zIndex?: number }) {
  if (!row.invoiceCount) return
  relatedInvoicesContract.value = row
  relatedInvoicesZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedInvoicesDrawerVisible.value = true
}

/** 操作列「發票記錄」：即使尚無發票也可打開關聯抽屜 */
function openInvoicesFromAction(row: ContractRecord, opts?: { zIndex?: number }) {
  relatedInvoicesContract.value = row
  relatedInvoicesZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedInvoicesDrawerVisible.value = true
}

/** 整頁共用「更多」菜單（避免每行 el-dropdown 在 fixed 操作列卡死渲染） */
const MORE_HOVER_CLOSE_MS = 180
let contractMoreCloseTimer: ReturnType<typeof setTimeout> | null = null

function clearContractMoreCloseTimer() {
  if (contractMoreCloseTimer == null) return
  clearTimeout(contractMoreCloseTimer)
  contractMoreCloseTimer = null
}

function closeContractMoreMenu() {
  clearContractMoreCloseTimer()
  contractMoreFeaturePinUntil = 0
  contractMoreVisible.value = false
  contractMoreRow.value = null
}

async function positionContractMoreMenu(btn: HTMLElement, row: ContractRecord) {
  const rect = btn.getBoundingClientRect()
  const gap = 6
  const edge = 8
  const right = Math.round(Math.max(edge, window.innerWidth - rect.right))
  // 先按向下展开占位，量高后再决定上／下
  contractMoreRow.value = row
  contractMoreStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + gap)}px`,
    bottom: 'auto',
    right: `${right}px`,
    left: 'auto',
    maxHeight: 'none',
    overflowY: 'visible',
    zIndex: String(contractMoreMenuZIndex()),
  }
  contractMoreVisible.value = true
  await nextTick()
  const menu = document.querySelector('.contract-more-menu') as HTMLElement | null
  if (!menu || contractMoreRow.value?.id !== row.id) return
  const menuH = menu.offsetHeight
  const spaceBelow = window.innerHeight - rect.bottom - gap - edge
  const spaceAbove = rect.top - gap - edge
  const openBelow = spaceBelow >= menuH || spaceBelow >= spaceAbove
  if (openBelow) {
    const needScroll = menuH > spaceBelow
    contractMoreStyle.value = {
      position: 'fixed',
      top: `${Math.round(rect.bottom + gap)}px`,
      bottom: 'auto',
      right: `${right}px`,
      left: 'auto',
      maxHeight: needScroll ? `${Math.max(120, Math.floor(spaceBelow))}px` : 'none',
      overflowY: needScroll ? 'auto' : 'visible',
      zIndex: String(contractMoreMenuZIndex()),
    }
  } else {
    const needScroll = menuH > spaceAbove
    contractMoreStyle.value = {
      position: 'fixed',
      top: 'auto',
      bottom: `${Math.round(window.innerHeight - rect.top + gap)}px`,
      right: `${right}px`,
      left: 'auto',
      maxHeight: needScroll ? `${Math.max(120, Math.floor(spaceAbove))}px` : 'none',
      overflowY: needScroll ? 'auto' : 'visible',
      zIndex: String(contractMoreMenuZIndex()),
    }
  }
}

/** 悬停打开面板（同列切换时直接换行） */
function onContractMoreHoverEnter(row: ContractRecord, ev: MouseEvent) {
  clearContractMoreCloseTimer()
  const btn = ev.currentTarget as HTMLElement | null
  if (!btn) return
  positionContractMoreMenu(btn, row)
}

/** 离开按钮或面板：短暂延迟关闭（纯悬停移开会关；功能弹窗／MessageBox 打开期间不关） */
function scheduleCloseContractMoreMenu() {
  clearContractMoreCloseTimer()
  contractMoreCloseTimer = setTimeout(() => {
    contractMoreCloseTimer = null
    if (shouldKeepContractMoreOpen()) return
    closeContractMoreMenu()
  }, MORE_HOVER_CLOSE_MS)
}

/** 「…」失焦：焦点进入更多面板内时不关 */
function onContractMoreTriggerBlur(ev: FocusEvent) {
  const next = ev.relatedTarget as HTMLElement | null
  if (next?.closest?.('.contract-more-menu')) {
    clearContractMoreCloseTimer()
    return
  }
  scheduleCloseContractMoreMenu()
}

/** 点击：同按钮再点关闭；否则打开（键盘/触控仍可用） */
function openContractMoreMenu(row: ContractRecord, ev: MouseEvent) {
  clearContractMoreCloseTimer()
  const btn = ev.currentTarget as HTMLElement | null
  if (!btn) return
  if (contractMoreVisible.value && contractMoreRow.value?.id === row.id) {
    closeContractMoreMenu()
    return
  }
  positionContractMoreMenu(btn, row)
}

/**
 * 从更多面板执行操作：打开功能弹窗／抽屉时不关面板；
 * 取消／删除等操作成功后再关。
 */
function onContractMorePick(cmd: string) {
  const row = contractMoreRow.value
  if (!row) return
  if (cmd === 'openOrder') {
    if (!canOpenOrderSign(row)) return
    pinContractMoreForFeatureUi()
    void onOpenOrderClick(row).then(() => {
      pinContractMoreForFeatureUi()
    })
    return
  }
  if (cmd === 'topUpBookingDeposit') {
    if (!canTopUpBookingDeposit(row)) return
    pinContractMoreForFeatureUi()
    openTopUpBookingDepositFor(row)
    pinContractMoreForFeatureUi()
    return
  }
  if (cmd === 'invoices') {
    pinContractMoreForFeatureUi()
    openInvoicesFromAction(row)
    pinContractMoreForFeatureUi()
    return
  }
  if (cmd === 'renew') {
    onRenewContractPlaceholder()
    return
  }
  if (cmd === 'end') {
    if (!endActionOf(row)) return
    pinContractMoreForFeatureUi()
    onContractEndAction(row)
    pinContractMoreForFeatureUi()
    return
  }
  if (cmd === 'cancelRefund') {
    if (!canOfferContractRefund(row)) return
    pinContractMoreForFeatureUi()
    void openContractRefund(row)
    pinContractMoreForFeatureUi()
    return
  }
  if (cmd === 'delete') {
    void (async () => {
      const done = await onDeleteContract(row)
      if (done) closeContractMoreMenu()
    })()
  }
}

function onContractMoreDocPointer(ev: Event) {
  if (!contractMoreVisible.value) return
  const t = ev.target as HTMLElement | null
  if (t?.closest('.contract-more-menu, .action-pill--more')) return
  // MessageBox／功能弹窗／抽屉内点击：保留更多面板
  if (
    t?.closest(
      [
        '.el-message-box',
        '.el-message-box__wrapper',
        '.el-overlay-message-box',
        '.el-overlay.is-message-box',
        '.el-overlay-dialog',
        '.el-dialog',
        '.el-dialog__wrapper',
        '.el-overlay.is-drawer',
        '.el-drawer',
        '.el-drawer__wrapper',
      ].join(', '),
    )
  ) {
    return
  }
  if (shouldKeepContractMoreOpen()) return
  closeContractMoreMenu()
}

function onContractMoreScrollOrResize() {
  if (!contractMoreVisible.value) return
  // 功能弹窗／MessageBox 期间保留；否则滚动／缩放关掉以免错位
  if (shouldKeepContractMoreOpen()) return
  closeContractMoreMenu()
}

function openReceivablesList(row: ContractRecord, opts?: { zIndex?: number }) {
  if (!row.receivableCount) return
  relatedReceivablesContract.value = row
  relatedReceivablesZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedReceivablesDrawerVisible.value = true
}

function openReceiptsList(row: ContractRecord, opts?: { force?: boolean; zIndex?: number }) {
  if (!opts?.force && !row.receiptCount) return
  relatedReceiptsContract.value = row
  relatedReceiptsZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedReceiptsDrawerVisible.value = true
}

/** 收款／退租弹窗内打开收款记录：必须盖过当前弹窗 */
function openReceiptsFromReceivePay(row: ContractRecord) {
  const above =
    receivePayVisible.value && receivePayZIndex.value != null
      ? receivePayZIndex.value
      : terminateVisible.value && terminateZIndex.value != null
        ? terminateZIndex.value
        : undefined
  openReceiptsList(row, { force: true, zIndex: above })
}

function openCashFlowsList(row: ContractRecord, opts?: { zIndex?: number }) {
  if (!(row.cashFlowCount ?? 0)) return
  relatedCashFlowsContract.value = row
  relatedCashFlowsZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedCashFlowsVisible.value = true
}

async function openContractCashFlowDetail(row: CashFlowRecord) {
  try {
    const { data } = await fetchCashFlow(row.id)
    relatedCashFlowRecord.value = data
  } catch {
    relatedCashFlowRecord.value = row
  }
  relatedCashFlowDetailZIndex.value = allocZ(relatedCashFlowsZIndex.value)
  relatedCashFlowDrawerVisible.value = true
}

function openPeriodsList(row: ContractRecord, opts?: { zIndex?: number }) {
  if (!row.periodCount) return
  relatedPeriodsContract.value = row
  relatedPeriodsZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedPeriodsDrawerVisible.value = true
}

function openTerminationsList(row: ContractRecord) {
  if (!canViewVacateSettlement(row)) return
  openVacateDetail(row)
}

function openLoanItemsList(row: ContractRecord, opts?: { zIndex?: number }) {
  if (!row.loanItemCount) return
  relatedLoanItemsContract.value = row
  relatedLoanItemsZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedLoanItemsDrawerVisible.value = true
}

function openDepositDeductionsList(row: ContractRecord, opts?: { zIndex?: number }) {
  if (!row.depositDeductionCount) return
  relatedDepositDeductionsContract.value = row
  relatedDepositDeductionsZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedDepositDeductionsDrawerVisible.value = true
}

function openDepositRefundsList(row: ContractRecord, opts?: { zIndex?: number }) {
  if (!row.depositRefundCount) return
  relatedDepositRefundsContract.value = row
  relatedDepositRefundsZIndex.value = allocRelatedListZ(opts?.zIndex)
  relatedDepositRefundsDrawerVisible.value = true
}

async function onContractBookingDepositChanged() {
  await loadList()
  const id = current.value?.id
  if (!id) return
  try {
    const { data } = await fetchContract(id)
    current.value = data
  } catch {
    /* 列表已刷新；详情保持原样即可 */
  }
}

function onOpenInvoiceFromList(invoice: InvoiceRecord) {
  void relationDrawers.value?.openInvoiceSide(invoice.id, {
    zIndex: relatedInvoicesZIndex.value,
  })
}

function onOpenReceivableFromList(receivable: ReceivableRecord) {
  void relationDrawers.value?.openReceivableSide(receivable.id, {
    zIndex: relatedReceivablesZIndex.value,
  })
}

function onOpenReceiptFromList(receipt: ReceiptRecord) {
  void relationDrawers.value?.openReceiptSide(receipt.id, {
    zIndex: relatedReceiptsZIndex.value,
  })
}

function onOpenPeriodFromList(period: ContractPeriodListRecord) {
  void relationDrawers.value?.openPeriodSide(period.id, {
    zIndex: relatedPeriodsZIndex.value,
  })
}

function onOpenSettlementFromList(settlement: ContractSettlementRecord) {
  void relationDrawers.value?.openSettlementSide(settlement.id, {
    zIndex: relatedSettlementsZIndex.value,
  })
}

function onOpenLoanItemFromList(fee: ContractLoanItemRecord) {
  void relationDrawers.value?.openLoanItemSide(fee.id, {
    zIndex: relatedLoanItemsZIndex.value,
  })
}

function onOpenDepositDeductionFromList(fee: DepositDeductionRecord) {
  void relationDrawers.value?.openDepositDeductionSide(fee.id, {
    zIndex: relatedDepositDeductionsZIndex.value,
  })
}

function onOpenDepositRefundFromList(record: DepositRefundRecord) {
  void relationDrawers.value?.openDepositRefundSide(record.id, {
    zIndex: relatedDepositRefundsZIndex.value,
  })
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head admin-page-head--with-chips">
      <RefreshListButton :loading="loading" @refresh="() => void onRefreshList()" />
      <h2>{{ t('menu.contracts') }}</h2>
      <div class="building-chips-rail">
        <div class="building-chips" role="tablist" :aria-label="t('contract.occupancyFilterAria')">
          <button
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': allChipActive }"
            :aria-selected="allChipActive"
            :title="t('contract.occupancyFilterAllTip')"
            @click="selectAllChip"
          >
            <span class="building-chip__name">{{ t('contract.occupancyFilterAll') }}</span>
            <span class="building-chip__count">({{ occupancyModeCounts.all }})</span>
          </button>
          <span class="building-chips__sep" aria-hidden="true">|</span>
          <button
            v-for="chip in occupancyModeChips"
            :key="chip.key"
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': occupancyModeFilter === chip.key }"
            :aria-selected="occupancyModeFilter === chip.key"
            @click="setOccupancyModeFilter(chip.key)"
          >
            <span class="building-chip__name">{{ chip.label }}</span>
            <span class="building-chip__count">({{ chip.count }})</span>
          </button>
          <span class="building-chips__sep" aria-hidden="true">|</span>
          <button
            type="button"
            class="building-chip"
            role="tab"
            :class="{ 'is-active': outstandingReceivableFilter }"
            :aria-selected="outstandingReceivableFilter"
            :title="t('contract.outstandingReceivableTip')"
            @click="toggleOutstandingReceivableFilter"
          >
            <span class="building-chip__name">{{ t('contract.outstandingReceivable') }}</span>
            <span class="building-chip__count">({{ outstandingReceivableCount }})</span>
          </button>
          <span class="building-chips__sep" aria-hidden="true">|</span>
          <div class="building-chip-group">
            <button
              type="button"
              class="building-chip"
              role="tab"
              :class="{ 'is-active': expiringSoonFilter }"
              :aria-selected="expiringSoonFilter"
              :title="expiringSoonTip || t('contract.expiringSoon')"
              @click="toggleExpiringSoonFilter"
            >
              <span class="building-chip__name">{{ t('contract.expiringSoon') }}</span>
              <span class="building-chip__count">({{ expiringSoonCount }})</span>
            </button>
            <el-popover
              v-if="userStore.isSuperAdmin"
              v-model:visible="expiringEditVisible"
              placement="bottom-start"
              :width="360"
              trigger="click"
              :teleported="true"
              :show-arrow="true"
              popper-class="expiring-soon-edit-popper"
              @show="seedExpiringEditForm"
            >
              <template #reference>
                <button
                  type="button"
                  class="building-chip-edit"
                  :class="{ 'is-open': expiringEditVisible }"
                  :title="t('contract.expiringSoonEdit')"
                  :aria-label="t('contract.expiringSoonEdit')"
                  @click.stop
                >
                  <el-icon :size="13"><EditPen /></el-icon>
                </button>
              </template>
              <div class="expiring-edit">
                <header class="expiring-edit__head">
                  <div class="expiring-edit__icon" aria-hidden="true">
                    <el-icon :size="16"><EditPen /></el-icon>
                  </div>
                  <div class="expiring-edit__head-text">
                    <div class="expiring-edit__title">{{ t('contract.expiringSoonEdit') }}</div>
                    <p class="expiring-edit__desc">{{ t('contract.expiringSoonEditDesc') }}</p>
                  </div>
                </header>

                <div class="expiring-edit__body">
                  <section class="expiring-edit__card">
                    <div class="expiring-edit__label">
                      {{ t('systemSettings.fields.expiringWindow') }}
                    </div>
                    <div class="expiring-edit__controls">
                      <el-input-number
                        v-model="expiringEditForm.amount"
                        class="expiring-edit__amount"
                        :min="1"
                        :max="expiringEditAmountMax"
                        :step="1"
                        controls-position="right"
                      />
                      <el-select
                        v-model="expiringEditForm.unit"
                        class="expiring-edit__unit"
                        :teleported="false"
                        @change="onExpiringEditUnitChange"
                      >
                        <el-option :label="t('systemSettings.unit.days')" value="day" />
                        <el-option :label="t('systemSettings.unit.months')" value="month" />
                      </el-select>
                    </div>
                  </section>

                  <section class="expiring-edit__card">
                    <div class="expiring-edit__label">
                      {{ t('systemSettings.fields.expiringStatusMode') }}
                    </div>
                    <el-radio-group
                      v-model="expiringEditForm.statusMode"
                      class="expiring-edit__mode"
                      @change="onExpiringEditStatusModeChange"
                    >
                      <el-radio-button value="all">
                        {{ t('systemSettings.statusMode.all') }}
                      </el-radio-button>
                      <el-radio-button value="include">
                        {{ t('systemSettings.statusMode.include') }}
                      </el-radio-button>
                      <el-radio-button value="exclude">
                        {{ t('systemSettings.statusMode.exclude') }}
                      </el-radio-button>
                    </el-radio-group>
                    <el-select
                      v-if="expiringEditForm.statusMode !== 'all'"
                      v-model="expiringEditForm.statuses"
                      multiple
                      collapse-tags
                      collapse-tags-tooltip
                      filterable
                      :teleported="false"
                      class="expiring-edit__statuses"
                      :placeholder="t('systemSettings.fields.expiringStatusesPlaceholder')"
                    >
                      <el-option
                        v-for="opt in expiringEditStatusOptions"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                      />
                    </el-select>
                  </section>
                </div>

                <footer class="expiring-edit__actions">
                  <el-button @click="expiringEditVisible = false">
                    {{ t('common.cancel') }}
                  </el-button>
                  <el-button
                    type="primary"
                    class="lb-btn-primary"
                    :loading="expiringEditSaving"
                    @click="saveExpiringEdit"
                  >
                    {{ t('common.save') }}
                  </el-button>
                </footer>
              </div>
            </el-popover>
          </div>
        </div>
      </div>
      <div class="head-actions">
        <el-popover
          v-if="issueBlockedAlerts.length"
          placement="bottom-end"
          :width="340"
          trigger="click"
          popper-class="issue-blocked-popper"
        >
          <template #reference>
            <button
              type="button"
              class="issue-blocked-chip"
              :title="t('contract.issueBlockedChipTip')"
            >
              <el-icon :size="14"><WarningFilled /></el-icon>
              <span>{{ t('contract.issueBlockedChip', { n: issueBlockedAlerts.length }) }}</span>
            </button>
          </template>
          <div class="issue-blocked-pop">
            <p class="issue-blocked-pop__lead">
              {{
                t('contract.issueBlockedPopLead', {
                  days: issueBlockedLeadDays,
                })
              }}
            </p>
            <ul class="issue-blocked-pop__list">
              <li v-for="item in issueBlockedAlerts" :key="item.id" class="issue-blocked-pop__row">
                <div class="issue-blocked-pop__meta">
                  <button
                    type="button"
                    class="issue-blocked-pop__code"
                    @click="openIssueBlockedDetail(item.id)"
                  >
                    {{ item.contractCode }}
                  </button>
                  <span class="issue-blocked-pop__date">
                    {{ t('contract.issueBlockedPopPeriod', { date: item.secondPeriodStart }) }}
                    · {{ issueBlockedUrgencyText(item) }}
                  </span>
                </div>
                <el-button
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="warning"
                  size="small"
                  plain
                  @click="openIssueBlockedOrder(item.id)"
                >
                  {{ t('contract.openOrder') }}
                </el-button>
              </li>
            </ul>
            <p v-if="issueBlockedAlerts.length > 4" class="issue-blocked-pop__foot">
              {{ t('contract.issueBlockedPopFoot', { n: issueBlockedAlerts.length }) }}
            </p>
          </div>
        </el-popover>
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('contract.searchPlaceholder')"
        />
        <ClearTableFiltersButton :count="tableHeaderConditionCount" @clear="onClearTableHeaderFilters" />
        <el-button
          v-if="perms.create" v-admin-glow="perms.codes.create"
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
              <el-dropdown-item v-if="perms.import" v-admin-glow="perms.codes.import" command="import">
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

    <div class="table-card">
      <div
        class="table-scroll"
        v-loading="loading"
        element-loading-background="rgba(247, 250, 248, 0.78)"
      >
        <el-table
          ref="tableRef"
          :key="contractTableKey"
          :data="list"
          row-key="id"
          height="100%"
          stripe
          border
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
                filterable
                sortable
                :options="contractCodeFilterOptions"
                :model-value="filters.contractCode || []"
                :sort-order="sortOrderOf('contractCode')"
                @update:model-value="(v) => setFilter('contractCode', v)"
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
                :model-value="filters.startDate || []"
                :sort-order="sortOrderOf('startDate')"
                :date-range-value="dateRangeOf('startDate')"
                @update:sort-order="(v) => setSort('startDate', v)"
                @update:model-value="(v) => setFilter('startDate', v)"
                @update:date-range-value="(v) => setDateRange('startDate', v)"
              />
            </template>
            <template #default="{ row }">
              <SuperAdminInlineCell
                :value="row.startDate || ''"
                type="date"
                :display-text="row.startDate || '—'"
                @save="(v) => onContractInlineSave(row, 'startDate', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.endDate'), { interactive: true, contentMin: 110 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.endDate')"
                sortable
                date-range
                :model-value="filters.endDate || []"
                :sort-order="sortOrderOf('endDate')"
                :date-range-value="dateRangeOf('endDate')"
                @update:sort-order="(v) => setSort('endDate', v)"
                @update:model-value="(v) => setFilter('endDate', v)"
                @update:date-range-value="(v) => setDateRange('endDate', v)"
              />
            </template>
            <template #default="{ row }">
              <SuperAdminInlineCell
                :value="row.endDate || ''"
                type="date"
                :display-text="row.endDate || '—'"
                @save="(v) => onContractInlineSave(row, 'endDate', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('contract.fields.status'),
                statusFilterOptions.map((o) => o.label),
              ) + (String(locale).toLowerCase().startsWith('zh') ? 4 : 0)
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
              <div class="contract-status-cell">
                <SuperAdminInlineCell
                  :value="row.status"
                  type="select"
                  :options="statusEditOptionsForRow(row as ContractRecord)"
                  :display-text="statusLabel(row.status)"
                  @save="(v) => onContractInlineSave(row, 'status', v)"
                >
                  <StatusBadge
                    :tone="contractStatusTone(row.status)"
                    :label="statusLabel(row.status)"
                  />
                </SuperAdminInlineCell>
                <el-tooltip
                  v-if="issueBlockedRowTip(row)"
                  :content="issueBlockedRowTip(row)"
                  placement="top"
                >
                  <el-icon class="contract-status-cell__warn" :size="16">
                    <WarningFilled />
                  </el-icon>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(
                t('contract.fields.rentCollectionStatus'),
                rentCollectionFilterOptions.map((o) => o.label),
              )
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.rentCollectionStatus')"
                filterable
                sortable
                :options="rentCollectionFilterOptions"
                :model-value="filters.rentCollectionStatus || []"
                :sort-order="sortOrderOf('rentCollectionStatus')"
                @update:model-value="(v) => setFilter('rentCollectionStatus', v)"
                @update:sort-order="(v) => setSort('rentCollectionStatus', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="rentCollectionTone(row.rentCollectionStatus)"
                :label="rentCollectionLabel(row.rentCollectionStatus)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.receivableAmountTotal'), { interactive: true, contentMin: 120 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.receivableAmountTotal')"
                sortable
                :sort-order="sortOrderOf('receivableAmountTotal')"
                @update:sort-order="(v) => setSort('receivableAmountTotal', v)"
              />
            </template>
            <template #default="{ row }">
              {{ formatMoney(row.receivableAmountTotal ?? 0) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="
              statusColW(t('contract.fields.leaseType'), occupancyStatusSamples, {
                interactive: true,
              })
            "
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.leaseType')"
                :filterable="!occupancyModeFilter"
                sortable
                :options="leaseTypeFilterOptions"
                :model-value="filters.leaseType || []"
                :sort-order="sortOrderOf('leaseType')"
                @update:model-value="(v) => setFilter('leaseType', v)"
                @update:sort-order="(v) => setSort('leaseType', v)"
              />
            </template>
            <template #default="{ row }">
              <StatusBadge
                :tone="contractOccupancyTone((row as ContractRecord).occupancyMode)"
                :label="occupancyLabelOf(row as ContractRecord)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.monthlyRent'), { interactive: true, contentMin: 100 })"
            align="right"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.monthlyRent')"
                filterable
                sortable
                :options="monthlyRentFilterOptions"
                :model-value="filters.monthlyRent || []"
                :sort-order="sortOrderOf('monthlyRent')"
                @update:model-value="(v) => setFilter('monthlyRent', v)"
                @update:sort-order="(v) => setSort('monthlyRent', v)"
              />
            </template>
            <template #default="{ row }">
              <SuperAdminInlineCell
                :value="row.monthlyRent"
                type="number"
                :precision="2"
                :min="0"
                :display-text="row.monthlyRent == null ? '—' : formatMoney(row.monthlyRent)"
                @save="(v) => onContractInlineSave(row, 'monthlyRent', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.paymentCycle'), { interactive: true, contentMin: 110 })"
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
            <template #default="{ row }">
              <SuperAdminInlineCell
                :value="coerceContractPaymentCycle(row.paymentCycle)"
                type="select"
                :options="paymentCycleFilterOptions"
                :display-text="
                  row.paymentCycle ? coerceContractPaymentCycle(row.paymentCycle) : '—'
                "
                @save="(v) => onContractInlineSave(row, 'paymentCycle', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.invoiceCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.invoiceCount')"
                sortable
                :sort-order="sortOrderOf('invoiceCount')"
                @update:sort-order="(v) => setSort('invoiceCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.invoiceCount ?? 0"
                @click="openInvoicesList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.receivableCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.receivableCount')"
                sortable
                :sort-order="sortOrderOf('receivableCount')"
                @update:sort-order="(v) => setSort('receivableCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receivableCount ?? 0"
                @click="openReceivablesList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.receiptCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.receiptCount')"
                sortable
                :sort-order="sortOrderOf('receiptCount')"
                @update:sort-order="(v) => setSort('receiptCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.receiptCount ?? 0"
                @click="openReceiptsList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.periodCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.periodCount')"
                sortable
                :sort-order="sortOrderOf('periodCount')"
                @update:sort-order="(v) => setSort('periodCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.periodCount ?? 0" @click="openPeriodsList(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.terminationCount'), { interactive: true, contentMin: 80 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.terminationCount')"
                sortable
                :sort-order="sortOrderOf('terminationCount')"
                @update:sort-order="(v) => setSort('terminationCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.terminationCount ?? 0" @click="openTerminationsList(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.loanItemCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.loanItemCount')"
                sortable
                :sort-order="sortOrderOf('loanItemCount')"
                @update:sort-order="(v) => setSort('loanItemCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill :count="row.loanItemCount ?? 0" @click="openLoanItemsList(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.depositDeductionCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.depositDeductionCount')"
                sortable
                :sort-order="sortOrderOf('depositDeductionCount')"
                @update:sort-order="(v) => setSort('depositDeductionCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.depositDeductionCount ?? 0"
                @click="openDepositDeductionsList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.depositRefundCount'), { interactive: true, contentMin: 88 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.depositRefundCount')"
                sortable
                :sort-order="sortOrderOf('depositRefundCount')"
                @update:sort-order="(v) => setSort('depositRefundCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.depositRefundCount ?? 0"
                @click="openDepositRefundsList(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('contract.fields.cashFlowCount'), { interactive: true, contentMin: 96 })"
            align="center"
          >
            <template #header>
              <TableColumnHeader
                :label="t('contract.fields.cashFlowCount')"
                sortable
                :sort-order="sortOrderOf('cashFlowCount')"
                @update:sort-order="(v) => setSort('cashFlowCount', v)"
              />
            </template>
            <template #default="{ row }">
              <CountListPill
                :count="row.cashFlowCount ?? 0"
                @click="openCashFlowsList(row)"
              />
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
            :width="contractActionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills" @click.stop>
                <ActionDetailButton @click="openDetail(row as ContractRecord)" />
                <button
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="openEdit(row as ContractRecord)"
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--accent"
                  @click="onReceivePayment(row as ContractRecord)"
                >
                  {{ t('contract.receivePayment') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--leave"
                  :disabled="printingAgreementId === (row as ContractRecord).id"
                  @mouseenter="prefetchAgreementPdfApi((row as ContractRecord).id)"
                  @focus="prefetchAgreementPdfApi((row as ContractRecord).id)"
                  @click="onPrintAgreement(row as ContractRecord)"
                >
                  {{ t('contract.printAgreement') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--view action-pill--more"
                  :class="{
                    'is-open':
                      contractMoreVisible && contractMoreRow?.id === (row as ContractRecord).id,
                  }"
                  :title="t('contract.moreActions')"
                  :aria-label="t('contract.moreActions')"
                  :aria-expanded="
                    contractMoreVisible && contractMoreRow?.id === (row as ContractRecord).id
                  "
                  @mouseenter="onContractMoreHoverEnter(row as ContractRecord, $event)"
                  @mouseleave="scheduleCloseContractMoreMenu"
                  @focus="onContractMoreHoverEnter(row as ContractRecord, $event)"
                  @blur="onContractMoreTriggerBlur"
                  @click.stop="openContractMoreMenu(row as ContractRecord, $event)"
                >
                  …
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

    <Teleport to="body">
      <div
        v-if="contractMoreVisible && contractMoreRow"
        class="contract-more-menu"
        :style="contractMoreStyle"
        role="menu"
        :aria-label="t('contract.moreActions')"
        @click.stop
        @mouseenter="clearContractMoreCloseTimer"
        @mouseleave="scheduleCloseContractMoreMenu"
      >
        <header class="contract-more-menu__head">
          <span class="contract-more-menu__head-label">{{ t('contract.fields.contractCode') }}</span>
          <span class="contract-more-menu__head-code" :title="contractMoreRow.contractCode">
            {{ contractMoreRow.contractCode || '—' }}
          </span>
        </header>
        <section class="contract-more-menu__group">
          <div class="contract-more-menu__label">{{ t('contract.moreGroupProcess') }}</div>
          <div class="contract-more-menu__pills">
            <button
              v-if="perms.update"
              v-admin-glow="perms.codes.update"
              type="button"
              class="action-pill action-pill--info"
              role="menuitem"
              :disabled="!canOpenOrderSign(contractMoreRow)"
              :title="
                canOpenOrderSign(contractMoreRow)
                  ? undefined
                  : t('contract.openOrderOnlySigning')
              "
              @click="onContractMorePick('openOrder')"
            >
              {{ t('contract.openOrder') }}
            </button>
            <button
              v-if="receiptPerms.create"
              v-admin-glow="receiptPerms.codes.create"
              type="button"
              class="action-pill action-pill--accent"
              role="menuitem"
              :disabled="!canTopUpBookingDeposit(contractMoreRow)"
              :title="
                canTopUpBookingDeposit(contractMoreRow)
                  ? undefined
                  : topUpBookingDepositDisabledReason(contractMoreRow)
              "
              @click="onContractMorePick('topUpBookingDeposit')"
            >
              {{ t('receipt.bookingDeposit.topUpAction') }}
            </button>
            <button
              type="button"
              class="action-pill action-pill--key"
              role="menuitem"
              @click="onContractMorePick('renew')"
            >
              {{ t('contract.renew') }}
            </button>
          </div>
        </section>
        <section class="contract-more-menu__group">
          <div class="contract-more-menu__label">{{ t('contract.moreGroupRecords') }}</div>
          <div class="contract-more-menu__pills">
            <button
              type="button"
              class="action-pill action-pill--view"
              role="menuitem"
              @click="onContractMorePick('invoices')"
            >
              {{ t('contract.invoiceRecords') }}
            </button>
          </div>
        </section>
        <section class="contract-more-menu__group">
          <div class="contract-more-menu__label">{{ t('contract.moreGroupEnd') }}</div>
          <div class="contract-more-menu__pills">
            <button
              v-admin-glow="
                endActionOf(contractMoreRow) === 'cancel' ? perms.codes.update : ''
              "
              type="button"
              class="action-pill"
              :class="
                endActionOf(contractMoreRow) === 'cancel'
                  ? 'action-pill--cancel-contract'
                  : 'action-pill--danger'
              "
              role="menuitem"
              :disabled="!endActionOf(contractMoreRow)"
              :title="endActionDisabledHint(contractMoreRow)"
              @click="onContractMorePick('end')"
            >
              {{ endActionLabel(contractMoreRow) }}
            </button>
            <button
              v-if="refundOrderPerms.update"
              v-admin-glow="refundOrderPerms.codes.update"
              type="button"
              class="action-pill action-pill--accent"
              role="menuitem"
              :disabled="!canOfferContractRefund(contractMoreRow)"
              :title="
                canOfferContractRefund(contractMoreRow)
                  ? undefined
                  : contractRefundDisabledHint(contractMoreRow)
              "
              @click="onContractMorePick('cancelRefund')"
            >
              {{ t('contract.cancelRefund') }}
            </button>
            <button
              v-if="perms.delete"
              v-admin-glow="perms.codes.delete"
              type="button"
              class="action-pill action-pill--danger"
              role="menuitem"
              @click="onContractMorePick('delete')"
            >
              {{ t('common.delete') }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>

    <ContractDetailDrawer
      v-model="drawerVisible"
      :contract="current"
      :desktop-direction="contractDrawerDirection"
      @open-customer="(id) => openCustomerSide(id, 'ltr')"
      @open-room="(id) => openRoomSide(id, 'ltr')"
      @open-building="openBuildingSide"
      @open-requirement="openRequirementSide"
      @open-invoices="openInvoicesList"
      @open-receivables="openReceivablesList"
      @open-receipts="openReceiptsList"
      @open-cash-flows="openCashFlowsList"
      @open-settlement="(id) => relationDrawers?.openSettlementSide(id)"
      @open-loan-items="openLoanItemsList"
      @open-booking-deposit-receipt="(id, opts) => relationDrawers?.openReceiptSide(id, opts)"
      @open-invoice="(id, opts) => relationDrawers?.openInvoiceSide(id, opts)"
      @booking-deposit-changed="onContractBookingDepositChanged"
    />
    <RelatedEntityDrawers ref="relationDrawers" @changed="loadList" />

    <ContractReceivePaymentDialog
      v-model="receivePayVisible"
      :contract="receivePayContract"
      :z-index="receivePayZIndex"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: receivePayZIndex })"
      @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: receivePayZIndex })"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id, { zIndex: receivePayZIndex })"
      @open-receipts="openReceiptsFromReceivePay"
      @collected="onReceivePayCollected"
    />

    <ContractTerminateDialog
      v-model="terminateVisible"
      :contract="terminateContract"
      :z-index="terminateZIndex"
      @done="loadList"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: terminateZIndex })"
      @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: terminateZIndex })"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id, { zIndex: terminateZIndex })"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id, { zIndex: terminateZIndex })"
      @open-receipts="openReceiptsFromReceivePay"
    />

    <ContractVacateDetailDialog
      v-model="vacateDetailVisible"
      :contract="vacateDetailContract"
      :settlement-type="endDetailSettlementType"
      :z-index="vacateDetailZIndex"
      :refresh-key="endDetailRefreshKey"
      @open-receivable="openReceivableFromVacate"
      @open-refund-order="openRefundOrderFromVacate"
      @collect-payment="onCollectFromEndDetail"
      @refund="onRefundFromEndDetail"
    />
    <RefundOrderDetailDrawer
      v-model="refundOrderDrawerVisible"
      :record="refundOrderRecord"
      desktop-direction="ltr"
      :z-index="refundOrderDrawerZIndex"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: refundOrderDrawerZIndex })"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id, 'ltr', { zIndex: refundOrderDrawerZIndex })"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr', { zIndex: refundOrderDrawerZIndex })"
      @open-settlement="(id) => relationDrawers?.openSettlementSide(id, { zIndex: refundOrderDrawerZIndex })"
      @open-cash-flows="openRefundOrderCashFlows"
    />
    <RelatedCashFlowsDrawer
      v-model="refundOrderCashFlowsVisible"
      :refund-order-id="refundOrderRecord?.id"
      :title-context="refundOrderRecord?.refundCode || ''"
      desktop-direction="ltr"
      :z-index="refundOrderCashFlowsZIndex"
      @open-cash-flow="openRefundOrderCashFlowDetail"
    />
    <CashFlowDetailDrawer
      v-model="refundOrderCashFlowDrawerVisible"
      :record="refundOrderCashFlowRecord"
      desktop-direction="ltr"
      :z-index="refundOrderCashFlowDetailZIndex"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: refundOrderCashFlowDetailZIndex })"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id, 'ltr', { zIndex: refundOrderCashFlowDetailZIndex })"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id, { zIndex: refundOrderCashFlowDetailZIndex })"
      @open-refund-order="(id) => relationDrawers?.openRefundOrderSide(id, { zIndex: refundOrderCashFlowDetailZIndex })"
    />
    <RelatedCashFlowsDrawer
      v-model="relatedCashFlowsVisible"
      :contract-id="relatedCashFlowsContract?.id"
      :title-context="relatedCashFlowsContract?.contractCode || ''"
      desktop-direction="ltr"
      :z-index="relatedCashFlowsZIndex"
      @open-cash-flow="openContractCashFlowDetail"
    />
    <CashFlowDetailDrawer
      v-model="relatedCashFlowDrawerVisible"
      :record="relatedCashFlowRecord"
      desktop-direction="ltr"
      :z-index="relatedCashFlowDetailZIndex"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: relatedCashFlowDetailZIndex })"
      @open-customer="(id) => relationDrawers?.openCustomerSide(id, 'ltr', { zIndex: relatedCashFlowDetailZIndex })"
      @open-receipt="(id) => relationDrawers?.openReceiptSide(id, { zIndex: relatedCashFlowDetailZIndex })"
      @open-refund-order="(id) => relationDrawers?.openRefundOrderSide(id, { zIndex: relatedCashFlowDetailZIndex })"
    />

    <ContractSettlementRefundDialog
      v-model="settlementRefundVisible"
      :settlement="settlementRefundRecord"
      :z-index="settlementRefundZIndex"
      @done="onSettlementRefundDone"
      @open-refund-order="openRefundOrderFromSettlementRefund"
    />
    <ContractCancelDialog
      v-model="cancelVisible"
      :contract="cancelContract"
      :z-index="contractMoreVisible ? FEATURE_DIALOG_ABOVE_MORE_Z : undefined"
      @done="onCancelContractDone"
      @open-invoice="(id, opts) => relationDrawers?.openInvoiceSide(id, opts)"
      @open-receipt="(id, opts) => relationDrawers?.openReceiptSide(id, opts)"
      @open-settlement="(id, opts) => relationDrawers?.openSettlementSide(id, opts)"
      @open-refund-order="openRefundOrderFromCancel"
    />

    <RelatedInvoicesDrawer
      v-model="relatedInvoicesDrawerVisible"
      :contract="relatedInvoicesContract"
      desktop-direction="ltr"
      :z-index="relatedInvoicesZIndex"
      @open-invoice="onOpenInvoiceFromList"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: relatedInvoicesZIndex })"
      @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: relatedInvoicesZIndex })"
      @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: relatedInvoicesZIndex })"
      @changed="loadList"
    />
    <RelatedReceivablesDrawer
      v-model="relatedReceivablesDrawerVisible"
      :contract="relatedReceivablesContract"
      desktop-direction="ltr"
      :z-index="relatedReceivablesZIndex"
      @open-receivable="onOpenReceivableFromList"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id, { zIndex: relatedReceivablesZIndex })"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: relatedReceivablesZIndex })"
      @changed="loadList"
    />
    <RelatedReceiptsDrawer
      v-model="relatedReceiptsDrawerVisible"
      :contract="relatedReceiptsContract"
      desktop-direction="ltr"
      :z-index="relatedReceiptsZIndex"
      @open-receipt="onOpenReceiptFromList"
      @open-receipt-by-id="(id) => relationDrawers?.openReceiptSide(id, { zIndex: relatedReceiptsZIndex })"
      @open-invoice="(id) => relationDrawers?.openInvoiceSide(id, { zIndex: relatedReceiptsZIndex })"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: relatedReceiptsZIndex })"
      @open-receivable="(id) => relationDrawers?.openReceivableSide(id, { zIndex: relatedReceiptsZIndex })"
      @changed="loadList"
    />
    <RelatedPeriodsDrawer
      v-model="relatedPeriodsDrawerVisible"
      :contract="relatedPeriodsContract"
      desktop-direction="ltr"
      :z-index="relatedPeriodsZIndex"
      @open-period="onOpenPeriodFromList"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr', { zIndex: relatedPeriodsZIndex })"
    />
    <RelatedSettlementsDrawer
      v-model="relatedSettlementsDrawerVisible"
      :contract="relatedSettlementsContract"
      type="VACATE"
      desktop-direction="ltr"
      :z-index="relatedSettlementsZIndex"
      @open-settlement="onOpenSettlementFromList"
      @open-contract="(id) => relationDrawers?.openContractSide(id, { zIndex: relatedSettlementsZIndex })"
      @open-room="(id) => relationDrawers?.openRoomSide(id, 'ltr', { zIndex: relatedSettlementsZIndex })"
    />
    <RelatedLoanItemsDrawer
      v-model="relatedLoanItemsDrawerVisible"
      :contract="relatedLoanItemsContract"
      desktop-direction="ltr"
      :z-index="relatedLoanItemsZIndex"
      @open-fee="onOpenLoanItemFromList"
    />
    <RelatedDepositDeductionsDrawer
      v-model="relatedDepositDeductionsDrawerVisible"
      :contract="relatedDepositDeductionsContract"
      desktop-direction="ltr"
      :z-index="relatedDepositDeductionsZIndex"
      @open-fee="onOpenDepositDeductionFromList"
      @open-settlement="(id) => relationDrawers?.openSettlementSide(id, { zIndex: relatedDepositDeductionsZIndex })"
    />
    <RelatedDepositRefundsDrawer
      v-model="relatedDepositRefundsDrawerVisible"
      :contract="relatedDepositRefundsContract"
      desktop-direction="ltr"
      :z-index="relatedDepositRefundsZIndex"
      @open-deposit-refund="onOpenDepositRefundFromList"
    />

    <el-dialog
      v-model="openOrderVisible"
      :title="t('contract.openOrderTitle')"
      :width="isMobile ? '94%' : '480px'"
      destroy-on-close
      append-to-body
      :z-index="contractMoreVisible ? FEATURE_DIALOG_ABOVE_MORE_Z : undefined"
    >
      <p class="form-hint">{{ t('contract.openOrderHint') }}</p>
      <el-form label-position="top">
        <el-form-item :label="t('contract.fields.attachment')" required>
          <AttachmentField v-model="openOrderAttachment" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="openOrderVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          v-admin-glow="perms.codes.update"
          type="primary"
          class="lb-btn-primary"
          :loading="openOrderSaving"
          @click="submitOpenOrder"
        >
          {{ t('contract.openOrder') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="formVisible"
      :width="dialogWidth"
      class="lb-dialog contract-form-dialog"
      destroy-on-close
    >
      <template #header="{ titleId, titleClass }">
        <div class="contract-form-dlg-header">
          <span :id="titleId" :class="titleClass">
            {{
              formReadonly
                ? t('contract.view')
                : editing
                  ? t('contract.edit')
                  : t('contract.create')
            }}
          </span>
          <span v-if="formReadonly" class="contract-form-dlg-header__hint">
            {{ t('contract.viewOnlyHint') }}
          </span>
        </div>
      </template>
      <div class="contract-form-body" :class="{ 'is-readonly': formReadonly }">
      <el-form label-position="top">
        <section class="form-section">
          <h3>{{ t('contract.sections.basic') }}</h3>
          <div class="form-grid">
            <el-form-item v-if="editing" :label="t('contract.fields.contractCode')">
              <SelectWithViewAction
                control="input"
                :disabled="!editing?.id"
                @view="relationDrawers?.openContractSide(editing?.id)"
              >
                <el-input v-model="form.contractCode" disabled />
              </SelectWithViewAction>
            </el-form-item>
            <el-form-item :label="t('contract.fields.roomCode')" required>
              <SelectWithViewAction
                :disabled="!form.roomId"
                @view="openRoomSide(form.roomId, 'ltr')"
              >
                <el-select
                  v-model="form.roomId"
                  filterable
                  remote
                  reserve-keyword
                  style="width: 100%"
                  popper-class="contract-room-select-popper"
                  :placeholder="t('contract.fields.roomCode')"
                  :remote-method="searchRoomsRemote"
                  :loading="roomSelectLoading"
                  @visible-change="onRoomSelectVisible"
                  @change="onRoomSelectChange"
                >
                  <template #header>
                    <div
                      class="contract-room-pick-modes"
                      role="tablist"
                      :aria-label="t('contract.roomPickModeAria')"
                      @mousedown.stop.prevent
                    >
                      <button
                        v-for="chip in roomPickModeChips"
                        :key="chip.key"
                        type="button"
                        class="contract-room-pick-mode"
                        role="tab"
                        :class="{ 'is-active': roomPickMode === chip.key }"
                        :aria-selected="roomPickMode === chip.key"
                        @click="setRoomPickMode(chip.key)"
                      >
                        {{ chip.label }}
                      </button>
                    </div>
                  </template>
                  <el-option
                    v-for="r in roomSelectOptions"
                    :key="r.id"
                    :label="roomOptionLabel(r)"
                    :value="r.id"
                    :title="roomOptionLabel(r)"
                  >
                    <div class="contract-room-option">
                      <span class="select-option-ellipsis" :title="roomOptionLabel(r)">
                        {{ roomOptionLabel(r) }}
                      </span>
                      <StatusBadge
                        class="contract-room-option__badge"
                        :tone="roomPickBadge(r).tone"
                        :label="roomPickBadge(r).label"
                      />
                    </div>
                  </el-option>
                </el-select>
              </SelectWithViewAction>
            </el-form-item>
            <el-form-item :label="t('contract.fields.customerName')" required>
              <SelectWithViewAction
                :disabled="!form.customerId"
                @view="openCustomerSide(form.customerId, 'ltr')"
              >
                <el-select
                  v-model="form.customerId"
                  filterable
                  remote
                  reserve-keyword
                  fit-input-width
                  style="width: 100%"
                  popper-class="contract-customer-select-popper"
                  :placeholder="t('contract.fields.customerName')"
                  :remote-method="searchCustomersRemote"
                  :loading="customerSelectLoading"
                  @visible-change="onCustomerSelectVisible"
                >
                  <el-option
                    v-for="c in customerSelectOptions"
                    :key="c.id"
                    :label="customerOptionLabel(c)"
                    :value="c.id"
                    :title="customerOptionLabel(c)"
                  >
                    <span class="select-option-ellipsis" :title="customerOptionLabel(c)">
                      {{ customerOptionLabel(c) }}
                    </span>
                  </el-option>
                </el-select>
              </SelectWithViewAction>
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
              <SelectWithViewAction
                clearable
                :disabled="!form.requirementId"
                @view="openRequirementSide(form.requirementId)"
              >
                <el-select
                  v-model="form.requirementId"
                  filterable
                  clearable
                  value-on-clear=""
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
              </SelectWithViewAction>
            </el-form-item>
            <el-form-item :label="t('contract.fields.startDate')" required>
              <el-date-picker
                v-model="form.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.endDate')" required>
              <el-date-picker
                v-model="form.endDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item
              class="occupancy-form-item"
              :required="form.occupancyMode === 'part'"
            >
              <template #label>
                <span>{{ t('contract.fields.occupancyMode') }}</span>
                <template v-if="form.occupancyMode === 'part'">
                  <span class="occupancy-form-item__sep">/</span>
                  <span>{{ t('contract.fields.partLabel') }}</span>
                </template>
              </template>
              <div class="occupancy-combo">
                <el-radio-group
                  v-model="form.occupancyMode"
                  class="lb-yesno-seg"
                  :disabled="
                    !form.roomId ||
                    selectedRoom?.leaseCapability === 'whole_only' ||
                    selectedRoom?.leaseCapability === 'part_only'
                  "
                >
                  <el-radio-button value="whole" :disabled="!canWholeLease">
                    {{ t('contract.occupancyWhole') }}
                  </el-radio-button>
                  <el-radio-button value="part" :disabled="!canPartLease">
                    {{ t('contract.occupancyPart') }}
                  </el-radio-button>
                </el-radio-group>
                <div
                  v-if="form.occupancyMode === 'part'"
                  class="part-label-picker"
                  role="listbox"
                  :aria-label="t('contract.fields.partLabel')"
                >
                  <button
                    v-for="opt in roomPartOptions"
                    :key="opt.value"
                    type="button"
                    role="option"
                    class="part-label-chip"
                    :class="{
                      'is-active': form.partLabel === opt.value,
                      'is-busy': opt.disabled,
                    }"
                    :disabled="opt.disabled"
                    :aria-selected="form.partLabel === opt.value"
                    :title="
                      opt.disabled
                        ? `${opt.label} · ${t('room.occupancy.busy')}`
                        : `${opt.label} · ${t('room.occupancy.slotFreeShort')}`
                    "
                    @click="form.partLabel = opt.value"
                  >
                    <span class="part-label-chip__letter">{{ opt.label }}</span>
                    <span v-if="opt.disabled" class="part-label-chip__tag">
                      {{ t('room.occupancy.busy') }}
                    </span>
                  </button>
                  <span v-if="!roomPartOptions.length" class="part-label-picker__empty">
                    {{ t('room.occupancy.unset') }}
                  </span>
                </div>
              </div>
            </el-form-item>
          </div>
        </section>

        <section class="form-section form-section--periods">
          <div class="period-section-head">
            <div class="period-section-head__left">
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
            <div v-if="periods.length > PERIOD_PAGE_SIZE" class="period-table-pager">
              <el-pagination
                v-model:current-page="periodPage"
                :page-size="PERIOD_PAGE_SIZE"
                :total="periods.length"
                layout="total, prev, pager, next"
                small
                background
                class="period-pager"
              />
            </div>
          </div>
          <div class="period-table-wrap">
            <div
              class="period-table"
              :class="{ 'period-table--en': periodTableEn }"
              role="table"
              :style="{ '--period-page-size': PERIOD_PAGE_SIZE }"
            >
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
                class="period-table__body"
                :class="{ 'period-table__body--fixed': periods.length > PERIOD_PAGE_SIZE }"
              >
                <div
                  v-for="{ p, index } in pagedPeriods"
                  :key="p.uid"
                  class="period-table__row"
                  role="row"
                  :class="{
                    'is-dragging': dragPeriodUid === p.uid,
                    'is-drag-over': dragOverPeriodUid === p.uid,
                    'is-editing-index': editingPeriodIndexUid === p.uid,
                  }"
                  @dragover="onPeriodDragOver(p.uid, $event)"
                  @drop="onPeriodDrop(p.uid, $event)"
                  @dragleave="dragOverPeriodUid === p.uid && (dragOverPeriodUid = null)"
                >
                  <div
                    class="period-table__cell period-table__cell--index"
                    :class="{ 'is-editing-index': editingPeriodIndexUid === p.uid }"
                    role="cell"
                  >
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
                    <input
                      v-if="editingPeriodIndexUid === p.uid"
                      ref="periodIndexInputRef"
                      :value="editingPeriodIndexDraft"
                      class="period-row__index-input"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="4"
                      :aria-label="t('contract.editPeriodIndex')"
                      @input="editingPeriodIndexDraft = ($event.target as HTMLInputElement).value.replace(/\D/g, '')"
                      @keydown="onPeriodIndexKeydown"
                      @blur="commitEditPeriodIndex"
                    />
                    <button
                      v-else
                      type="button"
                      class="period-row__index"
                      :title="t('contract.editPeriodIndexHint')"
                      @dblclick.stop="startEditPeriodIndex(p.uid, index)"
                    >
                      {{ index + 1 }}
                    </button>
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
                    <el-select
                      v-model="p.dateUnit"
                      style="width: 100%"
                      @change="onPeriodDurationChange(p, index)"
                    >
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
                      @change="onPeriodDurationChange(p, index)"
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
                      @change="onPeriodDatesChange(p, index)"
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
                      @change="onPeriodDatesChange(p, index)"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--actions" role="cell">
                    <el-button type="danger" link :icon="Delete" @click="removePeriod(index)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section form-section--loan-items">
          <div class="period-section-head">
            <div class="period-section-head__left">
              <h3>{{ t('contract.sections.loanItems') }}</h3>
              <el-button
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="period-add-btn"
                @click="addLoanItem"
              >
                {{ t('contract.addLoanItem') }}
              </el-button>
            </div>
            <div v-if="loanItems.length > LOAN_ITEM_PAGE_SIZE" class="period-table-pager">
              <el-pagination
                v-model:current-page="loanItemPage"
                :page-size="LOAN_ITEM_PAGE_SIZE"
                :total="loanItems.length"
                layout="total, prev, pager, next"
                small
                background
                class="period-pager"
              />
            </div>
          </div>
          <div class="period-table-wrap">
            <div
              class="period-table loan-item-table"
              role="table"
              :style="{ '--period-page-size': LOAN_ITEM_PAGE_SIZE }"
            >
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
                <div class="period-table__cell loan-item-table__cell--desc" role="columnheader">
                  <span class="req">*</span>{{ t('contractLoanItem.fields.description') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--qty" role="columnheader">
                  <span class="req">*</span>{{ t('contractLoanItem.fields.quantity') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--unit" role="columnheader">
                  <span class="req">*</span>{{ t('contractLoanItem.fields.unitAmount') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--sub" role="columnheader">
                  {{ t('contractLoanItem.fields.subtotal') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--remark" role="columnheader">
                  {{ t('contractLoanItem.fields.remark') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--actions" role="columnheader"></div>
              </div>
              <div
                class="period-table__body"
                :class="{ 'period-table__body--fixed': loanItems.length > LOAN_ITEM_PAGE_SIZE }"
              >
                <div
                  v-for="{ row, index } in pagedLoanItems"
                  :key="row.uid"
                  class="period-table__row"
                  role="row"
                  :class="{
                    'is-dragging': dragLoanItemUid === row.uid,
                    'is-drag-over': dragOverLoanItemUid === row.uid,
                    'is-editing-index': editingLoanItemIndexUid === row.uid,
                  }"
                  @dragover="onLoanItemDragOver(row.uid, $event)"
                  @drop="onLoanItemDrop(row.uid, $event)"
                  @dragleave="dragOverLoanItemUid === row.uid && (dragOverLoanItemUid = null)"
                >
                  <div
                    class="period-table__cell period-table__cell--index"
                    :class="{ 'is-editing-index': editingLoanItemIndexUid === row.uid }"
                    role="cell"
                  >
                    <button
                      type="button"
                      class="period-row__handle"
                      draggable="true"
                      :title="t('contract.dragLoanItem')"
                      aria-label="drag"
                      @dragstart="onLoanItemDragStart(row.uid, $event)"
                      @dragend="onLoanItemDragEnd"
                    >
                      <el-icon :size="14"><Rank /></el-icon>
                    </button>
                    <input
                      v-if="editingLoanItemIndexUid === row.uid"
                      ref="loanItemIndexInputRef"
                      :value="editingLoanItemIndexDraft"
                      class="period-row__index-input"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="4"
                      :aria-label="t('contract.editLoanItemIndex')"
                      @input="editingLoanItemIndexDraft = ($event.target as HTMLInputElement).value.replace(/\D/g, '')"
                      @keydown="onLoanItemIndexKeydown"
                      @blur="commitEditLoanItemIndex"
                    />
                    <button
                      v-else
                      type="button"
                      class="period-row__index"
                      :title="t('contract.editLoanItemIndexHint')"
                      @dblclick.stop="startEditLoanItemIndex(row.uid, index)"
                    >
                      {{ index + 1 }}
                    </button>
                  </div>
                  <div class="period-table__cell loan-item-table__cell--desc" role="cell">
                    <el-input
                      v-model="row.description"
                      :placeholder="t('contractLoanItem.fields.description')"
                    />
                  </div>
                  <div class="period-table__cell loan-item-table__cell--qty" role="cell">
                    <el-input-number
                      v-model="row.quantity"
                      :min="0"
                      :precision="2"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell loan-item-table__cell--unit" role="cell">
                    <el-input-number
                      v-model="row.unitAmount"
                      :min="0"
                      :precision="2"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell loan-item-table__cell--sub" role="cell">
                    {{ formatMoney(loanItemSubtotal(row)) }}
                  </div>
                  <div class="period-table__cell loan-item-table__cell--remark" role="cell">
                    <el-input
                      v-model="row.remark"
                      :placeholder="t('contractLoanItem.fields.remark')"
                    />
                  </div>
                  <div class="period-table__cell loan-item-table__cell--actions" role="cell">
                    <el-button type="danger" link :icon="Delete" @click="removeLoanItem(index)" />
                  </div>
                </div>
                <div v-if="!loanItems.length" class="loan-item-table__empty">
                  {{ t('contract.loanItemsEmpty') }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('contract.sections.finance') }}</h3>
          <div class="form-grid form-grid--finance">
            <el-form-item :label="t('contract.fields.monthlyRent')">
              <el-input-number
                v-model="form.monthlyRent"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.electricityRate')">
              <el-input-number
                v-model="form.electricityRate"
                :min="0"
                :precision="2"
                :step="0.1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.paymentCycle')">
              <el-select
                v-model="form.paymentCycle"
                filterable
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
            <el-form-item :label="t('contract.fields.roomDeposit')">
              <el-input-number
                v-model="form.roomDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
                @change="onRoomDepositUserChange"
              />
            </el-form-item>
            <el-form-item>
              <template #label>
                <span class="form-label-with-tip">
                  {{ t('contract.fields.loanItemsDeposit') }}
                  <el-tooltip
                    :content="t('contract.fields.loanItemsDepositHint')"
                    placement="top"
                  >
                    <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <div class="total-deposit-field">
                <span class="total-deposit-field__value">{{ formatMoney(computedLoanItemsDeposit) }}</span>
              </div>
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
            <el-form-item :label="doorKeyQtyLabel">
              <el-input-number
                v-model="form.doorKeyQty"
                :min="0"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="mailboxKeyQtyLabel">
              <el-input-number
                v-model="form.mailboxKeyQty"
                :min="0"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item>
              <template #label>
                <span class="form-label-with-tip">
                  {{ t('contract.fields.totalDeposit') }}
                  <el-tooltip
                    :content="t('contract.fields.totalDepositHint')"
                    placement="top"
                  >
                    <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <div class="total-deposit-field">
                <span class="total-deposit-field__value">{{ formatMoney(computedTotalDeposit) }}</span>
              </div>
            </el-form-item>
          </div>
        </section>

        <section class="form-section">
          <div class="period-section-head">
            <div class="period-section-head__left">
              <h3>{{ t('contract.sections.payment') }}</h3>
              <el-button
                v-if="canTopUpBookingDepositInForm"
                v-admin-glow="receiptPerms.codes.create"
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="period-add-btn"
                @click="openTopUpBookingDeposit"
              >
                {{ t('receipt.bookingDeposit.topUpAction') }}
              </el-button>
            </div>
          </div>
          <div class="form-grid form-grid--finance">
            <el-form-item>
              <template #label>
                <span class="form-label-with-tip">
                  {{ t('contract.fields.bookingDeposit') }}
                  <el-tooltip
                    v-if="bookingDepositLocked"
                    :content="t('contract.fields.bookingDepositLockedHint')"
                    placement="top"
                  >
                    <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <el-input-number
                v-model="form.bookingDeposit"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
                :disabled="formReadonly || bookingDepositLocked"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.paymentDate')">
              <el-date-picker
                v-model="form.paymentDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
                :disabled="formReadonly || bookingDepositLocked"
              />
            </el-form-item>
            <el-form-item
              :label="t('receipt.fields.paymentMethod')"
              :required="!editing && Number(form.bookingDeposit ?? 0) > 0"
            >
              <el-select
                v-model="form.paymentMethod"
                filterable
                clearable
                :value-on-clear="null"
                style="width: 100%"
                :placeholder="t('common.pleaseSelect')"
                :disabled="formReadonly || bookingDepositLocked"
              >
                <el-option
                  v-for="pm in RECEIPT_PAYMENT_METHODS"
                  :key="pm"
                  :label="pm"
                  :value="pm"
                />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="!editing"
              :label="t('contract.fields.paymentVoucher')"
              class="span-3"
              :required="Number(form.bookingDeposit ?? 0) > 0"
            >
              <AttachmentField v-model="form.paymentVoucher" />
            </el-form-item>
          </div>
        </section>

        <section class="form-section">
          <h3>{{ t('contract.sections.extra') }}</h3>
          <el-alert
            v-if="formIssueBlockedHint"
            class="contract-form-issue-alert"
            type="warning"
            show-icon
            :closable="false"
            :title="t('contract.issueBlockedFormTitle')"
            :description="
              t('contract.issueBlockedFormBody', {
                date: formIssueBlockedHint.secondPeriodStart || '—',
                days: rentInvoiceLeadDays,
              })
            "
          />
          <el-form-item>
            <template #label>
              <span class="form-label-with-tip">
                {{ t('contract.fields.attachment') }}
                <el-tooltip
                  v-if="!formReadonly"
                  :content="t('contract.issueNowHint')"
                  placement="top"
                >
                  <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <AttachmentField v-model="form.attachment" :disabled="formReadonly" />
          </el-form-item>
          <el-form-item :label="t('contract.fields.remark')">
            <el-input v-model="form.remark" type="textarea" :rows="2" />
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
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button
            v-if="editing"
            :loading="previewingDraft"
            :disabled="formSaving"
            @click="onPreviewAgreementDraft"
          >
            {{ t('contract.previewAgreement') }}
          </el-button>
          <el-button :disabled="formSaving" @click="formVisible = false">
            {{ formReadonly ? t('common.close') : t('common.cancel') }}
          </el-button>
          <el-button
            v-if="!formReadonly"
            :loading="formSaving"
            @click="saveForm('save')"
          >
            {{ t('common.save') }}
          </el-button>
          <el-button
            v-if="!formReadonly"
            type="primary"
            class="lb-btn-primary"
            :loading="formSaving"
            @click="saveForm('issue')"
          >
            {{ t('contract.issueNow') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="topUpVisible"
      width="480px"
      append-to-body
      destroy-on-close
      class="lb-dialog"
    >
      <template #header="{ titleId, titleClass }">
        <div class="top-up-dlg-header">
          <span :id="titleId" :class="titleClass">
            {{ t('receipt.bookingDeposit.topUpTitle') }}
          </span>
          <el-tooltip
            :content="t('receipt.bookingDeposit.topUpHint')"
            placement="top"
            :show-after="200"
          >
            <el-icon class="form-label-tip" :size="16"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
      </template>
      <el-form label-position="top">
        <el-form-item :label="t('receipt.bookingDeposit.topUpMode')" required>
          <div class="top-up-mode-cards" role="radiogroup">
            <button
              type="button"
              class="top-up-mode-card"
              :class="{ 'is-active': topUpForm.mode === 'new_receipt' }"
              role="radio"
              :aria-checked="topUpForm.mode === 'new_receipt'"
              @click="setTopUpMode('new_receipt')"
            >
              <span class="top-up-mode-card__radio" aria-hidden="true" />
              <span class="top-up-mode-card__title-row">
                <span class="top-up-mode-card__title">
                  {{ t('receipt.bookingDeposit.topUpModeNew') }}
                </span>
                <el-tooltip
                  :content="t('receipt.bookingDeposit.topUpModeNewHint')"
                  placement="top"
                  :show-after="200"
                >
                  <el-icon
                    class="form-label-tip"
                    :size="14"
                    @click.stop
                    @mousedown.stop
                  >
                    <QuestionFilled />
                  </el-icon>
                </el-tooltip>
              </span>
            </button>
            <button
              type="button"
              class="top-up-mode-card"
              :class="{
                'is-active': topUpForm.mode === 'merge',
                'is-disabled': !topUpHasExistingReceipts,
              }"
              role="radio"
              :aria-checked="topUpForm.mode === 'merge'"
              :aria-disabled="!topUpHasExistingReceipts"
              :disabled="!topUpHasExistingReceipts"
              :title="
                topUpHasExistingReceipts
                  ? undefined
                  : t('receipt.bookingDeposit.topUpMergeNeedReceipt')
              "
              @click="setTopUpMode('merge')"
            >
              <span class="top-up-mode-card__radio" aria-hidden="true" />
              <span class="top-up-mode-card__title-row">
                <span class="top-up-mode-card__title">
                  {{ t('receipt.bookingDeposit.topUpModeMerge') }}
                </span>
                <el-tooltip
                  :content="
                    topUpHasExistingReceipts
                      ? t('receipt.bookingDeposit.topUpModeMergeHint')
                      : t('receipt.bookingDeposit.topUpMergeNeedReceipt')
                  "
                  placement="top"
                  :show-after="200"
                >
                  <el-icon
                    class="form-label-tip"
                    :size="14"
                    @click.stop
                    @mousedown.stop
                  >
                    <QuestionFilled />
                  </el-icon>
                </el-tooltip>
              </span>
            </button>
          </div>
        </el-form-item>
        <el-form-item
          v-if="topUpForm.mode === 'merge'"
          :label="t('receipt.bookingDeposit.topUpMergeTarget')"
          required
        >
          <el-select
            v-model="topUpForm.mergeReceiptId"
            filterable
            style="width: 100%"
            :loading="topUpReceiptsLoading"
            :placeholder="t('common.pleaseSelect')"
            popper-class="top-up-dlg-popper"
            @change="applyMergePaymentMethodLock"
          >
            <el-option
              v-for="r in topUpReceiptOptions"
              :key="r.id"
              :label="`${r.receiptCode}（${formatMoney(r.amount)}）`"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('receipt.bookingDeposit.topUpAmount')" required>
          <el-input-number
            v-model="topUpForm.amount"
            :min="0.01"
            :precision="2"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('receipt.bookingDeposit.topUpDate')" required>
          <el-date-picker
            v-model="topUpForm.paymentDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            popper-class="top-up-dlg-popper"
          />
        </el-form-item>
        <el-form-item
          :label="t('receipt.fields.paymentMethod')"
          :required="topUpForm.mode === 'new_receipt'"
        >
          <el-select
            v-model="topUpForm.paymentMethod"
            filterable
            clearable
            :value-on-clear="null"
            style="width: 100%"
            :placeholder="t('common.pleaseSelect')"
            :disabled="topUpForm.mode === 'merge' && !!mergeTargetReceiptMethod"
            popper-class="top-up-dlg-popper"
          >
            <el-option v-for="pm in RECEIPT_PAYMENT_METHODS" :key="pm" :label="pm" :value="pm" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('contract.fields.paymentVoucher')">
          <AttachmentField v-model="topUpForm.paymentVoucher" />
        </el-form-item>
        <el-form-item :label="t('receipt.fields.remark')">
          <el-input v-model="topUpForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="topUpSubmitting" @click="topUpVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          type="primary"
          class="lb-btn-primary"
          :loading="topUpSubmitting"
          @click="submitTopUpBookingDeposit"
        >
          {{ t('common.submit') }}
        </el-button>
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

.issue-blocked-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 999px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.issue-blocked-chip:hover {
  background: var(--el-color-warning-light-8);
  border-color: var(--el-color-warning);
}

.issue-blocked-pop__lead {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}

.issue-blocked-pop__list {
  /* 滚动条靠 popover 右缘；列表内容右侧留白，与「开单」拉开 */
  margin: 0;
  padding: 0 8px 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(320px, 45vh);
  overflow: auto;
  overscroll-behavior: contain;
}

.issue-blocked-pop__foot {
  margin: 10px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-extra-light);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.issue-blocked-pop__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.issue-blocked-pop__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.issue-blocked-pop__code {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--lb-brand, var(--el-color-primary));
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.issue-blocked-pop__date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.contract-form-issue-alert {
  margin-bottom: 14px;
}

.contract-status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}

.contract-status-cell__warn {
  color: var(--el-color-warning);
  flex-shrink: 0;
  cursor: help;
}

.contract-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.form-hint {
  margin: 0 0 12px;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--lb-muted, #6a7a70);
}

.contract-form-body.is-readonly {
  pointer-events: none;
  user-select: text;
  opacity: 0.96;
}

/* 只读时仍允许预览已上传附件、查看问号说明 */
.contract-form-body.is-readonly :deep(.attachment-field__chip),
.contract-form-body.is-readonly :deep(.form-label-tip),
.contract-form-body.is-readonly :deep(.form-label-with-tip .el-tooltip__trigger) {
  pointer-events: auto;
  cursor: pointer;
}

.contract-form-dlg-header {
  display: flex;
  align-items: center;
  gap: 10px 14px;
  flex-wrap: wrap;
  min-width: 0;
  padding-right: 72px; /* 留出全屏／关闭按钮 */
}

.contract-form-dlg-header__hint {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: #8a6a45;
  background: #fff7ed;
  border: 1px solid #f0d2a8;
  border-radius: 8px;
  padding: 3px 10px;
  max-width: min(100%, 420px);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.form-grid--finance {
  grid-template-columns: 1fr 1fr 1fr;
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
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  min-height: 28px;
}

.period-section-head__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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

.top-up-dlg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.top-up-mode-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.top-up-mode-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 10px 12px;
  text-align: left;
  border: 1px solid #d7e2db;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.top-up-mode-card:hover:not(:disabled):not(.is-disabled) {
  border-color: color-mix(in srgb, var(--lb-brand) 45%, #d7e2db);
  background: color-mix(in srgb, var(--lb-brand) 4%, #fff);
}

.top-up-mode-card.is-active {
  border-color: var(--lb-brand);
  background: color-mix(in srgb, var(--lb-brand) 8%, #fff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand) 35%, transparent);
}

.top-up-mode-card.is-disabled,
.top-up-mode-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.top-up-mode-card__radio {
  flex: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid #9aab9f;
  border-radius: 50%;
  background: #fff;
  position: relative;
}

.top-up-mode-card.is-active .top-up-mode-card__radio {
  border-color: var(--lb-brand);
}

.top-up-mode-card.is-active .top-up-mode-card__radio::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--lb-brand);
}

.top-up-mode-card__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.top-up-mode-card__title {
  font-size: 0.9rem;
  font-weight: 650;
  color: #143628;
  line-height: 1.35;
}


.form-section--periods,
.form-section--loan-items {
  margin-bottom: 14px;
  padding-bottom: 6px;
}

.loan-item-table.period-table .period-table__head,
.loan-item-table.period-table .period-table__row {
  grid-template-columns:
    52px
    minmax(140px, 1.6fr)
    120px
    120px
    88px
    minmax(120px, 1.2fr)
    40px;
}

.loan-item-table__empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--lb-muted, #6a7a70);
  font-size: 0.84rem;
}

.loan-item-table .period-table__row .loan-item-table__cell--sub {
  justify-content: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #3d4f45;
}

.period-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e4ebe6;
  border-radius: 8px;
  background: #fff;
}

.period-table-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 4px 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #f4f7f5);
  border: 1px solid #e4ebe6;
}

.period-pager.el-pagination {
  --el-pagination-button-bg-color: #fff;
  --el-pagination-hover-color: var(--lb-brand, #0f4a32);
  --el-pagination-button-color: #4a5c54;
  font-weight: 600;
  gap: 2px;
}

.period-pager :deep(.el-pagination__total) {
  margin-right: 4px;
  color: #4a5c54;
  font-size: 0.78rem;
  font-weight: 650;
}

.period-pager :deep(.btn-prev),
.period-pager :deep(.btn-next),
.period-pager :deep(.el-pager li) {
  min-width: 26px !important;
  height: 26px !important;
  line-height: 26px !important;
  border-radius: 7px !important;
  margin: 0 2px !important;
}

.period-pager :deep(.el-pager li.is-active) {
  background: var(--lb-brand, #0f4a32) !important;
  color: #fff !important;
  font-weight: 700;
}

.period-pager :deep(.btn-prev:hover:not(:disabled)),
.period-pager :deep(.btn-next:hover:not(:disabled)),
.period-pager :deep(.el-pager li:hover:not(.is-active)) {
  color: var(--lb-brand, #0f4a32);
}

.period-table {
  --period-row-h: 44px;
  --period-page-size: 5;
  --period-col-unit: 72px;
  --period-col-value: 72px;
  --period-col-duration: 72px;
  display: grid;
  min-width: 780px;
}

.period-table--en {
  --period-col-unit: 104px;
  --period-col-value: 56px;
  --period-col-duration: 96px;
  min-width: 820px;
}

.period-table__head,
.period-table__row {
  display: grid;
  grid-template-columns:
    52px
    minmax(118px, 1.2fr)
    var(--period-col-unit)
    var(--period-col-value)
    var(--period-col-duration)
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

.period-table__body {
  background: #fff;
}

.period-table__body--fixed {
  box-sizing: border-box;
  height: calc(var(--period-row-h) * var(--period-page-size));
  min-height: calc(var(--period-row-h) * var(--period-page-size));
  overflow: hidden;
}

.period-table__row {
  box-sizing: border-box;
  min-height: var(--period-row-h);
  height: var(--period-row-h);
  border-bottom: 1px solid #edf2ef;
  transition: background 0.12s ease, box-shadow 0.12s ease;
  background: #fff;
}

.period-table__body:not(.period-table__body--fixed) .period-table__row:last-child {
  border-bottom: none;
}

.period-table__row.is-dragging {
  opacity: 0.45;
}

.period-table__row.is-editing-index {
  position: relative;
  z-index: 4;
  overflow: visible;
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
  gap: 1px;
  justify-content: flex-start;
  position: relative;
  z-index: 1;
  overflow: visible;
}

.period-table__cell--index.is-editing-index {
  z-index: 5;
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
  width: 18px;
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
  appearance: none;
  flex: 0 0 auto;
  min-width: 1rem;
  margin: 0;
  padding: 0 1px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: center;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #5a6b62;
  cursor: text;
  line-height: 1.4;
}

.period-row__index:hover {
  background: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  color: var(--lb-brand);
}

/* 编辑时输入框略向右浮出，不永久撑宽序号列 */
.period-row__index-input {
  box-sizing: border-box;
  position: absolute;
  left: 18px;
  top: 50%;
  z-index: 6;
  width: 2.4rem;
  min-width: 2.4rem;
  height: 24px;
  margin: 0;
  padding: 0 3px;
  border: 1px solid var(--lb-brand, #0f4a32);
  border-radius: 5px;
  background: #fff;
  color: #0f4a32;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 22px;
  outline: none;
  transform: translateY(-50%);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lb-brand, #0f4a32) 18%, transparent);
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

/* 右侧增减按钮需额外内边距，避免数字贴边 */
.period-table__row :deep(.el-input-number.is-controls-right .el-input__wrapper) {
  padding-right: 36px;
}

.period-table__row :deep(.el-date-editor.el-input) {
  width: 100%;
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
}

.total-deposit-field {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, #f4f7f5);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, transparent);
}

.total-deposit-field__value {
  font-size: 1.05rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  color: var(--lb-brand, #0f4a32);
  line-height: 1.2;
}

@media (max-width: 640px) {
  .form-grid,
  .form-grid--finance {
    grid-template-columns: 1fr;
  }
}

.occupancy-form-item__sep {
  margin: 0 4px;
  color: var(--lb-muted, #6a7a70);
  font-weight: 500;
}

.occupancy-combo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  width: 100%;
}

.occupancy-combo .part-label-picker {
  flex: 1 1 auto;
  min-width: 0;
}

.part-label-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

.part-label-picker__empty {
  font-size: 0.84rem;
  color: var(--lb-muted, #6a7a70);
}

.part-label-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  gap: 5px;
  min-width: 36px;
  height: 32px;
  margin: 0;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: #fff;
  box-shadow: inset 0 0 0 1px #cfd8d3;
  color: #4a5c54;
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.part-label-chip__letter {
  font-size: 0.88rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  line-height: 1;
}

.part-label-chip__tag {
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1;
  opacity: 0.9;
}

.part-label-chip:hover:not(:disabled):not(.is-active) {
  color: var(--lb-brand, #0f4a32);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #cfd8d3);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, #fff);
}

.part-label-chip:focus-visible {
  outline: none;
  box-shadow:
    inset 0 0 0 1px var(--lb-brand, #0f4a32),
    0 0 0 2px color-mix(in srgb, var(--lb-brand, #0f4a32) 18%, transparent);
}

.part-label-chip.is-active {
  background: var(--lb-brand, #0f4a32);
  color: #fff;
  box-shadow: inset 0 0 0 1px var(--lb-brand, #0f4a32);
}

.part-label-chip.is-busy,
.part-label-chip:disabled {
  cursor: not-allowed;
  background: #f1f3f2;
  color: #9aa39e;
  box-shadow: inset 0 0 0 1px #d5dcd7;
  opacity: 1;
}

.part-label-chip.is-busy .part-label-chip__tag {
  padding: 2px 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
}
</style>

<!-- popper 挂到 body，需非 scoped；右侧内边距收窄让滚动条靠右边缘 -->
<style>
.el-popover.issue-blocked-popper,
.el-popper.issue-blocked-popper {
  padding-right: 4px !important;
}

.el-popover.expiring-soon-edit-popper,
.el-popper.expiring-soon-edit-popper {
  padding: 0 !important;
  border: 1px solid #dce6e0 !important;
  border-radius: 14px !important;
  box-shadow:
    0 10px 28px rgba(15, 40, 30, 0.12),
    0 2px 8px rgba(15, 40, 30, 0.06) !important;
  /* 勿 overflow:hidden，否则面板内 teleported=false 的下拉会被裁切 */
  overflow: visible;
}

.el-popover.expiring-soon-edit-popper .el-popper__arrow::before,
.el-popper.expiring-soon-edit-popper .el-popper__arrow::before {
  border: 1px solid #dce6e0 !important;
  background: #f7faf8 !important;
}

.expiring-soon-edit-popper .expiring-edit {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.expiring-soon-edit-popper .expiring-edit__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px 12px;
  background: linear-gradient(180deg, #f7faf8 0%, #fff 100%);
  border-bottom: 1px solid #e8efe9;
  border-radius: 14px 14px 0 0;
}

.expiring-soon-edit-popper .expiring-edit__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  color: #0f4a32;
  background: color-mix(in srgb, #0f4a32 12%, #fff);
}

.expiring-soon-edit-popper .expiring-edit__head-text {
  min-width: 0;
  padding-top: 1px;
}

.expiring-soon-edit-popper .expiring-edit__title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.3;
  color: #16362a;
}

.expiring-soon-edit-popper .expiring-edit__desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: #6b7c74;
}

.expiring-soon-edit-popper .expiring-edit__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}

.expiring-soon-edit-popper .expiring-edit__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #e6eee9;
  border-radius: 10px;
  background: #fbfcfb;
}

.expiring-soon-edit-popper .expiring-edit__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #4a5c54;
}

.expiring-soon-edit-popper .expiring-edit__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expiring-soon-edit-popper .expiring-edit__amount {
  width: 128px;
}

.expiring-soon-edit-popper .expiring-edit__unit {
  width: 108px;
}

.expiring-soon-edit-popper .expiring-edit__mode {
  display: flex;
  width: 100%;
}

.expiring-soon-edit-popper .expiring-edit__mode .el-radio-button {
  flex: 1 1 0;
}

.expiring-soon-edit-popper .expiring-edit__mode .el-radio-button__inner {
  width: 100%;
  padding: 8px 6px;
  border-color: #d7ded9 !important;
  color: #4a5c54;
  font-weight: 600;
  box-shadow: none !important;
}

.expiring-soon-edit-popper .expiring-edit__mode .el-radio-button:first-child .el-radio-button__inner {
  border-radius: 8px 0 0 8px;
}

.expiring-soon-edit-popper .expiring-edit__mode .el-radio-button:last-child .el-radio-button__inner {
  border-radius: 0 8px 8px 0;
}

.expiring-soon-edit-popper
  .expiring-edit__mode
  .el-radio-button__original-radio:checked
  + .el-radio-button__inner {
  background: #0f4a32 !important;
  border-color: #0f4a32 !important;
  color: #fff !important;
  box-shadow: none !important;
}

.expiring-soon-edit-popper .expiring-edit__statuses {
  width: 100%;
}

.expiring-soon-edit-popper .expiring-edit__statuses .el-select__wrapper {
  min-height: 34px;
  border-radius: 8px;
}

/* 下拉挂在面板内，避免选完选项被当成 outside 而关面板 */
.expiring-soon-edit-popper .el-select-dropdown {
  z-index: 10;
}

.expiring-soon-edit-popper .expiring-edit__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid #e8efe9;
  background: #fafbfa;
  border-radius: 0 0 14px 14px;
}

.expiring-soon-edit-popper .expiring-edit__actions .el-button {
  border-radius: 8px;
  min-width: 72px;
}
</style>
