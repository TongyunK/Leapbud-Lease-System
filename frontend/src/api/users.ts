import request from './request'
import type { UserRecord, UserRole, UserStatus } from '@/types/user'

export function fetchUsers(keyword?: string) {
  return request.get<UserRecord[]>('/users', {
    params: keyword ? { keyword } : undefined,
  })
}

export function createUserApi(payload: {
  account: string
  password: string
  displayName?: string
  role?: UserRole
  status?: UserStatus
  phone?: string
  email?: string
}) {
  return request.post<UserRecord>('/users', payload)
}

export function updateUserApi(
  id: string,
  payload: {
    displayName?: string
    role?: UserRole
    status?: UserStatus
    phone?: string
    email?: string
    password?: string
  },
) {
  return request.patch<UserRecord>(`/users/${id}`, payload)
}

export function deleteUserApi(id: string) {
  return request.delete<{ success: boolean }>(`/users/${id}`)
}
