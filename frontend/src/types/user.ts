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
  /** 最后登录时间；未登录过为空 */
  lastLoginAt?: string
  /** 连续密码错误次数 */
  failedLoginCount?: number
  /** 登录锁定截止时间（展示用）；未锁定为空 */
  loginLockedUntil?: string | null
  /** 当前是否仍在登录冷却锁定中 */
  loginLocked?: boolean
  /** 距自动解锁剩余分钟（向上取整；未锁定为空） */
  loginLockedRemainingMinutes?: number | null
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}
