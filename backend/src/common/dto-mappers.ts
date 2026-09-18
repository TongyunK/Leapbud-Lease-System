import { Building, Room, Prisma } from '@prisma/client';
import { auditActorLabel, auditUserInclude, type AuditUserRef } from './audit';

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type BuildingWithRooms = Building & {
  rooms?: Pick<Room, 'id'>[];
  agreementTemplateRef?: { id: string; name: string; fileName: string } | null;
  invoiceTemplateRef?: { id: string; name: string; fileName: string } | null;
  receiptTemplateRef?: { id: string; name: string; fileName: string } | null;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

const templateRefSelect = { id: true, name: true, fileName: true } as const;

export const buildingListInclude = {
  rooms: { select: { id: true } },
  agreementTemplateRef: { select: templateRefSelect },
  invoiceTemplateRef: { select: templateRefSelect },
  receiptTemplateRef: { select: templateRefSelect },
  ...auditUserInclude,
} as const;

/** 对齐前端 BuildingRecord */
export function toBuildingDto(row: BuildingWithRooms) {
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
    agreementLogo: row.agreementLogo ?? undefined,
    apiTemplateSuffix: row.apiTemplateSuffix ?? undefined,
    logo2: row.logo2 ?? undefined,
    email: row.email,
    workingHours: row.workingHours,
    invoiceTemplateId: row.invoiceTemplateId ?? null,
    invoiceTemplateName: row.invoiceTemplateRef?.name ?? '',
    invoiceTemplateFileName: row.invoiceTemplateRef?.fileName ?? '',
    invoiceLogo: row.invoiceLogo ?? undefined,
    fpsId: row.fpsId ?? undefined,
    bankAccountHolder: row.bankAccountHolder ?? undefined,
    bankAccount: row.bankAccount ?? undefined,
    chequePaymentBy: row.chequePaymentBy ?? undefined,
    paymentAdvice: row.paymentAdvice ?? undefined,
    receiptTemplateId: row.receiptTemplateId ?? null,
    receiptTemplateName: row.receiptTemplateRef?.name ?? '',
    receiptTemplateFileName: row.receiptTemplateRef?.fileName ?? '',
    receiptTopLogo: row.receiptTopLogo ?? undefined,
    receiptLeftLogo: row.receiptLeftLogo ?? undefined,
    receiptRightLogo: row.receiptRightLogo ?? undefined,
    roomIds: (row.rooms ?? []).map((r) => r.id),
    buildingConfig: row.buildingConfig ?? undefined,
    useWbaNumber: row.useWbaNumber ?? undefined,
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
    leaseTerminations: number;
    depositRefunds: number;
  };
  building?: Pick<Building, 'name'> | null;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export const roomListInclude = {
  _count: {
    select: {
      contracts: true,
      invoices: true,
      leaseTerminations: true,
      depositRefunds: true,
    },
  },
  building: { select: { name: true } },
  ...auditUserInclude,
} as const;

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
    image1: row.image1 ?? undefined,
    image2: row.image2 ?? undefined,
    image3: row.image3 ?? undefined,
    description: row.description ?? undefined,
    remark: row.remark ?? undefined,
    windowConfig: row.windowConfig ?? undefined,
    acConfig: row.acConfig ?? undefined,
    latestContract: row.latestContract ?? undefined,
    contractRecords: row.contractRecords ?? [],
    contractCount: row._count?.contracts ?? 0,
    invoiceCount: row._count?.invoices ?? 0,
    terminationCount: row._count?.leaseTerminations ?? 0,
    depositRefundCount: row._count?.depositRefunds ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    createdAt: formatDateTime(row.createdAt),
    updatedBy: auditActorLabel(row.updatedByUser),
    updatedAt: formatDateTime(row.updatedAt),
    subleaseMark: row.subleaseMark ?? undefined,
  };
}
