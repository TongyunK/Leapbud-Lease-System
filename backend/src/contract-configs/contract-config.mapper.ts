import { ContractConfigOption, ContractConfigType, Prisma } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export type ContractConfigWithAudit = ContractConfigOption & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const contractConfigAuditInclude = auditUserInclude;

export function toContractConfigDto(row: ContractConfigWithAudit) {
  return {
    id: row.id,
    type: row.type,
    code: row.code,
    label: row.label,
    unitPrice: decimalToNumber(row.unitPrice),
    sortOrder: row.sortOrder,
    active: row.active,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const KEY_DEPOSIT_CODES = {
  door: 'door_key',
  mailbox: 'mailbox_key',
} as const;

export const USAGE_PERIOD_CODE = 'usage';

export function isContractConfigType(v: string): v is ContractConfigType {
  return (Object.values(ContractConfigType) as string[]).includes(v);
}
