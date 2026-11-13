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
      redirect: { name: 'home' },
      children: [
        {
          path: 'home',
          name: 'home',
          component: () => import('@/views/HomeDashboardView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'home.title',
          },
        },
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
          path: 'contract-mgmt/contract-loan-items',
          name: 'contractLoanItems',
          component: () => import('@/views/contract-mgmt/ContractLoanItemListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.contractLoanItems',
            subtitleKey: 'contractLoanItem.subtitle',
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
          path: 'finance-mgmt/deposit-refunds',
          name: 'depositRefunds',
          component: () => import('@/views/finance-mgmt/DepositRefundListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.depositRefunds',
            subtitleKey: 'depositRefund.subtitle',
          },
        },
        {
          path: 'finance-mgmt/contract-settlements',
          name: 'contractSettlements',
          component: () => import('@/views/finance-mgmt/ContractSettlementListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.contractSettlements',
            subtitleKey: 'contractSettlement.subtitle',
          },
        },
        {
          path: 'finance-mgmt/refund-orders',
          name: 'refundOrders',
          component: () => import('@/views/finance-mgmt/RefundOrderListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.refundOrders',
            subtitleKey: 'refundOrder.subtitle',
          },
        },
        {
          path: 'finance-mgmt/cash-flows',
          name: 'cashFlows',
          component: () => import('@/views/finance-mgmt/CashFlowListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.cashFlows',
            subtitleKey: 'cashFlow.subtitle',
          },
        },
        {
          path: 'finance-mgmt/invoices',
          name: 'invoices',
          component: () => import('@/views/finance-mgmt/InvoiceListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.invoices',
            subtitleKey: 'invoice.subtitle',
          },
        },
        {
          path: 'finance-mgmt/invoice-service-details',
          name: 'invoiceServiceDetails',
          component: () => import('@/views/finance-mgmt/InvoiceServiceDetailListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.invoiceServiceDetails',
            subtitleKey: 'invoiceServiceDetail.subtitle',
          },
        },
        {
          path: 'finance-mgmt/receivables',
          name: 'receivables',
          component: () => import('@/views/finance-mgmt/ReceivableListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.receivables',
            subtitleKey: 'receivable.subtitle',
          },
        },
        {
          path: 'finance-mgmt/receipts',
          name: 'receipts',
          component: () => import('@/views/finance-mgmt/ReceiptListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.receipts',
            subtitleKey: 'receipt.subtitle',
          },
        },
        {
          path: 'system/users',
          name: 'users',
          component: () => import('@/views/system/UserListView.vue'),
          meta: {
            requiresAuth: true,
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
            titleKey: 'menu.customerSources',
            subtitleKey: 'customerSource.subtitle',
          },
        },
        {
          path: 'system/document-templates',
          name: 'documentTemplates',
          component: () => import('@/views/system/DocumentTemplateListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.documentTemplates',
            subtitleKey: 'documentTemplate.subtitle',
          },
        },
        {
          path: 'system/auto-numbering',
          name: 'autoNumbering',
          component: () => import('@/views/system/AutoNumberingListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.autoNumbering',
            subtitleKey: 'autoNumbering.subtitle',
          },
        },
        {
          path: 'system/settings',
          name: 'systemSettings',
          component: () => import('@/views/system/SystemSettingsView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.systemSettings',
            subtitleKey: 'systemSettings.subtitle',
          },
        },
        {
          path: 'system/scheduled-jobs',
          name: 'scheduledJobs',
          component: () => import('@/views/system/ScheduledJobListView.vue'),
          meta: {
            requiresAuth: true,
            titleKey: 'menu.scheduledJobs',
            subtitleKey: 'scheduledJob.subtitle',
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
    return { name: 'home' }
  }

  if (!isPublicRoute(routeName) && to.meta.requiresAuth && !userStore.isLoggedIn) {
    return { name: 'login' }
  }

  return true
})

export default router
