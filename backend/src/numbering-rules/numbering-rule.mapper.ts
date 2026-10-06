import { NumberingRule } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';
import { renderNumberingFormat } from './numbering-format.util';

export type NumberingRuleWithAudit = NumberingRule & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const numberingRuleAuditInclude = auditUserInclude;

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toNumberingRuleDto(row: NumberingRuleWithAudit) {
  const nextSeq = Math.max(row.currentSeq + 1, row.startValue);
  return {
    id: row.id,
    bizKey: row.bizKey,
    name: row.name,
    format: row.format,
    startValue: row.startValue,
    resetCycle: row.resetCycle,
    currentSeq: row.currentSeq,
    periodKey: row.periodKey,
    active: row.active,
    sortOrder: row.sortOrder,
    preview: renderNumberingFormat(row.format, new Date(), nextSeq),
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  };
}
