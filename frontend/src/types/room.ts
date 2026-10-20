export type RoomStatus = 'idle' | 'signing' | 'leased' | 'terminating'

/** 房间图片（不限数量） */
export interface RoomImageRecord {
  id: string
  roomId: string
  fileName: string
  sortOrder: number
  /** 公开/外部地址时可直接作 img src；上传文件无此字段 */
  publicUrl?: string
}

export interface RoomRecord {
  id: string
  roomCode: string
  name: string
  roomType: string
  buildingId: string
  buildingName: string
  status: RoomStatus
  serialNo: string
  monthlyRent: number
  dailyRent: number
  hourlyRent: number
  sizeSqft: number
  images?: RoomImageRecord[]
  description?: string
  remark?: string
  windowConfig?: string
  acConfig?: string
  latestContract?: string
  contractCount?: number
  invoiceCount?: number
  terminationCount?: number
  depositRefundCount?: number
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  subleaseMark?: string
}
