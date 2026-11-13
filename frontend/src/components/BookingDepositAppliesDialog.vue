<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchBookingDepositAppliesApi,
  type BookingDepositApplyRow,
} from '@/api/receipts'
import { formatMoney } from '@/utils/format'
import {
  OVERLAY_ABOVE_FEATURE_MENU_Z,
  useOverlayStackZ,
} from '@/composables/useOverlayStackZ'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  contractId?: string | null
  contractCode?: string | null
  zIndex?: number
}>()

const emit = defineEmits<{
  openInvoice: [invoiceId: string, opts?: { zIndex?: number }]
  openReceipt: [receiptId: string, opts?: { zIndex?: number }]
}>()

const { t } = useI18n()
const { raiseFloor } = useOverlayStackZ()
const loading = ref(false)
const rows = ref<BookingDepositApplyRow[]>([])

const dialogZ = computed(
  () => Math.max(Number(props.zIndex) || 0, OVERLAY_ABOVE_FEATURE_MENU_Z) + 40,
)

async function load() {
  const contractId = props.contractId?.trim()
  if (!contractId) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchBookingDepositAppliesApi({ contractId })
    rows.value = (data ?? []).filter((r) => (r.type || 'apply') === 'apply')
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.contractId, dialogZ.value] as const,
  ([open, id, z]) => {
    if (open) {
      // 抬高全局叠层地板，后续关联抽屉 allocZ 才会盖过本弹窗／遮罩
      raiseFloor(z)
      if (id) void load()
    } else {
      rows.value = []
    }
  },
)

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

/**
 * 保持本弹窗打开，仅抬高叠层后开关联抽屉（须高于 dialogZ，否则抽屉被压在遮罩下）。
 * 勿在此关闭弹窗——用户还要对照抵扣列表。
 */
function openRelated(kind: 'invoice' | 'receipt', id: string) {
  const z = dialogZ.value
  raiseFloor(z)
  if (kind === 'invoice') emit('openInvoice', id, { zIndex: z })
  else emit('openReceipt', id, { zIndex: z })
}

function onOpenInvoice(row: BookingDepositApplyRow) {
  const id = row.invoiceId?.trim()
  if (id) void openRelated('invoice', id)
}

function onOpenReceipt(row: BookingDepositApplyRow) {
  const id = row.bookingDepositReceiptId?.trim()
  if (id) void openRelated('receipt', id)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="lb-dialog"
    :title="
      contractCode?.trim()
        ? t('contract.bookingDepositAppliesWithContract', { contract: contractCode.trim() })
        : t('receivable.fields.collectionPairs')
    "
    width="520px"
    :z-index="dialogZ"
    destroy-on-close
  >
    <div v-loading="loading" class="bd-applies">
      <p v-if="!loading && !rows.length" class="bd-applies__empty">—</p>
      <ul v-else class="bd-applies__list">
        <li v-for="row in rows" :key="row.id" class="bd-applies__row">
          <button
            v-if="row.invoiceId"
            type="button"
            class="fk-link"
            @click="onOpenInvoice(row)"
          >
            {{ row.invoiceCode || row.invoiceId }}
          </button>
          <span v-else>{{ row.invoiceCode || '—' }}</span>
          <span class="bd-applies__dot" aria-hidden="true">·</span>
          <span class="bd-applies__tag">{{ t('receivable.fields.bookingDepositApplies') }}</span>
          <button
            v-if="row.bookingDepositReceiptId"
            type="button"
            class="fk-link"
            @click="onOpenReceipt(row)"
          >
            {{ money(row.amount) }}
          </button>
          <span v-else>{{ money(row.amount) }}</span>
          <span class="bd-applies__dot" aria-hidden="true">·</span>
          <span class="bd-applies__date">{{ row.movementDate || '—' }}</span>
        </li>
      </ul>
    </div>
    <template #footer>
      <el-button type="primary" class="lb-btn-primary" @click="visible = false">
        {{ t('common.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bd-applies {
  min-height: 80px;
}

.bd-applies__empty {
  margin: 12px 0 0;
  color: var(--lb-muted, #6a7a70);
}

.bd-applies__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bd-applies__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 6px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e4ebe6;
  background: #f8faf8;
  font-size: 0.84rem;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  color: #1a2a22;
}

.bd-applies__dot {
  color: #b0bbb5;
  user-select: none;
}

.bd-applies__tag {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 700;
  color: #6a7a70;
}

.bd-applies__date {
  color: #6a7a70;
}
</style>
