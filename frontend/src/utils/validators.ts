/** 手机号：内地 11 位 / 香港 8 位数字 */
const CN_MOBILE = /^1[3-9]\d{9}$/
const HK_MOBILE = /^[4-9]\d{7}$/

/** 系统账号：字母开头，允许字母数字下划线，4–32 位 */
const ACCOUNT = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/

/** 登录账号输入框允许的字符（数字、字母、下划线） */
export const ACCOUNT_INPUT_PATTERN = /^[a-zA-Z0-9_]*$/

export function isPhoneNumber(value: string): boolean {
  const trimmed = value.trim()
  return CN_MOBILE.test(trimmed) || HK_MOBILE.test(trimmed)
}

export function isAccount(value: string): boolean {
  return ACCOUNT.test(value.trim())
}

/** 手机号或系统账号均视为合法登录标识 */
export function isValidLoginAccount(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return isPhoneNumber(trimmed) || isAccount(trimmed)
}

export function sanitizeAccountInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '')
}
