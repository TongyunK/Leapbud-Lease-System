import { NumberingResetCycle, NumberingRule } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';
import { periodKeyOf, renderNumberingFormat } from './numbering-format.util';

export type NumberingRuleWithAudit = NumberingRule & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const numberingRuleAuditInclude = auditUserInclude;

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 与 allocateCode 一致：空 periodKey 不重置；仅跨周期时回到 startValue */
export function nextSeqForPreview(row: Pick<NumberingRule, 'currentSeq' | 'startValue' | 'resetCycle' | 'periodKey'>, now = new Date()) {
  let currentSeq = row.currentSeq;
  if (row.resetCycle !== NumberingResetCycle.none) {
    const nextPeriod = periodKeyOf(now, row.resetCycle);
    if (row.periodKey && nextPeriod !== row.periodKey) {
      currentSeq = row.startValue - 1;
    }
  }
  return Math.max(currentSeq + 1, row.startValue);
}

export function toNumberingRuleDto(row: NumberingRuleWithAudit) {
  const nextSeq = nextSeqForPreview(row);
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
