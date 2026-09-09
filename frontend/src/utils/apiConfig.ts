/**
 * API baseURL 多模式：
 * - 开发：走 Vite 代理 `/api`
 * - Docker 同源：相对路径 `/api`
 * - 静态站外置：通过 VITE_API_ORIGIN 指定
 */
export function getApiBaseUrl(): string {
  const origin = import.meta.env.VITE_API_ORIGIN as string | undefined
  if (origin) {
    return `${origin.replace(/\/$/, '')}/api`
  }
  return '/api'
}
