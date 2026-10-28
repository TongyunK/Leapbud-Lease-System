/**
 * 全局为 el-dialog 注入「内容区全屏」按钮（非整屏 OS 全屏）。
 * 全屏时遮罩与对话框对齐 AppLayout 右侧 `.main`（侧栏以右红框区域；侧栏未折叠时侧栏仍可见）。
 */
import { i18n } from '@/i18n'
import { refreshMainBounds } from '@/utils/layoutMainBounds'

const ENHANCED = 'data-lb-fs-enhanced'
const EXCLUDE_DIALOG =
  '.batch-progress-dialog, .import-progress-dialog, .el-message-box, .lb-dialog--no-content-fs'

/** 四角外扩 — 进入内容区全屏 */
const ICON_EXPAND =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 0h2v7h-7v-2h5v-5z"/></svg>'

/** 四角内收 — 退出全屏 */
const ICON_COMPRESS =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M9 3H7v4H3v2h6V3zm8 0h-2v6h6V7h-4V3zM9 15H3v2h4v4h2v-6zm12 0h-6v6h2v-4h4v-2z"/></svg>'

function tFs(enter: boolean) {
  try {
    return String(
      i18n.global.t(enter ? 'common.dialogFullscreen' : 'common.dialogExitFullscreen'),
    )
  } catch {
    return enter ? '內容區全屏' : '退出全屏'
  }
}

function shouldSkip(dialog: HTMLElement) {
  if (dialog.matches(EXCLUDE_DIALOG)) return true
  if (dialog.closest('.el-message-box')) return true
  return false
}

function setFullscreen(dialog: HTMLElement, on: boolean, btn: HTMLButtonElement) {
  // 进入全屏前刷新右侧主区几何，避免侧栏展开时仍用旧的 left=0 盖住菜单
  if (on) {
    refreshMainBounds()
  }
  const overlay = dialog.closest('.el-overlay') as HTMLElement | null
  const overlayDialog = dialog.closest('.el-overlay-dialog') as HTMLElement | null
  dialog.classList.toggle('is-fullscreen', on)
  dialog.classList.toggle('lb-dialog--content-fs', on)
  overlay?.classList.toggle('lb-overlay--content-fs', on)
  overlayDialog?.classList.toggle('lb-overlay-dialog--content-fs', on)
  btn.classList.toggle('is-active', on)
  btn.setAttribute('aria-label', tFs(!on))
  btn.setAttribute('title', tFs(!on))
  btn.innerHTML = `<span class="lb-dialog-fs-btn__icon">${on ? ICON_COMPRESS : ICON_EXPAND}</span>`
  if (on) {
    requestAnimationFrame(() => refreshMainBounds())
  }
}

function enhanceDialog(dialog: HTMLElement) {
  if (dialog.getAttribute(ENHANCED) === '1') return
  if (shouldSkip(dialog)) return
  const header = dialog.querySelector('.el-dialog__header')
  if (!header) return

  dialog.setAttribute(ENHANCED, '1')
  dialog.classList.add('lb-dialog--fs-ready')

  const closeBtn = header.querySelector('.el-dialog__headerbtn:not(.lb-dialog-fs-btn)')
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'el-dialog__headerbtn lb-dialog-fs-btn'
  btn.setAttribute('aria-label', tFs(true))
  btn.setAttribute('title', tFs(true))
  btn.innerHTML = `<span class="lb-dialog-fs-btn__icon">${ICON_EXPAND}</span>`
  btn.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    const on = !dialog.classList.contains('lb-dialog--content-fs')
    setFullscreen(dialog, on, btn)
  })

  if (closeBtn) {
    header.insertBefore(btn, closeBtn)
  } else {
    header.appendChild(btn)
  }
}

function scan(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.el-dialog').forEach(enhanceDialog)
}

/** 在应用挂载后调用一次 */
export function setupDialogContentFullscreen() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
  scan()
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        if (node.classList?.contains('el-dialog')) enhanceDialog(node)
        else if (node.querySelector) scan(node)
      })
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
