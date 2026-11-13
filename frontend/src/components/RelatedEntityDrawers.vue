<script setup lang="ts">
/**
 * 全局关联实体导航链：客户 / 房间 / 楼宇 / 需求 / 入住人 / 合约 / 发票 / 应收 / 收据 /
 * 合约期 / 退租 / 借出物品 / 按金扣除 / 按金退还，以及各类 Related 列表。
 * 抽屉内关联字段与数量胶囊均可继续下钻。
 */
import { computed, ref, watch } from 'vue'
import { useOverlayStackZ } from '@/composables/useOverlayStackZ'
import { fetchBuilding } from '@/api/buildings'
import { fetchCustomer } from '@/api/customers'
import { fetchOccupant } from '@/api/occupants'
import { fetchCustomerRequirement } from '@/api/customer-requirements'
import { fetchRoom } from '@/api/rooms'
import { fetchContract } from '@/api/contracts'
import { fetchInvoice } from '@/api/invoices'
import { fetchReceivable } from '@/api/receivables'
import { fetchReceipt } from '@/api/receipts'
import { fetchContractPeriod } from '@/api/contract-periods'
import { fetchContractSettlement } from '@/api/contract-settlements'
import { fetchContractLoanItem } from '@/api/contract-loan-items'
import { fetchDepositDeduction } from '@/api/deposit-deductions'
import { fetchDepositRefund } from '@/api/deposit-refunds'
import { fetchInvoiceServiceDetail } from '@/api/invoice-service-details'
import { fetchRefundOrder } from '@/api/refund-orders'
import { fetchCashFlow } from '@/api/cash-flows'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import CustomerDetailDrawer from '@/components/CustomerDetailDrawer.vue'
import CustomerRequirementDetailDrawer from '@/components/CustomerRequirementDetailDrawer.vue'
import OccupantDetailDrawer from '@/components/OccupantDetailDrawer.vue'
import RoomDetailDrawer from '@/components/RoomDetailDrawer.vue'
import ContractDetailDrawer from '@/components/ContractDetailDrawer.vue'
import InvoiceDetailDrawer from '@/components/InvoiceDetailDrawer.vue'
import ReceivableDetailDrawer from '@/components/ReceivableDetailDrawer.vue'
import ReceiptDetailDrawer from '@/components/ReceiptDetailDrawer.vue'
import ContractPeriodDetailDrawer from '@/components/ContractPeriodDetailDrawer.vue'
import ContractSettlementDetailDrawer from '@/components/ContractSettlementDetailDrawer.vue'
import ContractLoanItemDetailDrawer from '@/components/ContractLoanItemDetailDrawer.vue'
import DepositDeductionDetailDrawer from '@/components/DepositDeductionDetailDrawer.vue'
import DepositRefundDetailDrawer from '@/components/DepositRefundDetailDrawer.vue'
import InvoiceServiceDetailDrawer from '@/components/InvoiceServiceDetailDrawer.vue'
import RefundOrderDetailDrawer from '@/components/RefundOrderDetailDrawer.vue'
import RelatedCashFlowsDrawer from '@/components/RelatedCashFlowsDrawer.vue'
import CashFlowDetailDrawer from '@/components/CashFlowDetailDrawer.vue'
import RelatedCustomerRequirementsDrawer from '@/components/RelatedCustomerRequirementsDrawer.vue'
import RelatedOccupantsDrawer from '@/components/RelatedOccupantsDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'
import RelatedContractsDrawer from '@/components/RelatedContractsDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedReceivablesDrawer from '@/components/RelatedReceivablesDrawer.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import RelatedSettlementsDrawer from '@/components/RelatedSettlementsDrawer.vue'
import RelatedRefundOrdersDrawer from '@/components/RelatedRefundOrdersDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import RelatedPeriodsDrawer from '@/components/RelatedPeriodsDrawer.vue'
import RelatedLoanItemsDrawer from '@/components/RelatedLoanItemsDrawer.vue'
import RelatedDepositDeductionsDrawer from '@/components/RelatedDepositDeductionsDrawer.vue'
import RelatedServiceDetailsDrawer from '@/components/RelatedServiceDetailsDrawer.vue'
import type { BuildingRecord } from '@/types/building'
import type { CustomerRecord, OccupantRecord } from '@/types/customer'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import type { RoomRecord } from '@/types/room'
import type { ContractRecord } from '@/types/contract'
import type { InvoiceRecord } from '@/types/invoice'
import type { ReceivableRecord } from '@/types/receivable'
import type { ReceiptRecord } from '@/types/receipt'
import type { ContractPeriodListRecord } from '@/types/contract-period'
import type { ContractSettlementRecord } from '@/types/contract-settlement'
import type { ContractLoanItemRecord } from '@/types/contract-loan-item'
import type { DepositDeductionRecord } from '@/types/deposit-deduction'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'
import type { RefundOrderRecord } from '@/types/refund-order'
import type { CashFlowRecord } from '@/types/cash-flow'

const emit = defineEmits<{
  /** 关联列表内删除等变更，供主列表刷新 */
  changed: []
}>()

function onRelatedListChanged() {
  emit('changed')
}

const relatedCustomer = ref<CustomerRecord | null>(null)
const customerDrawerVisible = ref(false)
const customerDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

const relatedRoom = ref<RoomRecord | null>(null)
const roomDrawerVisible = ref(false)
const roomDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

const relatedBuilding = ref<BuildingRecord | null>(null)
const buildingDrawerVisible = ref(false)

const relatedRoomsBuilding = ref<BuildingRecord | null>(null)
const relatedRoomsDrawer = ref(false)

