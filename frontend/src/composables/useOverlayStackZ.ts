import { ref } from 'vue'
import { useZIndex } from 'element-plus'

/**
 * 全局浮层叠层（弹窗 / 关联详情抽屉共用）。
 * 解决：业务弹窗固定抬到「更多菜单」之上后，后续 EP 默认 nextZIndex 仍偏低而被挡住。
 *
 * 约定（链式抬层，彻底规避「下层」）：
 * 每打开一层关联信息（弹窗／列表抽屉／详情抽屉），都须 allocZ(上一层 z)，
 * 并把该层 z 绑到组件 :z-index；再往下开时传 { zIndex: 本层 z }。
 * 已抬高的 el-dialog 内再开关联抽屉：raiseFloor(dialogZ) 或
 * openXxxSide(id, { zIndex: dialogZ })，否则抽屉会落在弹窗／遮罩下层。
 * 勿靠关闭来源弹窗规避叠层（如定金抵扣记录点关联详情后弹窗应保持打开）。
 */
const stackTop = ref(0)

/** 合约「更多」菜单抬高层，业务弹窗至少要盖过它 */
export const OVERLAY_ABOVE_FEATURE_MENU_Z = 4600

/**
 * 附件／图片预览层下限（须高于抬高后的弹窗／抽屉）。
 * 与 style.css 中 `.el-image-viewer__wrapper` 兜底一致。
 */
export const OVERLAY_IMAGE_PREVIEW_Z = 9800

export function useOverlayStackZ() {
  const { nextZIndex } = useZIndex()

  /**
   * 分配一层 z-index：始终高于当前栈顶。
   * @param minAbove 要求不低于该值（例如盖住已打开的退租详情弹窗）
   */
  function allocZ(minAbove?: number) {
    if (minAbove != null && minAbove > stackTop.value) {
      stackTop.value = minAbove
    }
    let z = nextZIndex()
    if (z <= stackTop.value) {
      z = stackTop.value + 1
    }
    stackTop.value = z
    return z
  }

  /**
   * 图片预览专用：保证盖过当前业务弹窗／抽屉栈顶与「更多」抬高层。
   * 同步写入 `--lb-image-viewer-z`，避免 style.css 里 !important 的 9800 下限变成上限
   * （弹窗栈顶超过 9800 时预览会被压在弹窗下）。
   * 附件预览请用 AttachmentImageViewer，勿直接写裸 el-image-viewer。
   */
  function allocPreviewZ() {
    const z = allocZ(
      Math.max(stackTop.value, OVERLAY_ABOVE_FEATURE_MENU_Z, OVERLAY_IMAGE_PREVIEW_Z - 1),
    )
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--lb-image-viewer-z', String(z))
    }
    return z
  }

  function raiseFloor(minZ: number) {
    if (minZ > stackTop.value) stackTop.value = minZ
  }

  function peekStack() {
    return stackTop.value
  }

  /** 全部关联浮层关闭后可归零，避免长期抬高 */
  function resetStack() {
    stackTop.value = 0
  }

  return { allocZ, allocPreviewZ, raiseFloor, peekStack, resetStack, stackTop }
}
