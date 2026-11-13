import type {
  Building,
  Contract,
  ContractLoanItem,
  ContractPeriod,
  Customer,
  CustomerRequirement,
  Room,
} from '@prisma/client';
import { ContractSettlementItemType, ContractSettlementType, Prisma } from '@prisma/client';
import { auditActorLabel, auditUserInclude, auditUserSelect, type AuditUserRef } from '../common/audit';

function iso(d: Date) {
  return d.toISOString();
}

function dateOnly(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

type RoomLite = Pick<Room, 'id' | 'roomCode' | 'name' | 'buildingId'> & {
  building?: Pick<Building, 'id' | 'name'> | null;
};

export type ContractWithRelations = Contract & {
  room?: RoomLite | null;
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  salesManagerUser?: AuditUserRef | null;
  requirement?: Pick<CustomerRequirement, 'id' | 'requirementCode'> | null;
  periods?: ContractPeriod[];
  /** 合约借出物品 */
  loanItems?: ContractLoanItem[];
  bookingDepositReceipt?: { id: string; receiptCode: string } | null;
  /** 退租结算（每合约至多一单；列表／详情用编号直链） */
  settlements?: Array<{ id: string; settlementCode: string }>;
  _count?: {
    invoices?: number;
    receivables?: number;
    receipts?: number;
    cashFlows?: number;
    periods?: number;
    settlements?: number;
    loanItems?: number;
    depositRefunds?: number;
    /** 按金扣除明细行数（列表附加，非 Prisma _count） */
    depositDeductionItems?: number;
  };
  /** 下属应收「应收金额」合计（列表附加，非 Prisma 字段） */
  receivableAmountTotal?: number;
  /** 下属发票开票金额合计（排除已取消） */
  invoiceAmountTotal?: number;
  /** 下属收据收款金额合计（定金 + 发票收据） */
  receiptAmountTotal?: number;
  /** 定金收据金额合计 */
  bookingDepositReceiptAmountTotal?: number;
  /** 发票收据金额合计 */
  invoiceReceiptAmountTotal?: number;
  /** 借出物品小计合计 */
  loanItemAmountTotal?: number;
  /** 按金扣除金额合计（结算 DAMAGE/PENALTY 明细） */
  depositDeductionAmountTotal?: number;
  /** 按金退还「实退金额」合计（排除已取消） */
  depositRefundAmountTotal?: number;
  /** 是否已退还：退租「已退」按金退还，或取消合约已退定金（列表附加） */
  depositRefundDone?: boolean;
  /** 已取消合约是否仍有暂留另收／定金可办「办理退款」（列表附加） */
  cancelRefundPending?: boolean;
  /** 收租情况（列表附加）：collected=已收租 / uncollected=未收租 */
  rentCollectionStatus?: 'collected' | 'uncollected';
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const contractInclude = {
  room: {
    select: {
      id: true,
      roomCode: true,
      name: true,
      buildingId: true,
      building: { select: { id: true, name: true } },
    },
  },
  customer: { select: { id: true, customerCode: true, name: true } },
  salesManagerUser: { select: auditUserSelect },
  requirement: { select: { id: true, requirementCode: true } },
  bookingDepositReceipt: { select: { id: true, receiptCode: true } },
  periods: {
    orderBy: [
      { sortOrder: 'asc' },
      { startDate: 'asc' },
    ] as Prisma.ContractPeriodOrderByWithRelationInput[],
  },
  loanItems: {
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ] as Prisma.ContractLoanItemOrderByWithRelationInput[],
  },
  /** 退租结算直链（业务上每合约一单） */
  settlements: {
    where: { type: ContractSettlementType.VACATE },
    select: { id: true, settlementCode: true },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  _count: {
    select: {
      /** 有效发票（未取消） */
      invoices: { where: { status: { not: '已取消' } } },
      /** 有效应收（所属发票未取消） */
      receivables: { where: { invoice: { status: { not: '已取消' } } } },
      /** 收据 */
      receipts: true,
      /** 资金流水（入账／出账） */
      cashFlows: true,
      periods: true,
      settlements: { where: { type: ContractSettlementType.VACATE } },
      loanItems: true,
      /** 有效按金退还（未取消） */
      depositRefunds: { where: { status: { not: '已取消' } } },
    },
  },
  ...auditUserInclude,
};

/** 按金扣除明细类型（结算行） */
export const DEPOSIT_DEDUCTION_ITEM_TYPES: ContractSettlementItemType[] = [
  ContractSettlementItemType.DAMAGE_DEDUCTION,
  ContractSettlementItemType.PENALTY_DEDUCTION,
];

export function toContractLoanItemNestedDto(row: ContractLoanItem) {
  return {
    id: row.id,
    description: row.description,
    quantity: decimalToNumber(row.quantity) ?? 0,
    unitAmount: decimalToNumber(row.unitAmount) ?? 0,
    subtotal: decimalToNumber(row.subtotal) ?? 0,
    remark: row.remark,
    sortOrder: row.sortOrder,
  };
}

export function toContractPeriodDto(row: ContractPeriod) {
  return {
    id: row.id,
    contractId: row.contractId,
    dateType: row.dateType,
    dateUnit: row.dateUnit,
    dateValue: row.dateValue,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    sortOrder: row.sortOrder,
  };
}

export function toContractDto(row: ContractWithRelations) {
  const loanItemCount = row.loanItems?.length ?? row._count?.loanItems ?? 0;
  return {
    id: row.id,
    contractCode: row.contractCode,
    roomId: row.roomId,
    roomCode: row.room?.roomCode ?? '',
    roomName: row.room?.name ?? '',
    buildingId: row.room?.buildingId ?? row.room?.building?.id ?? null,
    buildingName: row.room?.building?.name ?? '',
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    salesManagerId: row.salesManagerId,
    salesManager: auditActorLabel(row.salesManagerUser),
    requirementId: row.requirementId,
    requirementCode: row.requirement?.requirementCode ?? '',
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    actualEndDate: dateOnly(row.actualEndDate),
    leaseType: row.leaseType,
    occupancyMode: row.occupancyMode || 'whole',
    partLabel: row.partLabel || '',
    status: row.status,
    roomDeposit: decimalToNumber(row.roomDeposit),
    monthlyRent: decimalToNumber(row.monthlyRent),
    bookingDeposit: decimalToNumber(row.bookingDeposit),
    paymentDate: dateOnly(row.paymentDate),
    paymentCycle: row.paymentCycle,
    paymentMethod: row.paymentMethod || '',
    paymentVoucher: row.paymentVoucher || '',
    bookingDepositReceiptId: row.bookingDepositReceiptId ?? null,
    bookingDepositReceiptCode: row.bookingDepositReceipt?.receiptCode ?? '',
    electricityRate: decimalToNumber(row.electricityRate),
    miscDeposit: decimalToNumber(row.miscDeposit),
    doorKeyQty: row.doorKeyQty,
    doorKeyDeposit: decimalToNumber(row.doorKeyDeposit),
    mailboxKeyQty: row.mailboxKeyQty,
    mailboxKeyDeposit: decimalToNumber(row.mailboxKeyDeposit),
    roomNameText: row.roomNameText,
    subleaseMark: row.subleaseMark,
    attachment: row.attachment,
    remark: row.remark,
    periods: (row.periods ?? []).map(toContractPeriodDto),
    loanItems: (row.loanItems ?? []).map(toContractLoanItemNestedDto),
    invoiceCount: row._count?.invoices ?? 0,
    receivableCount: row._count?.receivables ?? 0,
    receivableAmountTotal: row.receivableAmountTotal ?? 0,
    invoiceAmountTotal: row.invoiceAmountTotal ?? 0,
    receiptAmountTotal: row.receiptAmountTotal ?? 0,
    bookingDepositReceiptAmountTotal: row.bookingDepositReceiptAmountTotal ?? 0,
    invoiceReceiptAmountTotal: row.invoiceReceiptAmountTotal ?? 0,
    loanItemAmountTotal:
      row.loanItemAmountTotal ??
      (row.loanItems ?? []).reduce((sum, f) => sum + (decimalToNumber(f.subtotal) ?? 0), 0),
    depositDeductionAmountTotal: row.depositDeductionAmountTotal ?? 0,
    depositRefundAmountTotal: row.depositRefundAmountTotal ?? 0,
    depositRefundDone: !!row.depositRefundDone,
    cancelRefundPending: !!row.cancelRefundPending,
    rentCollectionStatus: row.rentCollectionStatus ?? 'uncollected',
    receiptCount: row._count?.receipts ?? 0,
    cashFlowCount: row._count?.cashFlows ?? 0,
    periodCount: row._count?.periods ?? row.periods?.length ?? 0,
    terminationCount: row._count?.settlements ?? row.settlements?.length ?? 0,
    vacateSettlementId: row.settlements?.[0]?.id ?? null,
    vacateSettlementCode: row.settlements?.[0]?.settlementCode ?? '',
    /** 借出物品行数 */
    loanItemCount,
    /** 按金扣除：结算 DAMAGE/PENALTY 明细行数 */
    depositDeductionCount: row._count?.depositDeductionItems ?? 0,
    depositRefundCount: row._count?.depositRefunds ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
