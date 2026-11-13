<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { ContractSettlementRecord } from '@/types/contract-settlement'
import type { RefundOrderRecord } from '@/types/refund-order'
import {
  canDisburseRefundOrder,
  refundOrderRemaining,
} from '@/types/refund-order'
import {
  disburseRefundOrderApi,
  fetchRefundOrder,
  fetchRefundOrders,
  uploadRefundOrderAttachmentsApi,
} from '@/api/refund-orders'
import MultiAttachmentField from '@/components/MultiAttachmentField.vue'
import type { MultiAttachmentPending } from '@/components/MultiAttachmentField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { refundOrderStatusTone } from '@/constants/statusBadges'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useIsMobile } from '@/composables/useMediaQuery'
import { OVERLAY_ABOVE_FEATURE_MENU_Z } from '@/composables/useOverlayStackZ'
import { useUserStore } from '@/stores/user'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import { formatMoney } from '@/utils/format'
import {
  buildRefundDisburseAllocPreview,
  roundMoney2,
} from '@/utils/refundOrderAlloc'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  settlement: ContractSettlementRecord | null
  /** 叠在合约「更多」等浮层之上时传入 */
  zIndex?: number
}>()

const emit = defineEmits<{
  done: []
  openRefundOrder: [refundOrderId: string, opts?: { zIndex?: number }]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const refundPerms = useResourcePermissions('refundOrders')

/**
 * 本弹窗常带抬高 :z-index；日期／下拉默认 nextZIndex 会落在弹窗下。
 * 须 teleport 到 body 并显式抬高 popper（勿 teleported=false，会被 dialog body overflow / header 裁切）。
 */
const fieldPopperStyle = computed(() => ({
  zIndex: Math.max(Number(props.zIndex) || 0, OVERLAY_ABOVE_FEATURE_MENU_Z) + 20,
}))

const tipPopperStyle = computed(() => ({
  zIndex: Math.max(Number(props.zIndex) || 0, OVERLAY_ABOVE_FEATURE_MENU_Z) + 40,
}))

const loading = ref(false)
const order = ref<RefundOrderRecord | null>(null)
const saving = ref(false)
const pendingAttachments = ref<MultiAttachmentPending[]>([])

const form = reactive({
  amount: 0,
  refundDate: '',
  paymentMethod: '',
  remark: '',
})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '720px'))

const refundDue = computed(() => Number(props.settlement?.refundDueTotal) || 0)
const refunded = computed(() => Number(props.settlement?.refundedTotal) || 0)
const remaining = computed(() =>
  Math.max(0, Math.round((refundDue.value - refunded.value) * 100) / 100),
)

const orderRemaining = computed(() =>
  order.value ? refundOrderRemaining(order.value) : remaining.value,
)

const currentUserId = computed(() => userStore.user?.id?.trim() || '')

const paymentMethodOptions = computed(() => {
  const cur = form.paymentMethod.trim()
  if (cur && !(RECEIPT_PAYMENT_METHODS as readonly string[]).includes(cur)) {
    return [cur, ...RECEIPT_PAYMENT_METHODS]
  }
  return [...RECEIPT_PAYMENT_METHODS]
})

const payNowClamped = computed(() => {
  const n = roundMoney2(Math.max(0, Number(form.amount) || 0))
  return Math.min(n, orderRemaining.value)
})

const refundAllocPreview = computed(() => {
  const row = order.value
  if (!row) return []
  return buildRefundDisburseAllocPreview(row.items || [], {
    alreadyPaid: Number(row.paidAmount) || 0,
    payNow: payNowClamped.value,
  })
})

const showAllocPreview = computed(() =>
  refundAllocPreview.value.some((r) => r.refundPart > 0.009),
)

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function money(v: number | null | undefined) {
  return formatMoney(v ?? 0)
}

async function alertBox(msg: string, type: 'warning' | 'error' | 'success' = 'warning') {
  await ElMessageBox.alert(msg, t('contractSettlement.processRefundTitle'), {
    type,
    confirmButtonText: t('common.confirm'),
  }).catch(() => undefined)
}

