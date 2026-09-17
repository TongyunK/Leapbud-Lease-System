import type { Customer, CustomerRequirement, RoomConfigOption } from '@prisma/client';
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

type ConfigLite = Pick<RoomConfigOption, 'id' | 'label' | 'type'>;

export type CustomerRequirementWithRelations = CustomerRequirement & {
  _count?: { contracts: number };
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  salesManagerUser?: AuditUserRef | null;
  sizeConfig?: ConfigLite | null;
  acConfig?: ConfigLite | null;
  windowConfig?: ConfigLite | null;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

const configSelect = { id: true, label: true, type: true } as const;

export const customerRequirementInclude = {
  _count: { select: { contracts: true } },
  customer: { select: { id: true, customerCode: true, name: true } },
  salesManagerUser: { select: auditUserSelect },
  sizeConfig: { select: configSelect },
  acConfig: { select: configSelect },
  windowConfig: { select: configSelect },
  ...auditUserInclude,
} as const;

export function toCustomerRequirementDto(row: CustomerRequirementWithRelations) {
  return {
    id: row.id,
    requirementCode: row.requirementCode,
    customerId: row.customerId,
    customerCode: row.customer?.customerCode ?? '',
    customerName: row.customer?.name ?? '',
    salesManagerId: row.salesManagerId,
    salesManager: auditActorLabel(row.salesManagerUser),
    requirementDate: dateOnly(row.requirementDate),
    status: row.status,
    leaseDuration: row.leaseDuration,
    budget: decimalToNumber(row.budget),
    content: row.content,
    remark: row.remark,
    attachment: row.attachment,
    sizeConfigId: row.sizeConfigId,
    sizeConfigLabel: row.sizeConfig?.label ?? '',
    acConfigId: row.acConfigId,
    acConfigLabel: row.acConfig?.label ?? '',
    windowConfigId: row.windowConfigId,
    windowConfigLabel: row.windowConfig?.label ?? '',
    contractCount: row._count?.contracts ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
