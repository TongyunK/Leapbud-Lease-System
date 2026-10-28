<script setup lang="ts">
/**
 * 全局关联实体导航链：客户 / 房间 / 楼宇 / 需求 / 入住人 / 合约 / 发票 / 应收 / 收据 /
 * 合约期 / 退租 / 其他费用 / 按金退还，以及各类 Related 列表。
 * 抽屉内关联字段与数量胶囊均可继续下钻。
 */
import { ref } from 'vue'
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
import { fetchLeaseTermination } from '@/api/lease-terminations'
import { fetchContractOtherFee } from '@/api/contract-other-fees'
import { fetchDepositRefund } from '@/api/deposit-refunds'
import { fetchInvoiceServiceDetail } from '@/api/invoice-service-details'
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
import LeaseTerminationDetailDrawer from '@/components/LeaseTerminationDetailDrawer.vue'
import ContractOtherFeeDetailDrawer from '@/components/ContractOtherFeeDetailDrawer.vue'
import DepositRefundDetailDrawer from '@/components/DepositRefundDetailDrawer.vue'
import InvoiceServiceDetailDrawer from '@/components/InvoiceServiceDetailDrawer.vue'
import RelatedCustomerRequirementsDrawer from '@/components/RelatedCustomerRequirementsDrawer.vue'
import RelatedOccupantsDrawer from '@/components/RelatedOccupantsDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'
import RelatedContractsDrawer from '@/components/RelatedContractsDrawer.vue'
import RelatedInvoicesDrawer from '@/components/RelatedInvoicesDrawer.vue'
import RelatedReceivablesDrawer from '@/components/RelatedReceivablesDrawer.vue'
import RelatedReceiptsDrawer from '@/components/RelatedReceiptsDrawer.vue'
import RelatedTerminationsDrawer from '@/components/RelatedTerminationsDrawer.vue'
import RelatedDepositRefundsDrawer from '@/components/RelatedDepositRefundsDrawer.vue'
import RelatedPeriodsDrawer from '@/components/RelatedPeriodsDrawer.vue'
import RelatedOtherFeesDrawer from '@/components/RelatedOtherFeesDrawer.vue'
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
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'

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

const relatedPeriod = ref<ContractPeriodListRecord | null>(null)
const periodDrawerVisible = ref(false)

const relatedTermination = ref<LeaseTerminationRecord | null>(null)
const terminationDrawerVisible = ref(false)

const relatedOtherFee = ref<ContractOtherFeeRecord | null>(null)
const otherFeeDrawerVisible = ref(false)
const otherFeeI18nNs = ref<'contractOtherFee' | 'depositDeduction'>('contractOtherFee')

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
const listTermination = ref<LeaseTerminationRecord | null>(null)
const listDepositRefund = ref<DepositRefundRecord | null>(null)
const listReceivableId = ref<string | undefined>(undefined)

const relatedContractsDrawer = ref(false)
const relatedInvoicesDrawer = ref(false)
const relatedReceivablesDrawer = ref(false)
const relatedReceiptsDrawer = ref(false)
const relatedTerminationsDrawer = ref(false)
const relatedDepositRefundsDrawer = ref(false)
const relatedPeriodsDrawer = ref(false)
const relatedOtherFeesDrawer = ref(false)
const relatedDepositDeductionsDrawer = ref(false)
const relatedServiceDetailsDrawer = ref(false)
const relatedReqContractsDrawer = ref(false)

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