function seedForm(row: RefundOrderRecord | null) {
  pendingAttachments.value = []
  form.refundDate = todayYmd()
  form.paymentMethod = row?.paymentMethod || ''
  form.remark = ''
  form.amount = row ? refundOrderRemaining(row) : remaining.value
}

async function loadOrders() {
  const settlementId = props.settlement?.id?.trim()
  if (!settlementId) {
    order.value = null
    return
  }
  loading.value = true
  try {
    const { data } = await fetchRefundOrders({
      settlementId,
      pageSize: 50,
    })
    const open =
      (data.items || []).find((o) => canDisburseRefundOrder(o.status)) || null
    if (!open) {
      order.value = null
      seedForm(null)
      return
    }
    try {
      const detail = await fetchRefundOrder(open.id)
      order.value = detail.data
      seedForm(detail.data)
    } catch {
      order.value = open
      seedForm(open)
    }
  } catch {
    order.value = null
  } finally {
    loading.value = false
  }
}

function onOpenRefundOrder() {
  const id = order.value?.id?.trim()
  if (!id) return
  emit('openRefundOrder', id, { zIndex: props.zIndex })
}

function onAttachmentsAdd(files: File[]) {
  for (const file of files) {
    pendingAttachments.value.push({
      key: `${Date.now()}_${file.name}_${Math.random().toString(36).slice(2, 8)}`,
      file,
    })
  }
}

function onAttachmentRemovePending(key: string) {
  pendingAttachments.value = pendingAttachments.value.filter((p) => p.key !== key)
}

async function onSubmit() {
  const row = order.value
  if (!row) return

  const amount = Math.round((Number(form.amount) || 0) * 100) / 100
  const maxPay = orderRemaining.value
  if (amount <= 0.009) {
    await alertBox(t('refundOrder.needInstallmentAmount'))
    return
  }
  if (amount > maxPay + 0.009) {
    await alertBox(
      t('refundOrder.amountExceedRemaining', { amount: money(maxPay) }),
    )
    return
  }
  if (!form.refundDate) {
    await alertBox(t('refundOrder.needRefundDate'))
    return
  }

  saving.value = true
  try {
    const { data: paid } = await disburseRefundOrderApi(
      row.id,
      {
        amount,
        refundDate: form.refundDate,
        paymentMethod: form.paymentMethod.trim() || undefined,
        handlerId: currentUserId.value || null,
        remark: form.remark.trim() || undefined,
      },
      { silentError: true },
    )

    const files = pendingAttachments.value.map((p) => p.file)
    if (files.length && paid?.id) {
      try {
        await uploadRefundOrderAttachmentsApi(paid.id, files)
      } catch {
        await alertBox(t('refundOrder.attachmentsUploadFailed'), 'warning')
        emit('done')
        await loadOrders()
        return
      }
    }

    await alertBox(t('refundOrder.markPaidDone'), 'success')
    emit('done')
    await loadOrders()
    if (!order.value || orderRemaining.value <= 0.009) {
      visible.value = false
    }
  } catch (e) {
    const msg =
      e instanceof Error && e.message
        ? e.message
        : t('contractSettlement.refundSubmitFailed')
    await alertBox(msg, 'error')
  } finally {
    saving.value = false
  }
}

