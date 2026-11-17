/**
 * 清理「挡点击」的残留浮层。
 *
 * 注意：绝不能对 `.el-overlay` 做 `el.remove()`。
 * 这些节点由 Element Plus Dialog/Drawer 经 Vue Teleport 挂载；
 * 强拆 DOM 会让组件实例与真实节点脱节，之后「点了打不开」。
 * 只对明显空壳遮罩关掉 pointer-events，交给 EP 自行卸载。
 */

function isEmptyShellOverlay(el: HTMLElement): boolean {
  // 图片预览另有路径
  if (el.classList.contains('el-image-viewer__wrapper')) return false
  if (el.querySelector('.el-image-viewer__wrapper')) return false
  // 仍挂着业务表面：无论是否可见／动画中，一律不动
  if (
    el.querySelector(
      '.el-dialog, .lb-dialog, .el-drawer, .el-message-box, .el-overlay-message-box, .el-overlay-dialog',
    )
  ) {
    return false
  }
  return true
}

/** 空壳遮罩解除点击拦截（不删 DOM） */
export function sweepOrphanOverlays() {
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLElement>('.el-overlay').forEach((el) => {
    if (!isEmptyShellOverlay(el)) return
    if (getComputedStyle(el).pointerEvents === 'none') return
    el.style.pointerEvents = 'none'
  })
}

/** 路由切换：仅解除空壳拦截，不关 MessageBox、不延后强扫 */
export function sweepStuckOverlaysOnRouteChange() {
  sweepOrphanOverlays()
}
