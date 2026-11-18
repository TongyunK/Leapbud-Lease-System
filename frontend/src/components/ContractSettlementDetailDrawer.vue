<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ContractSettlementRecord,
  ReceivableWriteoffRecord,
} from '@/types/contract-settlement'
import { normalizeCollectStatus } from '@/types/contract-settlement'
import { fetchSettlementWriteoffs } from '@/api/contract-settlements'
import { fetchReceivables } from '@/api/receivables'
import { useIsMobile } from '@/composables/useMediaQuery'
import {
  OVERLAY_ABOVE_FEATURE_MENU_Z,
  useOverlayStackZ,
} from '@/composables/useOverlayStackZ'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import ContractSettlementItemsDialog from '@/components/ContractSettlementItemsDialog.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import {
  contractSettlementCollectStatusTone,
  contractSettlementRefundStatusTone,
  contractSettlementTypeTone,
  receivableValidityKey,
} from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: ContractSettlementRecord | null
    desktopDirection?: 'ltr' | 'rtl'

    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    desktopDirection: 'rtl',
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
  openReceivable: [receivableId: string]
  openInvoice: [invoiceId: string]
  openRefundOrders: [settlement: ContractSettlementRecord]
}>()

const { t, te } = useI18n()
const isMobile = useIsMobile()
const { allocZ, raiseFloor } = useOverlayStackZ()
const writeoffs = ref<ReceivableWriteoffRecord[]>([])
const writeoffsLoading = ref(false)
/** 关联合约当前有效应收未收合计 */
const contractOpenReceivable = ref<number | null>(null)
const itemsDialogVisible = ref(false)
const itemsDialogZ = ref<number | undefined>(undefined)

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => (isMobile.value ? '100%' : '640px'))

const refundStatus = computed(
  () => props.record?.refundStatus || props.record?.status || '',
)

const showPendingBanner = computed(() => {
  const s = refundStatus.value
  return s === 'pending_refund' || s === 'partial'
})

const pendingBannerText = computed(() =>
  refundStatus.value === 'partial'
    ? t('contractSettlement.partialRefundBanner')
    : t('contractSettlement.pendingRefundBanner'),
)

const terminationDateLabel = computed(() =>
  props.record?.type === 'CANCEL'
    ? t('contractSettlement.fields.cancelDate')
    : t('contractSettlement.fields.terminationDate'),
)

/** 备注与终止原因相同时不重复展示 */
const showRemark = computed(() => {
  const remark = (props.record?.remark || '').trim()
  if (!remark) return false
  const reason = (props.record?.reason || '').trim()
  return remark !== reason
})

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** 豁免未实现、定金抵扣并入应加收公式：条数均不计入 */
function isHiddenSettlementItem(it: { itemType?: string | null; remark?: string | null }) {
  const ty = (it.itemType || '').trim()
  if (ty === 'WAIVER' || ty === 'BOOKING_DEPOSIT_OFFSET') return true
  return (it.remark || '').trim() === 'booking_offset_excess'
}

const visibleItemCount = computed(
  () => (props.record?.items || []).filter((it) => !isHiddenSettlementItem(it)).length,
)

function openItemsDialog() {
  if (!visibleItemCount.value) return
  itemsDialogZ.value = allocZ(
    Math.max(Number(props.zIndex) || 0, OVERLAY_ABOVE_FEATURE_MENU_Z),
  )
  itemsDialogVisible.value = true
}

function onItemsDialogOpenReceivable(id: string) {
  if (itemsDialogZ.value != null) raiseFloor(itemsDialogZ.value)
  emit('openReceivable', id)
}

function onItemsDialogOpenInvoice(id: string) {
  if (itemsDialogZ.value != null) raiseFloor(itemsDialogZ.value)
  emit('openInvoice', id)
}

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function writeoffReasonLabel(code?: string | null) {
  const c = (code || '').trim()
  if (!c) return '—'
  const key = `contractSettlement.writeoffReason.${c}`
  return te(key) ? t(key) : c
}

defineExpose({ openItemsDialog })

async function loadWriteoffs(id: string) {
  writeoffsLoading.value = true
  try {
    const { data } = await fetchSettlementWriteoffs(id)
    writeoffs.value = data ?? []
  } catch {
    writeoffs.value = []
  } finally {
    writeoffsLoading.value = false
  }
}

