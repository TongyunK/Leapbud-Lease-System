import { Building, ContractSettlementType, Room, Prisma } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from './audit';

/** 房间图片行（与 Prisma RoomImage 对齐；避免客户端未 generate 时类型断裂） */
export type RoomImageRow = {
  id: string;
  roomId: string;
  fileName: string;
  storageKey: string;
  sortOrder: number;
};

/** 真正外部地址（无本地文件）；相对/旧 /upload 路径都算本地 uploads 下文件 */
export function isExternalRoomImageKey(storageKey: string): boolean {
  const key = (storageKey || '').trim();
  return /^https?:\/\//i.test(key);
}

/** 去掉前导 /，得到相对 uploads 根的路径 */
export function roomImageStorageRel(storageKey: string): string {
  return (storageKey || '').trim().replace(/^\/+/, '');
}

/**
 * 浏览器可直链的图片 URL（由入口 Nginx /files/ 静态提供，带缓存）。
 * 相对键 rooms/... → /files/rooms/...；旧 /upload/... → /files/upload/...
 */
export function roomImagePublicUrl(storageKey: string): string | undefined {
  const key = (storageKey || '').trim();
  if (!key) return undefined;
  if (/^https?:\/\//i.test(key)) return key;
  const rel = roomImageStorageRel(key);
  if (!rel || rel.includes('..')) return undefined;
  return `/files/${rel}`;
}

export function toRoomImageDto(row: RoomImageRow) {
  const storageKey = row.storageKey ?? '';
  return {
    id: row.id,
    roomId: row.roomId,
    fileName: row.fileName,
    sortOrder: row.sortOrder,
    publicUrl: roomImagePublicUrl(storageKey),
  };
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export type BuildingWhatsappTemplateSummary = {
  id: string
  label: string
  templateName: string
  categoryId: string
  categoryCode: string
  categoryLabel: string
  active: boolean
}

export type BuildingWithRooms = Building & {
  rooms?: Pick<Room, 'id'>[];
  agreementTemplateRef?: { id: string; name: string; fileName: string } | null;
  invoiceTemplateRef?: { id: string; name: string; fileName: string } | null;
  receiptTemplateRef?: { id: string; name: string; fileName: string } | null;
  whatsappBusinessNumberRef?: { id: string; label: string; phoneNumber: string } | null;
  whatsappTemplateLinks?: Array<{
    template: {
      id: string
      label: string
      templateName: string
      active: boolean
      category: { id: string; code: string; label: string }
    }
  }>;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

const templateRefSelect = { id: true, name: true, fileName: true } as const;
const whatsappNumberRefSelect = { id: true, label: true, phoneNumber: true } as const;
const whatsappTemplateListSelect = {
  id: true,
  label: true,
  templateName: true,
  active: true,
  category: { select: { id: true, code: true, label: true } },
} as const;

export const buildingListInclude = {
  rooms: { select: { id: true } },
  agreementTemplateRef: { select: templateRefSelect },
  invoiceTemplateRef: { select: templateRefSelect },
  receiptTemplateRef: { select: templateRefSelect },
  whatsappBusinessNumberRef: { select: whatsappNumberRefSelect },
  whatsappTemplateLinks: {
    select: {
      template: { select: whatsappTemplateListSelect },
    },
  },
  ...auditUserInclude,
} as const;

/** 对齐前端 BuildingRecord */
export function toBuildingDto(row: BuildingWithRooms) {
  const whatsappTemplates: BuildingWhatsappTemplateSummary[] = [...(row.whatsappTemplateLinks ?? [])]
    .map((link) => link.template)
    .filter(Boolean)
    .sort((a, b) => a.category.label.localeCompare(b.category.label, 'zh-Hant'))
    .map((t) => ({
      id: t.id,
      label: t.label,
      templateName: t.templateName,
      categoryId: t.category.id,
      categoryCode: t.category.code,
      categoryLabel: t.category.label,
      active: t.active,
    }))
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    addressEn: row.addressEn,
    manager: row.manager,
    managerPhone: row.managerPhone,
    agreementTemplateId: row.agreementTemplateId ?? null,
    agreementTemplateName: row.agreementTemplateRef?.name ?? '',
    agreementTemplateFileName: row.agreementTemplateRef?.fileName ?? '',
    whatsappTemplates,
    email: row.email,
    workingHours: row.workingHours,
    invoiceTemplateId: row.invoiceTemplateId ?? null,
    invoiceTemplateName: row.invoiceTemplateRef?.name ?? '',
    invoiceTemplateFileName: row.invoiceTemplateRef?.fileName ?? '',
    fpsId: row.fpsId ?? undefined,
    bankAccountHolder: row.bankAccountHolder ?? undefined,
    bankAccount: row.bankAccount ?? undefined,
    chequePaymentBy: row.chequePaymentBy ?? undefined,
    paymentAdvice: row.paymentAdvice ?? undefined,
    receiptTemplateId: row.receiptTemplateId ?? null,
    receiptTemplateName: row.receiptTemplateRef?.name ?? '',
    receiptTemplateFileName: row.receiptTemplateRef?.fileName ?? '',
    roomIds: (row.rooms ?? []).map((r) => r.id),
    whatsappBusinessNumberId: row.whatsappBusinessNumberId ?? null,
    whatsappBusinessNumberLabel: row.whatsappBusinessNumberRef?.label ?? '',
    whatsappBusinessPhoneNumber: row.whatsappBusinessNumberRef?.phoneNumber ?? '',
    whatsappAutoSendEnabled: row.whatsappAutoSendEnabled,
    active: row.active,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export type RoomWithBuilding = Room & {
  _count?: {
    contracts: number;
    invoices: number;
    contractSettlements: number;
    depositRefunds: number;
  };
  building?: Pick<Building, 'name'> | null;
  images?: RoomImageRow[];
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const roomListInclude = {
  _count: {
    select: {
      contracts: true,
      invoices: true,
      contractSettlements: { where: { type: ContractSettlementType.VACATE } },
      depositRefunds: true,
    },
  },
  building: { select: { name: true } },
  images: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  ...auditUserInclude,
};

/** 对齐前端 RoomRecord */
export function toRoomDto(row: RoomWithBuilding) {
  return {
    id: row.id,
    roomCode: row.roomCode,
    name: row.name,
    roomType: row.roomType,
    buildingId: row.buildingId,
    buildingName: row.building?.name ?? '',
    status: row.status,
    serialNo: row.serialNo,
    monthlyRent: decimalToNumber(row.monthlyRent),
    dailyRent: decimalToNumber(row.dailyRent),
    hourlyRent: decimalToNumber(row.hourlyRent),
    sizeSqft: decimalToNumber(row.sizeSqft),
    images: (row.images ?? []).map(toRoomImageDto),
    description: row.description ?? undefined,
    remark: row.remark ?? undefined,
    windowConfig: row.windowConfig ?? undefined,
    acConfig: row.acConfig ?? undefined,
    latestContract: row.latestContract ?? undefined,
    contractCount: row._count?.contracts ?? 0,
    invoiceCount: row._count?.invoices ?? 0,
    terminationCount: row._count?.contractSettlements ?? 0,
    depositRefundCount: row._count?.depositRefunds ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
    subleaseMark: row.subleaseMark ?? undefined,
    leaseCapability: (row as { leaseCapability?: string }).leaseCapability ?? 'flexible',
    splitLabels: Array.isArray((row as { splitLabels?: string[] }).splitLabels)
      ? [...((row as { splitLabels: string[] }).splitLabels)]
      : [],
    allowShortTerm: Boolean((row as { allowShortTerm?: boolean }).allowShortTerm),
  };
}
