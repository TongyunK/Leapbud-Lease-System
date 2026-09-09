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
          path: 'system/room-configs',
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
          path: 'system/room-types',
          name: 'roomTypes',
          component: () => import('@/views/system/RoomTypeListView.vue'),
          meta: {
            requiresAuth: true,
            requiresAdmin: true,
            titleKey: 'menu.roomTypes',
            subtitleKey: 'roomType.subtitle',
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
