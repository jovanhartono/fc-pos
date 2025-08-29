<script setup lang="ts">
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/components/ui/sidebar'
import { CogIcon, PackageIcon, StoreIcon, UsersIcon } from 'lucide-vue-next'

const menus = [
  {
    label: 'Users',
    icon: UsersIcon,
    routeName: 'users',
  },
  {
    label: 'Stores',
    icon: StoreIcon,
    routeName: 'stores',
  },
  {
    label: 'Services',
    icon: CogIcon,
    routeName: 'services',
  },
  {
    label: 'Products',
    icon: PackageIcon,
    routeName: 'products',
  },
]
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>Master Data</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="(menu, index) in menus" :key="index">
          <SidebarMenuButton as-child>
            <RouterLink
              :to="{
                name: menu.routeName,
              }"
            >
              <span>{{ menu.label }}</span>
              <SidebarMenuAction>
                <component :is="menu.icon" />
              </SidebarMenuAction>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
