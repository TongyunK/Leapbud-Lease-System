import request from './request'
import type { UserRecord, UserStatus } from '@/types/user'

export function fetchUsers(keyword?: string) {
  return request.get<UserRecord[]>('/users', {
    params: keyword ? { keyword } : undefined,
  })
}

export function createUserApi(payload: {
  account: string
  password: string
  displayName?: string
  role?: string
  status?: UserStatus
  phone?: string
  email?: string
  buildingIds?: string[]
}) {
  return request.post<UserRecord>('/users', payload)
}

export function updateUserApi(
  id: string,
  payload: {
    displayName?: string
    role?: string
    status?: UserStatus
    phone?: string
    email?: string
    password?: string
    buildingIds?: string[]
  },
) {
  return request.patch<UserRecord>(`/users/${id}`, payload)
}

export function deleteUserApi(id: string) {
  return request.delete<{ success: boolean }>(`/users/${id}`)
}

export function batchDeleteUsersApi(ids: string[]) {
  return request.post<{ deleted: number; failed: number; failures: Array<{ id: string; message: string }> }>(
    '/users/batch-delete',
    { ids },
  )
}
