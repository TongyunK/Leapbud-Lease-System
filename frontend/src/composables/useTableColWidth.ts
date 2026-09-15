import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  TABLE_ADDRESS_COL_CONTENT_MIN,
  TABLE_AUDIT_USER_CONTENT_MIN,
  TABLE_DATETIME_CONTENT_WIDTH,
  TABLE_LONG_TEXT_COL_CONTENT_MIN,
  TABLE_NAME_COL_CONTENT_MIN,
} from '@/constants/tableLayout'

/** 与 th > .cell 左右内边距大致一致 */
const HEADER_CELL_PAD = 24
/** TableColumnHeader 图标槽（含间距） */
const HEADER_ICON_SLOT = 26
/** 字体回退与字重偏差余量 */
const WIDTH_SLACK = 10

/**
 * StatusBadge 额外占位：左右 padding + gap + 圆点 + 边框 + cell 内边距 + 余量
 * （与 .lb-status 样式保持一致）
 */
const STATUS_BADGE_CHROME = 9 + 11 + 6 + 7 + 2 + 24 + 12

const FALLBACK_FONT_PX = 13

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

function resolveFontFamily(): string {
  return (
    getComputedStyle(document.body).fontFamily ||
    'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif'
  )
}

function resolveHeaderFont(): string {
  const size = getComputedStyle(document.documentElement).getPropertyValue('--lb-table-head').trim() || '0.82rem'
  return `700 ${size} ${resolveFontFamily()}`
}

/** 表体编号/链接字重（.fk-link 为 600），字号用 --lb-table-body */
function resolveCodeBodyFont(): string {
  const size =
    getComputedStyle(document.documentElement).getPropertyValue('--lb-table-body').trim() || '0.86rem'
  return `600 ${size} ${resolveFontFamily()}`
}

function resolveBadgeFont(): string {
  // 与 .lb-status 一致
  return `650 0.78rem ${resolveFontFamily()}`
}

function estimateTextWidth(text: string, font = resolveHeaderFont()): number {
  const ctx = getMeasureCtx()
  if (ctx) {
    ctx.font = font
    return ctx.measureText(text).width
  }
  let units = 0
  for (const ch of text) {
    if (/[\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)) units += 1
    else units += 0.55
  }
  return units * FALLBACK_FONT_PX
}

export type TableColWidthOpts = {
  /** 带排序/筛选/日期的表头控件 */
  interactive?: boolean
  /** 内容区最低宽度（号码、状态徽章、金额等） */
  contentMin?: number
}

export type TextColKind = 'name' | 'long' | 'address'

const TEXT_COL_CONTENT_MIN: Record<TextColKind, number> = {
  name: TABLE_NAME_COL_CONTENT_MIN,
  long: TABLE_LONG_TEXT_COL_CONTENT_MIN,
  address: TABLE_ADDRESS_COL_CONTENT_MIN,
}

/**
 * 按当前语言表头文案估算列宽，并与 contentMin 取较大值。
 */
export function measureTableColWidth(label: string, opts: TableColWidthOpts = {}): number {
  const textW = estimateTextWidth(label || '')
  const headerW = Math.ceil(
    textW + HEADER_CELL_PAD + (opts.interactive ? HEADER_ICON_SLOT : 0) + WIDTH_SLACK,
  )
  return Math.max(headerW, opts.contentMin ?? 0)
}

/** 按 StatusBadge 文案估算列内容宽度（完整显示、不换行截断） */
export function measureStatusBadgeColWidth(label: string): number {
  return Math.ceil(estimateTextWidth(label || '', resolveBadgeFont()) + STATUS_BADGE_CHROME)
}

/**
 * 表头列宽随中/英文案自适应（切换语言会重算）。
 */
export function useTableColWidth() {
  const { t, locale } = useI18n()

  function colW(label: string, opts: TableColWidthOpts = {}): number {
    void locale.value
    return measureTableColWidth(label, opts)
  }

  /**
   * 较长文本列（名称 / 长文 / 地址）：用统一 contentMin，避免默认过窄。
   * - name：客户名、大厦名、房间名、联系人名等
   * - long：需求内容、备注、提示等
   * - address：地址
   */
  function textColW(
    label: string,
    opts: { interactive?: boolean; kind?: TextColKind; contentMin?: number } = {},
  ): number {
    void locale.value
    const kind = opts.kind ?? 'name'
    return measureTableColWidth(label, {
      interactive: opts.interactive,
      contentMin: opts.contentMin ?? TEXT_COL_CONTENT_MIN[kind],
    })
  }

  /**
   * 业务编号列：按传入 samples（当前页/列表编号）中最长者测宽，完整显示且不统一写死。
   * 用表体字号 + 600 字重测（与 .fk-link / 单元格一致），避免按表头偏小字号估窄导致省略。
   * 无 samples 时仅按表头（+交互槽）测宽。
   */
  function codeColW(
    label: string,
    opts: {
      interactive?: boolean
      samples?: Array<string | null | undefined>
    } = {},
  ): number {
    void locale.value
    const samples = (opts.samples ?? [])
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
    const contentMin = samples.length
      ? Math.max(
          ...samples.map((s) =>
            Math.ceil(
              estimateTextWidth(s, resolveCodeBodyFont()) + HEADER_CELL_PAD + WIDTH_SLACK,
            ),
          ),
        )
      : 0
    return measureTableColWidth(label, {
      interactive: opts.interactive,
      contentMin,
    })
  }

  /**
   * 状态徽章列：表头 + 全部状态文案取最大，保证中/英完整显示（如 Following up）。
   * @param headerLabel 表头文案（已翻译）
   * @param statusLabels 当前语言下全部状态文案
   * @param opts.interactive 默认 true（带 TableColumnHeader）
   */
  function statusColW(
    headerLabel: string,
    statusLabels: string[],
    opts: { interactive?: boolean } = {},
  ): number {
    void locale.value
    const interactive = opts.interactive !== false
    const headerW = measureTableColWidth(headerLabel, { interactive })
    const labels = statusLabels.map((s) => String(s || '').trim()).filter(Boolean)
    const contentW = labels.length ? Math.max(...labels.map(measureStatusBadgeColWidth)) : 0
    return Math.max(headerW, contentW)
  }

  /** 时间戳列：完整 `YYYY-MM-DD HH:mm:ss` 与表头文案取较大值 */
  const datetimeColWidth = computed(() => {
    void locale.value
    return Math.max(
      TABLE_DATETIME_CONTENT_WIDTH,
      measureTableColWidth(t('common.createdAt'), { interactive: true }),
      measureTableColWidth(t('common.updatedAt'), { interactive: true }),
    )
  })

  /** 创建人 / 更新人：完整显示常见账号（如 superAdmin），勿过窄省略 */
  const auditUserColWidth = computed(() => {
    void locale.value
    return Math.max(
      measureTableColWidth(t('common.createdBy'), { contentMin: TABLE_AUDIT_USER_CONTENT_MIN }),
      measureTableColWidth(t('common.updatedBy'), { contentMin: TABLE_AUDIT_USER_CONTENT_MIN }),
    )
  })

  /** 挂到 el-table :key，切换语言时强制重算列布局 */
  const tableLayoutKey = computed(() => locale.value)

  return { colW, textColW, codeColW, statusColW, datetimeColWidth, auditUserColWidth, tableLayoutKey }
}
