import type {
  Building,
  Contract,
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

type RoomLite = Pick<Room, 'id' | 'roomCode' | 'name'> & {
  building?: Pick<Building, 'id' | 'name'> | null;
};

export type ContractWithRelations = Contract & {
  room?: RoomLite | null;
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  salesManagerUser?: AuditUserRef | null;
  requirement?: Pick<CustomerRequirement, 'id' | 'requirementCode'> | null;
  periods?: ContractPeriod[];
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const contractInclude = {
  room: {
    select: {
      id: true,
      roomCode: true,
      name: true,
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

export function toContractDto(row: ContractWithRelations) {
  return {
    id: row.id,
    contractCode: row.contractCode,
    roomId: row.roomId,
    roomCode: row.room?.roomCode ?? '',
    roomName: row.room?.name ?? '',
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
    status: row.status,
    roomDeposit: decimalToNumber(row.roomDeposit),
    monthlyRent: decimalToNumber(row.monthlyRent),
    bookingDeposit: decimalToNumber(row.bookingDeposit),
    paymentCycle: row.paymentCycle,
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
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
