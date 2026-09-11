import { ContractPeriod, Contract, Customer, Room, Building } from '@prisma/client';

function dateOnly(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function iso(d: Date) {
  return d.toISOString();
}

type ContractLite = Pick<Contract, 'id' | 'contractCode' | 'customerId' | 'roomId'> & {
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  room?: (Pick<Room, 'id' | 'roomCode' | 'name'> & {
    building?: Pick<Building, 'id' | 'name'> | null;
  }) | null;
};

export type ContractPeriodWithRelations = ContractPeriod & {
  contract?: ContractLite | null;
};

export const contractPeriodInclude = {
  contract: {
    select: {
      id: true,
      contractCode: true,
      customerId: true,
      roomId: true,
      customer: { select: { id: true, customerCode: true, name: true } },
      room: {
        select: {
          id: true,
          roomCode: true,
          name: true,
          building: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

export function toContractPeriodListDto(row: ContractPeriodWithRelations) {
  const c = row.contract;
  return {
    id: row.id,
    contractId: row.contractId,
    contractCode: c?.contractCode ?? '',
    customerId: c?.customerId ?? '',
    customerCode: c?.customer?.customerCode ?? '',
    customerName: c?.customer?.name ?? '',
    roomId: c?.roomId ?? '',
    roomCode: c?.room?.roomCode ?? '',
    roomName: c?.room?.name ?? '',
    buildingName: c?.room?.building?.name ?? '',
    dateType: row.dateType,
    dateUnit: row.dateUnit,
    dateValue: row.dateValue,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    sortOrder: row.sortOrder,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
