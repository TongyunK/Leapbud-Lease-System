export type RoomStatus = 'idle' | 'signing' | 'leased' | 'terminating'

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
  image1?: string
  image2?: string
  image3?: string
  description?: string
  remark?: string
  windowConfig?: string
  acConfig?: string
  latestContract?: string
  contractRecords?: string[]
  createdBy: string
  createdAt: string
  subleaseMark?: string
}
