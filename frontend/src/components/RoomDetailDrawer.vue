<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoomRecord } from '@/types/room'
import { useIsMobile } from '@/composables/useMediaQuery'
import StatusBadge from '@/components/StatusBadge.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import { roomStatusTone } from '@/constants/statusBadges'
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
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
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
            <dd>{{ dash(room.roomType) }}</dd>
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
                :tone="roomStatusTone(room.status)"
                :label="t(`room.status.${room.status}`)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.serialNo') }}</dt>
            <dd>{{ dash(room.serialNo) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.subleaseMark') }}</dt>
            <dd>{{ dash(room.subleaseMark) }}</dd>
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
        <div class="image-row">
          <div
            v-for="(src, idx) in [room.image1, room.image2, room.image3]"
            :key="idx"
            class="image-item"
          >
            <span>{{ t('room.fields.image') }} {{ idx + 1 }}</span>
            <img v-if="src" :src="src" alt="" />
            <em v-else>—</em>
          </div>
        </div>
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
        <h3>{{ t('room.sections.contract') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('room.fields.latestContract') }}</dt>
            <dd>{{ dash(room.latestContract) }}</dd>
          </div>
          <div>
            <dt>{{ t('room.fields.contractRecords') }}</dt>
            <dd>{{ room.contractRecords?.join(', ') || '—' }}</dd>
          </div>
        </dl>
      </section>

            <section class="detail-section">
        <h3>{{ t('room.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('room.fields.contractCount') }}</dt>
            <dd>
              <CountListPill :count="room.contractCount ?? 0" @click="emitIfCount(room.contractCount, 'openContracts')" />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.invoiceCount') }}</dt>
            <dd>
              <CountListPill :count="room.invoiceCount ?? 0" @click="emitIfCount(room.invoiceCount, 'openInvoices')" />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.terminationCount') }}</dt>
            <dd>
              <CountListPill :count="room.terminationCount ?? 0" @click="emitIfCount(room.terminationCount, 'openTerminations')" />
            </dd>
          </div>
          <div>
            <dt>{{ t('room.fields.depositRefundCount') }}</dt>
            <dd>
              <CountListPill :count="room.depositRefundCount ?? 0" @click="emitIfCount(room.depositRefundCount, 'openDepositRefunds')" />
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
.image-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.image-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--lb-muted, #6a7a70);
}

.image-item img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--lb-border, #dce3df);
}

@media (max-width: 640px) {
  .image-row {
    grid-template-columns: 1fr;
  }
}
</style>
