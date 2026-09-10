import { RoomTypeOption } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

export type RoomTypeWithAudit = RoomTypeOption & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const roomTypeAuditInclude = auditUserInclude;

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toRoomTypeDto(row: RoomTypeWithAudit) {
  return {
    id: row.id,
    label: row.label,
    tone: row.tone,
    hint: row.hint,
    sortOrder: row.sortOrder,
    active: row.active,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  };
}
