import request from './request'
import type { RoomConfigOption, RoomConfigType } from '@/types/room-config'

export function fetchRoomConfigs(params?: { type?: RoomConfigType; activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.type) query.type = params.type
  if (params?.activeOnly === false) query.activeOnly = 'false'
  return request.get<RoomConfigOption[]>('/room-configs', { params: query })
}

export function createRoomConfigApi(payload: {
  type: RoomConfigType
  label?: string
  minSqft?: number | null
  maxSqft?: number | null
  brand?: string
  model?: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<RoomConfigOption>('/room-configs', payload)
}

export function updateRoomConfigApi(
  id: string,
  payload: {
    label?: string
    minSqft?: number | null
    maxSqft?: number | null
    brand?: string
    model?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<RoomConfigOption>(`/room-configs/${id}`, payload)
}

export function deleteRoomConfigApi(id: string) {
  return request.delete<{ success: boolean }>(`/room-configs/${id}`)
}

export function batchDeleteRoomConfigsApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/room-configs/batch-delete',
    { ids },
  )
}

function boundNum(v: number | null | undefined): number | null {
  if (v == null || v === ('' as unknown as number)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function matchesSizeRange(sizeSqft: number, min: number | null, max: number | null): boolean {
  if (min != null && max != null) return sizeSqft >= min && sizeSqft < max
  if (min != null && max == null) return sizeSqft >= min
  if (min == null && max != null) return sizeSqft < max
  return false
}

/** 区间跨度：闭合区间用 max-min；单侧开区间用较大权重，避免误抢更贴合的闭合区间 */
function rangeSpan(min: number | null, max: number | null): number {
  if (min != null && max != null) return Math.max(0, max - min)
  return Number.POSITIVE_INFINITY
}

/**
 * 按呎数匹配尺寸区间（含下界、不含上界；无上界则 ≥min；无下界则 <max）。
 * 多条命中时优先更窄的闭合区间，再按 sortOrder。
 */
export function matchSizeOption(
  options: RoomConfigOption[],
  sizeSqft: number,
): RoomConfigOption | undefined {
  if (!Number.isFinite(sizeSqft)) return undefined
  const hits = options
    .filter((o) => o.type === 'size' && o.active)
    .map((o) => ({ opt: o, min: boundNum(o.minSqft), max: boundNum(o.maxSqft) }))
    .filter(({ min, max }) => matchesSizeRange(sizeSqft, min, max))
  if (!hits.length) return undefined
  hits.sort((a, b) => {
    const spanDiff = rangeSpan(a.min, a.max) - rangeSpan(b.min, b.max)
    if (spanDiff !== 0) return spanDiff
    return (a.opt.sortOrder ?? 0) - (b.opt.sortOrder ?? 0)
  })
  return hits[0]?.opt
}
