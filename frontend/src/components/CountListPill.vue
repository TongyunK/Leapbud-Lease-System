<script setup lang="ts">
withDefaults(
  defineProps<{
    count: number
    /** 为 0 时是否仍可点 */
    clickableWhenEmpty?: boolean
  }>(),
  {
    clickableWhenEmpty: false,
  },
)

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    type="button"
    class="lb-count-list-pill"
    :class="{
      'is-empty': !count,
      'is-clickable': count > 0 || clickableWhenEmpty,
    }"
    :disabled="!(count > 0 || clickableWhenEmpty)"
    @click.stop="$emit('click', $event)"
  >
    <span class="lb-count-list-pill__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
        <path
          d="M2.5 3.25h8.5M2.5 7h7.25M2.5 10.75h5.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <circle cx="11.25" cy="11.1" r="2.35" stroke="currentColor" stroke-width="1.45" />
        <path
          d="M12.95 12.85 14.4 14.3"
          stroke="currentColor"
          stroke-width="1.45"
          stroke-linecap="round"
        />
      </svg>
    </span>
    <span class="lb-count-list-pill__num">{{ count }}</span>
  </button>
</template>
