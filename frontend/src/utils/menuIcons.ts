import type { Component } from 'vue'
import {
  OfficeBuilding,
  Grid,
  Menu as MenuIcon,
  Setting,
  User,
  UserFilled,
  SetUp,
  CollectionTag,
  Promotion,
  Avatar,
} from '@element-plus/icons-vue'
import DoorIcon from '@/components/icons/DoorIcon.vue'

const ICON_MAP: Record<string, Component> = {
  Grid,
  Door: DoorIcon,
  DoorIcon,
  OfficeBuilding,
  UserFilled,
  User,
  Setting,
  Avatar,
  Menu: MenuIcon,
  MenuIcon,
  SetUp,
  CollectionTag,
  Promotion,
}

export function resolveMenuIcon(icon?: string | null): Component {
  const key = (icon || '').trim()
  return (key && ICON_MAP[key]) || MenuIcon
}
