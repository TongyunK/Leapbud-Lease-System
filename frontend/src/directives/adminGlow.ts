import type { Directive, DirectiveBinding } from 'vue'
import { watch, type WatchStopHandle } from 'vue'
import { useUserStore } from '@/stores/user'

const CLASS = 'lb-admin-only-glow'

type GlowEl = HTMLElement & {
  __adminGlowStop?: WatchStopHandle
  __adminGlowCode?: string
}

function apply(el: GlowEl, code: string) {
  const store = useUserStore()
  const on = Boolean(code) && store.isAdminExclusive(code)
  el.classList.toggle(CLASS, on)
  if (on) {
    if (!el.dataset.adminGlowTitleSaved) {
      el.dataset.adminGlowTitleSaved = el.getAttribute('title') ?? ''
      el.dataset.adminGlowHadTitle = el.hasAttribute('title') ? '1' : '0'
    }
    el.setAttribute('title', '僅超級管理員擁有此功能')
  } else if (el.dataset.adminGlowTitleSaved !== undefined) {
    if (el.dataset.adminGlowHadTitle === '1') {
      el.setAttribute('title', el.dataset.adminGlowTitleSaved)
    } else {
      el.removeAttribute('title')
    }
    delete el.dataset.adminGlowTitleSaved
    delete el.dataset.adminGlowHadTitle
  }
}

function bindCode(el: GlowEl, binding: DirectiveBinding<string | undefined>) {
  el.__adminGlowCode = typeof binding.value === 'string' ? binding.value : ''
  apply(el, el.__adminGlowCode)
}

/** 超级管理员视角：仅 superAdmin 拥有的功能按钮发光描边 */
export const vAdminGlow: Directive<GlowEl, string | undefined> = {
  mounted(el, binding) {
    const store = useUserStore()
    bindCode(el, binding)
    el.__adminGlowStop = watch(
      () =>
        [store.isSuperAdmin, store.adminExclusiveCodes.join('\0'), el.__adminGlowCode ?? ''] as const,
      () => apply(el, el.__adminGlowCode ?? ''),
    )
  },
  updated(el, binding) {
    bindCode(el, binding)
  },
  unmounted(el) {
    el.__adminGlowStop?.()
    delete el.__adminGlowStop
    el.classList.remove(CLASS)
    if (el.dataset.adminGlowTitleSaved !== undefined) {
      if (el.dataset.adminGlowHadTitle === '1') {
        el.setAttribute('title', el.dataset.adminGlowTitleSaved)
      } else {
        el.removeAttribute('title')
      }
      delete el.dataset.adminGlowTitleSaved
      delete el.dataset.adminGlowHadTitle
    }
    delete el.__adminGlowCode
  },
}
