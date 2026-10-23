export type MenuType = 'directory' | 'menu'

export type MenuRecord = {
  id: string
  parentId: string | null
  type: MenuType
  /** 中文名称 */
  name: string
  /** 英文名称 */
  nameEn: string
  nameKey: string
  routeName: string
  path: string
  icon: string
  sortOrder: number
  active: boolean
  permission: string
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  children?: MenuRecord[]
}