watch(
  () => [visible.value, props.settlement?.id] as const,
  ([open]) => {
    if (!open) {
      order.value = null
      pendingAttachments.value = []
      return
    }
    void loadOrders()
  },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    class="lb-dialog settlement-refund-dialog"
    :title="t('contractSettlement.processRefundTitle')"
    :width="dialogWidth"
    :fullscreen="isMobile"
    destroy-on-close
    :z-index="zIndex"
  >
    <div v-loading="loading" class="settlement-refund">
      <div v-if="settlement" class="settlement-refund__summary">
        <div class="settlement-refund__meta">
          <strong>{{ settlement.settlementCode }}</strong>
          <span>{{ settlement.contractCode }}</span>
          <span>{{ settlement.customerName || '—' }}</span>
          <span>{{ settlement.roomCode || '—' }}</span>
        </div>
        <div class="settlement-refund__totals">
          <div>
            <label>{{ t('contractSettlement.fields.refundDueTotal') }}</label>
            <em>{{ money(refundDue) }}</em>
          </div>
          <div>
            <label>{{ t('contractSettlement.fields.refundedTotal') }}</label>
            <em>{{ money(refunded) }}</em>
          </div>
          <div>
            <label>{{ t('contractSettlement.fields.refundRemaining') }}</label>
            <em class="is-remain">{{ money(remaining) }}</em>
          </div>
        </div>
      </div>

      <section class="settlement-refund__section">
        <h4>{{ t('contractSettlement.refundPendingOrders') }}</h4>
        <p v-if="!order" class="settlement-refund__empty">
          {{ t('contractSettlement.refundNoPending') }}
        </p>
        <div v-else class="settlement-refund__orders">
          <div class="settlement-refund__order is-active">
            <button
              type="button"
              class="settlement-refund__order-code fk-link"
              @click="onOpenRefundOrder"
            >
              {{ order.refundCode }}
            </button>
            <StatusBadge
              :tone="refundOrderStatusTone(order.status)"
              :label="t(`refundOrder.status.${order.status}`, order.status)"
            />
            <strong>{{ money(orderRemaining) }}</strong>
          </div>
        </div>
      </section>

      <section v-if="order && refundPerms.update" class="settlement-refund__section">
        <el-form label-position="top" class="settlement-refund__form">
          <div class="form-grid form-grid--2">
            <el-form-item required>
              <template #label>
                <span class="settlement-refund__label-with-tip">
                  {{ t('contract.cancelRefundNowAmount') }}
                  <el-tooltip
                    :content="
                      t('contract.cancelRefundNowAmountHint', {
                        max: money(orderRemaining),
                      })
                    "
                    placement="top"
                    :popper-style="tipPopperStyle"
                  >
                    <el-icon class="settlement-refund__label-tip" :size="14">
                      <QuestionFilled />
                    </el-icon>
                  </el-tooltip>
                </span>
              </template>
              <el-input-number
                v-model="form.amount"
                :min="0.01"
                :max="Math.max(0.01, orderRemaining || 0.01)"
                :precision="2"
                :step="100"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('refundOrder.fields.refundDate')" required>
              <el-date-picker
                v-model="form.refundDate"
                type="date"
                value-format="YYYY-MM-DD"
                :popper-style="fieldPopperStyle"
                style="width: 100%"
              />
            </el-form-item>
          </div>

          <div v-if="showAllocPreview" class="settlement-refund__alloc">
            <div class="settlement-refund__alloc-head">
              <span>{{ t('contract.cancelRefundAllocPreview') }}</span>
              <el-tooltip
                :content="t('contract.cancelRefundAllocFifoHint')"
                placement="top"
                :fallback-placements="['top', 'left', 'right']"
                :popper-style="tipPopperStyle"
              >
                <el-icon class="settlement-refund__label-tip" :size="14">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </div>
            <ul class="settlement-refund__alloc-list">
              <li
                v-for="row in refundAllocPreview"
                :key="row.key"
                class="settlement-refund__alloc-row"
              >
                <span class="settlement-refund__alloc-code">{{ row.label }}</span>
                <span class="settlement-refund__alloc-parts">
                  <span class="settlement-refund__alloc-tag is-due">
                    {{ t('contract.cancelRefundAllocDue', { amount: money(row.due) }) }}
                  </span>
                  <span
                    v-if="row.refundPart > 0.009"
                    class="settlement-refund__alloc-tag is-now"
                  >
                    {{
                      t('contract.cancelRefundAllocNow', {
                        amount: money(row.refundPart),
                      })
                    }}
                  </span>
                  <span
                    v-if="row.remainAfter <= 0.009 && row.refundPart > 0.009"
                    class="settlement-refund__alloc-tag is-settled"
                  >
                    {{ t('contract.cancelRefundAllocSettled') }}
                  </span>
                  <span
                    v-else-if="row.remainAfter > 0.009"
                    class="settlement-refund__alloc-tag is-later"
                  >
                    {{
                      t('contract.cancelRefundAllocLater', {
                        amount: money(row.remainAfter),
                      })
                    }}
                  </span>
                </span>
              </li>
            </ul>
          </div>

          <div class="form-grid form-grid--2">
            <el-form-item :label="t('refundOrder.fields.paymentMethod')">
              <el-select
                v-model="form.paymentMethod"
                filterable
                clearable
                value-on-clear=""
                :popper-style="fieldPopperStyle"
                :placeholder="t('common.pleaseSelect')"
                style="width: 100%"
              >
                <el-option
                  v-for="m in paymentMethodOptions"
                  :key="m"
                  :label="m"
                  :value="m"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('refundOrder.fields.attachments')">
              <MultiAttachmentField
                :pending="pendingAttachments"
                @add="onAttachmentsAdd"
                @remove-pending="onAttachmentRemovePending"
              />
            </el-form-item>
            <el-form-item :label="t('common.remark')" class="span-2">
              <el-input v-model="form.remark" type="textarea" :rows="2" resize="none" />
            </el-form-item>
          </div>
        </el-form>
      </section>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        v-if="refundPerms.update && order"
        v-admin-glow="refundPerms.codes.update"
        type="primary"
        class="lb-btn-primary"
        :loading="saving"
        @click="onSubmit"
      >
        {{ t('contractSettlement.processRefund') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.settlement-refund {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.settlement-refund__summary {
  border: 1px solid #e4ebe6;
  border-radius: 10px;
  background: #f7faf8;
  padding: 12px 14px;
}
.settlement-refund__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: #3d4f45;
  font-size: 0.9rem;
  margin-bottom: 10px;
}
.settlement-refund__totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.settlement-refund__totals label {
  display: block;
  color: #6a7a70;
  font-size: 0.78rem;
  margin-bottom: 2px;
}
.settlement-refund__totals em {
  font-style: normal;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #1f2a24;
}
.settlement-refund__totals em.is-remain {
  color: #b45309;
}
.settlement-refund__section h4 {
  margin: 0 0 8px;
  font-size: 0.92rem;
  color: #1f2a24;
}
.settlement-refund__empty {
  margin: 0;
  color: #7a8a80;
  font-size: 0.9rem;
}
.settlement-refund__orders {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.settlement-refund__order {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) auto auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 1px solid #d7ded9;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}
.settlement-refund__order.is-active {
  border-color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 25%, transparent);
}
.settlement-refund__order-code {
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  color: #1f2a24;
}
.settlement-refund__order-code.fk-link {
  color: var(--lb-brand, #0f4a32);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.settlement-refund__order strong {
  font-variant-numeric: tabular-nums;
  color: #0f4a32;
}
.settlement-refund__label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.settlement-refund__label-tip {
  color: #8a9a90;
  cursor: help;
  vertical-align: middle;
}
.settlement-refund__alloc {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4f7f5;
  border: 1px solid #e4ebe6;
}
.settlement-refund__alloc-head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: #2f3f36;
}
.settlement-refund__alloc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.settlement-refund__alloc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e0e8e3;
}
.settlement-refund__alloc-code {
  min-width: 0;
  font-size: 0.84rem;
  font-weight: 650;
  color: #3a4a42;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settlement-refund__alloc-parts {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.settlement-refund__alloc-tag {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px;
  border-radius: 999px;
}
.settlement-refund__alloc-tag.is-due {
  color: #5a3d12;
  background: #f3e6d0;
}
.settlement-refund__alloc-tag.is-now {
  color: #0f4a32;
  background: #ddeee4;
}
.settlement-refund__alloc-tag.is-settled {
  color: #0f4a32;
  background: #d8f0e4;
}
.settlement-refund__alloc-tag.is-later {
  color: #8a2f2f;
  background: #f6e0e0;
}
.settlement-refund__form .form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.settlement-refund__form .form-grid--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 12px;
}
.settlement-refund__form .span-2 {
  grid-column: 1 / -1;
}
@media (max-width: 720px) {
  .settlement-refund__totals,
  .settlement-refund__form .form-grid,
  .settlement-refund__form .form-grid--2 {
    grid-template-columns: 1fr;
  }
}
</style>
