import request from './request'
import type { MenuRecord, MenuType } from '@/types/menu'

export function fetchMenus(params?: { activeOnly?: boolean; flat?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.activeOnly !== undefined) query.activeOnly = String(params.activeOnly)
  if (params?.flat !== undefined) query.flat = String(params.flat)
  return request.get<MenuRecord[]>('/menus', { params: query })
}

/** 当前登录用户侧栏菜单树（按角色） */
export function fetchNavMenus() {
  return request.get<MenuRecord[]>('/menus/nav')
}

export function createMenuApi(payload: {
  parentId?: string | null
  type: MenuType
  name: string
  nameEn?: string
  nameKey?: string
  routeName?: string
  path?: string
  icon?: string
  sortOrder?: number
  active?: boolean
  permission?: string
}) {
  return request.post<MenuRecord>('/menus', payload)
}

export function updateMenuApi(
  id: string,
  payload: {
    parentId?: string | null
    type?: MenuType
    name?: string
    nameEn?: string
    nameKey?: string
    routeName?: string
    path?: string
    icon?: string
    sortOrder?: number
    active?: boolean
    permission?: string
  },
) {
  return request.patch<MenuRecord>(`/menus/${id}`, payload)
}

/** 同级菜单批量排序 */
export function reorderMenusApi(items: Array<{ id: string; sortOrder: number }>) {
  return request.patch<{ success: boolean }>('/menus/reorder', { items })
}

export function deleteMenuApi(id: string) {
  return request.delete<{ success: boolean }>(`/menus/${id}`)
}
