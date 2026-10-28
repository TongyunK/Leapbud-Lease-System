<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoomFillStatus, RoomLeaseCapability, RoomRecord } from '@/types/room'
import { useIsMobile } from '@/composables/useMediaQuery'
import StatusBadge from '@/components/StatusBadge.vue'
import RoomTypeBadge from '@/components/RoomTypeBadge.vue'
import RoomOccupancyChips from '@/components/RoomOccupancyChips.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import RoomImageGallery from '@/components/RoomImageGallery.vue'
import { roomFillStatusTone, roomLeaseCapabilityTone } from '@/constants/statusBadges'
import { formatMoney, formatNumber2 } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    room: RoomRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
  },
)

const emit = defineEmits<{
  openBuilding: [buildingId: string]
  openContracts: [room: RoomRecord]
  openInvoices: [room: RoomRecord]
  openTerminations: [room: RoomRecord]
  openDepositRefunds: [room: RoomRecord]
  openContract: [contractId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function fillStatusOf(row: RoomRecord | null | undefined): RoomFillStatus {
  return row?.occupancy?.summary || 'idle'
}

function leaseCapabilityLabel(cap?: RoomLeaseCapability | string | null) {
  if (cap === 'whole_only') return t('room.leaseCapability.wholeOnlyShort')
  if (cap === 'part_only') return t('room.leaseCapability.partOnlyShort')
  return t('room.leaseCapability.flexibleShort')
}

/** 详情：可整可分时附带份额数，如 可整可分 (2) */
function leaseCapabilityDetailLabel(row: RoomRecord) {
  const base = leaseCapabilityLabel(row.leaseCapability)
  if (row.leaseCapability === 'flexible') {
    const n = row.splitLabels?.length || 0
    if (n > 0) return `${base} (${n})`
  }
  return base
}

function emitIfCount(
  count: number | null | undefined,
  event: 'openContracts' | 'openInvoices' | 'openTerminations' | 'openDepositRefunds',
) {
  const r = props.room
  if (!r || !count) return
  emit(event, r)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('room.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="room">
      <section class="detail-section">
        <h3>{{ t('room.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('room.fields.roomCode') }}</dt>
            <dd>{{ room.roomCode }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.name') }}</dt>
            <dd>{{ room.name }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.roomType') }}</dt>
            <dd><RoomTypeBadge :value="room.roomType" /></dd>
          </div>
          <div>
            <dt>{{ t('room.fields.building') }}</dt>
            <dd>
              <button
                v-if="room.buildingId"
                type="button"
                class="fk-link"
                @click="emit('openBuilding', room.buildingId)"
              >
                {{ room.buildingName || '—' }}
              </button>
              <template v-else>{{ dash(room.buildingName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.status') }}</dt>
            <dd>
              <StatusBadge
                :tone="roomFillStatusTone(fillStatusOf(room))"
                :label="t(`room.fillStatus.${fillStatusOf(room)}`)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.serialNo') }}</dt>
            <dd>{{ dash(room.serialNo) }}</dd>
          </div>
          <div class="detail-span-2">
            <dt>{{ t('room.fields.leaseCapability') }}</dt>
            <dd class="room-lease-cap-detail">
              <StatusBadge
                :tone="roomLeaseCapabilityTone(room.leaseCapability)"
                :label="leaseCapabilityDetailLabel(room)"
              />
              <span
                v-if="room.leaseCapability === 'flexible' && (room.splitLabels?.length || 0) > 0"
                class="room-lease-cap-detail__chips"
                :title="(room.splitLabels || []).join(' / ')"
              >
                <span
                  v-for="lab in room.splitLabels"
                  :key="lab"
                  class="split-label-chip"
                >{{ lab }}</span>
              </span>
            </dd>
          </div>
          <div class="detail-span-2">
            <dt>{{ t('room.fields.occupancy') }}</dt>
            <dd>
              <RoomOccupancyChips
                variant="expanded"
                :occupancy="room.occupancy"
                :lease-capability="room.leaseCapability"
                :split-labels="room.splitLabels"
                @open-contract="(id) => emit('openContract', id)"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('room.sections.pricing') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('room.fields.monthlyRent') }}</dt>
            <dd>{{ formatMoney(room.monthlyRent) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.dailyRent') }}</dt>
            <dd>{{ formatMoney(room.dailyRent) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.hourlyRent') }}</dt>
            <dd>{{ formatMoney(room.hourlyRent) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.sizeSqft') }}</dt>
            <dd>{{ formatNumber2(room.sizeSqft) }} sq.ft</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('room.sections.config') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('room.fields.windowConfig') }}</dt>
            <dd>{{ dash(room.windowConfig) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.acConfig') }}</dt>
            <dd>{{ dash(room.acConfig) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('room.sections.media') }}</h3>
        <RoomImageGallery :room-id="room.id" :images="room.images || []" />
        <dl class="detail-grid" style="margin-top: 14px">
          <div>
            <dt>{{ t('room.fields.description') }}</dt>
            <dd>{{ dash(room.description) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.remark') }}</dt>
            <dd>{{ dash(room.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('room.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('room.fields.latestContract') }}</dt>
            <dd>{{ dash(room.latestContract) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.contractCount') }}</dt>
            <dd>
              <CountListPill
                :count="room.contractCount ?? 0"
                @click="emitIfCount(room.contractCount, 'openContracts')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.invoiceCount') }}</dt>
            <dd>
              <CountListPill
                :count="room.invoiceCount ?? 0"
                @click="emitIfCount(room.invoiceCount, 'openInvoices')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.terminationCount') }}</dt>
            <dd>
              <CountListPill
                :count="room.terminationCount ?? 0"
                @click="emitIfCount(room.terminationCount, 'openTerminations')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.depositRefundCount') }}</dt>
            <dd>
              <CountListPill
                :count="room.depositRefundCount ?? 0"
                @click="emitIfCount(room.depositRefundCount, 'openDepositRefunds')"
              />
            </dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="room.createdBy"
        :created-at="room.createdAt"
        :updated-by="room.updatedBy"
        :updated-at="room.updatedAt"
      />
    </template>
  </el-drawer>
</template>

<style scoped>
.room-lease-cap-detail {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.room-lease-cap-detail__chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.split-label-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #176db0;
  background: #eef6fb;
  box-shadow: inset 0 0 0 1px #b7d7ea;
}
</style>
