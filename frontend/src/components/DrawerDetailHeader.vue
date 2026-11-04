<script setup lang="ts">
withDefaults(
  defineProps<{
    titleId?: string
    titleClass?: string | Record<string, boolean> | Array<string | Record<string, boolean>>
    title: string
    /** 业务编号，显示在标题右侧 */
    code?: string | null
  }>(),
  {
    titleId: undefined,
    titleClass: 'el-drawer__title',
    code: '',
  },
)
</script>

<template>
  <div class="drawer-header-with-action">
    <div class="drawer-header-title-block">
      <h4 :id="titleId" :class="titleClass">{{ title }}</h4>
      <span v-if="code?.trim()" class="drawer-header-code" :title="code">{{ code }}</span>
    </div>
    <slot />
  </div>
</template>
