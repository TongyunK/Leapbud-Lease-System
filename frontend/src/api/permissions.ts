import request from './request'

export type PermissionItem = {
  code: string
  module: string
  action: string
  name: string
  sortOrder: number
}

export type PermissionModuleGroup = {
  module: string
  moduleName: string
  items: PermissionItem[]
}

export function fetchMyPermissionsApi() {
  return request.get<{ codes: string[]; adminExclusiveCodes?: string[] }>('/permissions/mine')
}

export function fetchPermissionCatalogApi() {
  return request.get<PermissionModuleGroup[]>('/permissions/catalog')
}

export function fetchRolePermissionsApi(roleId: string) {
  return request.get<{ codes: string[] }>(`/roles/${roleId}/permissions`)
}

export function assignRolePermissionsApi(roleId: string, codes: string[]) {
  return request.put<{ roleId: string; codes: string[] }>(`/roles/${roleId}/permissions`, { codes })
}
