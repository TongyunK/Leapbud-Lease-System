import { Building, Room, Prisma } from '@prisma/client';

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type BuildingWithRooms = Building & { rooms?: Pick<Room, 'id'>[] };

/** 对齐前端 BuildingRecord */
export function toBuildingDto(row: BuildingWithRooms) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    addressEn: row.addressEn,
    manager: row.manager,
    managerPhone: row.managerPhone,
    agreementTemplate: row.agreementTemplate ?? undefined,
    agreementLogo: row.agreementLogo ?? undefined,
    apiTemplateSuffix: row.apiTemplateSuffix ?? undefined,
    logo2: row.logo2 ?? undefined,
    email: row.email,
    workingHours: row.workingHours,
    invoiceTemplate: row.invoiceTemplate ?? undefined,
    invoiceLogo: row.invoiceLogo ?? undefined,
    fpsId: row.fpsId ?? undefined,
    bankAccountHolder: row.bankAccountHolder ?? undefined,
    bankAccount: row.bankAccount ?? undefined,
    chequePaymentBy: row.chequePaymentBy ?? undefined,
    paymentAdvice: row.paymentAdvice ?? undefined,
    receiptTemplate: row.receiptTemplate ?? undefined,
    receiptTopLogo: row.receiptTopLogo ?? undefined,
    receiptLeftLogo: row.receiptLeftLogo ?? undefined,
    receiptRightLogo: row.receiptRightLogo ?? undefined,
    roomIds: (row.rooms ?? []).map((r) => r.id),
    buildingConfig: row.buildingConfig ?? undefined,
    useWbaNumber: row.useWbaNumber ?? undefined,
    active: row.active,
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export type RoomWithBuilding = Room & { building?: Pick<Building, 'name'> | null };

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
    createdBy: row.createdBy,
    createdAt: formatDateTime(row.createdAt),
    subleaseMark: row.subleaseMark ?? undefined,
  };
}