const relatedOccupantsListDrawer = ref(false)
const relatedRequirementsListDrawer = ref(false)

const relatedOccupant = ref<OccupantRecord | null>(null)
const relatedOccupantDrawer = ref(false)
const occupantDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

const relatedRequirement = ref<CustomerRequirementRecord | null>(null)
const relatedRequirementDrawer = ref(false)

const relatedContract = ref<ContractRecord | null>(null)
const contractDrawerVisible = ref(false)

const relatedInvoice = ref<InvoiceRecord | null>(null)
const invoiceDrawerVisible = ref(false)

const relatedReceivable = ref<ReceivableRecord | null>(null)
const receivableDrawerVisible = ref(false)

const relatedReceipt = ref<ReceiptRecord | null>(null)
const receiptDrawerVisible = ref(false)

const { allocZ, resetStack } = useOverlayStackZ()

/** 各详情／关联列表抽屉的 z-index（打开时 alloc，关闭后可归零） */
const zCustomer = ref<number | undefined>()
const zOccupant = ref<number | undefined>()
const zRequirement = ref<number | undefined>()
const zBuilding = ref<number | undefined>()
const zRoom = ref<number | undefined>()
const zContract = ref<number | undefined>()
const zInvoice = ref<number | undefined>()
const zReceivable = ref<number | undefined>()
const zReceipt = ref<number | undefined>()
const zPeriod = ref<number | undefined>()
const zSettlement = ref<number | undefined>()
const zLoanItem = ref<number | undefined>()
const zDepositDeduction = ref<number | undefined>()
const zDepositRefund = ref<number | undefined>()
const zServiceDetail = ref<number | undefined>()
const zListOccupants = ref<number | undefined>()
const zListRequirements = ref<number | undefined>()
const zListReqContracts = ref<number | undefined>()
const zListRooms = ref<number | undefined>()
const zListContracts = ref<number | undefined>()
const zListInvoices = ref<number | undefined>()
const zListReceivables = ref<number | undefined>()
const zListReceipts = ref<number | undefined>()
const zListSettlements = ref<number | undefined>()
const zListRefundOrders = ref<number | undefined>()
const zRefundOrder = ref<number | undefined>()
const zListDepositRefunds = ref<number | undefined>()
const zListPeriods = ref<number | undefined>()
const zListLoanItems = ref<number | undefined>()
const zListDepositDeductions = ref<number | undefined>()
const zListServiceDetails = ref<number | undefined>()
const zListCashFlows = ref<number | undefined>()
const zCashFlow = ref<number | undefined>()

function takeZ(minAbove?: number) {
  return allocZ(minAbove)
}

const relatedPeriod = ref<ContractPeriodListRecord | null>(null)
const periodDrawerVisible = ref(false)

const relatedSettlement = ref<ContractSettlementRecord | null>(null)
const settlementDrawerVisible = ref(false)

const relatedRefundOrder = ref<RefundOrderRecord | null>(null)
const refundOrderDrawerVisible = ref(false)

const relatedLoanItem = ref<ContractLoanItemRecord | null>(null)
const loanItemDrawerVisible = ref(false)
const relatedDepositDeduction = ref<DepositDeductionRecord | null>(null)
const depositDeductionDrawerVisible = ref(false)

const relatedDepositRefund = ref<DepositRefundRecord | null>(null)
const depositRefundDrawerVisible = ref(false)

const relatedServiceDetail = ref<InvoiceServiceDetailListRecord | null>(null)
const serviceDetailDrawerVisible = ref(false)

/** Related 列表上下文 */
const listCustomer = ref<CustomerRecord | null>(null)
const listRoom = ref<RoomRecord | null>(null)
const listContract = ref<ContractRecord | null>(null)
const listInvoice = ref<InvoiceRecord | null>(null)
const listRequirement = ref<CustomerRequirementRecord | null>(null)
const listSettlement = ref<ContractSettlementRecord | null>(null)
const listDepositRefund = ref<DepositRefundRecord | null>(null)
const listReceivableId = ref<string | undefined>(undefined)
/** 关联收据标题用（勿用 id） */
const listReceivableTitle = ref<string | undefined>(undefined)

const relatedContractsDrawer = ref(false)
const relatedInvoicesDrawer = ref(false)
const relatedReceivablesDrawer = ref(false)
const relatedReceiptsDrawer = ref(false)
const relatedSettlementsDrawer = ref(false)
const relatedRefundOrdersDrawer = ref(false)
const relatedDepositRefundsDrawer = ref(false)
const relatedPeriodsDrawer = ref(false)
const relatedLoanItemsDrawer = ref(false)
const relatedDepositDeductionsDrawer = ref(false)
const relatedServiceDetailsDrawer = ref(false)
const relatedReqContractsDrawer = ref(false)
const relatedCashFlowsDrawer = ref(false)
const cashFlowDrawerVisible = ref(false)
const cashFlowRecord = ref<CashFlowRecord | null>(null)
/** 关联资金流水上下文（合约／发票／应收／收据） */
const listCashFlowCtx = ref<{
  contractId?: string
  invoiceId?: string
  receivableId?: string
  receiptId?: string
  title: string
} | null>(null)

