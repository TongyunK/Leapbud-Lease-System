import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { isPublicRoute } from '@/utils/publicRoutes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { titleKey: 'login.title' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { titleKey: 'register.title' },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { titleKey: 'forgot.title' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      redirect: { name: 'buildings' },
      children: [
        {
          path: 'room-mgmt/buildings',
          name: 'buildings',
          component: () => import('@/views/room-mgmt/BuildingListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.buildings',
            subtitleKey: 'building.subtitle',
          },
        },
        {
          path: 'room-mgmt/rooms',
          name: 'rooms',
          component: () => import('@/views/room-mgmt/RoomListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.rooms',
            subtitleKey: 'room.subtitle',
          },
        },
        {
          path: 'customer-mgmt/customers',
          name: 'customers',
          component: () => import('@/views/customer-mgmt/CustomerListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.customers',
            subtitleKey: 'customer.subtitle',
          },
        },
        {
          path: 'customer-mgmt/occupants',
          name: 'occupants',
          component: () => import('@/views/customer-mgmt/OccupantListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.occupants',
            subtitleKey: 'occupant.subtitle',
          },
        },
        {
          path: 'customer-mgmt/requirements',
          name: 'customerRequirements',
          component: () => import('@/views/customer-mgmt/CustomerRequirementListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.customerRequirements',
            subtitleKey: 'customerRequirement.subtitle',
          },
        },
        {
          path: 'contract-mgmt/contracts',
          name: 'contracts',
          component: () => import('@/views/contract-mgmt/ContractListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.contracts',
            subtitleKey: 'contract.subtitle',
          },
        },
        {
          path: 'contract-mgmt/contract-configs',
          name: 'contractConfigs',
          component: () => import('@/views/contract-mgmt/ContractConfigListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.contractConfigs',
            subtitleKey: 'contractConfig.subtitle',
          },
        },
        {
          path: 'contract-mgmt/contract-periods',
          name: 'contractPeriods',
          component: () => import('@/views/contract-mgmt/ContractPeriodListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.contractPeriods',
            subtitleKey: 'contractPeriod.subtitle',
          },
        },
        {
          path: 'contract-mgmt/lease-terminations',
          name: 'leaseTerminations',
          component: () => import('@/views/contract-mgmt/LeaseTerminationListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.leaseTerminations',
            subtitleKey: 'leaseTermination.subtitle',
          },
        },
        {
          path: 'contract-mgmt/contract-other-fees',
          name: 'contractOtherFees',
          component: () => import('@/views/contract-mgmt/ContractOtherFeeListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.contractOtherFees',
            subtitleKey: 'contractOtherFee.subtitle',
          },
        },
        {
          path: 'finance-mgmt/deposit-deductions',
          name: 'depositDeductions',
          component: () => import('@/views/finance-mgmt/DepositDeductionListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.depositDeductions',
            subtitleKey: 'depositDeduction.subtitle',
          },
        },
        {
          path: 'system/users',
          name: 'users',
          component: () => import('@/views/system/UserListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.users',
            subtitleKey: 'user.subtitle',
          },
        },
        {
          path: 'room-mgmt/room-configs',
          name: 'roomConfigs',
          component: () => import('@/views/system/RoomConfigListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.roomConfigs',
            subtitleKey: 'roomConfig.subtitle',
          },
        },
        {
          path: 'room-mgmt/room-types',
          name: 'roomTypes',
          component: () => import('@/views/system/RoomTypeListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.roomTypes',
            subtitleKey: 'roomType.subtitle',
          },
        },
        {
          path: 'customer-mgmt/customer-sources',
          name: 'customerSources',
          component: () => import('@/views/system/CustomerSourceListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.customerSources',
            subtitleKey: 'customerSource.subtitle',
          },
        },
        // 旧路径兼容跳转
        { path: 'system/room-configs', redirect: { name: 'roomConfigs' } },
        { path: 'system/room-types', redirect: { name: 'roomTypes' } },
        { path: 'system/customer-sources', redirect: { name: 'customerSources' } },
        {
          path: 'system/roles',
          name: 'roles',
          component: () => import('@/views/system/RoleListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.roles',
            subtitleKey: 'role.subtitle',
          },
        },
        {
          path: 'system/menus',
          name: 'menus',
          component: () => import('@/views/system/MenuListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.menus',
            subtitleKey: 'sysMenu.subtitle',
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  const userStore = useUserStore()
  const routeName = typeof to.name === 'string' ? to.name : null

  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (routeName === 'login' && userStore.isLoggedIn) {
    return { name: 'buildings' }
  }

  if (!isPublicRoute(routeName) && to.meta.requiresAuth && !userStore.isLoggedIn) {
    return { name: 'login' }
  }

  if (to.meta.requiresAdmin && !userStore.isAdmin) {
    return { name: 'buildings' }
  }

  return true
})

export default router
