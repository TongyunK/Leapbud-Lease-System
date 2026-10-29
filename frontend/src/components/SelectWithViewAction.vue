<script setup lang="ts">
/**
 * 业务实体选择：框内右侧「箭头/清空 + 查看」。
 * 下拉：… [▼][查看]；有值且悬停/聚焦时与 EP 一致，[▼] 变为 [×]（不同时出现）
 * 可清空：须同步传 clearable，并由内层 el-select 设 clearable
 * 只读 input：无箭头，仅「查看」贴右
 */
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    disabled?: boolean
    clearable?: boolean
    control?: 'select' | 'input'
  }>(),
  { disabled: false, clearable: false, control: 'select' },
)

const emit = defineEmits<{
  view: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="sia"
    :class="{
      'sia--clearable': clearable,
      'sia--input': control === 'input',
    }"
  >
    <div class="sia__field">
      <slot />
    </div>
    <div class="sia__trail">
      <button
        type="button"
        class="sia__view"
        :disabled="disabled"
        @click.stop="emit('view')"
      >
        {{ t('common.view') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sia {
  /* 仅给「查看」留位；箭头/清空仍用 EP 原生 suffix，同槽位互换 */
  --sia-view: 30px;
  --sia-edge: 10px;
  --sia-trail: calc(var(--sia-view) + var(--sia-edge));

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
}

.sia__field {
  grid-area: 1 / 1;
  min-width: 0;
  width: 100%;
}

.sia__field :deep(.el-select),
.sia__field :deep(.el-input) {
  width: 100% !important;
  max-width: 100%;
}

/*
 * padding 只为「查看」留空，不要把整个 suffix 再往左推一大截。
 * EP 原生 caret / clear 仍在 suffix 同位置互斥切换（参考销售经理下拉）。
 */
.sia__field :deep(.el-select__wrapper) {
  width: 100%;
  padding-right: var(--sia-trail) !important;
}

.sia__field :deep(.el-input__wrapper) {
  width: 100%;
  padding-right: var(--sia-trail) !important;
}

/* 「查看」贴右；箭头在其左侧由 EP 绘制 */
.sia__trail {
  grid-area: 1 / 1;
  justify-self: end;
  align-self: center;
  z-index: 2;
  display: flex;
  align-items: center;
  padding-right: var(--sia-edge);
  pointer-events: none;
}

.sia__view {
  pointer-events: auto;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--lb-brand, #0f4a32);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;
}

.sia__field :deep(.el-select__suffix) {
  z-index: 3;
}

.sia__view:hover:not(:disabled) {
  text-decoration: underline;
}

.sia__view:disabled {
  color: var(--lb-muted, #6a7a70);
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
