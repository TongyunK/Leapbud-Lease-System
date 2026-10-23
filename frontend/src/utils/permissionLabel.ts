import type { PermissionItem } from '@/api/permissions'

type Translate = (key: string, values?: Record<string, unknown>) => string
type TranslateExists = (key: string) => boolean

/** 权限模块显示名（跟随语言） */
export function permissionModuleLabel(
  module: string,
  t: Translate,
  te: TranslateExists,
  fallback?: string,
): string {
  const key = `permission.modules.${module}`
  if (te(key)) return t(key)
  const menuKey = module === 'numberingRules' ? 'menu.autoNumbering' : `menu.${module}`
  if (te(menuKey)) return t(menuKey)
  return fallback?.trim() || module
}

/** 动作文案：优先模块特例（如客户需求：跟进/取消），再回退通用动作 */
function permissionActionLabel(
  module: string,
  action: string,
  t: Translate,
  te: TranslateExists,
): string | null {
  const byModuleKey = `permission.actionsByModule.${module}.${action}`
  if (te(byModuleKey)) return t(byModuleKey)
  const actionKey = `permission.actions.${action}`
  if (te(actionKey)) return t(actionKey)
  return null
}

/** 单条权限芯片文案：动作 + 模块（跟随语言） */
export function permissionItemLabel(
  item: Pick<PermissionItem, 'module' | 'action' | 'name'>,
  t: Translate,
  te: TranslateExists,
): string {
  const action = permissionActionLabel(item.module, item.action, t, te)
  const moduleName = permissionModuleLabel(item.module, t, te)
  if (!action || !moduleName) return item.name
  const patternKey = 'permission.itemLabel'
  if (te(patternKey)) return t(patternKey, { action, module: moduleName })
  return `${action}${moduleName}`
}
