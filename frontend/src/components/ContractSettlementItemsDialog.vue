<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ContractSettlementItemRecord,
  ContractSettlementRecord,
} from '@/types/contract-settlement'
import { useIsMobile } from '@/composables/useMediaQuery'
import { formatMoney } from '@/utils/format'
import { formatSettlementItemDescParts } from '@/utils/settlementItemDesc'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: ContractSettlementRecord | null
    zIndex?: number
  }>(),
  {
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openReceivable: [receivableId: string]
  openInvoice: [invoiceId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const dialogWidth = computed(() => (isMobile.value ? '94%' : '780px'))

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function sumAmount(rows: ContractSettlementItemRecord[]) {
  return round2(rows.reduce((s, it) => s + (Number(it.amount) || 0), 0))
}

function isBookingOffsetItem(it: ContractSettlementItemRecord) {
  if ((it.itemType || '').trim() === 'BOOKING_DEPOSIT_OFFSET') return true
  return (it.remark || '').trim() === 'booking_offset_excess'
}

function isDeductionItem(it: ContractSettlementItemRecord) {
  if (isBookingOffsetItem(it)) return false
  const ty = (it.itemType || '').trim()
  return ty === 'DAMAGE_DEDUCTION' || ty === 'PENALTY_DEDUCTION'
}

function isExcessCompensationItem(it: ContractSettlementItemRecord) {
  if ((it.remark || '').trim() === 'excess_compensation') return true
  return /超出按金|excess.?compensat/i.test(it.description || '')
}

const allItems = computed(() => props.record?.items || [])

/** 定金抵扣仅用于推算应加收公式，界面不单独成栏 */
const bookingOffsetTotal = computed(() =>
  sumAmount(allItems.value.filter((it) => isBookingOffsetItem(it))),
)

/** 豁免、定金抵扣不在明细分组中展示 */
const visibleItems = computed(() =>
  allItems.value.filter((it) => {
    if ((it.itemType || '').trim() === 'WAIVER') return false
    if (isBookingOffsetItem(it)) return false
    return true
  }),
)

const deductionItems = computed(() => visibleItems.value.filter((it) => isDeductionItem(it)))
const additionalItems = computed(() =>
  visibleItems.value.filter((it) => (it.itemType || '').trim() === 'ADDITIONAL_CHARGE'),
)
const voidReceivableItems = computed(() =>
  visibleItems.value.filter((it) => (it.itemType || '').trim() === 'VOID_RECEIVABLE'),
)
const refundAllocationItems = computed(() =>
  visibleItems.value.filter((it) => (it.itemType || '').trim() === 'REFUND_ALLOCATION'),
)
const otherItems = computed(() =>
  visibleItems.value.filter((it) => {
    const ty = (it.itemType || '').trim()
    if (isDeductionItem(it)) return false
    return (
      ty !== 'ADDITIONAL_CHARGE' &&
      ty !== 'VOID_RECEIVABLE' &&
      ty !== 'REFUND_ALLOCATION'
    )
  }),
)

const deductionTotalForFormula = computed(() => {
  if (deductionItems.value.length) return sumAmount(deductionItems.value)
  return round2(Number(props.record?.deductionTotal) || 0)
})

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

/** 应加收（超出按金赔偿）金额由来：扣除 − 定金 − 按金 = 应加收 */
function excessFormulaOf(row: ContractSettlementItemRecord) {
  if (!isExcessCompensationItem(row)) return ''
  const deduction = deductionTotalForFormula.value
  const booking = bookingOffsetTotal.value
  const amount = round2(Number(row.amount) || 0)
  if (deduction <= 0.009 && amount <= 0.009) return ''
  const deposit = round2(Math.max(0, deduction - booking - amount))
  if (booking > 0.009) {
    return t('contractSettlement.itemGroups.excessFormula', {
      deduction: money(deduction),
      booking: money(booking),
      deposit: money(deposit),
      amount: money(amount),
    })
  }
  return t('contractSettlement.itemGroups.excessFormulaNoBooking', {
    deduction: money(deduction),
    deposit: money(deposit),
    amount: money(amount),
  })
}

function itemTypeLabel(type?: string | null) {
  const ty = (type || '').trim()
  if (!ty) return '—'
  return t(`contractSettlement.itemType.${ty}`, ty)
}

function onOpenReceivable(row: ContractSettlementItemRecord) {
  const id = (row.receivableId || '').trim()
  if (!id) return
  emit('openReceivable', id)
}

/** 描述 i18n + 末尾业务编号（发票号／应收号），可点开详情 */
function descParts(row: ContractSettlementItemRecord) {
  return formatSettlementItemDescParts(row, t)
}

function descText(row: ContractSettlementItemRecord) {
  const p = descParts(row)
  return p.code ? `${p.text} ${p.code}` : p.text
}

function canOpenDescCode(row: ContractSettlementItemRecord) {
  return !!(row.invoiceId || row.receivableId)
}

function onOpenDescCode(row: ContractSettlementItemRecord) {
  const invoiceId = (row.invoiceId || '').trim()
  if (invoiceId) {
    emit('openInvoice', invoiceId)
    return
  }
  onOpenReceivable(row)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('contractSettlement.itemsDialogTitle')"
    :width="dialogWidth"
    :fullscreen="isMobile"
    class="lb-dialog settlement-items-dialog"
    append-to-body
    destroy-on-close
    :z-index="zIndex"
  >
    <div class="settlement-item-groups">
      <div v-if="deductionItems.length" class="settlement-item-group">
        <div class="settlement-item-group__head">
          <h4>{{ t('contractSettlement.itemGroups.deduction') }}</h4>
          <span class="settlement-item-group__sum">
            {{ t('contractSettlement.itemGroups.subtotal') }}
            {{ money(sumAmount(deductionItems)) }}
          </span>
        </div>
        <el-table :data="deductionItems" border>
          <el-table-column type="index" label="#" width="52" />
          <el-table-column
            :label="t('contractSettlement.fields.itemType')"
            min-width="100"
          >
            <template #default="{ row }">{{ itemTypeLabel(row.itemType) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.description')" min-width="200">
            <template #default="{ row }">{{ descText(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.amount')" width="110" align="right">
            <template #default="{ row }">
              <span class="settlement-amount">{{ money(row.amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="additionalItems.length" class="settlement-item-group">
        <div class="settlement-item-group__head">
          <h4>{{ t('contractSettlement.itemGroups.additional') }}</h4>
        </div>
        <el-table :data="additionalItems" border>
          <el-table-column type="index" label="#" width="52" />
          <el-table-column :label="t('common.description')" min-width="240">
            <template #default="{ row }">
              <div
                v-for="p in [descParts(row)]"
                :key="row.id"
                class="settlement-item-desc"
              >
                <span>
                  <template v-if="p.code && canOpenDescCode(row)">
                    {{ p.text }}
                    <button type="button" class="fk-link" @click="onOpenDescCode(row)">
                      {{ p.code }}
                    </button>
                  </template>
                  <template v-else>{{ descText(row) }}</template>
                </span>
                <span v-if="excessFormulaOf(row)" class="settlement-item-desc__formula">
                  {{ excessFormulaOf(row) }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.amount')" width="120" align="right">
            <template #default="{ row }">
              <button
                v-if="row.receivableId"
                type="button"
                class="settlement-amount settlement-amount--strong settlement-amount--link"
                @click="onOpenReceivable(row)"
              >
                {{ money(row.amount) }}
              </button>
              <span v-else class="settlement-amount settlement-amount--strong">
                {{ money(row.amount) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="voidReceivableItems.length" class="settlement-item-group">
        <div class="settlement-item-group__head">
          <h4>{{ t('contractSettlement.itemGroups.voidReceivable') }}</h4>
        </div>
        <el-table :data="voidReceivableItems" border>
          <el-table-column type="index" label="#" width="52" />
          <el-table-column :label="t('common.description')" min-width="200">
            <template #default="{ row }">
              <template v-for="p in [descParts(row)]" :key="row.id">
                <template v-if="p.code && canOpenDescCode(row)">
                  {{ p.text }}
                  <button type="button" class="fk-link" @click="onOpenDescCode(row)">
                    {{ p.code }}
                  </button>
                </template>
                <template v-else>{{ descText(row) }}</template>
              </template>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.amount')" width="120" align="right">
            <template #default="{ row }">
              <button
                v-if="row.receivableId"
                type="button"
                class="settlement-amount settlement-amount--link"
                @click="onOpenReceivable(row)"
              >
                {{ money(row.amount) }}
              </button>
              <span v-else class="settlement-amount">{{ money(row.amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="refundAllocationItems.length" class="settlement-item-group">
        <div class="settlement-item-group__head">
          <h4>{{ t('contractSettlement.itemGroups.refundAllocation') }}</h4>
        </div>
        <el-table :data="refundAllocationItems" border>
          <el-table-column type="index" label="#" width="52" />
          <el-table-column :label="t('common.description')" min-width="200">
            <template #default="{ row }">{{ descText(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.amount')" width="120" align="right">
            <template #default="{ row }">
              <span class="settlement-amount settlement-amount--strong">
                {{ money(row.amount) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="otherItems.length" class="settlement-item-group">
        <div class="settlement-item-group__head">
          <h4>{{ t('contractSettlement.itemGroups.other') }}</h4>
        </div>
        <el-table :data="otherItems" border>
          <el-table-column type="index" label="#" width="52" />
          <el-table-column
            :label="t('contractSettlement.fields.itemType')"
            min-width="100"
          >
            <template #default="{ row }">{{ itemTypeLabel(row.itemType) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.description')" min-width="160">
            <template #default="{ row }">{{ descText(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.amount')" width="120" align="right">
            <template #default="{ row }">
              <span class="settlement-amount">{{ money(row.amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" class="lb-btn-primary" @click="visible = false">
        {{ t('common.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.settlement-item-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settlement-item-group__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.settlement-item-group__head h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
  color: #2f3f36;
}

.settlement-item-group__sum {
  flex-shrink: 0;
  font-size: 0.92rem;
  color: #5a6a60;
  font-variant-numeric: tabular-nums;
}

.settlement-item-group :deep(.el-table) {
  --el-table-font-size: 0.92rem;
  font-size: 0.92rem;
}

.settlement-item-group :deep(.el-table th.el-table__cell) {
  font-size: 0.88rem;
}

.settlement-item-group :deep(.el-table td.el-table__cell) {
  font-size: 0.92rem;
}

.settlement-item-group :deep(.fk-link) {
  font-size: inherit;
}

/** 金额：默认黑色常规；仅应加收／应退加粗 */
.settlement-amount {
  color: #111;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.settlement-amount--link {
  appearance: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  cursor: pointer;
  text-align: right;
}

.settlement-amount--strong {
  color: #000;
  font-weight: 600;
}

.settlement-amount--link:hover {
  text-decoration: underline;
}

.settlement-item-desc {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.4;
}

.settlement-item-desc__formula {
  font-size: 0.86rem;
  color: #6a7a70;
  font-variant-numeric: tabular-nums;
}
</style>
