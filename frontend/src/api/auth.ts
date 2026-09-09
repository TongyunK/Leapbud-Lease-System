import request from './request'

export interface LoginPayload {
  account: string
  password: string
  captcha?: string
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

export interface ForgotPasswordPayload {
  account: string
  channel: 'sms' | 'email'
}

export async function loginApi(payload: LoginPayload): Promise<LoginResult> {
  const { data } = await request.post<LoginResult>('/auth/login', {
    account: payload.account,
    password: payload.password,
  })
  return data
}

export function changePasswordApi(payload: { currentPassword: string; newPassword: string }) {
  return request.post('/auth/change-password', payload)
}

export function registerApi(payload: RegisterPayload) {
  return request.post('/auth/register', payload)
}

export function forgotPasswordApi(payload: ForgotPasswordPayload) {
  return request.post('/auth/forgot-password', payload)
}

export function sendCaptchaApi(account: string) {
  return request.post('/auth/captcha', { account }, { silentError: true })
}
