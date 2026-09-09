import { RoomTypeOption } from '@prisma/client';

export function toRoomTypeDto(row: RoomTypeOption) {
  return {
    id: row.id,
    label: row.label,
    tone: row.tone,
    hint: row.hint,
    sortOrder: row.sortOrder,
    active: row.active,
  };
}
