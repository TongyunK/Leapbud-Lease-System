<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { User, Lock, View, Hide } from '@element-plus/icons-vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useUserStore } from '@/stores/user'
import { sendCaptchaApi } from '@/api/auth'
import { isValidLoginAccount, sanitizeAccountInput } from '@/utils/validators'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const account = ref('')
const password = ref('')
const captcha = ref('')
const showPassword = ref(false)
const loading = ref(false)
const captchaLoading = ref(false)
const formError = ref('')
const showCaptcha = ref(false)

onMounted(() => {
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  document.body.style.height = '100%'
})

onUnmounted(() => {
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
  document.body.style.height = ''
})

function onLogoClick() {
  window.location.reload()
}

function onAccountInput(value: string) {
  account.value = sanitizeAccountInput(value)
  formError.value = ''
}

async function onSendCaptcha() {
  if (!account.value.trim()) {
    formError.value = t('login.emptyRequired')
    return
  }
  captchaLoading.value = true
  try {
    await sendCaptchaApi(account.value.trim())
    ElMessage.success(t('login.captchaSent'))
  } catch {
    ElMessage.success(t('login.captchaSent'))
  } finally {
    captchaLoading.value = false
  }
}

async function onSubmit() {
  formError.value = ''
  const accountVal = account.value.trim()
  const passwordVal = password.value

  if (!accountVal || !passwordVal) {
    formError.value = t('login.emptyRequired')
    return
  }

  if (!isValidLoginAccount(accountVal)) {
    formError.value = t('login.invalidAccount')
    return
  }

  loading.value = true
  try {
    await userStore.login({
      account: accountVal,
      password: passwordVal,
      captcha: captcha.value.trim() || undefined,
    })
    ElMessage.success(t('login.loginSuccess'))
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/room-mgmt/buildings'
    await router.replace(redirect || '/room-mgmt/buildings')
  } catch {
    formError.value = t('login.loginFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__lang">
      <LanguageSwitcher />
    </div>

    <div class="login__stage">
      <aside class="login__brand">
        <button type="button" class="brand-mark" :aria-label="t('common.brand')" @click="onLogoClick">
          <img src="/leapbud_logo.png" alt="leapbud" />
        </button>
        <div class="brand-copy">
          <p class="brand-kicker">leapbud</p>
          <h1>{{ t('common.brand') }}</h1>
        </div>
      </aside>

      <section class="login__form-pane">
        <header class="form-head">
          <h2>{{ t('login.title') }}</h2>
        </header>

        <form class="form" @submit.prevent="onSubmit">
          <label class="field">
            <span>{{ t('login.account') }}</span>
            <el-input
              :model-value="account"
              maxlength="32"
              clearable
              :placeholder="t('login.accountPlaceholder')"
              @update:model-value="onAccountInput"
            >
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-input>
          </label>

          <label class="field">
            <span>{{ t('login.password') }}</span>
            <el-input
              v-model="password"
              maxlength="64"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="t('login.passwordPlaceholder')"
              @input="formError = ''"
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

          <div class="captcha-toggle">
            <button type="button" class="linkish" @click="showCaptcha = !showCaptcha">
              {{ showCaptcha ? t('login.hideCaptcha') : t('login.showCaptcha') }}
            </button>
          </div>

          <div v-if="showCaptcha" class="captcha-row">
            <el-input
              v-model="captcha"
              maxlength="8"
              :placeholder="t('login.captchaPlaceholder')"
            />
            <el-button :loading="captchaLoading" @click="onSendCaptcha">
              {{ t('login.sendCaptcha') }}
            </el-button>
          </div>

          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

          <el-button
            type="primary"
            class="submit"
            native-type="submit"
            :loading="loading"
          >
            {{ loading ? t('login.loggingIn') : t('login.login') }}
          </el-button>
        </form>

        <footer class="form-foot">
          <router-link :to="{ name: 'forgot-password' }">{{ t('login.forgotPassword') }}</router-link>
          <router-link class="accent" :to="{ name: 'register' }">{{ t('login.register') }}</router-link>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: clamp(20px, 4.5vh, 48px) clamp(20px, 5vw, 64px);
  background:
    radial-gradient(ellipse 70% 50% at 15% 20%, rgba(217, 130, 43, 0.16), transparent 55%),
    linear-gradient(145deg, #243029 0%, #3e5b45 48%, #2a3f31 100%);
}

.login__lang {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  z-index: 5;
}

/* 默认按笔记本视口：卡片约占屏宽 ~70%、屏高 ~62% */
.login__stage {
  width: min(720px, 72vw);
  height: min(460px, 64dvh);
  display: grid;
  grid-template-columns: 1fr 1.05fr;
  border-radius: 24px;
  overflow: hidden;
  background: #fffaf4;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.26),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  animation: stage-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* 大屏台式机再放大一点 */
@media (min-width: 1440px) {
  .login__stage {
    width: min(820px, 58vw);
    height: min(520px, 58dvh);
    border-radius: 26px;
  }
}

@media (min-width: 1800px) {
  .login__stage {
    width: min(900px, 50vw);
    height: min(540px, 52dvh);
    border-radius: 28px;
  }
}

.login__brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 18px;
  padding: clamp(24px, 4vh, 40px);
  color: #f4efe6;
  background:
    radial-gradient(ellipse 80% 60% at 20% 15%, rgba(217, 130, 43, 0.22), transparent 55%),
    linear-gradient(165deg, #4a6b52 0%, #3e5b45 42%, #243029 100%);
  isolation: isolate;
  overflow: hidden;
}

.login__brand::before {
  content: '';
  position: absolute;
  inset: -20% auto auto 35%;
  width: 280px;
  height: 280px;
  border: 1px solid rgba(244, 239, 230, 0.12);
  border-radius: 32% 68% 45% 55% / 55% 38% 62% 45%;
  z-index: 0;
  pointer-events: none;
}

.login__brand::after {
  content: '';
  position: absolute;
  inset: auto -10% -25% auto;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(217, 130, 43, 0.28), transparent 70%);
  z-index: 0;
  pointer-events: none;
}

.brand-mark {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 1;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.brand-mark img {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
}

.brand-copy {
  position: relative;
  z-index: 1;
}

.brand-kicker {
  margin: 0 0 6px;
  font-size: 0.78rem;
  letter-spacing: 0.28em;
  text-transform: lowercase;
  color: var(--lb-accent);
  font-weight: 600;
}

.brand-copy h1 {
  margin: 0;
  font-size: clamp(1.35rem, 2.6vw, 1.85rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.login__form-pane {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(22px, 4vh, 40px) clamp(22px, 3.5vw, 42px);
  background: linear-gradient(180deg, #fffefb 0%, #f7f2ea 100%);
}

.form-head {
  margin-bottom: clamp(14px, 2.5vh, 24px);
}

.form-head h2 {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--lb-brand);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--lb-ink);
}

.form :deep(.el-input__wrapper) {
  border-radius: 12px;
  min-height: 42px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(62, 91, 69, 0.14) inset;
  transition: box-shadow 0.2s ease;
}

.form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(62, 91, 69, 0.28) inset;
}

.form :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--lb-brand) inset,
    0 0 0 3px rgba(62, 91, 69, 0.1);
}

.eye-btn {
  display: inline-flex;
  border: 0;
  background: transparent;
  color: var(--lb-muted);
  cursor: pointer;
  padding: 0;
}

.eye-btn:hover {
  color: var(--lb-accent);
}

.captcha-toggle {
  margin-top: -4px;
}

.linkish {
  border: 0;
  background: transparent;
  color: var(--lb-brand-mid);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
}

.linkish:hover {
  color: var(--lb-accent);
}

.captcha-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.form-error {
  margin: 0;
  color: var(--lb-danger);
  font-size: 0.84rem;
}

.submit {
  width: 100%;
  height: 44px;
  margin-top: 4px;
  border-radius: 12px !important;
  font-weight: 650;
  letter-spacing: 0.04em;
  --el-button-bg-color: var(--lb-accent);
  --el-button-border-color: var(--lb-accent);
  --el-button-hover-bg-color: var(--lb-accent-hover);
  --el-button-hover-border-color: var(--lb-accent-hover);
  box-shadow: 0 12px 28px rgba(217, 130, 43, 0.28);
}

.form-foot {
  margin-top: 18px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.88rem;
  font-weight: 500;
}

.form-foot a {
  color: var(--lb-brand-mid);
}

.form-foot a:hover {
  color: var(--lb-accent);
}

.form-foot .accent {
  color: var(--lb-accent);
}

@keyframes stage-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 860px) {
  .login__stage {
    grid-template-columns: 1fr;
    width: min(420px, 92vw);
    height: auto;
    max-height: calc(100dvh - 32px);
    overflow: auto;
  }

  .login__brand {
    min-height: 160px;
    justify-content: center;
    padding: 20px 22px 18px;
  }

  .brand-mark {
    position: static;
    margin-bottom: 4px;
  }

  .brand-mark img {
    width: 48px;
    height: 48px;
  }

  .brand-copy h1 {
    font-size: 1.25rem;
  }

  .login__form-pane {
    padding: 20px 22px 22px;
  }
}

@media (max-height: 700px) and (min-width: 861px) {
  .login__stage {
    width: min(680px, 74vw);
    height: min(420px, 78dvh);
  }

  .form {
    gap: 10px;
  }

  .form-head {
    margin-bottom: 12px;
  }

  .form :deep(.el-input__wrapper) {
    min-height: 38px;
  }

  .submit {
    height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login__stage {
    animation: none;
  }
}
</style>
