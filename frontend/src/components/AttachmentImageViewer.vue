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
    /** 预览标题（如模板显示名）；有值时叠在查看器顶部 */
    title?: string
  }>(),
  { initialIndex: 0, title: '' },
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
  <Teleport to="body">
    <div
      v-if="title.trim()"
      class="lb-attachment-image-viewer__title"
      :style="{ zIndex: zIndex + 1 }"
    >
      {{ title.trim() }}
    </div>
  </Teleport>
</template>

<style scoped>
.lb-attachment-image-viewer__title {
  position: fixed;
  /* 避开 el-image-viewer 顶部操作栏 */
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(72vw, 560px);
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: 0.01em;
  color: #fff;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  background: rgba(15, 20, 18, 0.72);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(8px);
}
</style>
