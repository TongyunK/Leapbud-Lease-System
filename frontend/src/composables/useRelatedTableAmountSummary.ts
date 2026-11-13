import { computed, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '@/utils/format'

export type RelatedAmountStatItem = {
  key: string
  label: string
  value: number
  display: string
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function sumProp(rows: ReadonlyArray<object>, prop: string) {
  let sum = 0
  for (const row of rows) {
    const n = Number((row as Record<string, unknown>)[prop])
    if (Number.isFinite(n)) sum += n
  }
  return round2(sum)
}

/**
 * 关联表格抽屉金额统计：固定条展示，不跟表体左右滚动。
 * 默认按筛选后的全部行；可传 filterRows 只计有效／未取消等。
 */
export function useRelatedAmountStats<T extends object>(options: {
  rows: Ref<ReadonlyArray<T>> | ComputedRef<ReadonlyArray<T>>
  fields: ReadonlyArray<{ prop: string; label: string }>
  /** 只统计通过筛选的行；默认全部 */
  filterRows?: (row: T) => boolean
}) {
  const { t } = useI18n()

  const sourceRows = computed(() => {
    const list = options.rows.value
    if (!options.filterRows) return list
    return list.filter(options.filterRows)
  })

  const items = computed<RelatedAmountStatItem[]>(() =>
    options.fields.map((f) => {
      const value = sumProp(sourceRows.value, f.prop)
      return {
        key: f.prop,
        label: f.label,
        value,
        display: formatMoney(value),
      }
    }),
  )

  const visible = computed(() => options.rows.value.length > 0)

  const caption = computed(() =>
    options.filterRows
      ? t('common.relatedAmountStatsActive')
      : t('common.relatedAmountStatsAll'),
  )

  return { items, visible, caption, sourceRows }
}
