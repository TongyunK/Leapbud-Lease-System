/**
 * Element Plus MessageBox 打开时会用 nextZIndex() 覆盖 options.zIndex，
 * 且与带显式高 z-index 的业务弹窗并列挂在 body 时会落在下层。
 *
 * 正确做法：把 MessageBox 挂到当前最上层业务弹窗的 .el-overlay 内，
 * 使其落在同一层叠上下文、盖住弹窗内容——不要再抬全局 z-index。
 */
export function findTopDialogOverlay(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let best: HTMLElement | null = null
  let bestZ = -Infinity
  document.querySelectorAll<HTMLElement>('.el-overlay').forEach((el) => {
    // 跳过 MessageBox 自己的遮罩（含已挂到业务弹窗内的嵌套层）
    if (el.classList.contains('is-message-box')) return
    if (el.querySelector(':scope > .el-overlay-message-box, :scope > .el-message-box')) return
    if (!el.querySelector('.el-dialog, .lb-dialog')) return
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