const anyOverlayOpen = computed(
  () =>
    customerDrawerVisible.value ||
    relatedOccupantDrawer.value ||
    relatedRequirementDrawer.value ||
    buildingDrawerVisible.value ||
    roomDrawerVisible.value ||
    contractDrawerVisible.value ||
    invoiceDrawerVisible.value ||
    receivableDrawerVisible.value ||
    receiptDrawerVisible.value ||
    periodDrawerVisible.value ||
    settlementDrawerVisible.value ||
    loanItemDrawerVisible.value ||
    depositDeductionDrawerVisible.value ||
    depositRefundDrawerVisible.value ||
    serviceDetailDrawerVisible.value ||
    relatedOccupantsListDrawer.value ||
    relatedRequirementsListDrawer.value ||
    relatedReqContractsDrawer.value ||
    relatedRoomsDrawer.value ||
    relatedContractsDrawer.value ||
    relatedInvoicesDrawer.value ||
    relatedReceivablesDrawer.value ||
    relatedReceiptsDrawer.value ||
    relatedSettlementsDrawer.value ||
    relatedRefundOrdersDrawer.value ||
    refundOrderDrawerVisible.value ||
    relatedDepositRefundsDrawer.value ||
    relatedPeriodsDrawer.value ||
    relatedLoanItemsDrawer.value ||
    relatedDepositDeductionsDrawer.value ||
    relatedServiceDetailsDrawer.value ||
    relatedCashFlowsDrawer.value ||
    cashFlowDrawerVisible.value,
)

watch(anyOverlayOpen, (open) => {
  if (!open) resetStack()
})

