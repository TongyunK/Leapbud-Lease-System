import type { Contract, Customer, Invoice, InvoiceServiceDetail, Room } from '@prisma/client';
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

type InvoiceLite = Pick<Invoice, 'id' | 'invoiceCode' | 'contractId' | 'customerId' | 'roomId'> & {
  contract?: Pick<Contract, 'id' | 'contractCode'> | null;
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  room?: Pick<Room, 'id' | 'roomCode' | 'name'> | null;
};

export type InvoiceServiceDetailWithRelations = InvoiceServiceDetail & {
  invoice?: InvoiceLite | null;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const invoiceServiceDetailInclude = {
  invoice: {
    select: {
      id: true,
      invoiceCode: true,
      contractId: true,
      customerId: true,
      roomId: true,
      contract: { select: { id: true, contractCode: true } },
      customer: { select: { id: true, customerCode: true, name: true } },
      room: { select: { id: true, roomCode: true, name: true } },
    },
  },
  ...auditUserInclude,
} as const;

export function toInvoiceServiceDetailListDto(row: InvoiceServiceDetailWithRelations) {
  const inv = row.invoice;
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceCode: inv?.invoiceCode ?? '',
    contractId: inv?.contractId ?? inv?.contract?.id ?? '',
    contractCode: inv?.contract?.contractCode ?? '',
    customerId: inv?.customerId ?? inv?.customer?.id ?? '',
    customerName: inv?.customer?.name ?? '',
    roomId: inv?.roomId ?? inv?.room?.id ?? '',
    roomCode: inv?.room?.roomCode ?? '',
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
