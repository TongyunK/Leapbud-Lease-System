export type MenuType = 'directory' | 'menu'

export type MenuRecord = {
  id: string
  parentId: string | null
  type: MenuType
  name: string
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
