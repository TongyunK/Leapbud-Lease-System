import request from './request'
import type { RoleRecord } from '@/types/role'

export function fetchRoles(params?: { keyword?: string; activeOnly?: boolean }) {
  const query: Record<string, string> = {}
  if (params?.keyword) query.keyword = params.keyword
  if (params?.activeOnly !== undefined) query.activeOnly = String(params.activeOnly)
  return request.get<RoleRecord[]>('/roles', { params: query })
}

export function createRoleApi(payload: {
  code: string
  name: string
  description?: string
  sortOrder?: number
  active?: boolean
}) {
  return request.post<RoleRecord>('/roles', payload)
}

export function updateRoleApi(
  id: string,
  payload: {
    code?: string
    name?: string
    description?: string
    sortOrder?: number
    active?: boolean
  },
) {
  return request.patch<RoleRecord>(`/roles/${id}`, payload)
}

export function deleteRoleApi(id: string) {
  return request.delete<{ success: boolean }>(`/roles/${id}`)
}

export function batchDeleteRolesApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/roles/batch-delete',
    { ids },
  )
}

export function fetchRoleMenusApi(id: string) {
  return request.get<{ menuIds: string[] }>(`/roles/${id}/menus`)
}

export function assignRoleMenusApi(id: string, menuIds: string[]) {
  return request.put<{ menuIds: string[] }>(`/roles/${id}/menus`, { menuIds })
}

export type RoleMenuMatrix = {
  roles: Array<{ id: string; code: string; name: string; isSystem: boolean }>
  menus: import('@/types/menu').MenuRecord[]
  grants: Record<string, string[]>
}

export function fetchRoleMenuMatrixApi() {
  return request.get<RoleMenuMatrix>('/roles/menu-matrix')
}

export function saveRoleMenuMatrixApi(grants: Array<{ roleId: string; menuIds: string[] }>) {
  return request.put<RoleMenuMatrix>('/roles/menu-matrix', { grants })
}
