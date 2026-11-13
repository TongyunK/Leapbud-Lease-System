<script setup lang="ts">
/**
 * 附件图片预览：z-index 始终盖过抬高的业务弹窗／抽屉。
 * 全站附件预览统一用本组件，勿直接使用裸 el-image-viewer。
 */
import { useOverlayStackZ } from '@/composables/useOverlayStackZ'

withDefaults(
  defineProps<{
    urlList: string[]
    initialIndex?: number
  }>(),
  { initialIndex: 0 },
)

const emit = defineEmits<{ close: [] }>()

const { allocPreviewZ } = useOverlayStackZ()
/** 组件随 v-if 挂载即分配，关闭销毁后下次再开会重新抬层 */
const zIndex = allocPreviewZ()
</script>

<template>
  <!-- teleported 必须为 true：办理退款等抬高弹窗带 transform，不 teleport 会被压在弹窗内／下层 -->
  <el-image-viewer
    :url-list="urlList"
    :initial-index="initialIndex"
    :z-index="zIndex"
    :teleported="true"
    hide-on-click-modal
    @close="emit('close')"
  />
</template>