async function openCustomerSide(
  customerId?: string | null,
  direction: 'ltr' | 'rtl' = 'ltr',
  opts?: { zIndex?: number },
) {
  if (!customerId) return
  try {
    const { data } = await fetchCustomer(customerId)
    relatedCustomer.value = data
    customerDrawerDirection.value = direction
    zCustomer.value = takeZ(opts?.zIndex)
    customerDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openRoomSide(
  roomId?: string | null,
  direction: 'ltr' | 'rtl' = 'ltr',
  opts?: { zIndex?: number },
) {
  if (!roomId) return
  try {
    const { data } = await fetchRoom(roomId)
    relatedRoom.value = data
    roomDrawerDirection.value = direction
    zRoom.value = takeZ(opts?.zIndex)
    roomDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openBuildingSide(buildingId?: string | null, opts?: { zIndex?: number }) {
  if (!buildingId) return
  try {
    const { data } = await fetchBuilding(buildingId)
    relatedBuilding.value = data
    zBuilding.value = takeZ(opts?.zIndex)
    buildingDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openRequirementSide(requirementId?: string | null, opts?: { zIndex?: number }) {
  if (!requirementId) return
  try {
    const { data } = await fetchCustomerRequirement(requirementId)
    relatedRequirement.value = data
    zRequirement.value = takeZ(opts?.zIndex)
    relatedRequirementDrawer.value = true
  } catch {
    /* interceptor */
  }
}

async function openContractSide(contractId?: string | null, opts?: { zIndex?: number }) {
  if (!contractId) return
  try {
    const { data } = await fetchContract(contractId)
    relatedContract.value = data
    zContract.value = takeZ(opts?.zIndex)
    contractDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openInvoiceSide(invoiceId?: string | null, opts?: { zIndex?: number }) {
  if (!invoiceId) return
  try {
    const { data } = await fetchInvoice(invoiceId)
    relatedInvoice.value = data
    zInvoice.value = takeZ(opts?.zIndex)
    invoiceDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openReceivableSide(
  receivableId?: string | null,
  opts?: { zIndex?: number },
) {
  if (!receivableId) return
  try {
    const { data } = await fetchReceivable(receivableId)
    relatedReceivable.value = data
    zReceivable.value = takeZ(opts?.zIndex)
    receivableDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openReceiptSide(receiptId?: string | null, opts?: { zIndex?: number }) {
  if (!receiptId) return
  try {
    const { data } = await fetchReceipt(receiptId)
    relatedReceipt.value = data
    zReceipt.value = takeZ(opts?.zIndex)
    receiptDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openPeriodSide(periodId?: string | null, opts?: { zIndex?: number }) {
  if (!periodId) return
  try {
    const { data } = await fetchContractPeriod(periodId)
    relatedPeriod.value = data
    zPeriod.value = takeZ(opts?.zIndex)
    periodDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openSettlementSide(settlementId?: string | null, opts?: { zIndex?: number }) {
  if (!settlementId) return
  try {
    const { data } = await fetchContractSettlement(settlementId)
    relatedSettlement.value = data
    zSettlement.value = takeZ(opts?.zIndex)
    settlementDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openRefundOrdersFromSettlement(
  settlement: ContractSettlementRecord,
  opts?: { zIndex?: number },
) {
  if (!(settlement.refundOrderCount ?? 0)) return
  listSettlement.value = settlement
  zListRefundOrders.value = takeZ(opts?.zIndex ?? zSettlement.value)
  relatedRefundOrdersDrawer.value = true
}

async function openRefundOrderSide(refundOrderId?: string | null, opts?: { zIndex?: number }) {
  if (!refundOrderId) return
  try {
    const { data } = await fetchRefundOrder(refundOrderId)
    relatedRefundOrder.value = data
    zRefundOrder.value = takeZ(opts?.zIndex ?? zListRefundOrders.value ?? zSettlement.value)
    refundOrderDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function onOpenRefundOrderFromList(row: RefundOrderRecord) {
  void openRefundOrderSide(row.id, { zIndex: zListRefundOrders.value })
}

async function openLoanItemSide(feeId?: string | null, opts?: { zIndex?: number }) {
  if (!feeId) return
  try {
    const { data } = await fetchContractLoanItem(feeId)
    relatedLoanItem.value = data
    zLoanItem.value = takeZ(opts?.zIndex)
    loanItemDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openDepositDeductionSide(feeId?: string | null, opts?: { zIndex?: number }) {
  if (!feeId) return
  try {
    const { data } = await fetchDepositDeduction(feeId)
    relatedDepositDeduction.value = data
    zDepositDeduction.value = takeZ(opts?.zIndex)
    depositDeductionDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openDepositRefundSide(id?: string | null, opts?: { zIndex?: number }) {
  if (!id) return
  try {
    const { data } = await fetchDepositRefund(id)
    relatedDepositRefund.value = data
    zDepositRefund.value = takeZ(opts?.zIndex)
    depositRefundDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openServiceDetailSide(id?: string | null, opts?: { zIndex?: number }) {
  if (!id) return
  try {
    const { data } = await fetchInvoiceServiceDetail(id)
    relatedServiceDetail.value = data
    zServiceDetail.value = takeZ(opts?.zIndex)
    serviceDetailDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openOccupantsSide(row: CustomerRecord) {
  if (!row.occupantCount) return
  listCustomer.value = row
  zListOccupants.value = takeZ(zCustomer.value)
  relatedOccupantsListDrawer.value = true
}

function openRequirementsSide(row: CustomerRecord) {
  if (!row.requirementCount) return
  listCustomer.value = row
  zListRequirements.value = takeZ(zCustomer.value)
  relatedRequirementsListDrawer.value = true
}

function openContractsSideFromCustomer(row: CustomerRecord) {
  if (!row.contractCount) return
  listCustomer.value = row
  listRoom.value = null
  listRequirement.value = null
  zListContracts.value = takeZ(zCustomer.value)
  relatedContractsDrawer.value = true
}

function openInvoicesSideFromCustomer(row: CustomerRecord) {
  if (!row.invoiceCount) return
  listCustomer.value = row
  listRoom.value = null
  listContract.value = null
  zListInvoices.value = takeZ(zCustomer.value)
  relatedInvoicesDrawer.value = true
}

function openReceivablesSideFromCustomer(row: CustomerRecord) {
  if (!row.receivableCount) return
  listCustomer.value = row
  listContract.value = null
  listInvoice.value = null
  listDepositRefund.value = null
  zListReceivables.value = takeZ(zCustomer.value)
  relatedReceivablesDrawer.value = true
}

function openReceiptsSideFromCustomer(row: CustomerRecord) {
  if (!row.receiptCount) return
  listCustomer.value = row
  listContract.value = null
  listInvoice.value = null
  listReceivableId.value = undefined
  listReceivableTitle.value = undefined
  zListReceipts.value = takeZ(zCustomer.value)
  relatedReceiptsDrawer.value = true
}

function openTerminationsSideFromCustomer(row: CustomerRecord) {
  if (!row.terminationCount) return
  listCustomer.value = row
  listRoom.value = null
  listContract.value = null
  zListSettlements.value = takeZ(zCustomer.value)
  relatedSettlementsDrawer.value = true
}

function openDepositRefundsSideFromCustomer(row: CustomerRecord) {
  if (!row.depositRefundCount) return
  listCustomer.value = row
  listRoom.value = null
  listContract.value = null
  zListDepositRefunds.value = takeZ(zCustomer.value)
  relatedDepositRefundsDrawer.value = true
}

function openContractsSideFromRoom(row: RoomRecord) {
  if (!row.contractCount) return
  listRoom.value = row
  listCustomer.value = null
  listRequirement.value = null
  zListContracts.value = takeZ(zRoom.value)
  relatedContractsDrawer.value = true
}

function openInvoicesSideFromRoom(row: RoomRecord) {
  if (!row.invoiceCount) return
  listRoom.value = row
  listCustomer.value = null
  listContract.value = null
  zListInvoices.value = takeZ(zRoom.value)
  relatedInvoicesDrawer.value = true
}

function openTerminationsSideFromRoom(row: RoomRecord) {
  if (!row.terminationCount) return
  listRoom.value = row
  listCustomer.value = null
  listContract.value = null
  zListSettlements.value = takeZ(zRoom.value)
  relatedSettlementsDrawer.value = true
}

function openDepositRefundsSideFromRoom(row: RoomRecord) {
  if (!row.depositRefundCount) return
  listRoom.value = row
  listCustomer.value = null
  listContract.value = null
  zListDepositRefunds.value = takeZ(zRoom.value)
  relatedDepositRefundsDrawer.value = true
}

function openContractsSideFromRequirement(row: CustomerRequirementRecord) {
  if (!row.contractCount) return
  listRequirement.value = row
  zListReqContracts.value = takeZ(zRequirement.value)
  relatedReqContractsDrawer.value = true
}

function openInvoicesList(contract: ContractRecord) {
  if (!contract.invoiceCount) return
  listContract.value = contract
  listCustomer.value = null
  listRoom.value = null
  zListInvoices.value = takeZ(zContract.value)
  relatedInvoicesDrawer.value = true
}

function openReceivablesList(contract: ContractRecord) {
  if (!contract.receivableCount) return
  listContract.value = contract
  listCustomer.value = null
  listInvoice.value = null
  listDepositRefund.value = null
  zListReceivables.value = takeZ(zContract.value)
  relatedReceivablesDrawer.value = true
}

function openReceiptsList(contract: ContractRecord) {
  if (!contract.receiptCount) return
  listContract.value = contract
  listCustomer.value = null
  listInvoice.value = null
  listReceivableId.value = undefined
  listReceivableTitle.value = undefined
  zListReceipts.value = takeZ(zContract.value)
  relatedReceiptsDrawer.value = true
}

function openPeriodsList(contract: ContractRecord) {
  if (!contract.periodCount) return
  listContract.value = contract
  zListPeriods.value = takeZ(zContract.value)
  relatedPeriodsDrawer.value = true
}

function openTerminationsList(contract: ContractRecord) {
  if (!contract.terminationCount) return
  listContract.value = contract
  listCustomer.value = null
  listRoom.value = null
  zListSettlements.value = takeZ(zContract.value)
  relatedSettlementsDrawer.value = true
}

function openLoanItemsList(contract: ContractRecord) {
  if (!contract.loanItemCount) return
  listContract.value = contract
  listSettlement.value = null
  zListLoanItems.value = takeZ(zContract.value)
  relatedLoanItemsDrawer.value = true
}

function openDepositDeductionsList(contract: ContractRecord) {
  if (!contract.depositDeductionCount) return
  listContract.value = contract
  zListDepositDeductions.value = takeZ(zContract.value)
  relatedDepositDeductionsDrawer.value = true
}

function openDepositRefundsList(contract: ContractRecord) {
  if (!contract.depositRefundCount) return
  listContract.value = contract
  listCustomer.value = null
  listRoom.value = null
  zListDepositRefunds.value = takeZ(zContract.value)
  relatedDepositRefundsDrawer.value = true
}

function openReceivablesFromInvoice(row: InvoiceRecord) {
  if (!row.receivableCount) return
  listInvoice.value = row
  listContract.value = null
  listCustomer.value = null
  listDepositRefund.value = null
  listReceivableId.value = undefined
  listReceivableTitle.value = undefined
  zListReceivables.value = takeZ(zInvoice.value)
  relatedReceivablesDrawer.value = true
}

function openReceiptsFromInvoice(row: InvoiceRecord) {
  if (!row.receiptCount) return
  listInvoice.value = row
  listContract.value = null
  listCustomer.value = null
  listReceivableId.value = undefined
  listReceivableTitle.value = undefined
  zListReceipts.value = takeZ(zInvoice.value)
  relatedReceiptsDrawer.value = true
}

function openServiceDetailsFromInvoice(row: InvoiceRecord) {
  if (!row.serviceDetailCount) return
  listInvoice.value = row
  zListServiceDetails.value = takeZ(zInvoice.value)
  relatedServiceDetailsDrawer.value = true
}

function openReceiptsFromReceivable(row: ReceivableRecord) {
  if (!row.receiptCount) return
  listReceivableId.value = row.id
  listReceivableTitle.value =
    row.invoiceCode?.trim() || row.receivableCode?.trim() || undefined
  listInvoice.value = null
  listContract.value = null
  listCustomer.value = null
  zListReceipts.value = takeZ(zReceivable.value)
  relatedReceiptsDrawer.value = true
}

function openCashFlowsFromContract(row: ContractRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  listCashFlowCtx.value = {
    contractId: row.id,
    title: row.contractCode || '',
  }
  zListCashFlows.value = takeZ(zContract.value)
  relatedCashFlowsDrawer.value = true
}

function openCashFlowsFromInvoice(row: InvoiceRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  listCashFlowCtx.value = {
    invoiceId: row.id,
    title: row.invoiceCode || '',
  }
  zListCashFlows.value = takeZ(zInvoice.value)
  relatedCashFlowsDrawer.value = true
}

function openCashFlowsFromReceivable(row: ReceivableRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  listCashFlowCtx.value = {
    receivableId: row.id,
    title: row.invoiceCode?.trim() || row.receivableCode?.trim() || '',
  }
  zListCashFlows.value = takeZ(zReceivable.value)
  relatedCashFlowsDrawer.value = true
}

function openCashFlowsFromReceipt(row: ReceiptRecord) {
  if (!(row.cashFlowCount ?? 0)) return
  listCashFlowCtx.value = {
    receiptId: row.id,
    title: row.receiptCode || '',
  }
  zListCashFlows.value = takeZ(zReceipt.value)
  relatedCashFlowsDrawer.value = true
}

async function openCashFlowSide(row: CashFlowRecord) {
  try {
    const { data } = await fetchCashFlow(row.id)
    cashFlowRecord.value = data
  } catch {
    cashFlowRecord.value = row
  }
  zCashFlow.value = takeZ(zListCashFlows.value)
  cashFlowDrawerVisible.value = true
}

function openReceivablesFromDepositRefund(row: DepositRefundRecord) {
  if (!row.receivableCount) return
  listDepositRefund.value = row
  listContract.value = null
  listCustomer.value = null
  listInvoice.value = null
  zListReceivables.value = takeZ(zDepositRefund.value)
  relatedReceivablesDrawer.value = true
}

function openRoomsSide(row: BuildingRecord) {
  if (!row.roomIds?.length) return
  relatedRoomsBuilding.value = row
  zListRooms.value = takeZ(zBuilding.value)
  relatedRoomsDrawer.value = true
}

function onOpenOccupantFromCustomer(occupant: OccupantRecord) {
  relatedOccupant.value = occupant
  occupantDrawerDirection.value = 'ltr'
  zOccupant.value = takeZ(zListOccupants.value)
  relatedOccupantDrawer.value = true
}

async function openOccupantSide(
  occupantId?: string | null,
  direction: 'ltr' | 'rtl' = 'ltr',
  opts?: { zIndex?: number },
) {
  if (!occupantId) return
  try {
    const { data } = await fetchOccupant(occupantId)
    relatedOccupant.value = data
    occupantDrawerDirection.value = direction
    zOccupant.value = takeZ(opts?.zIndex)
    relatedOccupantDrawer.value = true
  } catch {
    /* interceptor */
  }
}

function onOpenRequirementFromList(requirement: CustomerRequirementRecord) {
  void openRequirementSide(requirement.id, { zIndex: zListRequirements.value })
}

function onOpenRoomFromList(room: RoomRecord) {
  void openRoomSide(room.id, 'ltr', { zIndex: zListRooms.value })
}

function onOpenContractFromList(row: ContractRecord) {
  void openContractSide(row.id, {
    zIndex: zListContracts.value ?? zListReqContracts.value,
  })
}

function onOpenInvoiceFromList(row: InvoiceRecord) {
  void openInvoiceSide(row.id, { zIndex: zListInvoices.value })
}

function onOpenReceivableFromList(row: ReceivableRecord) {
  void openReceivableSide(row.id, { zIndex: zListReceivables.value })
}

function onOpenReceiptFromList(row: ReceiptRecord) {
  void openReceiptSide(row.id, { zIndex: zListReceipts.value })
}

function onOpenPeriodFromList(row: ContractPeriodListRecord) {
  void openPeriodSide(row.id, { zIndex: zListPeriods.value })
}

function onOpenSettlementFromList(row: ContractSettlementRecord) {
  void openSettlementSide(row.id, { zIndex: zListSettlements.value })
}

function onOpenLoanItemFromList(row: ContractLoanItemRecord) {
  void openLoanItemSide(row.id, { zIndex: zListLoanItems.value })
}

function onOpenDepositDeductionFromList(row: DepositDeductionRecord) {
  void openDepositDeductionSide(row.id, { zIndex: zListDepositDeductions.value })
}

function onOpenDepositRefundFromList(row: DepositRefundRecord) {
  void openDepositRefundSide(row.id, { zIndex: zListDepositRefunds.value })
}

function onOpenServiceDetailFromList(row: InvoiceServiceDetailListRecord) {
  void openServiceDetailSide(row.id, { zIndex: zListServiceDetails.value })
}

defineExpose({
  openCustomerSide,
  openOccupantSide,
  openRoomSide,
  openBuildingSide,
  openRequirementSide,
  openContractSide,
  openInvoiceSide,
  openReceivableSide,
  openReceiptSide,
  openPeriodSide,
  openSettlementSide,
  openRefundOrdersFromSettlement,
  openRefundOrderSide,
  openLoanItemSide,
  openDepositDeductionSide,
  openDepositRefundSide,
  openServiceDetailSide,
})
</script>

<template>
  <!-- 客户链 -->
  <CustomerDetailDrawer
    v-model="customerDrawerVisible"
    :customer="relatedCustomer"
    :desktop-direction="customerDrawerDirection"
    :z-index="zCustomer"
    @open-occupants="openOccupantsSide"
    @open-requirements="openRequirementsSide"
    @open-contracts="openContractsSideFromCustomer"
    @open-invoices="openInvoicesSideFromCustomer"
    @open-receivables="openReceivablesSideFromCustomer"
    @open-receipts="openReceiptsSideFromCustomer"
    @open-terminations="openTerminationsSideFromCustomer"
    @open-deposit-refunds="openDepositRefundsSideFromCustomer"
    @open-building="(id) => openBuildingSide(id, { zIndex: zCustomer })"
    @open-occupant="(id) => openOccupantSide(id, 'ltr', { zIndex: zCustomer })"
  />
  <RelatedOccupantsDrawer
    v-model="relatedOccupantsListDrawer"
    :customer="listCustomer"
    desktop-direction="ltr"
    :z-index="zListOccupants"
    @open-occupant="onOpenOccupantFromCustomer"
  />
  <RelatedCustomerRequirementsDrawer
    v-model="relatedRequirementsListDrawer"
    :customer="listCustomer"
    desktop-direction="ltr"
    :z-index="zListRequirements"
    @open-requirement="onOpenRequirementFromList"
  />
  <CustomerRequirementDetailDrawer
    v-model="relatedRequirementDrawer"
    :requirement="relatedRequirement"
    desktop-direction="ltr"
    :z-index="zRequirement"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zRequirement })"
    @open-contracts="openContractsSideFromRequirement"
  />
  <RelatedContractsDrawer
    v-model="relatedReqContractsDrawer"
    :requirement-id="listRequirement?.id"
    :title-context="listRequirement?.requirementCode"
    desktop-direction="ltr"
    :z-index="zListReqContracts"
    @open-contract="onOpenContractFromList"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zListReqContracts })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zListReqContracts })"
  />
  <OccupantDetailDrawer
    v-model="relatedOccupantDrawer"
    :occupant="relatedOccupant"
    :desktop-direction="occupantDrawerDirection"
    :z-index="zOccupant"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zOccupant })"
  />

  <!-- 楼宇 / 房间 -->
  <BuildingDetailDrawer
    v-model="buildingDrawerVisible"
    :building="relatedBuilding"
    desktop-direction="ltr"
    :z-index="zBuilding"
    @open-rooms="openRoomsSide"
  />
  <RelatedRoomsDrawer
    v-model="relatedRoomsDrawer"
    :building="relatedRoomsBuilding"
    desktop-direction="ltr"
    :z-index="zListRooms"
    @open-room="onOpenRoomFromList"
  />
  <RoomDetailDrawer
    v-model="roomDrawerVisible"
    :room="relatedRoom"
    :desktop-direction="roomDrawerDirection"
    :z-index="zRoom"
    @open-building="(id) => openBuildingSide(id, { zIndex: zRoom })"
    @open-contracts="openContractsSideFromRoom"
    @open-invoices="openInvoicesSideFromRoom"
    @open-terminations="openTerminationsSideFromRoom"
    @open-deposit-refunds="openDepositRefundsSideFromRoom"
    @open-contract="(id) => openContractSide(id, { zIndex: zRoom })"
  />

  <!-- 合约详情 + 下属列表 -->
  <ContractDetailDrawer
    v-model="contractDrawerVisible"
    :contract="relatedContract"
    desktop-direction="ltr"
    :z-index="zContract"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zContract })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zContract })"
    @open-building="(id) => openBuildingSide(id, { zIndex: zContract })"
    @open-requirement="(id) => openRequirementSide(id, { zIndex: zContract })"
    @open-invoices="openInvoicesList"
    @open-receivables="openReceivablesList"
    @open-receipts="openReceiptsList"
    @open-cash-flows="openCashFlowsFromContract"
    @open-settlement="(id) => openSettlementSide(id, { zIndex: zContract })"
    @open-loan-items="openLoanItemsList"
    @open-booking-deposit-receipt="(id, opts) => openReceiptSide(id, { zIndex: opts?.zIndex ?? zContract })"
    @open-invoice="(id, opts) => openInvoiceSide(id, { zIndex: opts?.zIndex ?? zContract })"
    @booking-deposit-changed="emit('changed')"
  />

  <InvoiceDetailDrawer
    v-model="invoiceDrawerVisible"
    :record="relatedInvoice"
    desktop-direction="ltr"
    :z-index="zInvoice"
    @open-contract="(id) => openContractSide(id, { zIndex: zInvoice })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zInvoice })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zInvoice })"
    @open-receivables="openReceivablesFromInvoice"
    @open-receipts="openReceiptsFromInvoice"
    @open-cash-flows="openCashFlowsFromInvoice"
    @open-service-details="openServiceDetailsFromInvoice"
  />
  <ReceivableDetailDrawer
    v-model="receivableDrawerVisible"
    :record="relatedReceivable"
    desktop-direction="ltr"
    :z-index="zReceivable"
    @open-invoice="(id) => openInvoiceSide(id, { zIndex: zReceivable })"
    @open-contract="(id) => openContractSide(id, { zIndex: zReceivable })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zReceivable })"
    @open-deposit-refund="(id) => openDepositRefundSide(id, { zIndex: zReceivable })"
    @open-receipts="openReceiptsFromReceivable"
    @open-receipt="(id) => openReceiptSide(id, { zIndex: zReceivable })"
    @open-cash-flows="openCashFlowsFromReceivable"
  />
  <ReceiptDetailDrawer
    v-model="receiptDrawerVisible"
    :record="relatedReceipt"
    desktop-direction="ltr"
    :z-index="zReceipt"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zReceipt })"
    @open-contract="(id) => openContractSide(id, { zIndex: zReceipt })"
    @open-invoice="(id) => openInvoiceSide(id, { zIndex: zReceipt })"
    @open-receivable="(id) => openReceivableSide(id, { zIndex: zReceipt })"
    @open-cash-flows="openCashFlowsFromReceipt"
    @booking-deposit-changed="onRelatedListChanged"
  />
  <ContractPeriodDetailDrawer
    v-model="periodDrawerVisible"
    :period="relatedPeriod"
    desktop-direction="ltr"
    :z-index="zPeriod"
    @open-contract="(id) => openContractSide(id, { zIndex: zPeriod })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zPeriod })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zPeriod })"
  />
  <ContractSettlementDetailDrawer
    v-model="settlementDrawerVisible"
    :record="relatedSettlement"
    desktop-direction="ltr"
    :z-index="zSettlement"
    @open-contract="(id) => openContractSide(id, { zIndex: zSettlement })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zSettlement })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zSettlement })"
    @open-receivable="(id) => openReceivableSide(id, { zIndex: zSettlement })"
    @open-refund-orders="openRefundOrdersFromSettlement"
  />
  <RelatedRefundOrdersDrawer
    v-model="relatedRefundOrdersDrawer"
    :settlement-id="listSettlement?.id"
    :title-context="listSettlement?.settlementCode || ''"
    desktop-direction="ltr"
    :z-index="zListRefundOrders"
    @open-refund-order="onOpenRefundOrderFromList"
  />
  <RefundOrderDetailDrawer
    v-model="refundOrderDrawerVisible"
    :record="relatedRefundOrder"
    desktop-direction="ltr"
    :z-index="zRefundOrder"
    @open-contract="(id) => openContractSide(id, { zIndex: zRefundOrder })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zRefundOrder })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zRefundOrder })"
    @open-settlement="(id) => openSettlementSide(id, { zIndex: zRefundOrder })"
  />
  <ContractLoanItemDetailDrawer
    v-model="loanItemDrawerVisible"
    :fee="relatedLoanItem"
    desktop-direction="ltr"
    :z-index="zLoanItem"
    @open-contract="(id) => openContractSide(id, { zIndex: zLoanItem })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zLoanItem })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zLoanItem })"
  />
  <DepositDeductionDetailDrawer
    v-model="depositDeductionDrawerVisible"
    :fee="relatedDepositDeduction"
    desktop-direction="ltr"
    :z-index="zDepositDeduction"
    @open-contract="(id) => openContractSide(id, { zIndex: zDepositDeduction })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zDepositDeduction })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zDepositDeduction })"
    @open-settlement="(id) => openSettlementSide(id, { zIndex: zDepositDeduction })"
  />
  <DepositRefundDetailDrawer
    v-model="depositRefundDrawerVisible"
    :record="relatedDepositRefund"
    desktop-direction="ltr"
    :z-index="zDepositRefund"
    @open-contract="(id) => openContractSide(id, { zIndex: zDepositRefund })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zDepositRefund })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zDepositRefund })"
    @open-receivables="openReceivablesFromDepositRefund"
  />
  <InvoiceServiceDetailDrawer
    v-model="serviceDetailDrawerVisible"
    :detail="relatedServiceDetail"
    desktop-direction="ltr"
    :z-index="zServiceDetail"
    @open-invoice="(id) => openInvoiceSide(id, { zIndex: zServiceDetail })"
    @open-contract="(id) => openContractSide(id, { zIndex: zServiceDetail })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zServiceDetail })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zServiceDetail })"
  />

  <!-- Related 列表 -->
  <RelatedContractsDrawer
    v-model="relatedContractsDrawer"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    :title-context="listCustomer?.name || listRoom?.roomCode"
    desktop-direction="ltr"
    :z-index="zListContracts"
    @open-contract="onOpenContractFromList"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zListContracts })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zListContracts })"
  />
  <RelatedInvoicesDrawer
    v-model="relatedInvoicesDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    :title-context="listCustomer?.name || listRoom?.roomCode || listContract?.contractCode"
    desktop-direction="ltr"
    :z-index="zListInvoices"
    @open-invoice="onOpenInvoiceFromList"
    @open-contract="(id) => openContractSide(id, { zIndex: zListInvoices })"
    @changed="onRelatedListChanged"
  />
  <RelatedReceivablesDrawer
    v-model="relatedReceivablesDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :invoice-id="listInvoice?.id"
    :deposit-refund-id="listDepositRefund?.id"
    :title-context="
      listCustomer?.name || listContract?.contractCode || listInvoice?.invoiceCode || listDepositRefund?.refundCode
    "
    desktop-direction="ltr"
    :z-index="zListReceivables"
    @open-receivable="onOpenReceivableFromList"
    @open-invoice="(id) => openInvoiceSide(id, { zIndex: zListReceivables })"
    @open-contract="(id) => openContractSide(id, { zIndex: zListReceivables })"
    @changed="onRelatedListChanged"
  />
  <RelatedReceiptsDrawer
    v-model="relatedReceiptsDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :invoice-id="listInvoice?.id"
    :receivable-id="listReceivableId"
    :title-context="
      listCustomer?.name ||
      listContract?.contractCode ||
      listInvoice?.invoiceCode ||
      listReceivableTitle
    "
    desktop-direction="ltr"
    :z-index="zListReceipts"
    @open-receipt="onOpenReceiptFromList"
    @open-receipt-by-id="(id) => openReceiptSide(id, { zIndex: zListReceipts })"
    @open-invoice="(id) => openInvoiceSide(id, { zIndex: zListReceipts })"
    @open-contract="(id) => openContractSide(id, { zIndex: zListReceipts })"
    @open-receivable="(id) => openReceivableSide(id, { zIndex: zListReceipts })"
    @changed="onRelatedListChanged"
  />
  <RelatedSettlementsDrawer
    v-model="relatedSettlementsDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    type="VACATE"
    :title-context="listCustomer?.name || listRoom?.roomCode || listContract?.contractCode"
    desktop-direction="ltr"
    :z-index="zListSettlements"
    @open-settlement="onOpenSettlementFromList"
    @open-contract="(id) => openContractSide(id, { zIndex: zListSettlements })"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zListSettlements })"
  />
  <RelatedDepositRefundsDrawer
    v-model="relatedDepositRefundsDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    :title-context="listCustomer?.name || listRoom?.roomCode || listContract?.contractCode"
    desktop-direction="ltr"
    :z-index="zListDepositRefunds"
    @open-deposit-refund="onOpenDepositRefundFromList"
  />
  <RelatedPeriodsDrawer
    v-model="relatedPeriodsDrawer"
    :contract="listContract"
    desktop-direction="ltr"
    :z-index="zListPeriods"
    @open-period="onOpenPeriodFromList"
    @open-room="(id) => openRoomSide(id, 'ltr', { zIndex: zListPeriods })"
  />
  <RelatedLoanItemsDrawer
    v-model="relatedLoanItemsDrawer"
    :contract="listContract"
    desktop-direction="ltr"
    :z-index="zListLoanItems"
    @open-fee="onOpenLoanItemFromList"
  />
  <RelatedDepositDeductionsDrawer
    v-model="relatedDepositDeductionsDrawer"
    :contract="listContract"
    desktop-direction="ltr"
    :z-index="zListDepositDeductions"
    @open-fee="onOpenDepositDeductionFromList"
    @open-settlement="(id) => openSettlementSide(id, { zIndex: zListDepositDeductions })"
  />
  <RelatedServiceDetailsDrawer
    v-model="relatedServiceDetailsDrawer"
    :invoice="listInvoice"
    desktop-direction="ltr"
    :z-index="zListServiceDetails"
    @open-service-detail="onOpenServiceDetailFromList"
  />
  <RelatedCashFlowsDrawer
    v-model="relatedCashFlowsDrawer"
    :contract-id="listCashFlowCtx?.contractId"
    :invoice-id="listCashFlowCtx?.invoiceId"
    :receivable-id="listCashFlowCtx?.receivableId"
    :receipt-id="listCashFlowCtx?.receiptId"
    :title-context="listCashFlowCtx?.title || ''"
    desktop-direction="ltr"
    :z-index="zListCashFlows"
    @open-cash-flow="openCashFlowSide"
  />
  <CashFlowDetailDrawer
    v-model="cashFlowDrawerVisible"
    :record="cashFlowRecord"
    desktop-direction="ltr"
    :z-index="zCashFlow"
    @open-contract="(id) => openContractSide(id, { zIndex: zCashFlow })"
    @open-customer="(id) => openCustomerSide(id, 'ltr', { zIndex: zCashFlow })"
    @open-receipt="(id) => openReceiptSide(id, { zIndex: zCashFlow })"
    @open-refund-order="(id) => openRefundOrderSide(id, { zIndex: zCashFlow })"
  />
</template>
