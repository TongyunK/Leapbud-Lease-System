<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { forgotPasswordApi } from '@/api/auth'

const { t } = useI18n()
const router = useRouter()

const account = ref('')
const channel = ref<'sms' | 'email'>('sms')
const loading = ref(false)

async function onSubmit() {
  if (!account.value.trim()) {
    ElMessage.warning(t('login.emptyRequired'))
    return
  }
  loading.value = true
  try {
    await forgotPasswordApi({ account: account.value.trim(), channel: channel.value })
    ElMessage.success(t('forgot.success'))
    await router.push({ name: 'login' })
  } catch {
    ElMessage.success(t('forgot.success'))
    await router.push({ name: 'login' })
  } finally {
    loading.value = false
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
      <p class="subtitle">{{ t('forgot.subtitle') }}</p>

      <form class="form" @submit.prevent="onSubmit">
        <label class="field">
          <span>{{ t('forgot.account') }}</span>
          <el-input v-model="account" size="large" />
        </label>

        <div class="field">
          <span>{{ t('forgot.channel') }}</span>
          <el-radio-group v-model="channel">
            <el-radio value="sms">{{ t('forgot.sms') }}</el-radio>
            <el-radio value="email">{{ t('forgot.email') }}</el-radio>
          </el-radio-group>
        </div>

        <el-button type="primary" size="large" class="submit-btn" native-type="submit" :loading="loading">
          {{ t('forgot.sendCode') }}
        </el-button>
      </form>

      <router-link class="back-link" :to="{ name: 'login' }">{{ t('common.backToLogin') }}</router-link>
    </div>
  </div>
</template>
