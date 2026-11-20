import request from './request'

export interface LoginPayload {
  account: string
  password: string
  captchaId?: string
  captchaCode?: string
}

export interface LoginOptions {
  captchaEnabled: boolean
}

export interface LoginCaptchaResult {
  captchaId: string
  imageDataUrl: string
}

export interface LoginResult {
  accessToken: string
  user: {
    id: string
    account: string
    displayName?: string
    roles?: string[]
    role?: string
  }
}

export interface RegisterPayload {
  contactName: string
  contactPhone: string
  whatsapp?: string
  email: string
  password: string
}

export interface ForgotPasswordSendCodeResult {
  success: boolean
  sent: boolean
  emailMasked?: string
  message: string
}

export interface ForgotPasswordResetResult {
  success: boolean
  message: string
}

export interface AuthMeResult {
  id: string
  account: string
  displayName?: string
  email?: string
  role?: string
  roleName?: string
  roles?: string[]
  phone?: string
}

export async function loginApi(payload: LoginPayload): Promise<LoginResult> {
  const { data } = await request.post<LoginResult>(
    '/auth/login',
    {
      account: payload.account,
      password: payload.password,
      captchaId: payload.captchaId,
      captchaCode: payload.captchaCode,
    },
    { silentError: true },
  )
  return data
}

export function fetchLoginOptionsApi() {
  return request.get<LoginOptions>('/auth/login-options', { silentError: true })
}

export function fetchLoginCaptchaApi() {
  return request.get<LoginCaptchaResult>('/auth/captcha', { silentError: true })
}

export function fetchMeApi() {
  return request.get<AuthMeResult>('/auth/me')
}

export function changePasswordApi(payload: { currentPassword: string; newPassword: string }) {
  return request.post('/auth/change-password', payload)
}

export function changeEmailApi(payload: { email: string; currentPassword: string }) {
  return request.post<{ success: boolean; user: AuthMeResult }>(
    '/auth/change-email',
    payload,
    { silentError: true },
  )
}

export function registerApi(payload: RegisterPayload) {
  return request.post('/auth/register', payload)
}

/** 忘记密码：发送邮箱验证码（locale 决定邮件语言） */
export function sendForgotPasswordCodeApi(account: string, locale?: string) {
  return request.post<ForgotPasswordSendCodeResult>(
    '/auth/forgot-password/send-code',
    { account, locale },
    { silentError: true },
  )
}

/** 忘记密码：校验验证码并重置 */
export function resetPasswordWithCodeApi(payload: {
  account: string
  code: string
  newPassword: string
  locale?: string
}) {
  return request.post<ForgotPasswordResetResult>('/auth/forgot-password/reset', payload, {
    silentError: true,
  })
}

/** @deprecated 使用 sendForgotPasswordCodeApi */
export function forgotPasswordApi(payload: { account: string; channel?: 'sms' | 'email' }) {
  return sendForgotPasswordCodeApi(payload.account)
}

export function sendCaptchaApi(account: string) {
  return request.post('/auth/captcha', { account }, { silentError: true })
}
