import fs from 'node:fs'

const path = 'src/components/RelatedEntityDrawers.vue'
let src = fs.readFileSync(path, 'utf8')

const map = {
  CustomerDetailDrawer: 'zCustomer',
  RelatedOccupantsDrawer: 'zListOccupants',
  RelatedCustomerRequirementsDrawer: 'zListRequirements',
  CustomerRequirementDetailDrawer: 'zRequirement',
  RelatedContractsDrawer: 'zListContracts', // also req contracts — handle separately
  OccupantDetailDrawer: 'zOccupant',
  BuildingDetailDrawer: 'zBuilding',
  RelatedRoomsDrawer: 'zListRooms',
  RoomDetailDrawer: 'zRoom',
  ContractDetailDrawer: 'zContract',
  InvoiceDetailDrawer: 'zInvoice',
  ReceivableDetailDrawer: 'zReceivable',
  ReceiptDetailDrawer: 'zReceipt',
  ContractPeriodDetailDrawer: 'zPeriod',
  ContractSettlementDetailDrawer: 'zSettlement',
  ContractLoanItemDetailDrawer: 'zLoanItem',
  DepositDeductionDetailDrawer: 'zDepositDeduction',
  DepositRefundDetailDrawer: 'zDepositRefund',
  InvoiceServiceDetailDrawer: 'zServiceDetail',
  RelatedInvoicesDrawer: 'zListInvoices',
  RelatedReceivablesDrawer: 'zListReceivables',
  RelatedReceiptsDrawer: 'zListReceipts',
  RelatedSettlementsDrawer: 'zListSettlements',
  RelatedDepositRefundsDrawer: 'zListDepositRefunds',
  RelatedPeriodsDrawer: 'zListPeriods',
  RelatedLoanItemsDrawer: 'zListLoanItems',
  RelatedDepositDeductionsDrawer: 'zListDepositDeductions',
  RelatedServiceDetailsDrawer: 'zListServiceDetails',
}

// Fix receivableDrawerZIndex → zReceivable first
src = src.replace(':z-index="receivableDrawerZIndex"', ':z-index="zReceivable"')

for (const [comp, zVar] of Object.entries(map)) {
  const re = new RegExp(`<(${comp})(\\s[^>]*)?>`, 'g')
  src = src.replace(re, (full, name, attrs = '') => {
    if (/:z-index=/.test(attrs) || /:z-index=/.test(full)) {
      // replace existing binding
      return full.replace(/:z-index="[^"]*"/, `:z-index="${zVar}"`)
    }
    return `<${name}${attrs}\n    :z-index="${zVar}"\n  >`
  })
}

// RelatedContractsDrawer appears twice — first is req contracts
let seenContracts = 0
src = src.replace(/<RelatedContractsDrawer([\s\S]*?):z-index="zListContracts"/g, (full) => {
  seenContracts += 1
  if (seenContracts === 1) {
    return full.replace(':z-index="zListContracts"', ':z-index="zListReqContracts"')
  }
  return full
})

fs.writeFileSync(path, src, 'utf8')
console.log('bound z-index in RelatedEntityDrawers')
