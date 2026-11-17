/**
 * Element Plus MessageBox 打开时会用 nextZIndex() 覆盖 options.zIndex，
 * 且与带显式高 z-index 的业务弹窗并列挂在 body 时会落在下层。
 *
 * 正确做法：把 MessageBox 挂到当前最上层业务弹窗的 .el-overlay 内，
 * 使其落在同一层叠上下文、盖住弹窗内容——不要再抬全局 z-index。
 */

function isUsableDialogOverlay(el: HTMLElement): boolean {
  // 跳过 MessageBox 自己的遮罩（含已挂到业务弹窗内的嵌套层）
  if (el.classList.contains('is-message-box')) return false
  if (el.querySelector(':scope > .el-overlay-message-box, :scope > .el-message-box')) {
    return false
  }
  const dialog = el.querySelector('.el-dialog, .lb-dialog') as HTMLElement | null
  if (!dialog) return false

  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  if (style.pointerEvents === 'none') return false
  const opacity = Number(style.opacity)
  if (Number.isFinite(opacity) && opacity <= 0.01) return false

  const rect = el.getBoundingClientRect()
  if (rect.width < 8 || rect.height < 8) return false

  const dStyle = getComputedStyle(dialog)
  if (dStyle.display === 'none' || dStyle.visibility === 'hidden') return false
  const dRect = dialog.getBoundingClientRect()
  if (dRect.width < 8 || dRect.height < 8) return false

  return true
}

export function findTopDialogOverlay(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let best: HTMLElement | null = null
  let bestZ = -Infinity
  document.querySelectorAll<HTMLElement>('.el-overlay').forEach((el) => {
    if (!isUsableDialogOverlay(el)) return
    const z = Number(getComputedStyle(el).zIndex)
    const score = Number.isFinite(z) ? z : 0
    if (score >= bestZ) {
      bestZ = score
      best = el
    }
  })
  return best
}

/** 若存在打开中的业务弹窗，返回供 MessageBox `appendTo` 使用的宿主 */
export function messageBoxAppendHost(): HTMLElement | undefined {
  return findTopDialogOverlay() ?? undefined
}