async function openRoomSide(roomId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  if (!roomId) return
  try {
    const { data } = await fetchRoom(roomId)
    relatedRoom.value = data
    roomDrawerDirection.value = direction
    roomDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openBuildingSide(buildingId?: string | null) {
  if (!buildingId) return
  try {
    const { data } = await fetchBuilding(buildingId)
    relatedBuilding.value = data
    buildingDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openRequirementSide(requirementId?: string | null) {
  if (!requirementId) return
  try {
    const { data } = await fetchCustomerRequirement(requirementId)
    relatedRequirement.value = data
    relatedRequirementDrawer.value = true
  } catch {
    /* interceptor */
  }
}

async function openContractSide(contractId?: string | null) {
  if (!contractId) return
  try {
    const { data } = await fetchContract(contractId)
    relatedContract.value = data
    contractDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openInvoiceSide(invoiceId?: string | null) {
  if (!invoiceId) return
  try {
    const { data } = await fetchInvoice(invoiceId)
    relatedInvoice.value = data
    invoiceDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openReceivableSide(receivableId?: string | null) {
  if (!receivableId) return
  try {
    const { data } = await fetchReceivable(receivableId)
    relatedReceivable.value = data
    receivableDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openReceiptSide(receiptId?: string | null) {
  if (!receiptId) return
  try {
    const { data } = await fetchReceipt(receiptId)
    relatedReceipt.value = data
    receiptDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openPeriodSide(periodId?: string | null) {
  if (!periodId) return
  try {
    const { data } = await fetchContractPeriod(periodId)
    relatedPeriod.value = data
    periodDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openTerminationSide(terminationId?: string | null) {
  if (!terminationId) return
  try {
    const { data } = await fetchLeaseTermination(terminationId)
    relatedTermination.value = data
    terminationDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openOtherFeeSide(
  feeId?: string | null,
  ns: 'contractOtherFee' | 'depositDeduction' = 'contractOtherFee',
) {
  if (!feeId) return
  try {
    const { data } = await fetchContractOtherFee(feeId)
    relatedOtherFee.value = data
    otherFeeI18nNs.value = ns
    otherFeeDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openDepositRefundSide(id?: string | null) {
  if (!id) return
  try {
    const { data } = await fetchDepositRefund(id)
    relatedDepositRefund.value = data
    depositRefundDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openServiceDetailSide(id?: string | null) {
  if (!id) return
  try {
    const { data } = await fetchInvoiceServiceDetail(id)
    relatedServiceDetail.value = data
    serviceDetailDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

function openOccupantsSide(row: CustomerRecord) {
  if (!row.occupantCount) return
  listCustomer.value = row
  relatedOccupantsListDrawer.value = true
}

function openRequirementsSide(row: CustomerRecord) {
  if (!row.requirementCount) return
  listCustomer.value = row
  relatedRequirementsListDrawer.value = true
}

function openContractsSideFromCustomer(row: CustomerRecord) {
  if (!row.contractCount) return
  listCustomer.value = row
  listRoom.value = null
  listRequirement.value = null
  relatedContractsDrawer.value = true
}

function openInvoicesSideFromCustomer(row: CustomerRecord) {
  if (!row.invoiceCount) return
  listCustomer.value = row
  listRoom.value = null
  listContract.value = null
  relatedInvoicesDrawer.value = true
}

function openReceivablesSideFromCustomer(row: CustomerRecord) {
  if (!row.receivableCount) return
  listCustomer.value = row
  listContract.value = null
  listInvoice.value = null
  listDepositRefund.value = null
  relatedReceivablesDrawer.value = true
}

function openReceiptsSideFromCustomer(row: CustomerRecord) {
  if (!row.receiptCount) return
  listCustomer.value = row
  listContract.value = null
  listInvoice.value = null
  listReceivableId.value = undefined
  relatedReceiptsDrawer.value = true
}

function openTerminationsSideFromCustomer(row: CustomerRecord) {
  if (!row.terminationCount) return
  listCustomer.value = row
  listRoom.value = null
  listContract.value = null
  relatedTerminationsDrawer.value = true
}

function openDepositRefundsSideFromCustomer(row: CustomerRecord) {
  if (!row.depositRefundCount) return
  listCustomer.value = row
  listRoom.value = null
  listContract.value = null
  relatedDepositRefundsDrawer.value = true
}

function openContractsSideFromRoom(row: RoomRecord) {
  if (!row.contractCount) return
  listRoom.value = row
  listCustomer.value = null
  listRequirement.value = null
  relatedContractsDrawer.value = true
}

function openInvoicesSideFromRoom(row: RoomRecord) {
  if (!row.invoiceCount) return
  listRoom.value = row
  listCustomer.value = null
  listContract.value = null
  relatedInvoicesDrawer.value = true
}

function openTerminationsSideFromRoom(row: RoomRecord) {
  if (!row.terminationCount) return
  listRoom.value = row
  listCustomer.value = null
  listContract.value = null
  relatedTerminationsDrawer.value = true
}

function openDepositRefundsSideFromRoom(row: RoomRecord) {
  if (!row.depositRefundCount) return
  listRoom.value = row
  listCustomer.value = null
  listContract.value = null
  relatedDepositRefundsDrawer.value = true
}

function openContractsSideFromRequirement(row: CustomerRequirementRecord) {
  if (!row.contractCount) return
  listRequirement.value = row
  relatedReqContractsDrawer.value = true
}

function openInvoicesList(contract: ContractRecord) {
  if (!contract.invoiceCount) return
  listContract.value = contract
  listCustomer.value = null
  listRoom.value = null
  relatedInvoicesDrawer.value = true
}

function openReceivablesList(contract: ContractRecord) {
  if (!contract.receivableCount) return
  listContract.value = contract
  listCustomer.value = null
  listInvoice.value = null
  listDepositRefund.value = null
  relatedReceivablesDrawer.value = true
}

function openReceiptsList(contract: ContractRecord) {
  if (!contract.receiptCount) return
  listContract.value = contract
  listCustomer.value = null
  listInvoice.value = null
  listReceivableId.value = undefined
  relatedReceiptsDrawer.value = true
}

function openPeriodsList(contract: ContractRecord) {
  if (!contract.periodCount) return
  listContract.value = contract
  relatedPeriodsDrawer.value = true
}

function openTerminationsList(contract: ContractRecord) {
  if (!contract.terminationCount) return
  listContract.value = contract
  listCustomer.value = null
  listRoom.value = null
  relatedTerminationsDrawer.value = true
}

function openOtherFeesList(contract: ContractRecord) {
  if (!contract.otherFeeCount) return
  listContract.value = contract
  listTermination.value = null
  relatedOtherFeesDrawer.value = true
}

function openDepositDeductionsList(contract: ContractRecord) {
  if (!contract.depositDeductionCount) return
  listContract.value = contract
  relatedDepositDeductionsDrawer.value = true
}

function openDepositRefundsList(contract: ContractRecord) {
  if (!contract.depositRefundCount) return
  listContract.value = contract
  listCustomer.value = null
  listRoom.value = null
  relatedDepositRefundsDrawer.value = true
}

function openReceivablesFromInvoice(row: InvoiceRecord) {
  if (!row.receivableCount) return
  listInvoice.value = row
  listContract.value = null
  listCustomer.value = null
  listDepositRefund.value = null
  listReceivableId.value = undefined
  relatedReceivablesDrawer.value = true
}

function openReceiptsFromInvoice(row: InvoiceRecord) {
  if (!row.receiptCount) return
  listInvoice.value = row
  listContract.value = null
  listCustomer.value = null
  listReceivableId.value = undefined
  relatedReceiptsDrawer.value = true
}

function openServiceDetailsFromInvoice(row: InvoiceRecord) {
  if (!row.serviceDetailCount) return
  listInvoice.value = row
  relatedServiceDetailsDrawer.value = true
}

function openReceiptsFromReceivable(row: ReceivableRecord) {
  if (!row.receiptCount) return
  listReceivableId.value = row.id
  listInvoice.value = null
  listContract.value = null
  listCustomer.value = null
  relatedReceiptsDrawer.value = true
}

function openOtherFeesFromTermination(row: LeaseTerminationRecord) {
  if (!row.otherFeeCount) return
  listTermination.value = row
  listContract.value = null
  relatedOtherFeesDrawer.value = true
}

function openReceivablesFromDepositRefund(row: DepositRefundRecord) {
  if (!row.receivableCount) return
  listDepositRefund.value = row
  listContract.value = null
  listCustomer.value = null
  listInvoice.value = null
  relatedReceivablesDrawer.value = true
}

function openRoomsSide(row: BuildingRecord) {
  if (!row.roomIds?.length) return
  relatedRoomsBuilding.value = row
  relatedRoomsDrawer.value = true
}

function onOpenOccupantFromCustomer(occupant: OccupantRecord) {
  relatedOccupant.value = occupant
  occupantDrawerDirection.value = 'ltr'
  relatedOccupantDrawer.value = true
}

async function openOccupantSide(occupantId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  if (!occupantId) return
  try {
    const { data } = await fetchOccupant(occupantId)
    relatedOccupant.value = data
    occupantDrawerDirection.value = direction
    relatedOccupantDrawer.value = true
  } catch {
    /* interceptor */
  }
}

function onOpenRequirementFromList(requirement: CustomerRequirementRecord) {
  void openRequirementSide(requirement.id)
}

function onOpenRoomFromList(room: RoomRecord) {
  void openRoomSide(room.id, 'ltr')
}

function onOpenContractFromList(row: ContractRecord) {
  void openContractSide(row.id)
}

function onOpenInvoiceFromList(row: InvoiceRecord) {
  void openInvoiceSide(row.id)
}

function onOpenReceivableFromList(row: ReceivableRecord) {
  void openReceivableSide(row.id)
}

function onOpenReceiptFromList(row: ReceiptRecord) {
  void openReceiptSide(row.id)
}

function onOpenPeriodFromList(row: ContractPeriodListRecord) {
  void openPeriodSide(row.id)
}

function onOpenTerminationFromList(row: LeaseTerminationRecord) {
  void openTerminationSide(row.id)
}

function onOpenOtherFeeFromList(row: ContractOtherFeeRecord) {
  void openOtherFeeSide(row.id, 'contractOtherFee')
}

function onOpenDepositDeductionFromList(row: ContractOtherFeeRecord) {
  void openOtherFeeSide(row.id, 'depositDeduction')
}

function onOpenDepositRefundFromList(row: DepositRefundRecord) {
  void openDepositRefundSide(row.id)
}

function onOpenServiceDetailFromList(row: InvoiceServiceDetailListRecord) {
  void openServiceDetailSide(row.id)
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
  openTerminationSide,
  openOtherFeeSide,
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
    @open-occupants="openOccupantsSide"
    @open-requirements="openRequirementsSide"
    @open-contracts="openContractsSideFromCustomer"
    @open-invoices="openInvoicesSideFromCustomer"
    @open-receivables="openReceivablesSideFromCustomer"
    @open-receipts="openReceiptsSideFromCustomer"
    @open-terminations="openTerminationsSideFromCustomer"
    @open-deposit-refunds="openDepositRefundsSideFromCustomer"
    @open-building="openBuildingSide"
    @open-occupant="(id) => openOccupantSide(id, 'ltr')"
  />
  <RelatedOccupantsDrawer
    v-model="relatedOccupantsListDrawer"
    :customer="listCustomer"
    desktop-direction="ltr"
    @open-occupant="onOpenOccupantFromCustomer"
  />
  <RelatedCustomerRequirementsDrawer
    v-model="relatedRequirementsListDrawer"
    :customer="listCustomer"
    desktop-direction="ltr"
    @open-requirement="onOpenRequirementFromList"
  />
  <CustomerRequirementDetailDrawer
    v-model="relatedRequirementDrawer"
    :requirement="relatedRequirement"
    desktop-direction="ltr"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-contracts="openContractsSideFromRequirement"
  />
  <RelatedContractsDrawer
    v-model="relatedReqContractsDrawer"
    :requirement-id="listRequirement?.id"
    :title-context="listRequirement?.requirementCode"
    desktop-direction="ltr"
    @open-contract="onOpenContractFromList"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
  />
  <OccupantDetailDrawer
    v-model="relatedOccupantDrawer"
    :occupant="relatedOccupant"
    :desktop-direction="occupantDrawerDirection"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
  />

  <!-- 楼宇 / 房间 -->
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
    v-model="roomDrawerVisible"
    :room="relatedRoom"
    :desktop-direction="roomDrawerDirection"
    @open-building="openBuildingSide"
    @open-contracts="openContractsSideFromRoom"
    @open-invoices="openInvoicesSideFromRoom"
    @open-terminations="openTerminationsSideFromRoom"
    @open-deposit-refunds="openDepositRefundsSideFromRoom"
    @open-contract="(id) => openContractSide(id)"
  />

  <!-- 合约详情 + 下属列表 -->
  <ContractDetailDrawer
    v-model="contractDrawerVisible"
    :contract="relatedContract"
    desktop-direction="ltr"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
    @open-building="openBuildingSide"
    @open-requirement="openRequirementSide"
    @open-invoices="openInvoicesList"
    @open-receivables="openReceivablesList"
    @open-receipts="openReceiptsList"
    @open-periods="openPeriodsList"
    @open-terminations="openTerminationsList"
    @open-other-fees="openOtherFeesList"
    @open-deposit-deductions="openDepositDeductionsList"
    @open-deposit-refunds="openDepositRefundsList"
    @open-booking-deposit-receipt="(id) => openReceiptSide(id)"
  />

  <InvoiceDetailDrawer
    v-model="invoiceDrawerVisible"
    :record="relatedInvoice"
    desktop-direction="ltr"
    @open-contract="openContractSide"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
    @open-receivables="openReceivablesFromInvoice"
    @open-receipts="openReceiptsFromInvoice"
    @open-service-details="openServiceDetailsFromInvoice"
  />
  <ReceivableDetailDrawer
    v-model="receivableDrawerVisible"
    :record="relatedReceivable"
    desktop-direction="ltr"
    @open-invoice="openInvoiceSide"
    @open-contract="openContractSide"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-deposit-refund="openDepositRefundSide"
    @open-receipts="openReceiptsFromReceivable"
  />
  <ReceiptDetailDrawer
    v-model="receiptDrawerVisible"
    :record="relatedReceipt"
    desktop-direction="ltr"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-contract="openContractSide"
    @open-invoice="openInvoiceSide"
    @open-receivable="openReceivableSide"
  />
  <ContractPeriodDetailDrawer
    v-model="periodDrawerVisible"
    :period="relatedPeriod"
    desktop-direction="ltr"
    @open-contract="openContractSide"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
  />
  <LeaseTerminationDetailDrawer
    v-model="terminationDrawerVisible"
    :termination="relatedTermination"
    desktop-direction="ltr"
    @open-contract="openContractSide"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
    @open-other-fees="openOtherFeesFromTermination"
  />
  <ContractOtherFeeDetailDrawer
    v-model="otherFeeDrawerVisible"
    :fee="relatedOtherFee"
    :i18n-ns="otherFeeI18nNs"
    desktop-direction="ltr"
    @open-contract="openContractSide"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
    @open-termination="openTerminationSide"
  />
  <DepositRefundDetailDrawer
    v-model="depositRefundDrawerVisible"
    :record="relatedDepositRefund"
    desktop-direction="ltr"
    @open-contract="openContractSide"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
    @open-receivables="openReceivablesFromDepositRefund"
  />
  <InvoiceServiceDetailDrawer
    v-model="serviceDetailDrawerVisible"
    :detail="relatedServiceDetail"
    desktop-direction="ltr"
    @open-invoice="openInvoiceSide"
    @open-contract="openContractSide"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
  />

  <!-- Related 列表 -->
  <RelatedContractsDrawer
    v-model="relatedContractsDrawer"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    :title-context="listCustomer?.name || listRoom?.roomCode"
    desktop-direction="ltr"
    @open-contract="onOpenContractFromList"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
    @open-room="(id) => openRoomSide(id, 'ltr')"
  />
  <RelatedInvoicesDrawer
    v-model="relatedInvoicesDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    :title-context="listCustomer?.name || listRoom?.roomCode || listContract?.contractCode"
    desktop-direction="ltr"
    @open-invoice="onOpenInvoiceFromList"
    @open-contract="openContractSide"
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
    @open-receivable="onOpenReceivableFromList"
    @open-invoice="openInvoiceSide"
    @open-contract="openContractSide"
    @changed="onRelatedListChanged"
  />
  <RelatedReceiptsDrawer
    v-model="relatedReceiptsDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :invoice-id="listInvoice?.id"
    :receivable-id="listReceivableId"
    :title-context="
      listCustomer?.name || listContract?.contractCode || listInvoice?.invoiceCode || listReceivableId
    "
    desktop-direction="ltr"
    @open-receipt="onOpenReceiptFromList"
    @open-invoice="openInvoiceSide"
    @open-contract="openContractSide"
    @open-receivable="openReceivableSide"
    @changed="onRelatedListChanged"
  />
  <RelatedTerminationsDrawer
    v-model="relatedTerminationsDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    :title-context="listCustomer?.name || listRoom?.roomCode || listContract?.contractCode"
    desktop-direction="ltr"
    @open-termination="onOpenTerminationFromList"
    @open-contract="openContractSide"
    @open-room="(id) => openRoomSide(id, 'ltr')"
  />
  <RelatedDepositRefundsDrawer
    v-model="relatedDepositRefundsDrawer"
    :contract="listContract"
    :customer-id="listCustomer?.id"
    :room-id="listRoom?.id"
    :title-context="listCustomer?.name || listRoom?.roomCode || listContract?.contractCode"
    desktop-direction="ltr"
    @open-deposit-refund="onOpenDepositRefundFromList"
  />
  <RelatedPeriodsDrawer
    v-model="relatedPeriodsDrawer"
    :contract="listContract"
    desktop-direction="ltr"
    @open-period="onOpenPeriodFromList"
    @open-room="(id) => openRoomSide(id, 'ltr')"
  />
  <RelatedOtherFeesDrawer
    v-model="relatedOtherFeesDrawer"
    :contract="listContract"
    :termination-id="listTermination?.id"
    desktop-direction="ltr"
    @open-fee="onOpenOtherFeeFromList"
    @open-termination="openTerminationSide"
  />
  <RelatedOtherFeesDrawer
    v-model="relatedDepositDeductionsDrawer"
    :contract="listContract"
    mode="depositDeduction"
    desktop-direction="ltr"
    @open-fee="onOpenDepositDeductionFromList"
    @open-termination="openTerminationSide"
  />
  <RelatedServiceDetailsDrawer
    v-model="relatedServiceDetailsDrawer"
    :invoice="listInvoice"
    desktop-direction="ltr"
    @open-service-detail="onOpenServiceDetailFromList"
  />
</template>
