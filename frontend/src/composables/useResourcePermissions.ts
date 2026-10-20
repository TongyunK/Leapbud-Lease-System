import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

/** 业务资源按钮权限（create / update / delete / import / batchDelete） */
export function useResourcePermissions(resource: string) {
  const userStore = useUserStore()

  const codes = {
    create: `${resource}:create`,
    update: `${resource}:update`,
    delete: `${resource}:delete`,
    import: `${resource}:import`,
    batchDelete: `${resource}:batchDelete`,
  } as const

  const create = computed(() => userStore.can(codes.create))
  const update = computed(() => userStore.can(codes.update))
  const remove = computed(() => userStore.can(codes.delete))
  const importPerm = computed(() => userStore.can(codes.import))
  const batchDelete = computed(() => userStore.can(codes.batchDelete))
  const anyWrite = computed(
    () => create.value || update.value || remove.value || importPerm.value || batchDelete.value,
  )
  const canEditOrDelete = computed(() => update.value || remove.value)

  return {
    codes,
    create,
    update,
    delete: remove,
    import: importPerm,
    batchDelete,
    anyWrite,
    canEditOrDelete,
  }
}
