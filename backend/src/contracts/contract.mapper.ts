import type {
  Building,
  Contract,
  ContractOtherFee,
  ContractPeriod,
  Customer,
  CustomerRequirement,
  Room,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
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
  /** 合约级借出物品（不含退租关联） */
  otherFees?: ContractOtherFee[];
  _count?: {
    invoices?: number;
    receivables?: number;
    receipts?: number;
    periods?: number;
    terminations?: number;
    otherFees?: number;
    depositRefunds?: number;
  };
  /** 下属应收「应收金额」合计（列表附加，非 Prisma 字段） */
  receivableAmountTotal?: number;
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
  periods: {
    orderBy: [
      { sortOrder: 'asc' },
      { startDate: 'asc' },
    ] as Prisma.ContractPeriodOrderByWithRelationInput[],
  },
  otherFees: {
    where: { terminationId: null },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ] as Prisma.ContractOtherFeeOrderByWithRelationInput[],
  },
  _count: {
    select: {
      invoices: true,
      receivables: true,
      receipts: true,
      periods: true,
      terminations: true,
      otherFees: true,
      depositRefunds: true,
    },
  },
  ...auditUserInclude,
};

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

export function toContractOtherFeeNestedDto(row: ContractOtherFee) {
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

export function toContractDto(row: ContractWithRelations) {
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
    otherFees: (row.otherFees ?? []).map(toContractOtherFeeNestedDto),
    invoiceCount: row._count?.invoices ?? 0,
    receivableCount: row._count?.receivables ?? 0,
    receivableAmountTotal: row.receivableAmountTotal ?? 0,
    rentCollectionStatus: row.rentCollectionStatus ?? 'uncollected',
    receiptCount: row._count?.receipts ?? 0,
    periodCount: row._count?.periods ?? row.periods?.length ?? 0,
    terminationCount: row._count?.terminations ?? 0,
    otherFeeCount: row._count?.otherFees ?? 0,
    // 与「其他费用」同源（contract_other_fees）；退租关联为可选，导入数据常无 terminationId
    depositDeductionCount: row._count?.otherFees ?? 0,
    depositRefundCount: row._count?.depositRefunds ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
