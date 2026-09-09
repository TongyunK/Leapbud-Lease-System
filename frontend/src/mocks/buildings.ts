/**
 * 前端 mock 入口（类型包装）
 * 实际数据：./mockData.js
 */
import { getMockBuildings } from './mockData.js'
import type { BuildingRecord } from '@/types/building'

export const mockBuildings: BuildingRecord[] = getMockBuildings()
