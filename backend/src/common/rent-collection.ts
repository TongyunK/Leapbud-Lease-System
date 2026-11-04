import { Prisma } from '@prisma/client'

/** 收租情况：已收租 / 未收租 */
export type RentCollectionStatus = 'collected' | 'uncollected'

/** 计入收租判定的发票类型（与 invoice-auto 常量一致）：按金 + 缴费周期租金 */
export const RENT_COLLECTION_INVOICE_TYPES = ['Deposit', '1, Charging Period'] as const

/**
 * 未收租：存在未取消的按金／租金发票，且对应应收金额 > 0（含逾期未缴）。
 * 已收租：已有此类发票，且全部应收已缴清（应收金额 ≤ 0）。
 * 尚无按金／租金发票时视为未收租（新建后未缴清首月+按金）。
 */
export function rentCollectionInvoiceFilter(): Prisma.InvoiceWhereInput {
  return {
    status: { not: '已取消' },
    invoiceType: { in: [...RENT_COLLECTION_INVOICE_TYPES] },
  }
}

export function unpaidRentReceivableWhere(
  contractIds?: string[],
): Prisma.ReceivableWhereInput {
  return {
    ...(contractIds?.length ? { contractId: { in: contractIds } } : {}),
    receivableAmount: { gt: 0 },
    invoice: rentCollectionInvoiceFilter(),
  }
}

export function contractWhereUncollectedRent(): Prisma.ContractWhereInput {
  return {
    OR: [
      // 尚无按金／租金发票
      { NOT: { invoices: { some: rentCollectionInvoiceFilter() } } },
      // 有未缴清的按金／租金应收
      { receivables: { some: unpaidRentReceivableWhere() } },
    ],
  }
}

export function contractWhereCollectedRent(): Prisma.ContractWhereInput {
  return {
    AND: [
      { invoices: { some: rentCollectionInvoiceFilter() } },
      { NOT: { receivables: { some: unpaidRentReceivableWhere() } } },
    ],
  }
}
