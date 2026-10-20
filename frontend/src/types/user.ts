export type UserStatus = 'active' | 'disabled'

export interface UserRecord {
  id: string
  account: string
  displayName: string
  /** 角色编码（对应角色管理 roles.code） */
  role: string
  /** 角色名称（来自角色管理） */
  roleName?: string
  roles?: string[]
  status: UserStatus
  phone: string
  email: string
  buildingIds?: string[]
  buildings?: Array<{ id: string; name: string }>
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
