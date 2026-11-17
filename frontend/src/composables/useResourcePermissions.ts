import { computed, reactive } from 'vue'
import { useUserStore } from '@/stores/user'

/** 业务资源按钮权限（create / update / delete / import / batchDelete；个别模块另有 purge） */
export function useResourcePermissions(resource: string) {
  const userStore = useUserStore()

  const codes = {
    create: `${resource}:create`,
    update: `${resource}:update`,
    delete: `${resource}:delete`,
    import: `${resource}:import`,
    batchDelete: `${resource}:batchDelete`,
    purge: `${resource}:purge`,
    batchPurge: `${resource}:batchPurge`,
  } as const

  const create = computed(() => userStore.can(codes.create))
  const update = computed(() => userStore.can(codes.update))
  const remove = computed(() => userStore.can(codes.delete))
  const importPerm = computed(() => userStore.can(codes.import))
  const batchDelete = computed(() => userStore.can(codes.batchDelete))
  const purge = computed(() => userStore.can(codes.purge))
  const batchPurge = computed(() => userStore.can(codes.batchPurge))
  const anyWrite = computed(
    () =>
      create.value ||
      update.value ||
      remove.value ||
      importPerm.value ||
      batchDelete.value ||
      purge.value ||
      batchPurge.value,
  )
  const canEditOrDelete = computed(() => update.value || remove.value || purge.value)

  // reactive 解包嵌套 computed，模板 v-if="perms.delete" 才是布尔值；
  // 纯对象包 ComputedRef 时对象恒为真，会导致无权限按钮仍显示、操作列被裁切。
  return reactive({
    codes,
    create,
    update,
    delete: remove,
    import: importPerm,
    batchDelete,
    purge,
    batchPurge,
    anyWrite,
    canEditOrDelete,
  })
}
