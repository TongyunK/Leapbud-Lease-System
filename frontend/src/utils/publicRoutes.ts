/** 无需登录即可访问的路由 name */
export const publicRoutes = [
  'login',
  'register',
  'forgot-password',
] as const

export type PublicRouteName = (typeof publicRoutes)[number]

export function isPublicRoute(name: string | symbol | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false
  return (publicRoutes as readonly string[]).includes(name)
}
