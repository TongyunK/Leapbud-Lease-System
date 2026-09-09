<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TimeHmField from '@/components/TimeHmField.vue'
import {
  WEEKDAY_KEYS,
  formatWorkingHours,
  parseWorkingHours,
  type WeekdayKey,
} from '@/utils/workingHours'

const model = defineModel<string>({ default: '' })
const { t } = useI18n()

const days = ref<WeekdayKey[]>([])
const start = ref('09:00')
const end = ref('18:00')
const syncing = ref(false)

function applyFromModel(value: string) {
  syncing.value = true
  const parts = parseWorkingHours(value)
  days.value = [...parts.days]
  start.value = parts.start || '09:00'
  end.value = parts.end || '18:00'
  syncing.value = false
}

applyFromModel(model.value)

watch(
  () => model.value,
  (v) => {
    if (syncing.value) return
    const next = formatWorkingHours({
      days: days.value,
      start: start.value,
      end: end.value,
    })
    if ((v || '') === next) return
    applyFromModel(v || '')
  },
)

function emitModel() {
  const next = formatWorkingHours({
    days: days.value,
    start: start.value,
    end: end.value,
  })
  if (model.value === next) return
  syncing.value = true
  model.value = next
  syncing.value = false
}

watch([days, start, end], emitModel)

function toggleDay(day: WeekdayKey) {
  const set = new Set(days.value)
  if (set.has(day)) set.delete(day)
  else set.add(day)
  days.value = WEEKDAY_KEYS.filter((d) => set.has(d))
}

const preview = computed(() => model.value || t('building.workingHours.empty'))
</script>

<template>
  <div class="wh-field">
    <div class="wh-field__days" role="group" :aria-label="t('building.fields.workingHours')">
      <button
        v-for="day in WEEKDAY_KEYS"
        :key="day"
        type="button"
        class="wh-chip"
        :class="{ 'is-on': days.includes(day) }"
        @click="toggleDay(day)"
      >
        {{ t(`building.workingHours.days.${day}`) }}
      </button>
    </div>

    <div class="wh-field__times">
      <TimeHmField v-model="start" :placeholder="t('building.workingHours.start')" />
      <span class="wh-field__sep">-</span>
      <TimeHmField v-model="end" :placeholder="t('building.workingHours.end')" />
    </div>

    <p class="wh-field__preview">{{ preview }}</p>
  </div>
</template>

<style scoped>
.wh-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.wh-field__days {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.wh-chip {
  appearance: none;
  margin: 0;
  padding: 5px 10px;
  border: 1px solid #d7ded9;
  border-radius: 999px;
  background: #fff;
  color: #3a4a42;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.wh-chip:hover {
  border-color: #b7c6bd;
  background: #f7f9f8;
}

.wh-chip.is-on {
  border-color: var(--lb-brand);
  background: #eef6f1;
  color: var(--lb-brand);
  box-shadow: 0 0 0 1px var(--lb-brand) inset;
}

.wh-field__times {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.wh-field__sep {
  flex: 0 0 auto;
  color: var(--lb-muted);
  font-weight: 600;
}

.wh-field__preview {
  margin: 0;
  font-size: 0.78rem;
  color: var(--lb-muted);
}
</style>
