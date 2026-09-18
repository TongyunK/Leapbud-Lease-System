import type { DocumentTemplate } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit';

function iso(d: Date) {
  return d.toISOString();
}

export type DocumentTemplateWithRelations = DocumentTemplate & {
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const documentTemplateInclude = {
  ...auditUserInclude,
} as const;

export function toDocumentTemplateDto(row: DocumentTemplateWithRelations) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    fileName: row.fileName,
    storageKey: row.storageKey,
    enabled: row.enabled,
    remark: row.remark,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
