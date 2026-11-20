import { WhatsappTemplate } from '@prisma/client'
import { auditActorLabel, auditUserInclude, type AuditUserRef } from '../common/audit'
import { roomImagePublicUrl } from '../common/dto-mappers'

export type WhatsappTemplateBuildingLink = {
  buildingId: string
  building?: { id: string; name: string } | null
}

export type WhatsappTemplateWithAudit = WhatsappTemplate & {
  buildings?: WhatsappTemplateBuildingLink[]
  category?: { id: string; code: string; label: string; badgeTone: string } | null
  createdByUser?: AuditUserRef | null
  updatedByUser?: AuditUserRef | null
}

export const whatsappTemplateAuditInclude = {
  ...auditUserInclude,
  buildings: {
    include: { building: { select: { id: true, name: true } } },
    orderBy: { building: { name: 'asc' as const } },
  },
  category: { select: { id: true, code: true, label: true, badgeTone: true } },
} as const

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function sanitizeWhatsappDiagramKey(raw?: string | null): string {
  let key = String(raw ?? '').trim()
  if (!key) return ''
  if (key.includes('..')) return ''
  if (/^https?:\/\//i.test(key)) return key
  key = key.replace(/^\/+/, '').replace(/^files\//, '')
  return key
}

export function toWhatsappTemplateDto(row: WhatsappTemplateWithAudit) {
  const diagramKey = row.diagramKey ?? ''
  const buildings = [...(row.buildings ?? [])]
    .map((link) => ({
      id: link.building?.id ?? link.buildingId,
      name: link.building?.name ?? '',
    }))
    .filter((b) => !!b.id)
  return {
    id: row.id,
    buildingIds: buildings.map((b) => b.id),
    buildings,
    buildingNames: buildings.map((b) => b.name || b.id).join('、'),
    categoryId: row.categoryId,
    categoryCode: row.category?.code ?? '',
    categoryLabel: row.category?.label ?? '',
    categoryBadgeTone: row.category?.badgeTone || 'neutral',
    label: row.label,
    templateName: row.templateName,
    remark: row.remark ?? '',
    diagramKey,
    diagramUrl: roomImagePublicUrl(diagramKey) ?? '',
    sortOrder: row.sortOrder,
    active: row.active,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  }
}
