/**
 * 前端 mock 入口（类型包装）
 * 实际数据：./mockData.js
 */
import { getMockRooms } from './mockData.js'
import type { RoomRecord } from '@/types/room'

export const mockRooms: RoomRecord[] = getMockRooms()
