import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useStatusStore = defineStore('status', () => {
  const visible = ref(false)
  const message = ref('')
  const type = ref<'error' | 'success' | 'info'>('error')

  function showError(msg: string) {
    message.value = msg
    type.value = 'error'
    visible.value = true
  }

  function showSuccess(msg: string) {
    message.value = msg
    type.value = 'success'
    visible.value = true
  }

  function clear() {
    visible.value = false
    message.value = ''
  }

  return {
    visible,
    message,
    type,
    showError,
    showSuccess,
    clear,
  }
})
