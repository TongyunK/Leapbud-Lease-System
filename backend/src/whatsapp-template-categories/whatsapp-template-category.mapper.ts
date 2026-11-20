import { WhatsappTemplateCategory } from '@prisma/client'
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit'

export type WhatsappTemplateCategoryWithAudit = WhatsappTemplateCategory & {
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
  _count?: { templates?: number }
}

export const whatsappTemplateCategoryAuditInclude = {
  ...auditUserInclude,
  _count: { select: { templates: true } },
} as const

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function toWhatsappTemplateCategoryDto(row: WhatsappTemplateCategoryWithAudit) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    badgeTone: row.badgeTone || 'neutral',
    remark: row.remark ?? '',
    sortOrder: row.sortOrder,
    active: row.active,
    templateCount: row._count?.templates ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  }
}
