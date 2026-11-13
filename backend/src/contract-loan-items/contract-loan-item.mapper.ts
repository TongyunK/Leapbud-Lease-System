import type { Contract, ContractLoanItem, Customer, Room } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

function iso(d: Date) {
  return d.toISOString();
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

type ContractLite = Pick<Contract, 'id' | 'contractCode' | 'customerId' | 'roomId'> & {
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  room?: Pick<Room, 'id' | 'roomCode' | 'name'> | null;
};

export type ContractLoanItemWithRelations = ContractLoanItem & {
  contract?: ContractLite | null;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const contractLoanItemInclude = {
  contract: {
    select: {
      id: true,
      contractCode: true,
      customerId: true,
      roomId: true,
      customer: { select: { id: true, customerCode: true, name: true } },
      room: { select: { id: true, roomCode: true, name: true } },
    },
  },
  ...auditUserInclude,
} as const;

export function toContractLoanItemListDto(row: ContractLoanItemWithRelations) {
  const c = row.contract;
  return {
    id: row.id,
    contractId: row.contractId,
    contractCode: c?.contractCode ?? '',
    customerId: c?.customerId ?? '',
    customerName: c?.customer?.name ?? '',
    roomId: c?.roomId ?? '',
    roomCode: c?.room?.roomCode ?? '',
    description: row.description,
    quantity: decimalToNumber(row.quantity),
    unitAmount: decimalToNumber(row.unitAmount),
    subtotal: decimalToNumber(row.subtotal),
    remark: row.remark,
    sortOrder: row.sortOrder,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
