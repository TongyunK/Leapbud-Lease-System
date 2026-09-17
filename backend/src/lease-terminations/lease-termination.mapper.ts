import type {
  Building,
  Contract,
  ContractOtherFee,
  Customer,
  LeaseTermination,
  Room,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

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

type ContractLite = Pick<Contract, 'id' | 'contractCode' | 'customerId' | 'roomId'> & {
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  room?: (Pick<Room, 'id' | 'roomCode' | 'name'> & {
    building?: Pick<Building, 'id' | 'name'> | null;
  }) | null;
};

export type ContractOtherFeeRow = ContractOtherFee;

export type LeaseTerminationWithRelations = LeaseTermination & {
  _count?: { otherFees: number };
  contract?: ContractLite | null;
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  room?: (Pick<Room, 'id' | 'roomCode' | 'name'> & {
    building?: Pick<Building, 'id' | 'name'> | null;
  }) | null;
  otherFees?: ContractOtherFeeRow[];
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const leaseTerminationInclude = {
  _count: { select: { otherFees: true } },
  contract: {
    select: {
      id: true,
      contractCode: true,
      customerId: true,
      roomId: true,
      customer: { select: { id: true, customerCode: true, name: true } },
      room: {
        select: {
          id: true,
          roomCode: true,
          name: true,
          building: { select: { id: true, name: true } },
        },
      },
    },
  },
  customer: { select: { id: true, customerCode: true, name: true } },
  room: {
    select: {
      id: true,
      roomCode: true,
      name: true,
      building: { select: { id: true, name: true } },
    },
  },
  otherFees: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] as Prisma.ContractOtherFeeOrderByWithRelationInput[],
  },
  ...auditUserInclude,
} as const;

export function toContractOtherFeeDto(row: ContractOtherFeeRow) {
  return {
    id: row.id,
    contractId: row.contractId,
    terminationId: row.terminationId,
    description: row.description,
    quantity: decimalToNumber(row.quantity),
    unitAmount: decimalToNumber(row.unitAmount),
    subtotal: decimalToNumber(row.subtotal),
    remark: row.remark,
    sortOrder: row.sortOrder,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toLeaseTerminationListDto(row: LeaseTerminationWithRelations) {
  const c = row.contract;
  const customer = row.customer ?? c?.customer;
  const room = row.room ?? c?.room;
  return {
    id: row.id,
    terminationCode: row.terminationCode,
    contractId: row.contractId,
    contractCode: c?.contractCode ?? '',
    customerId: row.customerId,
    customerCode: customer?.customerCode ?? '',
    customerName: customer?.name ?? '',
    roomId: row.roomId,
    roomCode: room?.roomCode ?? '',
    roomName: room?.name ?? '',
    buildingName: room?.building?.name ?? '',
    reason: row.reason,
    terminationDate: dateOnly(row.terminationDate),
    noticeAttachment: row.noticeAttachment,
    doorKeyReturnedQty: row.doorKeyReturnedQty,
    smartCardReturnedQty: row.smartCardReturnedQty,
    siteCondition: row.siteCondition,
    remark: row.remark,
    relatedDepositRefund: row.relatedDepositRefund,
    otherFees: (row.otherFees ?? []).map(toContractOtherFeeDto),
    otherFeeCount: row._count?.otherFees ?? row.otherFees?.length ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
