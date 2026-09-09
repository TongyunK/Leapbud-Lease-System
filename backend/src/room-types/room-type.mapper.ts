import { RoomTypeOption } from '@prisma/client';

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toRoomTypeDto(row: RoomTypeOption) {
  return {
    id: row.id,
    label: row.label,
    tone: row.tone,
    hint: row.hint,
    sortOrder: row.sortOrder,
    active: row.active,
    createdBy: row.createdBy,
    createdAt: formatDateTime(row.createdAt),
    updatedBy: row.updatedBy,
    updatedAt: formatDateTime(row.updatedAt),
  };
}
