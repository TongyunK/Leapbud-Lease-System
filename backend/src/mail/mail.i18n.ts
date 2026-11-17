/** 系统邮件文案（与前端 AppLocale 对齐：zh-TW | en） */

export type MailLocale = 'zh-TW' | 'en'

export function normalizeMailLocale(raw?: string | null): MailLocale {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (v === 'en' || v.startsWith('en-')) return 'en'
  return 'zh-TW'
}

export function passwordResetMailContent(
  locale: MailLocale,
  params: { code: string; accountLabel: string },
): { subject: string; text: string } {
  const { code, accountLabel } = params
  if (locale === 'en') {
    return {
      subject: 'Leapbud Lease — Password reset code',
      text: [
        'Hello,',
        '',
        `A password reset was requested for account "${accountLabel}".`,
        `Verification code: ${code}`,
        '',
        'This code is valid for 15 minutes. Do not share it with others.',
        'If you did not request this, please ignore this email.',
        '',
        '— Leapbud Lease System',
      ].join('\n'),
    }
  }
  return {
    subject: 'Leapbud 租賃系統 — 重置密碼驗證碼',
    text: [
      '您好，',
      '',
      `帳號「${accountLabel}」正在重置密碼。`,
      `驗證碼：${code}`,
      '',
      '驗證碼 15 分鐘內有效，請勿轉發他人。',
      '如非本人操作，請忽略本郵件。',
      '',
      '— Leapbud 租賃系統',
    ].join('\n'),
  }
}

export function forgotPasswordUiMessage(
  locale: MailLocale,
  key:
    | 'accountMissing'
    | 'emailNotBound'
    | 'sendTooFrequent'
    | 'codeSent'
    | 'resetSuccess'
    | 'codeInvalid'
    | 'codeWrong'
    | 'passwordTooShort',
  vars?: { emailMasked?: string },
): string {
  const en = locale === 'en'
  switch (key) {
    case 'accountMissing':
      return en ? 'Account not found or disabled' : '帳號不存在或已停用'
    case 'emailNotBound':
      return en
        ? 'This account has no bound email, so password reset by code is unavailable. Contact an administrator.'
        : '該帳號未綁定郵箱，無法通過驗證碼重置密碼，請聯繫管理員'
    case 'sendTooFrequent':
      return en ? 'Too many requests. Please try again later.' : '發送過於頻繁，請稍後再試'
    case 'codeSent':
      return en
        ? `Verification code sent to ${vars?.emailMasked || 'your email'}. Please check your inbox.`
        : `驗證碼已發送至 ${vars?.emailMasked || '您的郵箱'}，請查收郵件。`
    case 'resetSuccess':
      return en
        ? 'Password reset. Please sign in with the new password.'
        : '密碼已重置，請使用新密碼登入'
    case 'codeInvalid':
      return en ? 'Invalid or expired verification code' : '驗證碼無效或已過期'
    case 'codeWrong':
      return en ? 'Incorrect verification code' : '驗證碼不正確'
    case 'passwordTooShort':
      return en ? 'New password must be at least 6 characters' : '新密碼至少 6 位'
    default:
      return en ? 'Request failed' : '操作失敗'
  }
}
