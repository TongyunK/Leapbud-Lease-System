<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

const props = withDefaults(
  defineProps<{
    total: number
    pageSizes?: number[]
    /** 跨页已选数量 */
    selectedCount?: number
    /** 显示「全选全部」按钮 */
    enableSelectAll?: boolean
    selectAllLoading?: boolean
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
    selectedCount: 0,
    enableSelectAll: false,
    selectAllLoading: false,
  },
)

const emit = defineEmits<{
  'select-all': []
  'clear-selection': []
}>()

const { t } = useI18n()

const maxPage = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value) || 1))
const showSelectAll = computed(
  () => props.enableSelectAll && props.total > 0 && props.selectedCount < props.total,
)
const showBatch = computed(() => props.selectedCount > 0)
const showLeftActions = computed(() => showSelectAll.value || showBatch.value)

/** 页码列表：数字或省略号 */
const pageItems = computed(() => {
  const total = maxPage.value
  const current = Math.min(page.value, total)
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)

  if (left > 2) items.push('ellipsis')
  for (let i = left; i <= right; i += 1) items.push(i)
  if (right < total - 1) items.push('ellipsis')
  items.push(total)
  return items
})

function prev() {
  if (page.value > 1) page.value -= 1
}

function next() {
  if (page.value < maxPage.value) page.value += 1
}

function go(n: number) {
  if (n >= 1 && n <= maxPage.value) page.value = n
}

function onSizeChange(size: string | number) {
  pageSize.value = Number(size)
  page.value = 1
}

const jumpDraft = ref(String(page.value))

watch(page, (n) => {
  jumpDraft.value = String(n)
})

function onJumpInput(e: Event) {
  jumpDraft.value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)
}

function commitJump() {
  const raw = Number.parseInt(jumpDraft.value, 10)
  if (!Number.isFinite(raw)) {
    jumpDraft.value = String(page.value)
    return
  }
  const next = Math.min(maxPage.value, Math.max(1, raw))
  page.value = next
  jumpDraft.value = String(next)
}

function onJumpKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitJump()
    ;(e.target as HTMLInputElement).blur()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    jumpDraft.value = String(page.value)
    ;(e.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <div class="lb-pager">
    <div class="lb-pager__left">
      <span class="lb-pager__total">{{ t('common.records', { n: total }) }}</span>
      <div v-if="showLeftActions" class="lb-pager__batch">
        <span v-if="showBatch" class="lb-pager__selected">
          {{ t('common.selectedCount', { n: selectedCount }) }}
        </span>
        <div class="lb-pager__batch-actions">
          <button
            v-if="showSelectAll"
            type="button"
            class="lb-pager__batch-btn lb-pager__batch-btn--primary"
            :disabled="selectAllLoading"
            @click="emit('select-all')"
          >
            {{ t('common.selectAllFiltered') }}
          </button>
          <button
            v-if="showBatch"
            type="button"
            class="lb-pager__batch-btn lb-pager__batch-btn--muted"
            :disabled="selectAllLoading"
            @click="emit('clear-selection')"
          >
            {{ t('common.clearSelection') }}
          </button>
          <template v-if="showBatch">
            <slot name="batch" />
          </template>
        </div>
      </div>
    </div>

    <div class="lb-pager__nav">
      <button
        type="button"
        class="lb-pager__btn lb-pager__arrow"
        :disabled="page <= 1"
        :aria-label="t('common.prevPage')"
        @click="prev"
      >
        <el-icon :size="14"><ArrowLeft /></el-icon>
      </button>

      <template v-for="(item, idx) in pageItems" :key="`${item}-${idx}`">
        <span v-if="item === 'ellipsis'" class="lb-pager__ellipsis">…</span>
        <button
          v-else
          type="button"
          class="lb-pager__btn lb-pager__page"
          :class="{ 'is-active': item === page }"
          @click="go(item)"
        >
          {{ item }}
        </button>
      </template>

      <button
        type="button"
        class="lb-pager__btn lb-pager__arrow"
        :disabled="page >= maxPage"
        :aria-label="t('common.nextPage')"
        @click="next"
      >
        <el-icon :size="14"><ArrowRight /></el-icon>
      </button>
    </div>

    <div class="lb-pager__right">
      <label class="lb-pager__jump">
        <span>{{ t('common.goToPage') }}</span>
        <input
          class="lb-pager__jump-input"
          type="text"
          inputmode="numeric"
          :value="jumpDraft"
          :disabled="maxPage <= 1"
          :aria-label="t('common.goToPage')"
          @input="onJumpInput"
          @keydown="onJumpKeydown"
          @blur="commitJump"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <span v-if="t('common.pageUnit')">{{ t('common.pageUnit') }}</span>
      </label>
      <el-select
        class="lb-pager__size"
        size="small"
        style="width: 96px"
        popper-class="lb-pager-size-popper"
        :model-value="pageSize"
        :teleported="true"
        :fit-input-width="false"
        @change="onSizeChange"
      >
        <el-option
          v-for="size in pageSizes"
          :key="size"
          :label="t('common.perPage', { n: size })"
          :value="size"
        />
      </el-select>
    </div>
  </div>
</template>
