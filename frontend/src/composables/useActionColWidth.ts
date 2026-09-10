import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/** 与 .action-pill 一致：左右 14 + border 1*2 */
const PILL_PAD_BORDER = 30
const PILL_GAP = 6
/** 与 td.col-actions > .cell 左右各 10px 一致 */
const CELL_PAD = 20
/** 余量：字重/字体回退与 canvas 实测偏差，避免右侧被裁切 */
const WIDTH_SLACK = 10

/** 无 DOM 时的回退：CJK 1em，拉丁约 0.5em（原先 0.58 偏宽） */
const FALLBACK_FONT_PX = 12.5

let measureCtx: CanvasRenderingContext2D | null | undefined

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx
  if (typeof document === 'undefined') {
    measureCtx = null
    return null
  }
  const canvas = document.createElement('canvas')
  measureCtx = canvas.getContext('2d')
  return measureCtx
}

function resolveActionFont(): string {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  const size = styles.getPropertyValue('--lb-table-action').trim() || '0.78rem'
  const family =
    getComputedStyle(document.body).fontFamily ||
    'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif'
  // 与 .action-pill 字重接近；略偏粗避免低估
  return `bold ${size} ${family}`
}

function estimateTextWidth(text: string): number {
  const ctx = getMeasureCtx()
  if (ctx) {
    ctx.font = resolveActionFont()
    return ctx.measureText(text).width
  }
  let units = 0
  for (const ch of text) {
    if (/[\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)) units += 1
    else units += 0.5
  }
  return units * FALLBACK_FONT_PX
}

function estimatePillWidth(label: string): number {
  return Math.ceil(estimateTextWidth(label) + PILL_PAD_BORDER)
}

/** 按实际按钮文案估算操作列宽（刚好容纳、不换行） */
export function measureActionColWidth(labels: string[]): number {
  if (!labels.length) return CELL_PAD
  const pills = labels.reduce(
    (sum, label, i) => sum + estimatePillWidth(label) + (i > 0 ? PILL_GAP : 0),
    0,
  )
  return pills + CELL_PAD + WIDTH_SLACK
}

/**
 * 操作列宽随当前语言文案自适应（切换中/英会重算）
 */
export function useActionColWidth() {
  const { t, locale } = useI18n()

  const actionColWidth = computed(() => {
    void locale.value
    const detail = t('common.detail')
    const edit = t('common.edit')
    const del = t('common.delete')
    return {
      /** 仅详情 */
      one: measureActionColWidth([detail]),
      /** 详情+编辑 与 编辑+删除 取较大值 */
      two: Math.max(
        measureActionColWidth([detail, edit]),
        measureActionColWidth([edit, del]),
      ),
      /** 详情+编辑+删除 */
      three: measureActionColWidth([detail, edit, del]),
    }
  })

  return { actionColWidth }
}
