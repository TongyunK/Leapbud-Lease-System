import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** 与 .action-pill 一致：左右 14 + border 1*2 */
const PILL_PAD_BORDER = 30
/** 与 .action-pill--more 一致：左右 8 + border 1*2（勿用普通 pill 的 30，否则合约「…」右侧会空一大截） */
const MORE_PILL_PAD_BORDER = 18
const PILL_GAP = 6
/** 与 td.col-actions > .cell 左侧 10px 一致（合约表基准） */
const CELL_PAD_LEFT = 10
/**
 * 小屏断点（约 14 寸 / 窄视口）。大屏右侧留白见 `.admin-page { --lb-action-pad-right }`。
 * 样式与测宽都读该 CSS 变量，避免 HMR/首帧时「先变宽再被列宽旧值吃掉」。
 */
const COMPACT_ACTION_QUERY = '(max-width: 1439.98px)'
/** 无 DOM / 变量未就绪时的回退（须与 style.css 默认一致） */
const CELL_PAD_RIGHT_FALLBACK = 10
const CELL_PAD_RIGHT_COMPACT_FALLBACK = 6
/** 余量：字体回退与 canvas 实测偏差，避免 overflow:visible 的 pill 吃掉右侧留白 */
const WIDTH_SLACK = 6
const WIDTH_SLACK_COMPACT = 4
/** 字号档位变化时重测（与 .admin-page 的 --lb-table-action 断点一致） */
const ACTION_FONT_QUERIES = [
  '(max-width: 1279.98px)',
  COMPACT_ACTION_QUERY,
  '(min-width: 1800px)',
]

/** 无 DOM 时的回退：CJK 1em，拉丁约 0.5em（原先 0.58 偏宽） */
const FALLBACK_FONT_PX = 12.5

let measureCtx: CanvasRenderingContext2D | null | undefined
/** 断点或首帧挂载后递增，让列宽 computed 重测 */
const actionLayoutEpoch = ref(0)
let actionLayoutWatching = false

function ensureActionLayoutWatch() {
  if (typeof window === 'undefined' || actionLayoutWatching) return
  actionLayoutWatching = true
  const bump = () => {
    actionLayoutEpoch.value += 1
  }
  for (const query of ACTION_FONT_QUERIES) {
    window.matchMedia(query).addEventListener('change', bump)
  }
  // setup 阶段 .admin-page / CSS 变量可能尚未就绪：首帧 + 下一帧各测一次，避免「闪一下又回去」
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      bump()
      requestAnimationFrame(bump)
    })
  })
}

function isCompactActionViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(COMPACT_ACTION_QUERY).matches
}

/** 与 style.css `--lb-action-pad-right` 同源，避免样式与列宽各写一套数字 */
function resolveActionPadRightPx(): number {
  if (typeof document === 'undefined') {
    return isCompactActionViewport() ? CELL_PAD_RIGHT_COMPACT_FALLBACK : CELL_PAD_RIGHT_FALLBACK
  }
  const host = document.querySelector('.admin-page') ?? document.documentElement
  const raw = getComputedStyle(host).getPropertyValue('--lb-action-pad-right').trim()
  const n = parseFloat(raw)
  if (Number.isFinite(n) && n >= 0) return n
  return isCompactActionViewport() ? CELL_PAD_RIGHT_COMPACT_FALLBACK : CELL_PAD_RIGHT_FALLBACK
}

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

function resolveActionFontSizePx(): number {
  const host = document.querySelector('.admin-page') ?? document.documentElement
  const raw = getComputedStyle(host).getPropertyValue('--lb-table-action').trim() || '0.78rem'
  if (raw.endsWith('px')) return parseFloat(raw) || 12.5
  if (raw.endsWith('rem')) {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    return (parseFloat(raw) || 0.78) * rootPx
  }
  if (raw.endsWith('em')) {
    const basePx = parseFloat(getComputedStyle(host).fontSize) || 16
    return (parseFloat(raw) || 0.78) * basePx
  }
  return 12.5
}

function resolveActionFont(): string {
  const family =
    getComputedStyle(document.body).fontFamily ||
    'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif'
  // 与 .action-pill 的 font-weight: 650 对齐；用 px，避免 canvas 不解析 rem
  return `650 ${resolveActionFontSizePx()}px ${family}`
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

function isMorePillLabel(label: string): boolean {
  const s = label.trim()
  return s === '…' || s === '...' || s === '⋯'
}

function estimatePillWidth(label: string): number {
  if (isMorePillLabel(label)) {
    // 对齐 .action-pill--more：padding 8/8 + border，且 min-width: 2.2em
    const minW = 2.2 * resolveActionFontSizePx()
    return Math.max(estimateTextWidth(label) + MORE_PILL_PAD_BORDER, minW)
  }
  return estimateTextWidth(label) + PILL_PAD_BORDER
}

/** 按实际按钮文案估算操作列宽（刚好容纳、不换行） */
export function measureActionColWidth(labels: string[]): number {
  ensureActionLayoutWatch()
  void actionLayoutEpoch.value
  const rightPad = resolveActionPadRightPx()
  const slack = isCompactActionViewport() ? WIDTH_SLACK_COMPACT : WIDTH_SLACK
  if (!labels.length) return CELL_PAD_LEFT + rightPad + slack
  const pills = labels.reduce(
    (sum, label, i) => sum + estimatePillWidth(label) + (i > 0 ? PILL_GAP : 0),
    0,
  )
  // 只在总和上取整，避免多按钮时每个 ceil 把右侧空隙叠宽
  return Math.ceil(pills + CELL_PAD_LEFT + rightPad + slack)
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