async function loadContractOpenReceivable(contractId?: string | null) {
  const id = (contractId || '').trim()
  if (!id) {
    contractOpenReceivable.value = null
    return
  }
  try {
    const { data } = await fetchReceivables({
      contractId: id,
      validity: 'all',
      page: 1,
      pageSize: 200,
    })
    const open = (data.items ?? [])
      .filter((r) => receivableValidityKey(r.invoiceStatus) !== 'invalid')
      .reduce((s, r) => s + (Number(r.receivableAmount) || 0), 0)
    contractOpenReceivable.value = round2(open)
  } catch {
    contractOpenReceivable.value = null
  }
}

watch(
  () => [visible.value, props.record?.id, props.record?.contractId] as const,
  ([open, id, contractId]) => {
    if (open && id) {
      void loadWriteoffs(id)
      void loadContractOpenReceivable(contractId)
    }
    if (!open) {
      writeoffs.value = []
      contractOpenReceivable.value = null
      itemsDialogVisible.value = false
    }
  },
)

function onOpenRefundOrders() {
  if (!props.record || !(props.record.refundOrderCount ?? 0)) return
  emit('openRefundOrders', props.record)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :direction="direction"
    class="responsive-drawer"
    append-to-body
    :z-index="zIndex"
  >
    <template #header="{ titleId, titleClass }">
      <DrawerDetailHeader
        :title-id="titleId"
        :title-class="titleClass"
        :title="t('contractSettlement.detailTitle')"
        :code="record?.settlementCode"
      />
    </template>
    <template v-if="record">
      <div
        v-if="showPendingBanner"
        class="settlement-detail__banner is-warn"
        role="status"
      >
        <div class="settlement-detail__banner-dot" />
        <p class="settlement-detail__banner-title">{{ pendingBannerText }}</p>
      </div>

      <section class="detail-section">
        <h3>{{ t('contractSettlement.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contractSettlement.fields.settlementCode') }}</dt>
            <dd>{{ record.settlementCode }}</dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.type') }}</dt>
            <dd>
              <StatusBadge
                :tone="contractSettlementTypeTone(record.type)"
                :label="t(`contractSettlement.type.${record.type}`, record.type)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.refundStatus') }}</dt>
            <dd>
              <StatusBadge
                :tone="contractSettlementRefundStatusTone(record.refundStatus || record.status)"
                :label="
                  t(
                    `contractSettlement.refundStatus.${record.refundStatus || record.status}`,
                    record.refundStatus || record.status,
                  )
                "
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.collectStatus') }}</dt>
            <dd>
              <StatusBadge
                :tone="contractSettlementCollectStatusTone(record.collectStatus)"
                :label="
                  t(
                    `contractSettlement.collectStatus.${normalizeCollectStatus(record.collectStatus)}`,
                  )
                "
              />
            </dd>
          </div>
          <div>
            <dt>{{ terminationDateLabel }}</dt>
            <dd>{{ dash(record.terminationDate || record.settlementDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.refundOrderCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.refundOrderCount ?? 0"
                @click="onOpenRefundOrders"
              />
            </dd>
          </div>
          <template v-if="record.type === 'VACATE'">
            <div class="full">
              <dt>{{ t('contractSettlement.fields.reason') }}</dt>
              <dd>{{ dash(record.reason) }}</dd>
            </div>
            <div class="full">
              <dt>{{ t('contractSettlement.fields.siteCondition') }}</dt>
              <dd>{{ dash(record.siteCondition) }}</dd>
            </div>
            <div>
              <dt>{{ t('contractSettlement.fields.doorKeyReturnedQty') }}</dt>
              <dd>{{ record.doorKeyReturnedQty ?? 0 }}</dd>
            </div>
            <div>
              <dt>{{ t('contractSettlement.fields.smartCardReturnedQty') }}</dt>
              <dd>{{ record.smartCardReturnedQty ?? 0 }}</dd>
            </div>
            <div class="full">
              <dt>{{ t('contractSettlement.fields.noticeAttachment') }}</dt>
              <dd class="path-text">{{ dash(record.noticeAttachment) }}</dd>
            </div>
          </template>
          <div>
            <dt>{{ t('contractSettlement.fields.contractCode') }}</dt>
            <dd>
              <button
                v-if="record.contractId"
                type="button"
                class="fk-link"
                @click="emit('openContract', record.contractId)"
              >
                {{ record.contractCode || '—' }}
              </button>
              <template v-else>{{ dash(record.contractCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="record.customerId"
                type="button"
                class="fk-link"
                @click="emit('openCustomer', record.customerId)"
              >
                {{ record.customerName || record.customerCode || '—' }}
              </button>
              <template v-else>{{ dash(record.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.roomCode') }}</dt>
            <dd>
              <button
                v-if="record.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', record.roomId)"
              >
                {{ record.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(record.roomCode) }}</template>
            </dd>
          </div>
          <div v-if="showRemark">
            <dt>{{ t('common.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contractSettlement.sections.amounts') }}</h3>
        <dl class="detail-grid three">
          <div>
            <dt>{{ t('contractSettlement.fields.deductionTotal') }}</dt>
            <dd>{{ money(record.deductionTotal) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.additionalTotal') }}</dt>
            <dd>{{ money(record.additionalTotal) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.contractOpenReceivable') }}</dt>
            <dd>{{ money(contractOpenReceivable) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.refundDueTotal') }}</dt>
            <dd>{{ money(record.refundDueTotal) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.refundedTotal') }}</dt>
            <dd>{{ money(record.refundedTotal) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractSettlement.fields.refundRemaining') }}</dt>
            <dd>
              {{
                money(
                  record.refundRemaining != null
                    ? record.refundRemaining
                    : Math.max(
                        0,
                        Math.round(
                          (Number(record.refundDueTotal) - Number(record.refundedTotal)) * 100,
                        ) / 100,
                      ),
                )
              }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contractSettlement.sections.items') }}</h3>
        <CountListPill :count="visibleItemCount" @click="openItemsDialog" />
        <p v-if="!visibleItemCount" class="settlement-detail__empty">
          {{ t('contractSettlement.itemGroups.empty') }}
        </p>
      </section>

      <section v-if="writeoffsLoading || writeoffs.length" class="detail-section">
        <h3>{{ t('contractSettlement.sections.writeoffs') }}</h3>
        <el-table v-loading="writeoffsLoading" :data="writeoffs" border>
          <el-table-column prop="writeoffCode" :label="t('contractSettlement.fields.writeoffCode')" min-width="140" />
          <el-table-column :label="t('contractSettlement.fields.receivableCode')" min-width="120">
            <template #default="{ row }">
              <button
                v-if="row.receivableId"
                type="button"
                class="fk-link"
                @click="emit('openReceivable', row.receivableId)"
              >
                {{ row.receivableCode || '—' }}
              </button>
              <template v-else>{{ dash(row.receivableCode) }}</template>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.amount')" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column :label="t('contractSettlement.fields.reasonType')" min-width="120">
            <template #default="{ row }">{{ writeoffReasonLabel(row.reasonType) }}</template>
          </el-table-column>
          <el-table-column prop="writeoffDate" :label="t('contractSettlement.fields.writeoffDate')" width="120" />
        </el-table>
      </section>

      <AuditDetailSection
        :created-by="record.createdBy"
        :updated-by="record.updatedBy"
        :created-at="record.createdAt"
        :updated-at="record.updatedAt"
      />
    </template>
  </el-drawer>

  <ContractSettlementItemsDialog
    v-model="itemsDialogVisible"
    :record="record"
    :z-index="itemsDialogZ"
    @open-receivable="onItemsDialogOpenReceivable"
    @open-invoice="onItemsDialogOpenInvoice"
  />
</template>

<style scoped>
.settlement-detail__banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
}

.settlement-detail__banner.is-warn {
  background: #fdf6e8;
  border: 1px solid #f0d9a8;
}

.settlement-detail__banner-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: #c47d0a;
}

.settlement-detail__banner-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: #8a5a10;
  line-height: 1.45;
}

.settlement-detail__empty {
  margin: 8px 0 0;
  color: var(--lb-muted, #666);
  font-size: 0.95rem;
}

/* 金额汇总与基本信息略加大，与明细一致 */
:deep(.detail-grid dt) {
  font-size: 0.82rem;
}

:deep(.detail-grid dd) {
  font-size: 0.95rem;
}
</style>
