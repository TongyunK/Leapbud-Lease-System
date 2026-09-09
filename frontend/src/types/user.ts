export type UserRole = 'admin' | 'user'
export type UserStatus = 'active' | 'disabled'

export interface UserRecord {
  id: string
  account: string
  displayName: string
  role: UserRole
  roles?: string[]
  status: UserStatus
  phone: string
  email: string
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
