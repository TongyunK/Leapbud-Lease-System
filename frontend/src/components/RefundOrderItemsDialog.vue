<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { RefundItemRecord, RefundOrderRecord } from '@/types/refund-order'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { formatMoney } from '@/utils/format'
import {
  buildRefundOrderItemAlloc,
  refundItemDisplayCode,
} from '@/utils/refundOrderAlloc'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: RefundOrderRecord | null
    zIndex?: number
  }>(),
  {
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openReceivable: [receivableId: string]
  openReceipt: [receiptId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, textColW, tableLayoutKey } = useTableColWidth()
const dialogWidth = computed(() => (isMobile.value ? '94%' : '820px'))

const items = computed(() => props.record?.items || [])

const allocByKey = computed(() => {
  const map = new Map<string, { due: number; refundPart: number; remainAfter: number }>()
  const rows = buildRefundOrderItemAlloc(items.value, Number(props.record?.paidAmount) || 0)
  for (const r of rows) map.set(r.key, r)
  return map
})

const totalDue = computed(() =>
  Math.round(items.value.reduce((s, it) => s + (Number(it.amount) || 0), 0) * 100) / 100,
)

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function itemKey(it: RefundItemRecord) {
  return it.id || `${it.sortOrder}:${it.description}`
}

function itemTypeLabel(type?: string | null) {
  const ty = (type || '').trim()
  if (!ty) return '—'
  return t(`refundOrder.itemType.${ty}`, ty)
}

function itemLabel(it: RefundItemRecord) {
  return refundItemDisplayCode(it.description, it.itemType) || it.description || '—'
}

function allocOf(it: RefundItemRecord) {
  return allocByKey.value.get(itemKey(it))
}

function onOpenReceivable(it: RefundItemRecord) {
  const id = (it.receivableId || '').trim()
  if (id) emit('openReceivable', id)
}

function onOpenReceipt(it: RefundItemRecord) {
  const id = (it.receiptId || '').trim()
  if (id) emit('openReceipt', id)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('refundOrder.itemsDialogTitle')"
    :width="dialogWidth"
    :fullscreen="isMobile"
    class="lb-dialog refund-items-dialog"
    append-to-body
    destroy-on-close
    :z-index="zIndex"
  >
    <div class="refund-items-shell">
      <div v-if="record" class="refund-items-meta">
        <div class="refund-items-meta__left">
          <span class="refund-items-meta__code">{{ record.refundCode }}</span>
          <div class="refund-items-hint">
            <span>{{ t('contract.cancelRefundAllocPreview') }}</span>
            <el-tooltip
              :content="t('contract.cancelRefundAllocFifoHint')"
              placement="top"
            >
              <el-icon class="refund-items-hint__tip" :size="14"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </div>
        <span class="refund-items-meta__sum">
          {{ t('refundOrder.itemsDialogTotal', { amount: money(totalDue) }) }}
        </span>
      </div>

      <el-table
        v-if="items.length"
        :key="tableLayoutKey"
        :data="items"
        border
        class="refund-items-table"
      >
        <el-table-column type="index" label="#" width="52" />
        <el-table-column
          :label="t('refundOrder.fields.itemType')"
          :min-width="colW(t('refundOrder.fields.itemType'), { contentMin: 88 })"
        >
          <template #default="{ row }">{{ itemTypeLabel(row.itemType) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('common.description')"
          :min-width="textColW(t('common.description'), { kind: 'name' })"
        >
          <template #default="{ row }">
            <button
              v-if="row.receivableId"
              type="button"
              class="fk-link"
              @click="onOpenReceivable(row)"
            >
              {{ itemLabel(row) }}
            </button>
            <button
              v-else-if="row.receiptId"
              type="button"
              class="fk-link"
              @click="onOpenReceipt(row)"
            >
              {{ itemLabel(row) }}
            </button>
            <span v-else>{{ itemLabel(row) }}</span>
            <div v-if="row.description && row.description !== itemLabel(row)" class="refund-items-desc">
              {{ row.description }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('refundOrder.fields.amount')"
          :min-width="colW(t('refundOrder.fields.amount'), { contentMin: 96 })"
          align="right"
        >
          <template #default="{ row }">
            <span class="refund-items-amt">{{ money(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('refundOrder.fields.paidAmount')"
          :min-width="colW(t('refundOrder.fields.paidAmount'), { contentMin: 148 })"
          align="right"
        >
          <template #default="{ row }">
            <template v-if="allocOf(row)">
              <span
                class="refund-items-tag"
                :class="allocOf(row)!.refundPart > 0.009 ? 'is-paid' : 'is-muted'"
              >
                {{
                  allocOf(row)!.refundPart > 0.009
                    ? t('refundOrder.allocPaid', { amount: money(allocOf(row)!.refundPart) })
                    : money(0)
                }}
              </span>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('refundOrder.fields.remainingAmount')"
          :min-width="colW(t('refundOrder.fields.remainingAmount'), { contentMin: 150 })"
          align="right"
        >
          <template #default="{ row }">
            <template v-if="allocOf(row)">
              <span
                v-if="allocOf(row)!.remainAfter <= 0.009 && allocOf(row)!.refundPart > 0.009"
                class="refund-items-tag is-settled"
              >
                {{ t('contract.cancelRefundAllocSettled') }}
              </span>
              <span v-else-if="allocOf(row)!.remainAfter > 0.009" class="refund-items-tag is-later">
                {{
                  t('contract.cancelRefundAllocLater', {
                    amount: money(allocOf(row)!.remainAfter),
                  })
                }}
              </span>
              <span v-else class="refund-items-tag is-muted">{{ money(0) }}</span>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
      <p v-else class="refund-items-empty">{{ t('refundOrder.noItems') }}</p>
    </div>
  </el-dialog>
</template>

<style scoped>
/* append-to-body 拿不到 .admin-page 变量，自行对齐列表表格字号断点 */
.refund-items-shell {
  --lb-table-body: 0.86rem;
  --lb-table-head: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  font-size: var(--lb-table-body);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #333);
}

@media (max-width: 1279.98px) {
  .refund-items-shell {
    --lb-table-body: 0.83rem;
    --lb-table-head: 0.78rem;
  }
}

@media (min-width: 1440px) {
  .refund-items-shell {
    --lb-table-body: 0.89rem;
    --lb-table-head: 0.85rem;
  }
}

@media (min-width: 1800px) {
  .refund-items-shell {
    --lb-table-body: 0.93rem;
    --lb-table-head: 0.89rem;
  }
}

.refund-items-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.refund-items-meta__left {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  min-width: 0;
}

.refund-items-meta__code {
  font-size: var(--lb-table-body);
  font-weight: 700;
  color: var(--lb-ink, #1a1a1a);
}

.refund-items-meta__sum {
  font-size: var(--lb-table-body);
  font-weight: 650;
  color: var(--lb-muted, #666);
}

.refund-items-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--lb-table-head);
  font-weight: 650;
  color: var(--lb-muted, #666);
}

.refund-items-hint__tip {
  color: #9aa3a0;
  cursor: help;
}

.refund-items-table.el-table {
  --el-table-font-size: var(--lb-table-body);
  font-size: var(--lb-table-body);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #333);
}

.refund-items-table :deep(.el-table__cell) {
  font-size: inherit;
}

.refund-items-table :deep(.el-table__cell > .cell) {
  font-size: inherit;
  line-height: 1.4;
}

.refund-items-table :deep(th.el-table__cell) {
  background-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #fff);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #5a6068);
  font-size: var(--lb-table-head);
  font-weight: 650;
}

.refund-items-table :deep(th.el-table__cell > .cell) {
  font-size: inherit;
}

.refund-items-desc {
  margin-top: 2px;
  font-size: inherit;
  color: var(--lb-muted, #666);
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}

.refund-items-amt {
  font-size: inherit;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.refund-items-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: inherit;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.refund-items-tag.is-paid {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #fff);
  color: var(--lb-brand-dark, #0c3d29);
}

.refund-items-tag.is-settled {
  background: color-mix(in srgb, #3d8b66 14%, #fff);
  color: #2a6b4a;
}

.refund-items-tag.is-later {
  background: color-mix(in srgb, #c9843a 14%, #fff);
  color: #9a6418;
}

.refund-items-tag.is-muted {
  background: #f3f4f3;
  color: #888;
}

.refund-items-empty {
  margin: 18px 0 8px;
  text-align: center;
  color: var(--lb-muted, #666);
  font-size: var(--lb-table-body);
}
</style>
