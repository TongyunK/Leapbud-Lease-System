<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { Lock, Message, User, View, Hide } from '@element-plus/icons-vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { resetPasswordWithCodeApi, sendForgotPasswordCodeApi } from '@/api/auth'

const { t, locale } = useI18n()
const router = useRouter()

function currentLocale() {
  return String(locale.value || 'zh-TW')
}

const account = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const emailMasked = ref('')
const sending = ref(false)
const resetting = ref(false)
const cooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const canSendCode = computed(() => cooldown.value <= 0 && !sending.value)

function startCooldown(seconds = 60) {
  cooldown.value = seconds
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

watch(account, () => {
  if (!emailMasked.value) return
  emailMasked.value = ''
  code.value = ''
})

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
  const msg = err?.response?.data?.message
  if (Array.isArray(msg) && msg[0]) return String(msg[0])
  if (typeof msg === 'string' && msg.trim()) return msg
  if (err?.message?.trim()) return err.message
  return fallback
}

async function onSendCode() {
  if (!canSendCode.value) return
  const acc = account.value.trim()
  if (!acc) {
    await ElMessageBox.alert(t('forgot.accountRequired'), t('common.tip'), { type: 'warning' })
    return
  }
  sending.value = true
  try {
    const { data } = await sendForgotPasswordCodeApi(acc, currentLocale())
    if (!data?.sent) {
      emailMasked.value = ''
      await ElMessageBox.alert(
        data?.message || t('forgot.emailNotBound'),
        t('common.tip'),
        { type: 'warning' },
      )
      return
    }
    emailMasked.value = data.emailMasked || ''
    startCooldown(60)
    await ElMessageBox.alert(data.message || t('forgot.codeSent'), t('common.tip'), {
      type: 'success',
    })
  } catch (e) {
    emailMasked.value = ''
    await ElMessageBox.alert(
      apiErrorMessage(e, t('forgot.sendFailed')),
      t('common.tip'),
      { type: 'warning' },
    )
  } finally {
    sending.value = false
  }
}

async function onReset() {
  const acc = account.value.trim()
  const c = code.value.trim()
  const pwd = newPassword.value
  const confirm = confirmPassword.value
  if (!acc) {
    await ElMessageBox.alert(t('forgot.accountRequired'), t('common.tip'), { type: 'warning' })
    return
  }
  if (!c) {
    await ElMessageBox.alert(t('forgot.codeRequired'), t('common.tip'), { type: 'warning' })
    return
  }
  if (!pwd || pwd.length < 6) {
    await ElMessageBox.alert(t('forgot.passwordTooShort'), t('common.tip'), { type: 'warning' })
    return
  }
  if (pwd !== confirm) {
    await ElMessageBox.alert(t('forgot.passwordMismatch'), t('common.tip'), { type: 'warning' })
    return
  }
  resetting.value = true
  try {
    const { data } = await resetPasswordWithCodeApi({
      account: acc,
      code: c,
      newPassword: pwd,
      locale: currentLocale(),
    })
    await ElMessageBox.alert(data.message || t('forgot.resetSuccess'), t('common.tip'), {
      type: 'success',
    })
    await router.push({ name: 'login' })
  } catch (e) {
    await ElMessageBox.alert(apiErrorMessage(e, t('forgot.resetFailed')), t('common.tip'), {
      type: 'error',
    })
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="auth-shell">
    <div class="auth-shell__orb" aria-hidden="true" />
    <div class="auth-shell__lang">
      <LanguageSwitcher />
    </div>

    <div class="auth-panel auth-panel--narrow">
      <h1>{{ t('forgot.title') }}</h1>

      <form class="form" @submit.prevent="onReset">
        <label class="field">
          <span>{{ t('forgot.account') }}</span>
          <el-input
            v-model="account"
            size="large"
            maxlength="128"
            clearable
            :placeholder="t('forgot.accountPlaceholder')"
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </label>

        <label class="field">
          <span>{{ t('forgot.code') }}</span>
          <el-input
            v-model="code"
            size="large"
            maxlength="12"
            clearable
            :placeholder="t('forgot.codePlaceholder')"
          >
            <template #prefix>
              <el-icon><Message /></el-icon>
            </template>
            <template #suffix>
              <button
                type="button"
                class="resend-btn"
                :disabled="!canSendCode"
                @click.prevent="onSendCode"
              >
                {{
                  sending
                    ? t('forgot.sending')
                    : cooldown > 0
                      ? t('forgot.resendIn', { n: cooldown })
                      : emailMasked
                        ? t('forgot.resend')
                        : t('forgot.sendCode')
                }}
              </button>
            </template>
          </el-input>
        </label>

        <label class="field">
          <span>{{ t('forgot.newPassword') }}</span>
          <el-input
            v-model="newPassword"
            size="large"
            maxlength="64"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('forgot.newPasswordPlaceholder')"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
            <template #suffix>
              <button
                type="button"
                class="eye-btn"
                :aria-label="showPassword ? 'hide' : 'show'"
                @click="showPassword = !showPassword"
              >
                <el-icon>
                  <View v-if="showPassword" />
                  <Hide v-else />
                </el-icon>
              </button>
            </template>
          </el-input>
        </label>

        <label class="field">
          <span>{{ t('forgot.confirmPassword') }}</span>
          <el-input
            v-model="confirmPassword"
            size="large"
            maxlength="64"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('forgot.confirmPasswordPlaceholder')"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </label>

        <el-button
          type="primary"
          size="large"
          class="submit-btn"
          native-type="submit"
          :loading="resetting"
        >
          {{ t('forgot.resetSubmit') }}
        </el-button>
      </form>

      <router-link class="back-link" :to="{ name: 'login' }">{{ t('common.backToLogin') }}</router-link>
    </div>
  </div>
</template>

<style scoped>
.eye-btn,
.resend-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.eye-btn {
  display: inline-flex;
  color: var(--lb-muted);
}

.eye-btn:hover {
  color: var(--lb-accent);
}

.resend-btn {
  color: var(--lb-brand-mid);
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.resend-btn:disabled {
  color: var(--lb-muted);
  cursor: not-allowed;
}

.resend-btn:not(:disabled):hover {
  color: var(--lb-accent);
}

.auth-panel--narrow > h1 {
  margin-bottom: 18px;
}

.back-link {
  font-size: 0.88rem;
  font-weight: 500;
}
</style>
