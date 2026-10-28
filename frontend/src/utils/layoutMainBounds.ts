/** AppLayout 注册：弹窗内容区全屏前可强制刷新右侧主区几何 */

type Publisher = () => void

let publisher: Publisher | null = null

export function registerMainBoundsPublisher(fn: Publisher | null) {
  publisher = fn
  fn?.()
}

/** 读取 .main 的 getBoundingClientRect 写入 --lb-main-* */
export function refreshMainBounds() {
  publisher?.()
}
